"""
DYNAMIC OBSTACLE ARENA & COMPREHENSIVE BENCHMARK HARNESS
Simulates rigorous 6-DoF rigid-body flight trials under escalating stress scenarios:
- Extreme approach velocities (stress to crash)
- Late pop-up emergence distances (reaction horizon boundary)
- Severe crosswind turbulence gusts
- Multi-threat simultaneous pincers
- Optical sensory degradation / photon noise
Evaluates:
1. Proposed Drosophila Connectome + Leaky Neuromorphic Gyro Bridge
2. Flawed Baseline Discrete Heuristic (naive flybrain)
3. Classical Robotics Optical Flow APF Controller
4. Ablated Connectome Bridge (Without Haltere Stabilization)
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import numpy as np

from fly_connectome_drone.connectome.synaptic_matrix import ConnectomeGraph
from fly_connectome_drone.spiking_engine.biophysical_lif import BiophysicalLIFEngine
from fly_connectome_drone.spiking_engine.compound_eye import CompoundEyeRetina
from fly_connectome_drone.conversion_engine.neuromorphic_gyro import NeuromorphicGyroBridge
from fly_connectome_drone.conversion_engine.baseline_controllers import (
    BaselineFlawedController,
    ClassicalAPFController,
    AblatedNoHaltereBridge,
)
from fly_connectome_drone.simulation.drone_dynamics_6dof import DroneDynamics6DoF


@dataclass
class ObstacleState:
    pos: np.ndarray
    vel: np.ndarray
    radius: float = 0.35


@dataclass
class TrialResult:
    controller_name: str
    scenario_name: str
    dodged_successfully: bool
    crash_reason: str  # "NONE", "OBSTACLE_COLLISION", "GROUND_CRASH", "TUMBLE_STALL"
    min_clearance_m: float
    rms_angular_jitter_rad_s2: float
    max_roll_deg: float
    max_pitch_deg: float
    final_pos: np.ndarray
    trajectory: List[np.ndarray] = field(default_factory=list)
    spikes_per_sec: float = 0.0
    reaction_latency_ms: float = 999.0
    crash_time_s: Optional[float] = None
    stress_parameter_val: float = 0.0


class ArenaExperiment:
    """
    Simulates high-speed dynamic collision encounters in 3D flight space.
    Strictly verifies physical crash boundaries in 6-DoF.
    """

    def __init__(self, trial_duration_s: float = 3.0, dt_s: float = 0.001):
        self.duration = trial_duration_s
        self.dt = dt_s
        self.n_steps = int(trial_duration_s / dt_s)

        # Connectome & Neuromorphic Subsystems
        self.graph = ConnectomeGraph(n_ommatidia_per_eye=32)
        self.lif = BiophysicalLIFEngine(self.graph, dt_ms=self.dt * 1000.0)
        self.eye = CompoundEyeRetina(n_ommatidia_per_eye=32)
        self.gyro_bridge = NeuromorphicGyroBridge(dt_s=self.dt)
        self.drone = DroneDynamics6DoF(dt_s=self.dt)

        # Baseline & Comparison Controllers
        self.baseline_flawed = BaselineFlawedController(dt_s=self.dt)
        self.classical_apf = ClassicalAPFController(dt_s=self.dt)
        self.ablated_no_haltere = AblatedNoHaltereBridge(dt_s=self.dt)

        # Pre-cache neuron indices for sub-millisecond execution
        self.idx_r_l = [self.graph.neuron_index_map[f"R1_6_L_{i}"] for i in range(self.eye.n)]
        self.idx_r_r = [self.graph.neuron_index_map[f"R1_6_R_{i}"] for i in range(self.eye.n)]
        self.idx_dna01_l = self.graph.neuron_index_map["DNa01_L"]
        self.idx_dna01_r = self.graph.neuron_index_map["DNa01_R"]
        self.idx_dna02_l = self.graph.neuron_index_map["DNa02_L"]
        self.idx_dna02_r = self.graph.neuron_index_map["DNa02_R"]
        self.idx_dnp01 = self.graph.neuron_index_map["DNp01"]
        self.idx_dnb01 = self.graph.neuron_index_map["DNb01"]
        self.idx_gf_l = self.graph.neuron_index_map["GiantFiber_L"]
        self.idx_gf_r = self.graph.neuron_index_map["GiantFiber_R"]

    def run_trial(
        self,
        controller_type: str = "proposed_neuromorphic",
        scenario_name: str = "Standard",
        obstacles: Optional[List[ObstacleState]] = None,
        wind_world: Optional[np.ndarray] = None,
        sensory_noise_std: float = 0.0,
        stress_val: float = 0.0,
    ) -> TrialResult:
        """
        Runs an autonomous 6-DoF flight trial.
        Args:
            controller_type: "proposed_neuromorphic" | "baseline_flawed" | "classical_apf" | "ablated_no_haltere"
            scenario_name: Descriptive tag for the stress scenario
            obstacles: List of ObstacleState instances
            wind_world: External 3D wind velocity vector [wx, wy, wz]
            sensory_noise_std: Photoreceptor noise standard deviation
            stress_val: Value of the parameter being stress-tested
        """
        # Default single obstacle if none supplied
        if obstacles is None or len(obstacles) == 0:
            obs_list = [
                ObstacleState(
                    pos=np.array([14.0, 0.0, 1.5], dtype=np.float32),
                    vel=np.array([-4.0, 0.0, 0.0], dtype=np.float32),
                    radius=0.35,
                )
            ]
        else:
            # Deep copy obstacle states
            obs_list = [
                ObstacleState(pos=o.pos.copy().astype(np.float32), vel=o.vel.copy().astype(np.float32), radius=o.radius)
                for o in obstacles
            ]

        drone_radius = 0.20  # 20 cm collision radius

        # Reset drone to stable initial condition: (0, 0, 1.5m), cruising at +3.0 m/s
        self.drone.reset(
            init_pos=np.array([0.0, 0.0, 1.5], dtype=np.float32),
            init_vel=np.array([3.0, 0.0, 0.0], dtype=np.float32),
        )
        self.lif.reset()
        self.gyro_bridge.reset()
        self.baseline_flawed.reset()
        self.classical_apf.reset()
        self.ablated_no_haltere.reset()

        trajectory: List[np.ndarray] = []
        angular_accelerations: List[float] = []
        max_roll_rad = 0.0
        max_pitch_rad = 0.0
        total_spikes = 0
        min_clearance = 999.0
        dodged = True
        crash_reason = "NONE"
        crash_time = None
        reaction_latency_ms = 999.0
        first_saccade_detected = False

        prev_omega = self.drone.omega.copy()
        ext_currents = np.zeros(self.graph.n_total, dtype=np.float32)

        for step in range(self.n_steps):
            t = step * self.dt

            # 1. Update Obstacles in World Space & Check Minimum Clearance
            R_body_to_world = self.drone.rotation_matrix()
            closest_obs = None
            closest_dist = 999.0

            for obs in obs_list:
                obs.pos += obs.vel * self.dt
                rel_pos_w = obs.pos - self.drone.pos
                d = float(np.linalg.norm(rel_pos_w))
                if d < min_clearance:
                    min_clearance = d
                if d < closest_dist:
                    closest_dist = d
                    closest_obs = obs

                # Collision Check
                collision_threshold = obs.radius + drone_radius
                if d <= collision_threshold and crash_reason == "NONE":
                    dodged = False
                    crash_reason = "OBSTACLE_COLLISION"
                    crash_time = t

            # 2. Check Secondary Physical Failure Criteria:
            # A. Ground Strike
            if self.drone.pos[2] <= 0.08 and crash_reason == "NONE":
                dodged = False
                crash_reason = "GROUND_CRASH"
                crash_time = t

            # B. Aerodynamic Tumble / Inverted Stall (|roll| > 75 deg or |pitch| > 75 deg)
            roll_abs = abs(float(self.drone.euler[0]))
            pitch_abs = abs(float(self.drone.euler[1]))
            if roll_abs > max_roll_rad:
                max_roll_rad = roll_abs
            if pitch_abs > max_pitch_rad:
                max_pitch_rad = pitch_abs

            if (roll_abs > 1.31 or pitch_abs > 1.31) and crash_reason == "NONE":
                dodged = False
                crash_reason = "TUMBLE_STALL"
                crash_time = t

            # Fast early exit if crash already occurred or obstacle has safely passed well behind drone
            if crash_reason != "NONE":
                break
            if len(obs_list) > 0 and all(obs.pos[0] < self.drone.pos[0] - 2.5 for obs in obs_list) and t > 0.8:
                break

            # 3. Vision & Retina Optical Flow
            rel_pos_body = np.dot(R_body_to_world.T, closest_obs.pos - self.drone.pos)
            rel_vel_body = np.dot(R_body_to_world.T, closest_obs.vel - self.drone.vel)
            body_vel = self.drone.get_body_velocity()

            flux_L, flux_R = self.eye.compute_photoreceptor_currents(
                drone_velocity_body=body_vel,
                drone_angular_rate=self.drone.omega,
                obstacle_rel_pos=rel_pos_body,
                obstacle_rel_vel=rel_vel_body,
                obstacle_radius=closest_obs.radius,
            )

            # Apply sensory noise / degradation if specified
            if sensory_noise_std > 0.0:
                noise_L = np.random.normal(0.0, sensory_noise_std, size=self.eye.n).astype(np.float32)
                noise_R = np.random.normal(0.0, sensory_noise_std, size=self.eye.n).astype(np.float32)
                flux_L = np.maximum(0.0, flux_L + noise_L)
                flux_R = np.maximum(0.0, flux_R + noise_R)

            # 4. Spiking Connectome or Classical Controller Step
            if controller_type in ["proposed_neuromorphic", "baseline_flawed", "ablated_no_haltere"]:
                ext_currents.fill(0.0)
                ext_currents[self.idx_r_l] = flux_L * 1.8
                ext_currents[self.idx_r_r] = flux_R * 1.8

                spikes = self.lif.step(ext_currents)
                total_spikes += int(np.sum(spikes))

                spk_dna01_l = bool(spikes[self.idx_dna01_l])
                spk_dna01_r = bool(spikes[self.idx_dna01_r])
                spk_dna02_l = bool(spikes[self.idx_dna02_l])
                spk_dna02_r = bool(spikes[self.idx_dna02_r])
                spk_dnp01 = bool(spikes[self.idx_dnp01])
                spk_dnb01 = bool(spikes[self.idx_dnb01])
                spk_gf_l = bool(spikes[self.idx_gf_l])
                spk_gf_r = bool(spikes[self.idx_gf_r])

                # Reaction latency measurement
                if not first_saccade_detected and (spk_dna02_l or spk_dna02_r or spk_gf_l or spk_gf_r):
                    reaction_latency_ms = t * 1000.0
                    first_saccade_detected = True

                if controller_type == "proposed_neuromorphic":
                    cmd = self.gyro_bridge.decode_spikes(
                        spikes_dna01_l=spk_dna01_l,
                        spikes_dna01_r=spk_dna01_r,
                        spikes_dna02_l=spk_dna02_l,
                        spikes_dna02_r=spk_dna02_r,
                        spikes_dnp01=spk_dnp01,
                        spikes_dnb01=spk_dnb01,
                        spikes_gf_l=spk_gf_l,
                        spikes_gf_r=spk_gf_r,
                        current_roll_rad=float(self.drone.euler[0]),
                        current_pitch_rad=float(self.drone.euler[1]),
                        current_z=float(self.drone.pos[2]),
                        current_vz=float(self.drone.vel[2]),
                    )
                elif controller_type == "baseline_flawed":
                    cmd = self.baseline_flawed.compute(
                        spk_dna01_l=spk_dna01_l,
                        spk_dna01_r=spk_dna01_r,
                        spk_dna02_l=spk_dna02_l,
                        spk_dna02_r=spk_dna02_r,
                        spk_gf_l=spk_gf_l,
                        spk_gf_r=spk_gf_r,
                        current_roll_rad=float(self.drone.euler[0]),
                        current_pitch_rad=float(self.drone.euler[1]),
                        current_z=float(self.drone.pos[2]),
                        current_vz=float(self.drone.vel[2]),
                    )
                else:  # ablated_no_haltere
                    cmd = self.ablated_no_haltere.compute(
                        spk_dna01_l=spk_dna01_l,
                        spk_dna01_r=spk_dna01_r,
                        spk_dna02_l=spk_dna02_l,
                        spk_dna02_r=spk_dna02_r,
                        spk_dnp01=spk_dnp01,
                        spk_dnb01=spk_dnb01,
                        spk_gf_l=spk_gf_l,
                        spk_gf_r=spk_gf_r,
                        current_roll_rad=float(self.drone.euler[0]),
                        current_pitch_rad=float(self.drone.euler[1]),
                        current_z=float(self.drone.pos[2]),
                        current_vz=float(self.drone.vel[2]),
                    )
            else:
                # Classical APF Controller
                cmd = self.classical_apf.compute(
                    flux_l_mean=float(np.mean(flux_L)),
                    flux_r_mean=float(np.mean(flux_R)),
                    current_roll_rad=float(self.drone.euler[0]),
                    current_pitch_rad=float(self.drone.euler[1]),
                    current_z=float(self.drone.pos[2]),
                    current_vz=float(self.drone.vel[2]),
                    obstacle_rel_pos=rel_pos_body,
                    obstacle_rel_vel=rel_vel_body,
                )
                # Classical reaction latency: when commanded roll rate exceeds 0.5 rad/s
                if not first_saccade_detected and abs(cmd.roll_rate_sp) > 0.5:
                    reaction_latency_ms = t * 1000.0
                    first_saccade_detected = True

            # 5. Advance 6-DoF Physics
            self.drone.step(
                roll_rate_sp=cmd.roll_rate_sp,
                pitch_rate_sp=cmd.pitch_rate_sp,
                yaw_rate_sp=cmd.yaw_rate_sp,
                thrust_sp=cmd.thrust_sp,
                wind_world=wind_world,
            )

            # Record angular jerk/acceleration
            angular_accel = float(np.linalg.norm((self.drone.omega - prev_omega) / self.dt))
            angular_accelerations.append(angular_accel)
            prev_omega = self.drone.omega.copy()

            if step % 10 == 0:
                trajectory.append(self.drone.pos.copy())

        rms_jitter = float(np.sqrt(np.mean(np.square(angular_accelerations))))
        spikes_per_sec = total_spikes / max(t, 0.001)

        return TrialResult(
            controller_name=controller_type,
            scenario_name=scenario_name,
            dodged_successfully=dodged,
            crash_reason=crash_reason,
            min_clearance_m=min_clearance,
            rms_angular_jitter_rad_s2=rms_jitter,
            max_roll_deg=float(np.degrees(max_roll_rad)),
            max_pitch_deg=float(np.degrees(max_pitch_rad)),
            final_pos=self.drone.pos.copy(),
            trajectory=trajectory,
            spikes_per_sec=spikes_per_sec,
            reaction_latency_ms=reaction_latency_ms,
            crash_time_s=crash_time,
            stress_parameter_val=stress_val,
        )
