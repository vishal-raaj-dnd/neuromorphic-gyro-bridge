"""
AUTOPILOT TELEMETRY & HARDWARE COMMUNICATION BRIDGE
Supports direct deployment to physical drones running:
1. PX4 / ArduPilot via MAVLink (SET_ATTITUDE_TARGET body rate control)
2. Betaflight / INAV via MSP (MultiWii Serial Protocol v1/v2)
"""

import struct
import time
from typing import Optional, Tuple
import numpy as np

from fly_connectome_drone.conversion_engine.neuromorphic_gyro import DroneControlSetpoints


class MavlinkRateBridge:
    """
    Serializes DroneControlSetpoints into MAVLink SET_ATTITUDE_TARGET messages
    for PX4 / ArduPilot offboard flight control over UART / UDP.
    """

    # MAVLink Message ID: SET_ATTITUDE_TARGET = 82
    # Type mask bits:
    # 0b00000001 (1) -> ignore roll rate
    # 0b00000010 (2) -> ignore pitch rate
    # 0b00000100 (4) -> ignore yaw rate
    # 0b01000000 (64) -> ignore attitude quaternion (ENABLE RATE CONTROL)
    # 0b10000000 (128) -> ignore thrust
    TYPE_MASK_RATE_CONTROL_ONLY = 0b01000000  # Ignore quaternion, control angular rates and thrust

    def __init__(self, target_system: int = 1, target_component: int = 1):
        self.sys_id = target_system
        self.comp_id = target_component
        self.seq = 0

    def encode_set_attitude_target(
        self,
        setpoints: DroneControlSetpoints,
        max_thrust_n: float = 12.0
    ) -> bytes:
        """
        Encodes body-rate setpoints into a binary MAVLink v1/v2 frame.
        Payload:
          uint32_t time_boot_ms
          float[4] q (ignored when bit 64 is set)
          float body_roll_rate (rad/s)
          float body_pitch_rate (rad/s)
          float body_yaw_rate (rad/s)
          float thrust (0.0 to 1.0 normalized)
          uint8_t target_system
          uint8_t target_component
          uint8_t type_mask
        """
        time_boot_ms = int((time.time() * 1000) % 4294967295)
        q = [1.0, 0.0, 0.0, 0.0]  # Neutral identity quaternion (ignored by type mask)
        
        # Normalize thrust from Newtons to [0.0, 1.0]
        norm_thrust = float(np.clip(setpoints.thrust_sp / max_thrust_n, 0.05, 1.0))

        payload = struct.pack(
            "<I4fffffBBB",
            time_boot_ms,
            q[0], q[1], q[2], q[3],
            float(setpoints.roll_rate_sp),
            float(setpoints.pitch_rate_sp),
            float(setpoints.yaw_rate_sp),
            norm_thrust,
            self.sys_id,
            self.comp_id,
            self.TYPE_MASK_RATE_CONTROL_ONLY
        )

        # MAVLink v1 Header: 0xFE, length, seq, sys_id, comp_id, msg_id=82
        header = struct.pack(
            "<BBBBBB",
            0xFE,
            len(payload),
            self.seq & 0xFF,
            self.sys_id,
            self.comp_id,
            82  # SET_ATTITUDE_TARGET
        )
        self.seq = (self.seq + 1) & 0xFF

        # Standard MAVLink X.25 Checksum calculation
        crc = self._crc_calculate(header[1:] + payload)
        # Seed for msg_id 82 is 49
        crc = self._crc_accumulate(49, crc)
        crc_bytes = struct.pack("<H", crc)

        return header + payload + crc_bytes

    @staticmethod
    def _crc_accumulate(data_byte: int, crc: int) -> int:
        tmp = data_byte ^ (crc & 0xFF)
        tmp = (tmp ^ (tmp << 4)) & 0xFF
        return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF

    @classmethod
    def _crc_calculate(cls, buffer: bytes) -> int:
        crc = 0xFFFF
        for b in buffer:
            crc = cls._crc_accumulate(b, crc)
        return crc


class MspRateBridge:
    """
    Serializes DroneControlSetpoints into Betaflight / INAV MultiWii Serial Protocol (MSP)
    frames for micro-drones (e.g. 1S/2S whoops, Crazyflie, or 5-inch Betaflight rigs).
    """

    MSP_SET_RAW_RC = 200

    @classmethod
    def encode_msp_rc(
        cls,
        setpoints: DroneControlSetpoints,
        hover_thrust_n: float = 4.41,
        max_rate_rad_s: float = 6.0
    ) -> bytes:
        """
        Converts continuous rates and thrust into standard 1000-2000 microsecond RC channels:
        Ch 1: Roll (1500 center)
        Ch 2: Pitch (1500 center)
        Ch 3: Throttle (1000-2000, 1500 ~ hover)
        Ch 4: Yaw (1500 center)
        Ch 5: Arm switch (2000 = Armed)
        """
        # Map angular rates [-max_rate, +max_rate] to [1000, 2000]
        roll_rc = int(np.clip(1500 + (setpoints.roll_rate_sp / max_rate_rad_s) * 500, 1000, 2000))
        pitch_rc = int(np.clip(1500 + (setpoints.pitch_rate_sp / max_rate_rad_s) * 500, 1000, 2000))
        yaw_rc = int(np.clip(1500 + (setpoints.yaw_rate_sp / max_rate_rad_s) * 500, 1000, 2000))

        # Map thrust around hover
        throttle_rc = int(np.clip(1000 + (setpoints.thrust_sp / (hover_thrust_n * 2.0)) * 1000, 1000, 2000))
        aux1_arm = 2000  # Armed

        payload = struct.pack("<5H", roll_rc, pitch_rc, throttle_rc, yaw_rc, aux1_arm)

        # MSP header: $M< (to drone), length, type
        header = b"$M<" + struct.pack("<BB", len(payload), cls.MSP_SET_RAW_RC)
        
        # Checksum is XOR of length, type, and all payload bytes
        checksum = len(payload) ^ cls.MSP_SET_RAW_RC
        for b in payload:
            checksum ^= b

        return header + payload + bytes([checksum])
