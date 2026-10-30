"""
COMPOUND EYE SIMULATOR - HEMISPHERICAL RETINA
Models Drosophila compound eye ommatidia optical reception, wide-field optic flow,
and dynamic 3D looming target projection.
"""

from typing import Dict, List, Tuple
import numpy as np


class CompoundEyeRetina:
    """
    Simulates dual compound eyes with wide horizontal field-of-view (270 degrees)
    and binocular front overlap, feeding visual flux into photoreceptors.
    """

    def __init__(self, n_ommatidia_per_eye: int = 32):
        self.n = n_ommatidia_per_eye

        # Left eye: azimuth from -135 to +15 deg (overlapping in front)
        self.azimuth_L = np.linspace(-135.0, 15.0, self.n) * (np.pi / 180.0)
        # Right eye: azimuth from -15 to +135 deg
        self.azimuth_R = np.linspace(-15.0, 135.0, self.n) * (np.pi / 180.0)

        # Baseline photoreceptor tonic activation
        self.r_baseline = 0.05

    def compute_photoreceptor_currents(
        self,
        drone_velocity_body: np.ndarray,
        drone_angular_rate: np.ndarray,
        obstacle_rel_pos: np.ndarray,
        obstacle_rel_vel: np.ndarray,
        obstacle_radius: float = 0.35,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calculates instantaneous light flux and contrast change for Left and Right eyes.

        Args:
            drone_velocity_body: [vx, vy, vz] forward, right, down in body frame (m/s)
            drone_angular_rate: [wx, wy, wz] roll, pitch, yaw rates (rad/s)
            obstacle_rel_pos: [x, y, z] relative position in drone body frame (m)
            obstacle_rel_vel: [vx, vy, vz] relative velocity in drone body frame (m/s)
            obstacle_radius: radius of approaching object in meters

        Returns:
            flux_L: [N] currents for Left eye R1-R6 photoreceptors
            flux_R: [N] currents for Right eye R1-R6 photoreceptors
        """
        flux_L = np.full(self.n, self.r_baseline, dtype=np.float32)
        flux_R = np.full(self.n, self.r_baseline, dtype=np.float32)

        # 1. Wide-field optical flow from self-motion (Forward speed creates outward expansion)
        fwd_speed = drone_velocity_body[0]
        yaw_rate = drone_angular_rate[2]

        # Translational expansion + rotational optic flow
        flow_L = -fwd_speed * np.sin(self.azimuth_L) * 0.08 + yaw_rate * 0.12
        flow_R = fwd_speed * np.sin(self.azimuth_R) * 0.08 - yaw_rate * 0.12

        flux_L += np.maximum(0.0, flow_L)
        flux_R += np.maximum(0.0, flow_R)

        # 2. Approaching Obstacle / Looming Stimulus
        # Distance and direction in horizontal body plane
        dist = np.linalg.norm(obstacle_rel_pos)
        if dist > 0.05 and obstacle_rel_pos[0] > 0.0:  # In front of the drone
            # Angular bearing to target
            target_azimuth = np.arctan2(obstacle_rel_pos[1], obstacle_rel_pos[0])

            # Angular half-size (theta) and expansion velocity (theta_dot)
            # theta = 2 * arctan(R / dist)
            theta = 2.0 * np.arctan2(obstacle_radius, dist)
            closing_speed = -np.dot(obstacle_rel_pos, obstacle_rel_vel) / dist

            if closing_speed > 0.0:
                # Looming expansion rate theta_dot = (2 * R * closing_speed) / (dist^2 + R^2)
                theta_dot = (2.0 * obstacle_radius * closing_speed) / (dist**2 + obstacle_radius**2)
                looming_intensity = float(theta * 1.5 + theta_dot * 2.5)

                # Project onto Left Eye ommatidia
                diff_L = np.abs(self.azimuth_L - target_azimuth)
                angular_sigma = max(theta, 0.15)
                gaussian_L = np.exp(-(diff_L**2) / (2.0 * angular_sigma**2))
                flux_L += gaussian_L * looming_intensity

                # Project onto Right Eye ommatidia
                diff_R = np.abs(self.azimuth_R - target_azimuth)
                gaussian_R = np.exp(-(diff_R**2) / (2.0 * angular_sigma**2))
                flux_R += gaussian_R * looming_intensity

        return flux_L, flux_R
