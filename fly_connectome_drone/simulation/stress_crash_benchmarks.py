"""
COMPREHENSIVE CRASH & STRESS TEST BENCHMARK SUITE
Executes rigorous dynamic trials across 5 stressful real-world flight scenarios:
1. Speed Sweep (Closing speeds 3 m/s to 9 m/s)
2. Angular Bearing Sweep (-45 deg to +45 deg)
3. Heavy Crosswind Turbulence (Sudden lateral wind gusts)
4. Visual Sensor Noise (0% to 60% camera noise / dirty lens)
5. Multi-Obstacle Sequential Looming (Rapid double threat)
"""

import sys
import os
import time
from typing import Dict, List, Tuple
import numpy as np

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fly_connectome_drone.connectome.synaptic_matrix import ConnectomeGraph
from fly_connectome_drone.spiking_engine.biophysical_lif import BiophysicalLIFEngine
from fly_connectome_drone.spiking_engine.compound_eye import CompoundEyeRetina
from fly_connectome_drone.conversion_engine.neuromorphic_gyro import NeuromorphicGyroBridge
from fly_connectome_drone.simulation.drone_dynamics_6dof import DroneDynamics6DoF


class StressTestHarness:
    def __init__(self, dt_s: float = 0.001):
        self.dt = dt_s
        self.graph = ConnectomeGraph(n_ommatidia_per_eye=32)
        self.lif = BiophysicalLIFEngine(self.graph, dt_ms=self.dt * 1000.0)
        self.eye = CompoundEyeRetina(n_ommatidia_per_eye=32)
        self.gyro_bridge = NeuromorphicGyroBridge(dt_s=self.dt)
        self.drone = DroneDynamics6DoF(dt_s=self.dt)

        # Pre-cache neuron indices
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
        self.ext_currents = np.zeros(self.graph.n_total, dtype=np.float32)

    def run_stress_trial(
        self,
        controller_type: str = "neuromorphic", # "neuromorphic" or "baseline"
        obstacle_speed: float = 4.0,           # m/s closing speed
        obstacle_angle_deg: float = 0.0,       # approach angle
        crosswind_m_s: float = 0.0,            # lateral wind force
        visual_noise_sigma: float = 0.0,       # camera noise
        multi_threat: bool = False
    ) -> Dict:
        # Reset systems
        self.drone.reset(
            init_pos=np.array([0.0, 0.0, 1.5], dtype=np.float32),
            init_vel=np.array([3.0, 0.0, 0.0], dtype=np.float32)
        )
        self.lif.reset()
        self.gyro_bridge.reset()

        # Primary Obstacle
        angle_rad = np.radians(obstacle_angle_deg)
        dist_start = 14.0
        obs1_pos = np.array([
            dist_start * np.cos(angle_rad),
            dist_start * np.sin(angle_rad),
            1.5
        ], dtype=np.float32)
        obs1_vel = np.array([
            -obstacle_speed * np.cos(angle_rad),
            -obstacle_speed * np.sin(angle_rad),
            0.0
        ], dtype=np.float32)

        # Secondary Obstacle (if multi-threat)
        obs2_pos = np.array([22.0, -0.6, 1.5], dtype=np.float32)
        obs2_vel = np.array([-obstacle_speed, 0.0, 0.0], dtype=np.float32)

        obs_radius = 0.35
        drone_radius = 0.20
        collision_thresh = obs_radius + drone_radius

        min_clearance = 999.0
        dodged = True
        latency_ms = 999.0
        reaction_detected = False
        duration_s = 2.8
        n_steps = int(duration_s / self.dt)

        for step in range(n_steps):
            t = step * self.dt

            # Update obstacle 1
            obs1_pos += obs1_vel * self.dt
            rel_world1 = obs1_pos - self.drone.pos
            dist1 = float(np.linalg.norm(rel_world1))
            if dist1 < min_clearance:
                min_clearance = dist1
            if dist1 <= collision_thresh:
                dodged = False

            # Update obstacle 2 if active
            if multi_threat:
                obs2_pos += obs2_vel * self.dt
                rel_world2 = obs2_pos - self.drone.pos
                dist2 = float(np.linalg.norm(rel_world2))
                if dist2 < min_clearance:
                    min_clearance = dist2
                if dist2 <= collision_thresh:
                    dodged = False

            # Relative frame transform for vision
            R = self.drone.rotation_matrix()
            rel_body = np.dot(R.T, rel_world1)
            rel_vel_body = np.dot(R.T, obs1_vel - self.drone.vel)

            body_vel = self.drone.get_body_velocity()
            fl, fr = self.eye.compute_photoreceptor_currents(
                drone_velocity_body=body_vel,
                drone_angular_rate=self.drone.omega,
                obstacle_rel_pos=rel_body,
                obstacle_rel_vel=rel_vel_body,
                obstacle_radius=obs_radius
            )

            # Inject visual sensor noise (simulating dirty lens / darkness / packet drops)
            if visual_noise_sigma > 0.0:
                fl += np.maximum(0.0, np.random.normal(0.0, visual_noise_sigma, size=len(fl)).astype(np.float32))
                fr += np.maximum(0.0, np.random.normal(0.0, visual_noise_sigma, size=len(fr)).astype(np.float32))

            # LIF Spiking Step
            self.ext_currents.fill(0.0)
            self.ext_currents[self.idx_r_l] = fl * 1.8
            self.ext_currents[self.idx_r_r] = fr * 1.8
            spikes = self.lif.step(self.ext_currents)

            spk_01l = bool(spikes[self.idx_dna01_l])
            spk_01r = bool(spikes[self.idx_dna01_r])
            spk_02l = bool(spikes[self.idx_dna02_l])
            spk_02r = bool(spikes[self.idx_dna02_r])
            spk_p01 = bool(spikes[self.idx_dnp01])
            spk_b01 = bool(spikes[self.idx_dnb01])
            spk_gfl = bool(spikes[self.idx_gf_l])
            spk_gfr = bool(spikes[self.idx_gf_r])

            if not reaction_detected and (spk_02l or spk_02r or spk_gfl or spk_gfr):
                latency_ms = t * 1000.0
                reaction_detected = True

            # Controller Execution
            if controller_type == "neuromorphic":
                ctrl = self.gyro_bridge.decode_spikes(
                    spk_01l, spk_01r, spk_02l, spk_02r, spk_p01, spk_b01, spk_gfl, spk_gfr,
                    float(self.drone.euler[0]), float(self.drone.euler[1]),
                    float(self.drone.pos[2]), float(self.drone.vel[2])
                )
                roll_rate_sp = ctrl.roll_rate_sp
                pitch_rate_sp = ctrl.pitch_rate_sp
                yaw_rate_sp = ctrl.yaw_rate_sp
                thrust_sp = ctrl.thrust_sp
            else:
                # Baseline flawed heuristic
                raw_yaw = 3.0 if spk_01l else (-3.0 if spk_01r else 0.0)
                raw_thrust = 8.5 if (spk_gfl or spk_gfr) else 4.41
                thrust_sp = raw_thrust
                yaw_rate_sp = raw_yaw
                pitch_rate_sp = float(np.clip(thrust_sp * 0.3, -2.0, 2.0))
                roll_rate_sp = float(np.clip(yaw_rate_sp * 0.3, -2.0, 2.0))

            # Apply Crosswind Turbulence Force
            if crosswind_m_s != 0.0:
                # Wind applies lateral aerodynamic drag pushing the drone
                wind_accel = np.array([0.0, crosswind_m_s * 0.35, 0.0], dtype=np.float32)
                self.drone.vel += wind_accel * self.dt

            self.drone.step(roll_rate_sp, pitch_rate_sp, yaw_rate_sp, thrust_sp)

        return {
            "controller": controller_type,
            "dodged": dodged,
            "min_clearance": min_clearance,
            "latency_ms": latency_ms,
            "final_pos": self.drone.pos.copy()
        }


