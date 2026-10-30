"""
CONTINUOUS NEUROMORPHIC GYRO & THRUST BRIDGE
Translates asynchronous Drosophila descending spike trains into continuous,
C1-smooth 3D angular rate setpoints [wx, wy, wz] and coupled thrust.
Eliminates discrete bang-bang jumps and motor desync.
"""

from dataclasses import dataclass
from typing import Dict, List, Tuple
import numpy as np


@dataclass
class DroneControlSetpoints:
    roll_rate_sp: float   # Target body-axis roll rate (rad/s)
    pitch_rate_sp: float  # Target body-axis pitch rate (rad/s)
    yaw_rate_sp: float    # Target body-axis yaw rate (rad/s)
    thrust_sp: float      # Target collective thrust (Newtons or normalized 0-1)


class SecondOrderFilter:
    """
    Continuous-time critically damped filter:
    x_ddot + 2*zeta*omega_n * x_dot + omega_n^2 * x = omega_n^2 * u
    Provides physical neuromuscular smoothing with zero step-discontinuity.
    """

    def __init__(self, omega_n: float = 35.0, zeta: float = 1.0, dt: float = 0.001, initial_val: float = 0.0):
        self.omega_n = omega_n
        self.zeta = zeta
        self.dt = dt
        self.init_val = initial_val
        self.x = initial_val
        self.x_dot = 0.0

    def update(self, impulse_drive: float) -> float:
        # Critically damped integration
        x_ddot = (self.omega_n ** 2) * (impulse_drive - self.x) - 2.0 * self.zeta * self.omega_n * self.x_dot
        self.x_dot += x_ddot * self.dt
        self.x += self.x_dot * self.dt
        return self.x

    def reset(self):
        self.x = self.init_val
        self.x_dot = 0.0


