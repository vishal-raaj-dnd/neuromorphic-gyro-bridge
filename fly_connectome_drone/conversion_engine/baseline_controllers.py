"""
BASELINE FLIGHT CONTROLLERS FOR BENCHMARK COMPARISON
Implements:
1. BaselineFlawedController: Unbuffered heuristic from flybrain (discrete commands, pitch=thrust*0.5, roll=yaw*0.3)
2. ClassicalAPFController: Standard Robotics Optical Flow Artificial Potential Field with cascaded PID
3. AblatedNoHaltereBridge: Drosophila Connectome with LIF spikes, but Haltere restorative gyro feedback removed
"""

from dataclasses import dataclass
import numpy as np
from fly_connectome_drone.conversion_engine.neuromorphic_gyro import DroneControlSetpoints, SecondOrderFilter


class BaselineFlawedController:
    """
    Direct port of the naive GitHub implementation (flybrain/drone_brain_controller.py).
    Suffers from:
    - Discrete bang-bang commands without continuous filtering
    - Erroneous cross-axis coupling: pitch = thrust * 0.5, roll = yaw * 0.3
    - No haltere gyro restorative stabilization
    - Zero altitude compensation during aggressive roll banking
    """

    def __init__(self, dt_s: float = 0.001, hover_thrust_n: float = 9.81 * 0.45):
        self.dt = dt_s
        self.hover_thrust = hover_thrust_n

    def reset(self):
        pass

    def compute(
        self,
        spk_dna01_l: bool,
        spk_dna01_r: bool,
        spk_dna02_l: bool,
        spk_dna02_r: bool,
        spk_gf_l: bool,
        spk_gf_r: bool,
        current_roll_rad: float = 0.0,
        current_pitch_rad: float = 0.0,
        current_z: float = 1.5,
        current_vz: float = 0.0,
    ) -> DroneControlSetpoints:
        # Discrete bang-bang motor jumps
        raw_yaw = 3.5 if spk_dna01_l else (-3.5 if spk_dna01_r else 0.0)
        raw_thrust = 9.5 if (spk_gf_l or spk_gf_r) else self.hover_thrust

        # Flawed cross-coupling from naive codebase
        thrust_sp = raw_thrust
        yaw_rate_sp = raw_yaw
        pitch_rate_sp = float(np.clip(thrust_sp * 0.35, -2.5, 2.5))
        roll_rate_sp = float(np.clip(yaw_rate_sp * 0.35, -2.5, 2.5))

        return DroneControlSetpoints(
            roll_rate_sp=roll_rate_sp,
            pitch_rate_sp=pitch_rate_sp,
            yaw_rate_sp=yaw_rate_sp,
            thrust_sp=thrust_sp,
        )