def execute_all_stress_tests():
    harness = StressTestHarness()
    results = {}

    print("=" * 80)
    print("        DEEP CRASH TESTS & STRESS BENCHMARKS (SIMULATED FLIGHT)")
    print("=" * 80)

    # 1. SPEED STRESS TEST (Threat approach from 3 m/s to 9 m/s)
    speeds = [3.0, 5.0, 7.0, 9.0]
    print("\n--- TEST SUITE 1: CLOSING SPEED STRESS TEST ---")
    speed_results = {"baseline": [], "neuromorphic": []}
    for s in speeds:
        res_b = harness.run_stress_trial("baseline", obstacle_speed=s)
        res_n = harness.run_stress_trial("neuromorphic", obstacle_speed=s)
        speed_results["baseline"].append(res_b)
        speed_results["neuromorphic"].append(res_n)
        status_b = "PASS" if res_b["dodged"] else "CRASH"
        status_n = "PASS" if res_n["dodged"] else "CRASH"
        print(f" Closing Speed {s*3.6:4.1f} km/h ({s:.1f} m/s) | Baseline: {status_b} (Clear: {res_b['min_clearance']:.2f}m) | Neuromorphic: {status_n} (Clear: {res_n['min_clearance']:.2f}m)")
    results["speed"] = speed_results

    # 2. ANGULAR DIRECTIONAL SWEEP (-45 deg to +45 deg)
    angles = [-45.0, -30.0, -15.0, 0.0, 15.0, 30.0, 45.0]
    print("\n--- TEST SUITE 2: ANGULAR BEARING & BLIND SPOT TEST ---")
    angle_results = {"baseline": [], "neuromorphic": []}
    for a in angles:
        res_b = harness.run_stress_trial("baseline", obstacle_angle_deg=a)
        res_n = harness.run_stress_trial("neuromorphic", obstacle_angle_deg=a)
        angle_results["baseline"].append(res_b)
        angle_results["neuromorphic"].append(res_n)
        status_b = "PASS" if res_b["dodged"] else "CRASH"
        status_n = "PASS" if res_n["dodged"] else "CRASH"
        print(f" Threat Angle {a:+5.1f} deg | Baseline: {status_b} (Clear: {res_b['min_clearance']:.2f}m) | Neuromorphic: {status_n} (Clear: {res_n['min_clearance']:.2f}m)")
    results["angle"] = angle_results

    # 3. HEAVY CROSSWIND & TURBULENCE TEST (0 km/h to 18 km/h lateral gusts)
    winds = [0.0, 2.0, 3.5, 5.0]
    print("\n--- TEST SUITE 3: CROSSWIND GUST & TURBULENCE RECOVERY ---")
    wind_results = {"baseline": [], "neuromorphic": []}
    for w in winds:
        res_b = harness.run_stress_trial("baseline", crosswind_m_s=w)
        res_n = harness.run_stress_trial("neuromorphic", crosswind_m_s=w)
        wind_results["baseline"].append(res_b)
        wind_results["neuromorphic"].append(res_n)
        status_b = "PASS" if res_b["dodged"] else "CRASH"
        status_n = "PASS" if res_n["dodged"] else "CRASH"
        print(f" Lateral Wind {w*3.6:4.1f} km/h | Baseline: {status_b} (Clear: {res_b['min_clearance']:.2f}m) | Neuromorphic: {status_n} (Clear: {res_n['min_clearance']:.2f}m)")
    results["wind"] = wind_results

    # 4. VISUAL SENSOR NOISE & CAMERA DEGRADATION (0% to 50% sensor noise)
    noises = [0.0, 0.1, 0.25, 0.45]
    print("\n--- TEST SUITE 4: SENSOR NOISE & LOW-LIGHT DEGRADATION ---")
    noise_results = {"baseline": [], "neuromorphic": []}
    for n_val in noises:
        res_b = harness.run_stress_trial("baseline", visual_noise_sigma=n_val)
        res_n = harness.run_stress_trial("neuromorphic", visual_noise_sigma=n_val)
        noise_results["baseline"].append(res_b)
        noise_results["neuromorphic"].append(res_n)
        status_b = "PASS" if res_b["dodged"] else "CRASH"
        status_n = "PASS" if res_n["dodged"] else "CRASH"
        print(f" Visual Noise {n_val*100:4.1f}% | Baseline: {status_b} (Clear: {res_b['min_clearance']:.2f}m) | Neuromorphic: {status_n} (Clear: {res_n['min_clearance']:.2f}m)")
    results["noise"] = noise_results

    # 5. MULTI-OBSTACLE SEQUENTIAL THREAT (Double threat test)
    print("\n--- TEST SUITE 5: MULTI-OBSTACLE RAPID SUCCESSION TEST ---")
    res_b = harness.run_stress_trial("baseline", multi_threat=True)
    res_n = harness.run_stress_trial("neuromorphic", multi_threat=True)
    status_b = "PASS" if res_b["dodged"] else "CRASH"
    status_n = "PASS" if res_n["dodged"] else "CRASH"
    print(f" Double Threat Encounter | Baseline: {status_b} (Clear: {res_b['min_clearance']:.2f}m) | Neuromorphic: {status_n} (Clear: {res_n['min_clearance']:.2f}m)")
    results["multi"] = {"baseline": res_b, "neuromorphic": res_n}

    print("\n" + "=" * 80)
    print(" [TESTS FINISHED] All simulated crash and stress benchmarks executed successfully.")
    print("=" * 80)
    return results


if __name__ == "__main__":
    execute_all_stress_tests()
