"""
RIGOROUS MODEL CRASH-TEST BENCHMARK & REAL-TIME COMPARATOR
Executes systematic stress sweeps until failure across 3 independent flight controllers:
1. Proposed: Drosophila Connectome Spiking Engine + Continuous Neuromorphic Gyro Bridge
2. Baseline: Flawed Discrete Heuristic (naive flybrain)
3. Classical: Classical Robotics Optical Flow Artificial Potential Field (APF) PID

Measures physical failure boundaries:
- Maximum survivable closing velocity before collision (m/s)
- Minimum survivable reaction distance before crash (m)
- Maximum survivable crosswind gust before tumble / stall (m/s)
- Symmetrical multi-threat pincer resolution rate (%)
- Photoreceptor noise tolerance threshold (sigma)
"""

import sys
import os
import json
import time
from typing import Dict, List, Any
import numpy as np

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fly_connectome_drone.simulation.arena_experiment import ArenaExperiment, ObstacleState, TrialResult


def run_comprehensive_crash_benchmark() -> Dict[str, Any]:
    print("=" * 88)
    print("        DROSOPHILA CONNECTOME CRASH-TEST BENCHMARK & REAL-TIME MODEL COMPARISON")
    print(" Models Under Test:")
    print("   [1] Proposed Neuromorphic Gyro Bridge (Biophysical LIF + Leaky Haltere Stabilization)")
    print("   [2] Flawed Baseline Discrete Heuristic (Naive discrete bang-bang, pitch=thrust*0.5)")
    print("   [3] Classical Robotics APF Autopilot (Continuous Optical Flow Repulsive Field + PID)")
    print(" Physics Engine: True 6-DoF Rigid-Body Newton-Euler Dynamics (dt = 1.0 ms)")
    print("=" * 88)

    arena = ArenaExperiment(trial_duration_s=3.0, dt_s=0.001)

    controllers = [
        ("proposed_neuromorphic", "Proposed Neuromorphic"),
        ("baseline_flawed", "Baseline Flawed"),
        ("classical_apf", "Classical APF"),
    ]

    benchmark_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "suites": {},
    }

    # =========================================================================
    # SUITE 1: VELOCITY STRESS TO CRASH (4 m/s to 28 m/s in steps)
    # =========================================================================
    print("\n" + "#" * 88)
    print(" [SUITE 1/5] VELOCITY STRESS TO CRASH (Closing Speed: 4 m/s to 28 m/s [14 - 100 km/h])")
    print(" Goal: Find the exact physical closing speed where each controller fails/crashes.")
    print("#" * 88)

    speeds = [4.0, 7.0, 10.0, 13.0, 16.0, 19.0, 22.0, 25.0, 28.0]
    suite1_results = {ctrl_id: [] for ctrl_id, _ in controllers}

    for spd in speeds:
        print(f"\n--- Testing Closing Speed: {spd:.1f} m/s ({spd * 3.6:.1f} km/h) ---")
        for ctrl_id, ctrl_label in controllers:
            obs = [ObstacleState(pos=np.array([16.0, 0.05, 1.5], dtype=np.float32), vel=np.array([-spd, 0.0, 0.0], dtype=np.float32))]
            res = arena.run_trial(
                controller_type=ctrl_id,
                scenario_name=f"Velocity_{spd:.1f}mps",
                obstacles=obs,
                stress_val=spd,
            )
            suite1_results[ctrl_id].append({
                "speed_mps": spd,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "jitter_rad_s2": round(res.rms_angular_jitter_rad_s2, 2),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "latency_ms": round(res.reaction_latency_ms, 2),
            })
            status = "PASSED (Dodged)" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
            print(f"  [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Roll: {res.max_roll_deg:4.1f}° | Latency: {res.reaction_latency_ms:5.1f}ms")

    benchmark_data["suites"]["velocity_stress"] = suite1_results

    # =========================================================================
    # SUITE 2: POP-UP REACTION DISTANCE BOUNDARY (16m down to 2m)
    # =========================================================================
    print("\n" + "#" * 88)
    print(" [SUITE 2/5] POP-UP REACTION HORIZON (Spawn Distance: 16m down to 2m at 7.0 m/s)")
    print(" Goal: Determine the minimum perception-to-collision warning distance needed to dodge.")
    print("#" * 88)

    distances = [16.0, 12.0, 9.0, 7.0, 5.0, 4.0, 3.0, 2.0]
    suite2_results = {ctrl_id: [] for ctrl_id, _ in controllers}

    for dist in distances:
        print(f"\n--- Testing Pop-Up Distance: {dist:.1f} m ---")
        for ctrl_id, ctrl_label in controllers:
            obs = [ObstacleState(pos=np.array([dist, 0.0, 1.5], dtype=np.float32), vel=np.array([-7.0, 0.0, 0.0], dtype=np.float32))]
            res = arena.run_trial(
                controller_type=ctrl_id,
                scenario_name=f"Distance_{dist:.1f}m",
                obstacles=obs,
                stress_val=dist,
            )
            suite2_results[ctrl_id].append({
                "distance_m": dist,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "jitter_rad_s2": round(res.rms_angular_jitter_rad_s2, 2),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "latency_ms": round(res.reaction_latency_ms, 2),
            })
            status = "PASSED (Dodged)" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
            print(f"  [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Roll: {res.max_roll_deg:4.1f}°")

    benchmark_data["suites"]["distance_horizon"] = suite2_results

    # =========================================================================
    # SUITE 3: CROSSWIND TURBULENCE GUST STRESS (0 to 14 m/s [0 to 50 km/h])
    # =========================================================================
    print("\n" + "#" * 88)
    print(" [SUITE 3/5] CROSSWIND TURBULENCE GUSTS (Lateral Wind: 0 to 14 m/s during evasion)")
    print(" Goal: Verify aerodynamic roll stability and resistance to lateral blow-off and ground strikes.")
    print("#" * 88)

    winds = [0.0, 2.5, 5.0, 7.5, 10.0, 12.5, 15.0]
    suite3_results = {ctrl_id: [] for ctrl_id, _ in controllers}

    for wind in winds:
        print(f"\n--- Testing Lateral Crosswind: {wind:.1f} m/s ({wind * 3.6:.1f} km/h) ---")
        wind_vec = np.array([0.0, wind, 0.0], dtype=np.float32)
        for ctrl_id, ctrl_label in controllers:
            obs = [ObstacleState(pos=np.array([14.0, 0.1, 1.5], dtype=np.float32), vel=np.array([-5.0, 0.0, 0.0], dtype=np.float32))]
            res = arena.run_trial(
                controller_type=ctrl_id,
                scenario_name=f"Wind_{wind:.1f}mps",
                obstacles=obs,
                wind_world=wind_vec,
                stress_val=wind,
            )
            suite3_results[ctrl_id].append({
                "wind_mps": wind,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "final_pos_z": round(float(res.final_pos[2]), 2),
            })
            status = "PASSED (Dodged)" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
            print(f"  [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Roll: {res.max_roll_deg:4.1f}° | Alt: {res.final_pos[2]:4.2f}m")

    benchmark_data["suites"]["crosswind_stress"] = suite3_results

    # =========================================================================
    # SUITE 4: DUAL-THREAT PINCER TRAP (Left & Right Simultaneous Threats)
    # =========================================================================
    print("\n" + "#" * 88)
    print(" [SUITE 4/5] DUAL-THREAT PINCER TRAP (Simultaneous Convergence from Left & Right)")
    print(" Goal: Test bilateral symmetry-breaking and dilemma resolution under optical deadlock.")
    print("#" * 88)

    offsets = [0.8, 0.6, 0.4, 0.3]
    suite4_results = {ctrl_id: [] for ctrl_id, _ in controllers}

    for off in offsets:
        print(f"\n--- Testing Pincer Corridor Width: ±{off:.2f} m (Gap: {off*2:.2f}m) ---")
        obs_pincer = [
            ObstacleState(pos=np.array([14.0, -off, 1.5], dtype=np.float32), vel=np.array([-4.5, 0.0, 0.0], dtype=np.float32)),
            ObstacleState(pos=np.array([14.0, off, 1.5], dtype=np.float32), vel=np.array([-4.5, 0.0, 0.0], dtype=np.float32)),
        ]
        for ctrl_id, ctrl_label in controllers:
            res = arena.run_trial(
                controller_type=ctrl_id,
                scenario_name=f"Pincer_gap_{off*2:.2f}m",
                obstacles=obs_pincer,
                stress_val=off * 2.0,
            )
            suite4_results[ctrl_id].append({
                "gap_m": off * 2.0,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
            })
            status = "PASSED (Dodged)" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
            print(f"  [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Roll: {res.max_roll_deg:4.1f}°")

    benchmark_data["suites"]["pincer_trap"] = suite4_results

    # =========================================================================
    # SUITE 5: SENSORY NOISE & PHOTON DEGRADATION (sigma = 0.0 to 1.5)
    # =========================================================================
    print("\n" + "#" * 88)
    print(" [SUITE 5/5] SENSORY NOISE TOLERANCE (Photoreceptor Gaussian Noise: sigma 0.0 to 1.5)")
    print(" Goal: Test robustness against low-light photon noise, fog, and sensor corruption.")
    print("#" * 88)

    noise_levels = [0.0, 0.2, 0.5, 0.8, 1.2, 1.6]
    suite5_results = {ctrl_id: [] for ctrl_id, _ in controllers}

    for noise_sigma in noise_levels:
        print(f"\n--- Testing Sensory Noise Sigma: {noise_sigma:.2f} ---")
        for ctrl_id, ctrl_label in controllers:
            obs = [ObstacleState(pos=np.array([14.0, 0.0, 1.5], dtype=np.float32), vel=np.array([-5.0, 0.0, 0.0], dtype=np.float32))]
            res = arena.run_trial(
                controller_type=ctrl_id,
                scenario_name=f"Noise_{noise_sigma:.2f}",
                obstacles=obs,
                sensory_noise_std=noise_sigma,
                stress_val=noise_sigma,
            )
            suite5_results[ctrl_id].append({
                "noise_sigma": noise_sigma,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "spikes_per_sec": round(res.spikes_per_sec, 1),
            })
            status = "PASSED (Dodged)" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
            print(f"  [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Spikes/s: {res.spikes_per_sec:8.1f}")

    benchmark_data["suites"]["sensory_noise"] = suite5_results

    # =========================================================================
    # EXECUTIVE CRASH-BOUNDARY SUMMARY & PHYSICAL LIMITS REPORT
    # =========================================================================
    print("\n" + "=" * 88)
    print("                 EXECUTIVE BENCHMARK & CRASH BOUNDARY ANALYSIS")
    print("=" * 88)

    def find_crash_boundary(trials, key, direction="max"):
        """Finds the critical parameter value where the controller first crashes."""
        for t in trials:
            if not t["dodged"]:
                return t[key], t["crash_reason"]
        return ("Survived All", "NONE")

    print(f"{'Performance Stress Dimension':<34} | {'Proposed Neuromorphic':<18} | {'Baseline (Naive)':<18} | {'Classical APF':<18}")
    print("-" * 96)

    # Max speed
    v_prop, v_prop_r = find_crash_boundary(suite1_results["proposed_neuromorphic"], "speed_mps")
    v_base, v_base_r = find_crash_boundary(suite1_results["baseline_flawed"], "speed_mps")
    v_apf, v_apf_r = find_crash_boundary(suite1_results["classical_apf"], "speed_mps")
    print(f"{'Crash Speed Limit (m/s)':<34} | {str(v_prop):<18} | {str(v_base):<18} | {str(v_apf):<18}")

    # Min distance
    d_prop, _ = find_crash_boundary(suite2_results["proposed_neuromorphic"], "distance_m")
    d_base, _ = find_crash_boundary(suite2_results["baseline_flawed"], "distance_m")
    d_apf, _ = find_crash_boundary(suite2_results["classical_apf"], "distance_m")
    print(f"{'Min Reaction Distance (m)':<34} | {str(d_prop):<18} | {str(d_base):<18} | {str(d_apf):<18}")

    # Wind limit
    w_prop, w_prop_r = find_crash_boundary(suite3_results["proposed_neuromorphic"], "wind_mps")
    w_base, w_base_r = find_crash_boundary(suite3_results["baseline_flawed"], "wind_mps")
    w_apf, w_apf_r = find_crash_boundary(suite3_results["classical_apf"], "wind_mps")
    print(f"{'Crosswind Crash Limit (m/s)':<34} | {str(w_prop):<18} | {str(w_base):<18} | {str(w_apf):<18}")

    # Pincer trap
    p_prop, _ = find_crash_boundary(suite4_results["proposed_neuromorphic"], "gap_m")
    p_base, _ = find_crash_boundary(suite4_results["baseline_flawed"], "gap_m")
    p_apf, _ = find_crash_boundary(suite4_results["classical_apf"], "gap_m")
    print(f"{'Pincer Trap Gap Limit (m)':<34} | {str(p_prop):<18} | {str(p_base):<18} | {str(p_apf):<18}")

    # Noise limit
    n_prop, _ = find_crash_boundary(suite5_results["proposed_neuromorphic"], "noise_sigma")
    n_base, _ = find_crash_boundary(suite5_results["baseline_flawed"], "noise_sigma")
    n_apf, _ = find_crash_boundary(suite5_results["classical_apf"], "noise_sigma")
    print(f"{'Noise Crash Limit (sigma)':<34} | {str(n_prop):<18} | {str(n_base):<18} | {str(n_apf):<18}")
    print("=" * 88)

    # Save output to JSON
    json_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "crash_benchmark_results.json"))
    with open(json_path, "w") as f:
        json.dump(benchmark_data, f, indent=2)
    print(f"\n[OK] Raw benchmark telemetry saved to: {json_path}")

    return benchmark_data


if __name__ == "__main__":
    run_comprehensive_crash_benchmark()
