"""
6-DOF QUADROTOR DYNAMICS & INNER-LOOP RATE CONTROLLER
Realistic rigid-body flight physics with aerodynamics, motor lag, and IMU gyros.
"""

from typing import Dict, List, Tuple
import numpy as np


class DroneDynamics6DoF:
    """
    6-Degree-of-Freedom rigid-body flight simulator for a micro-quadrotor (450g).
    Implements true Newton-Euler rotational dynamics, rotor mixing, and rate PIDs.
    """

    def __init__(self, dt_s: float = 0.001):
        self.dt = dt_s

        # Physical Properties
        self.mass = 0.450                     # 450 grams
        self.g = 9.81                         # m/s^2
        self.I = np.array([0.0023, 0.0023, 0.0042], dtype=np.float32) # Principal moments of inertia (kg*m^2)
        self.drag_coeff = np.array([0.15, 0.15, 0.25], dtype=np.float32) # Linear drag

        # Motor Dynamics (First-order lag tau = 20 ms)
        self.tau_motor = 0.020
        self.motor_decay = np.exp(-self.dt / self.tau_motor)

        # Inner-Loop Rate PID Gains (Simulating Betaflight / PX4 gyro rate loop)
        self.kp_rate = np.array([0.18, 0.18, 0.25], dtype=np.float32)
        self.ki_rate = np.array([0.02, 0.02, 0.03], dtype=np.float32)
        self.kd_rate = np.array([0.003, 0.003, 0.004], dtype=np.float32)

        # State Variables
        self.pos = np.zeros(3, dtype=np.float32)      # [x, y, z] in NED (z is down, or z up: here z is UP!)
        self.vel = np.zeros(3, dtype=np.float32)      # [vx, vy, vz] in world frame
        self.euler = np.zeros(3, dtype=np.float32)    # [roll, pitch, yaw] in radians
        self.omega = np.zeros(3, dtype=np.float32)    # [wx, wy, wz] in body frame (rad/s)

        # Internal Controller & Motor States
        self.rate_error_integral = np.zeros(3, dtype=np.float32)
        self.prev_rate_error = np.zeros(3, dtype=np.float32)
        self.actual_torques = np.zeros(3, dtype=np.float32)
        self.actual_thrust = self.mass * self.g

    def reset(self, init_pos: np.ndarray = None, init_vel: np.ndarray = None):
        self.pos = np.zeros(3, dtype=np.float32) if init_pos is None else init_pos.copy().astype(np.float32)
        self.vel = np.zeros(3, dtype=np.float32) if init_vel is None else init_vel.copy().astype(np.float32)
        self.euler.fill(0.0)
        self.omega.fill(0.0)
        self.rate_error_integral.fill(0.0)
        self.prev_rate_error.fill(0.0)
        self.actual_torques.fill(0.0)
        self.actual_thrust = self.mass * self.g

    def rotation_matrix(self) -> np.ndarray:
        """Body to World rotation matrix (Z-Y-X Euler angles: Yaw, Pitch, Roll)."""
        phi, theta, psi = self.euler
        c_phi, s_phi = np.cos(phi), np.sin(phi)
        c_th, s_th = np.cos(theta), np.sin(theta)
        c_psi, s_psi = np.cos(psi), np.sin(psi)

        R = np.array([
            [c_psi * c_th, c_psi * s_th * s_phi - s_psi * c_phi, c_psi * s_th * c_phi + s_psi * s_phi],
            [s_psi * c_th, s_psi * s_th * s_phi + c_psi * c_phi, s_psi * s_th * c_phi - c_psi * s_phi],
            [-s_th,        c_th * s_phi,                         c_th * c_phi]
        ], dtype=np.float32)
        return R

    def step(
        self,
        roll_rate_sp: float,
        pitch_rate_sp: float,
        yaw_rate_sp: float,
        thrust_sp: float,
        wind_world: np.ndarray = None,
    ):
        """
        Step flight physics by dt.
        Inputs: Target angular rates (rad/s) and collective thrust (N).
        Optional: External wind velocity vector [wx, wy, wz] (m/s) in world frame.
        """
        sp_rates = np.array([roll_rate_sp, pitch_rate_sp, yaw_rate_sp], dtype=np.float32)

        # 1. Inner-Loop Rate PID (Generates Desired Body Torques)
        rate_err = sp_rates - self.omega
        self.rate_error_integral = np.clip(self.rate_error_integral + rate_err * self.dt, -1.0, 1.0)
        d_error = (rate_err - self.prev_rate_error) / self.dt
        self.prev_rate_error = rate_err

        desired_torques = (
            self.kp_rate * rate_err +
            self.ki_rate * self.rate_error_integral +
            self.kd_rate * d_error
        )
        desired_torques = np.clip(desired_torques, -0.6, 0.6)

        # 2. Motor Lag Integration
        self.actual_torques = self.actual_torques * self.motor_decay + desired_torques * (1.0 - self.motor_decay)
        self.actual_thrust = self.actual_thrust * self.motor_decay + thrust_sp * (1.0 - self.motor_decay)

        # 3. Euler Rotational Dynamics: I * d_omega/dt = tau - (omega x (I * omega))
        gyroscopic_torque = np.cross(self.omega, self.I * self.omega)
        d_omega = (self.actual_torques - gyroscopic_torque) / self.I
        self.omega += d_omega * self.dt

        # Kinematic equation: Euler angle rates from body angular velocity
        phi, theta, _ = self.euler
        c_th = np.cos(theta)
        if np.abs(c_th) < 1e-4:
            c_th = 1e-4 * np.sign(c_th)

        euler_kinematics = np.array([
            [1.0, np.sin(phi) * np.tan(theta),  np.cos(phi) * np.tan(theta)],
            [0.0, np.cos(phi),                 -np.sin(phi)],
            [0.0, np.sin(phi) / c_th,           np.cos(phi) / c_th]
        ], dtype=np.float32)

        d_euler = np.dot(euler_kinematics, self.omega)
        self.euler += d_euler * self.dt

        # 4. Translational Dynamics
        # Thrust is directed along positive body Z axis (Upward in drone coordinates)
        R = self.rotation_matrix()
        thrust_world = np.dot(R, np.array([0.0, 0.0, self.actual_thrust], dtype=np.float32))
        gravity_world = np.array([0.0, 0.0, -self.mass * self.g], dtype=np.float32)

        # Aerodynamic drag based on apparent airspeed
        relative_airspeed = self.vel if wind_world is None else (self.vel - wind_world)
        drag_world = -self.drag_coeff * relative_airspeed

        accel_world = (thrust_world + gravity_world + drag_world) / self.mass
        self.vel += accel_world * self.dt
        self.pos += self.vel * self.dt

    def get_imu_gyro_rates(self, noise_std: float = 0.01) -> np.ndarray:
        """Returns noisy body gyro rates (rad/s)."""
        noise = np.random.normal(0.0, noise_std, size=3).astype(np.float32)
        return self.omega + noise

    def get_body_velocity(self) -> np.ndarray:
        """Velocity expressed in body coordinate frame."""
        R = self.rotation_matrix()
        return np.dot(R.T, self.vel)