class ClassicalAPFController:
    """
    State-of-the-art Classical Robotics Baseline:
    Artificial Potential Field (APF) with Optical Flow Divergence steering and cascaded PID autopilot.
    Represents standard non-neuromorphic reactive micro-UAV collision avoidance in robotics literature.
    """

    def __init__(self, dt_s: float = 0.001, hover_thrust_n: float = 9.81 * 0.45):
        self.dt = dt_s
        self.hover_thrust = hover_thrust_n
        self.mass = 0.45

        # Optical sensing memory
        self.prev_flux_l = 0.05
        self.prev_flux_r = 0.05
        self.filtered_repulse_y = 0.0

        # Autopilot PID gains
        self.kp_angle = 6.0
        self.kd_rate = 0.15
        self.kp_z = 7.0
        self.kd_z = 2.8

    def reset(self):
        self.prev_flux_l = 0.05
        self.prev_flux_r = 0.05
        self.filtered_repulse_y = 0.0

    def compute(
        self,
        flux_l_mean: float,
        flux_r_mean: float,
        current_roll_rad: float,
        current_pitch_rad: float,
        current_z: float,
        current_vz: float,
        obstacle_rel_pos: np.ndarray,
        obstacle_rel_vel: np.ndarray,
    ) -> DroneControlSetpoints:
        """
        Computes APF repulsive vector from optical flux gradient & range estimation.
        """
        # Optical flux temporal gradient (approaching threat creates positive optical expansion)
        d_flux_l = (flux_l_mean - self.prev_flux_l) / self.dt
        d_flux_r = (flux_r_mean - self.prev_flux_r) / self.dt
        self.prev_flux_l = flux_l_mean
        self.prev_flux_r = flux_r_mean

        # Potential field repulsive lateral force: steer away from higher optical expansion
        flux_diff = flux_l_mean - flux_r_mean
        expansion_rate = max(0.0, d_flux_l + d_flux_r)

        # Repulsion calculation
        target_repulsion = -flux_diff * 4.0
        # If symmetrical looming, break symmetry
        if abs(flux_diff) < 0.05 and expansion_rate > 10.0:
            target_repulsion = 3.5

        # First-order smoothing of sensor commands (simulating flight computer IMU cycle)
        alpha = 0.15
        self.filtered_repulse_y = (1.0 - alpha) * self.filtered_repulse_y + alpha * target_repulsion

        # Target bank angle (roll) from APF force
        roll_target = float(np.clip(self.filtered_repulse_y * 0.35, -0.65, 0.65)) # Max ~37 deg bank
        roll_rate_sp = float(self.kp_angle * (roll_target - current_roll_rad))
        roll_rate_sp = float(np.clip(roll_rate_sp, -5.0, 5.0))

        # Target pitch: flare slightly during expansion to shed forward speed
        pitch_target = 0.15 if expansion_rate > 10.0 else -0.05
        pitch_rate_sp = float(self.kp_angle * (pitch_target - current_pitch_rad))
        pitch_rate_sp = float(np.clip(pitch_rate_sp, -3.0, 3.0))

        # Yaw rate: align heading with avoidance corridor
        yaw_rate_sp = float(np.clip(self.filtered_repulse_y * 0.8, -4.0, 4.0))

        # Altitude hold with tilt compensation
        z_target = 1.5
        z_err = z_target - current_z
        accel_z = 9.81 + self.kp_z * z_err - self.kd_z * current_vz
        accel_z = float(np.clip(accel_z, 2.0, 20.0))

        cos_tilt = max(0.4, np.cos(current_roll_rad) * np.cos(current_pitch_rad))
        thrust_sp = float(np.clip((self.mass * accel_z) / cos_tilt, 1.0, 16.0))

        return DroneControlSetpoints(
            roll_rate_sp=roll_rate_sp,
            pitch_rate_sp=pitch_rate_sp,
            yaw_rate_sp=yaw_rate_sp,
            thrust_sp=thrust_sp,
        )