class NeuromorphicGyroBridge:
    """
    Decodes biological action potentials into 4-DoF continuous flight setpoints
    compatible with Betaflight/PX4 high-rate inner-loop controllers.
    """

    def __init__(self, dt_s: float = 0.001, hover_thrust_n: float = 9.81 * 0.45):
        self.dt = dt_s
        self.hover_thrust = hover_thrust_n  # ~4.41 N for a 450g drone

        # Biological time constant ~25-35 rad/s matches insect neuromuscular activation
        self.filter_roll = SecondOrderFilter(omega_n=40.0, zeta=1.0, dt=dt_s)
        self.filter_pitch = SecondOrderFilter(omega_n=35.0, zeta=1.0, dt=dt_s)
        self.filter_yaw = SecondOrderFilter(omega_n=30.0, zeta=1.0, dt=dt_s)
        self.filter_thrust = SecondOrderFilter(omega_n=25.0, zeta=1.0, dt=dt_s, initial_val=self.hover_thrust)

        # Gain scalers converting spike rates to angular velocities (rad/s)
        self.k_roll = 3.5     # Max ~3-4 rad/s for crisp, stabilized evasion
        self.k_pitch = 2.5    # Max ~2.5 rad/s pitch attitude shift
        self.k_yaw = 4.0      # Max ~4 rad/s yaw saccades
        self.k_escape_thrust = 2.5  # Realistic thrust burst during emergency dodge

        # Internal leaky synaptic traces for descending channels
        self.tau_syn = 0.015  # 15 ms decay
        self.decay = np.exp(-dt_s / self.tau_syn)

        self.trace_dna01_l = 0.0
        self.trace_dna01_r = 0.0
        self.trace_dna02_l = 0.0
        self.trace_dna02_r = 0.0
        self.trace_dnp01 = 0.0
        self.trace_dnb01 = 0.0
        self.trace_gf_l = 0.0
        self.trace_gf_r = 0.0

    def reset(self):
        self.filter_roll.reset()
        self.filter_pitch.reset()
        self.filter_yaw.reset()
        self.filter_thrust.reset()
        self.trace_dna01_l = 0.0
        self.trace_dna01_r = 0.0
        self.trace_dna02_l = 0.0
        self.trace_dna02_r = 0.0
        self.trace_dnp01 = 0.0
        self.trace_dnb01 = 0.0
        self.trace_gf_l = 0.0
        self.trace_gf_r = 0.0

    def decode_spikes(
        self,
        spikes_dna01_l: bool,
        spikes_dna01_r: bool,
        spikes_dna02_l: bool,
        spikes_dna02_r: bool,
        spikes_dnp01: bool,
        spikes_dnb01: bool,
        spikes_gf_l: bool,
        spikes_gf_r: bool,
        current_roll_rad: float = 0.0,
        current_pitch_rad: float = 0.0,
        current_z: float = 1.5,
        current_vz: float = 0.0,
    ) -> DroneControlSetpoints:
        """
        Decodes incoming spike events into C1-smooth angular rate and thrust commands.

        Args:
            spikes_*: Boolean action potentials in current timestep
            current_roll_rad, current_pitch_rad: Current drone tilt for coupled thrust vectoring

        Returns:
            DroneControlSetpoints [roll_rate, pitch_rate, yaw_rate, thrust]
        """
        # 1. Update Leaky Synaptic Conductance Traces
        self.trace_dna01_l = self.trace_dna01_l * self.decay + (1.0 if spikes_dna01_l else 0.0)
        self.trace_dna01_r = self.trace_dna01_r * self.decay + (1.0 if spikes_dna01_r else 0.0)
        self.trace_dna02_l = self.trace_dna02_l * self.decay + (1.0 if spikes_dna02_l else 0.0)
        self.trace_dna02_r = self.trace_dna02_r * self.decay + (1.0 if spikes_dna02_r else 0.0)
        self.trace_dnp01 = self.trace_dnp01 * self.decay + (1.0 if spikes_dnp01 else 0.0)
        self.trace_dnb01 = self.trace_dnb01 * self.decay + (1.0 if spikes_dnb01 else 0.0)
        self.trace_gf_l = self.trace_gf_l * self.decay + (2.0 if spikes_gf_l else 0.0)
        self.trace_gf_r = self.trace_gf_r * self.decay + (2.0 if spikes_gf_r else 0.0)

        # 2. Channel Decoupling with Biological Haltere Restorative Feedback:
        # In Drosophila, halteres act as high-speed gyroscopes that damp visual saccades
        # and restore level flight after an evasive maneuver.
        k_haltere_p = 8.0  # Restorative angular stiffness (rad/s per radian)

        # A. Yaw Rate: Differential DNa01 activation (turning towards stimulus-free side)
        raw_yaw_drive = (self.trace_dna01_l - self.trace_dna01_r) * self.k_yaw

        # Pre-compute bilateral escape drive from Giant Fibers
        bilateral_escape = (self.trace_gf_l + self.trace_gf_r) * 0.5

        # B. Roll Rate: Saccade impulse minus Haltere restorative bank damping
        # Commands sharp ~25-35 deg banking jink during looming, then auto-levels smoothly
        saccade_roll = ((self.trace_dna02_l + self.trace_gf_l * 0.6) - 
                        (self.trace_dna02_r + self.trace_gf_r * 0.6)) * self.k_roll
        # In head-on symmetry, break symmetry slightly to choose a clear dodge corridor
        if abs(saccade_roll) < 0.2 and bilateral_escape > 0.4:
            saccade_roll = 2.2  # Saccade break to the right

        raw_roll_drive = saccade_roll - (k_haltere_p * current_roll_rad)
        raw_roll_drive = float(np.clip(raw_roll_drive, -4.0, 4.0))

        # C. Pitch Rate: Gentle flare to brake (+0.5 rad/s) minus Haltere pitch damping
        pitch_cruise_target = -0.05  # -3 deg nose-down to sustain forward cruise
        saccade_pitch = (self.trace_dnb01 * 0.4 + bilateral_escape * 0.5)
        raw_pitch_drive = saccade_pitch - (k_haltere_p * (current_pitch_rad - pitch_cruise_target))
        raw_pitch_drive = float(np.clip(raw_pitch_drive, -2.5, 2.5))

        raw_yaw_drive = float(np.clip(raw_yaw_drive, -3.5, 3.5))

        # 3. Aerodynamic Coupled Thrust Vectoring with Closed-Loop Altitude Hold:
        z_target = 1.5  # Standard test arena altitude
        z_error = z_target - current_z
        z_damping = current_vz
        kp_z = 6.0
        kd_z = 2.5
        accel_z_desired = 9.81 + (kp_z * z_error) - (kd_z * z_damping)
        accel_z_desired = float(np.clip(accel_z_desired, 3.0, 15.0))
        
        base_altitude_thrust = 0.45 * accel_z_desired

        # Add emergency Giant Fiber upward thrust burst during looming
        raw_thrust_drive = base_altitude_thrust + (bilateral_escape * self.k_escape_thrust)

        # Aerodynamic tilt compensation (capped at 1.38x to prevent vertical runaway)
        cos_tilt = max(0.72, np.cos(current_roll_rad) * np.cos(current_pitch_rad))
        compensated_thrust = raw_thrust_drive / cos_tilt

        # 4. Continuous-Time Low-Pass Second-Order Filtering
        roll_rate = float(self.filter_roll.update(raw_roll_drive))
        pitch_rate = float(self.filter_pitch.update(raw_pitch_drive))
        yaw_rate = float(self.filter_yaw.update(raw_yaw_drive))
        thrust = float(np.clip(self.filter_thrust.update(compensated_thrust), 2.0, 8.5))

        return DroneControlSetpoints(
            roll_rate_sp=roll_rate,
            pitch_rate_sp=pitch_rate,
            yaw_rate_sp=yaw_rate,
            thrust_sp=thrust
        )