class AblatedNoHaltereBridge:
    """
    Ablation Study Model:
    Drosophila Connectome Spiking Engine + Leaky Synapses, BUT Haltere Gyroscopic Restorative Feedback is REMOVED.
    Demonstrates what happens to insect-scale neuromorphic flight when mechanical gyroscopic damping is missing.
    """

    def __init__(self, dt_s: float = 0.001, hover_thrust_n: float = 9.81 * 0.45):
        self.dt = dt_s
        self.hover_thrust = hover_thrust_n
        self.filter_roll = SecondOrderFilter(omega_n=40.0, zeta=1.0, dt=dt_s)
        self.filter_pitch = SecondOrderFilter(omega_n=35.0, zeta=1.0, dt=dt_s)
        self.filter_yaw = SecondOrderFilter(omega_n=30.0, zeta=1.0, dt=dt_s)
        self.filter_thrust = SecondOrderFilter(omega_n=25.0, zeta=1.0, dt=dt_s, initial_val=self.hover_thrust)

        self.k_roll = 6.5
        self.k_pitch = 4.0
        self.k_yaw = 5.0
        self.k_escape_thrust = 6.0

        self.decay = np.exp(-dt_s / 0.015)
        self.trace_dna01_l = 0.0
        self.trace_dna01_r = 0.0
        self.trace_dna02_l = 0.0
        self.trace_dna02_r = 0.0
        self.trace_gf_l = 0.0
        self.trace_gf_r = 0.0
        self.trace_dnb01 = 0.0
        self.trace_dnp01 = 0.0

    def reset(self):
        self.filter_roll.reset()
        self.filter_pitch.reset()
        self.filter_yaw.reset()
        self.filter_thrust.reset()
        self.trace_dna01_l = 0.0
        self.trace_dna01_r = 0.0
        self.trace_dna02_l = 0.0
        self.trace_dna02_r = 0.0
        self.trace_gf_l = 0.0
        self.trace_gf_r = 0.0
        self.trace_dnb01 = 0.0
        self.trace_dnp01 = 0.0

    def compute(
        self,
        spk_dna01_l: bool,
        spk_dna01_r: bool,
        spk_dna02_l: bool,
        spk_dna02_r: bool,
        spk_dnp01: bool,
        spk_dnb01: bool,
        spk_gf_l: bool,
        spk_gf_r: bool,
        current_roll_rad: float,
        current_pitch_rad: float,
        current_z: float,
        current_vz: float,
    ) -> DroneControlSetpoints:
        # Update traces
        self.trace_dna01_l = self.trace_dna01_l * self.decay + (1.0 if spk_dna01_l else 0.0)
        self.trace_dna01_r = self.trace_dna01_r * self.decay + (1.0 if spk_dna01_r else 0.0)
        self.trace_dna02_l = self.trace_dna02_l * self.decay + (1.0 if spk_dna02_l else 0.0)
        self.trace_dna02_r = self.trace_dna02_r * self.decay + (1.0 if spk_dna02_r else 0.0)
        self.trace_dnp01 = self.trace_dnp01 * self.decay + (1.0 if spk_dnp01 else 0.0)
        self.trace_dnb01 = self.trace_dnb01 * self.decay + (1.0 if spk_dnb01 else 0.0)
        self.trace_gf_l = self.trace_gf_l * self.decay + (2.5 if spk_gf_l else 0.0)
        self.trace_gf_r = self.trace_gf_r * self.decay + (2.5 if spk_gf_r else 0.0)

        # NO HALTERE RESTORATIVE FEEDBACK (k_haltere = 0.0)
        bilateral_escape = (self.trace_gf_l + self.trace_gf_r) * 0.5
        raw_yaw = float(np.clip((self.trace_dna01_l - self.trace_dna01_r) * self.k_yaw, -4.0, 4.0))

        saccade_roll = ((self.trace_dna02_l + self.trace_gf_l) - 
                        (self.trace_dna02_r + self.trace_gf_r)) * self.k_roll
        if abs(saccade_roll) < 0.2 and bilateral_escape > 0.5:
            saccade_roll = 2.5

        raw_roll = float(np.clip(saccade_roll, -5.0, 5.0)) # Unstabilized!
        raw_pitch = float(np.clip((self.trace_dnb01 * 0.5 + bilateral_escape * 0.8), -3.0, 3.0))

        # Basic altitude hold
        z_err = 1.5 - current_z
        accel_z = 9.81 + 6.0 * z_err - 2.5 * current_vz
        base_thrust = 0.45 * float(np.clip(accel_z, 2.0, 22.0))
        raw_thrust = base_thrust + (bilateral_escape * self.k_escape_thrust)
        cos_tilt = max(0.4, np.cos(current_roll_rad) * np.cos(current_pitch_rad))
        compensated_thrust = raw_thrust / cos_tilt

        roll_rate = float(self.filter_roll.update(raw_roll))
        pitch_rate = float(self.filter_pitch.update(raw_pitch))
        yaw_rate = float(self.filter_yaw.update(raw_yaw))
        thrust = float(np.clip(self.filter_thrust.update(compensated_thrust), 1.0, 18.0))

        return DroneControlSetpoints(
            roll_rate_sp=roll_rate,
            pitch_rate_sp=pitch_rate,
            yaw_rate_sp=yaw_rate,
            thrust_sp=thrust,
        )
