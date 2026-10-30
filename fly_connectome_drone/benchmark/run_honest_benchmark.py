"""
HONEST, VERIFIED COMPARATIVE BENCHMARK RUNNER
Evaluates:
1. Proposed Drosophila Connectome + Leaky Neuromorphic Gyro Bridge
2. Classical Robotics Optical Flow APF + Cascaded PID Autopilot
3. Naive Flawed Baseline Heuristic (bang-bang commands, pitch=thrust*0.5)
4. Ablated Connectome (Without Haltere Stabilization)

Identifies precise physical failure boundaries across:
- Closing Velocity Threshold (Stress to Crash)
- Reaction Distance Horizon (Late Pop-up)
- Crosswind Turbulence Limit
- Symmetrical Multi-Threat Pincer Corridor
- Photoreceptor Noise / Optical Degradation
"""

import sys
import os
import json
import time
from typing import Dict, List, Any, Tuple
import numpy as np

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fly_connectome_drone.simulation.arena_experiment import ArenaExperiment, ObstacleState, TrialResult


def run_benchmark():
    print("=" * 90, flush=True)
    print("      VERIFIED RIGOROUS BENCHMARK & SYSTEMATIC CRASH-BOUNDARY EVALUATION", flush=True)
    print("=" * 90, flush=True)
    print("Comparing 4 Controllers Under Identical 6-DoF Rigid-Body Physics (dt = 1.0 ms):", flush=True)
    print("  [1] Proposed Neuromorphic: Drosophila Connectome (Biophysical LIF) + Haltere Gyro Bridge", flush=True)
    print("  [2] Classical APF:         Optical Flow Repulsive Potential Field + Cascaded PID", flush=True)
    print("  [3] Baseline Flawed:       Discrete Bang-Bang Heuristic (pitch=thrust*0.5, no haltere)", flush=True)
    print("  [4] Ablated SNN:           Connectome SNN without Haltere Restorative Stabilization", flush=True)
    print("=" * 90, flush=True)

    arena = ArenaExperiment(trial_duration_s=2.8, dt_s=0.001)

    controllers = [
        ("proposed_neuromorphic", "Proposed Connectome"),
        ("classical_apf",         "Classical APF (PID)"),
        ("baseline_flawed",       "Baseline (Flawed)"),
        ("ablated_no_haltere",    "Ablated (No Haltere)"),
    ]

    all_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "suites": {},
        "crash_boundaries": {},
    }

    # Helper function to print trial summary
    def print_trial_line(ctrl_label: str, res: TrialResult):
        status = "PASSED" if res.dodged_successfully else f"CRASHED ({res.crash_reason})"
        print(f"    [{ctrl_label:<21}] {status:<24} | Min Clearance: {res.min_clearance_m:5.2f}m | Max Roll: {res.max_roll_deg:5.1f}° | Jitter: {res.rms_angular_jitter_rad_s2:5.1f} rad/s²", flush=True)

    # -------------------------------------------------------------------------
    # SUITE 1: CLOSING VELOCITY STRESS SWEEP (4 to 28 m/s)
    # -------------------------------------------------------------------------
    print("\n" + "#" * 90, flush=True)
    print(" [SUITE 1/5] VELOCITY STRESS: Approach Velocity from 4.0 m/s to 28.0 m/s (14 to 100 km/h)", flush=True)
    print(" Objective: Pinpoint the exact closing speed where reaction time & inertia cause collision.", flush=True)
    print("#" * 90, flush=True)

    speeds = [4.0, 7.0, 10.0, 13.0, 16.0, 20.0, 24.0, 28.0]
    suite1 = {cid: [] for cid, _ in controllers}

    for spd in speeds:
        closing_spd = spd + 3.0  # Drone forward speed is 3.0 m/s
        print(f"\n  -- Obstacle Speed: {spd:.1f} m/s (Relative Closing Speed: {closing_spd:.1f} m/s / {closing_spd*3.6:.1f} km/h) --", flush=True)
        obs = [ObstacleState(pos=np.array([14.0, 0.05, 1.5], dtype=np.float32), vel=np.array([-spd, 0.0, 0.0], dtype=np.float32), radius=0.35)]
        for cid, clabel in controllers:
            res = arena.run_trial(controller_type=cid, scenario_name=f"Velocity_{spd:.1f}", obstacles=obs, stress_val=closing_spd)
            suite1[cid].append({
                "speed_mps": closing_spd,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "jitter": round(res.rms_angular_jitter_rad_s2, 2),
                "latency_ms": round(res.reaction_latency_ms, 2),
            })
            print_trial_line(clabel, res)

    all_data["suites"]["velocity_stress"] = suite1

    # -------------------------------------------------------------------------
    # SUITE 2: POP-UP REACTION HORIZON (14m down to 2m)
    # -------------------------------------------------------------------------
    print("\n" + "#" * 90, flush=True)
    print(" [SUITE 2/5] POP-UP REACTION HORIZON: Obstacle Emergence Distance (14m down to 2m at 7 m/s)", flush=True)
    print(" Objective: Find the minimum perceptual warning distance required to bank and clear obstacle.", flush=True)
    print("#" * 90, flush=True)

    distances = [14.0, 11.0, 8.0, 6.0, 4.5, 3.5, 2.5, 1.8]
    suite2 = {cid: [] for cid, _ in controllers}

    for dist in distances:
        print(f"\n  -- Obstacle Distance: {dist:.1f} m (Time-to-Impact: {dist / 10.0:.2f} s) --", flush=True)
        obs = [ObstacleState(pos=np.array([dist, 0.0, 1.5], dtype=np.float32), vel=np.array([-7.0, 0.0, 0.0], dtype=np.float32), radius=0.35)]
        for cid, clabel in controllers:
            res = arena.run_trial(controller_type=cid, scenario_name=f"Distance_{dist:.1f}", obstacles=obs, stress_val=dist)
            suite2[cid].append({
                "distance_m": dist,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "jitter": round(res.rms_angular_jitter_rad_s2, 2),
                "latency_ms": round(res.reaction_latency_ms, 2),
            })
            print_trial_line(clabel, res)

    all_data["suites"]["reaction_horizon"] = suite2

    # -------------------------------------------------------------------------
    # SUITE 3: CROSSWIND TURBULENCE GUSTS (0 to 14 m/s)
    # -------------------------------------------------------------------------
    print("\n" + "#" * 90, flush=True)
    print(" [SUITE 3/5] CROSSWIND TURBULENCE GUSTS: Lateral Wind 0 to 14 m/s (0 to 50 km/h)", flush=True)
    print(" Objective: Determine crosswind velocity threshold causing aerodynamic tumble or ground strike.", flush=True)
    print("#" * 90, flush=True)

    winds = [0.0, 3.0, 6.0, 9.0, 12.0, 15.0]
    suite3 = {cid: [] for cid, _ in controllers}

    for wind in winds:
        print(f"\n  -- Lateral Crosswind: {wind:.1f} m/s ({wind * 3.6:.1f} km/h) --", flush=True)
        wind_vec = np.array([0.0, wind, 0.0], dtype=np.float32)
        obs = [ObstacleState(pos=np.array([14.0, 0.05, 1.5], dtype=np.float32), vel=np.array([-5.0, 0.0, 0.0], dtype=np.float32), radius=0.35)]
        for cid, clabel in controllers:
            res = arena.run_trial(controller_type=cid, scenario_name=f"Wind_{wind:.1f}", obstacles=obs, wind_world=wind_vec, stress_val=wind)
            suite3[cid].append({
                "wind_mps": wind,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
                "final_pos_z": round(float(res.final_pos[2]), 2),
            })
            print_trial_line(clabel, res)

    all_data["suites"]["crosswind_stress"] = suite3

    # -------------------------------------------------------------------------
    # SUITE 4: DUAL-THREAT PINCER TRAP (Gap: 2.0m down to 0.5m)
    # -------------------------------------------------------------------------
    print("\n" + "#" * 90, flush=True)
    print(" [SUITE 4/5] DUAL-THREAT PINCER TRAP: Symmetrical Converging Obstacles (Gap 2.0m down to 0.5m)", flush=True)
    print(" Objective: Test bilateral symmetry breaking and corridor navigation limits.", flush=True)
    print("#" * 90, flush=True)

    gaps = [2.0, 1.5, 1.1, 0.8, 0.5]
    suite4 = {cid: [] for cid, _ in controllers}

    for gap in gaps:
        half_gap = gap / 2.0
        print(f"\n  -- Pincer Corridor Gap: {gap:.2f} m (Flanking ±{half_gap:.2f} m) --", flush=True)
        obs_pincer = [
            ObstacleState(pos=np.array([14.0, -half_gap, 1.5], dtype=np.float32), vel=np.array([-4.5, 0.0, 0.0], dtype=np.float32), radius=0.35),
            ObstacleState(pos=np.array([14.0, half_gap, 1.5], dtype=np.float32), vel=np.array([-4.5, 0.0, 0.0], dtype=np.float32), radius=0.35),
        ]
        for cid, clabel in controllers:
            res = arena.run_trial(controller_type=cid, scenario_name=f"Pincer_{gap:.2f}", obstacles=obs_pincer, stress_val=gap)
            suite4[cid].append({
                "gap_m": gap,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "max_roll_deg": round(res.max_roll_deg, 1),
            })
            print_trial_line(clabel, res)

    all_data["suites"]["pincer_trap"] = suite4

    # -------------------------------------------------------------------------
    # SUITE 5: SENSORY NOISE / PHOTON DEGRADATION (sigma 0.0 to 1.5)
    # -------------------------------------------------------------------------
    print("\n" + "#" * 90, flush=True)
    print(" [SUITE 5/5] SENSORY NOISE TOLERANCE: Photoreceptor Gaussian Noise (sigma 0.0 to 1.5)", flush=True)
    print(" Objective: Determine optical sensor degradation point where vision fails to detect threat.", flush=True)
    print("#" * 90, flush=True)

    noise_sigmas = [0.0, 0.3, 0.6, 0.9, 1.2, 1.5]
    suite5 = {cid: [] for cid, _ in controllers}

    for sigma in noise_sigmas:
        print(f"\n  -- Photoreceptor Noise Sigma: {sigma:.2f} --", flush=True)
        obs = [ObstacleState(pos=np.array([14.0, 0.0, 1.5], dtype=np.float32), vel=np.array([-5.0, 0.0, 0.0], dtype=np.float32), radius=0.35)]
        for cid, clabel in controllers:
            res = arena.run_trial(controller_type=cid, scenario_name=f"Noise_{sigma:.2f}", obstacles=obs, sensory_noise_std=sigma, stress_val=sigma)
            suite5[cid].append({
                "noise_sigma": sigma,
                "dodged": res.dodged_successfully,
                "crash_reason": res.crash_reason,
                "min_clearance_m": round(res.min_clearance_m, 3),
                "spikes_per_sec": round(res.spikes_per_sec, 1),
            })
            print_trial_line(clabel, res)

    all_data["suites"]["sensory_noise"] = suite5

    # -------------------------------------------------------------------------
    # COMPILE EXACT FAILURE BOUNDARY BREAKDOWN
    # -------------------------------------------------------------------------
    print("\n" + "=" * 90, flush=True)
    print("              EXECUTIVE COMPARATIVE FAILURE BOUNDARY MATRIX", flush=True)
    print("=" * 90, flush=True)

    def find_first_failure(trials: List[Dict], val_key: str, mode: str = "max") -> Tuple[Any, str]:
        """Returns the first parameter value where the controller fails and its crash reason."""
        for t in trials:
            if not t["dodged"]:
                return (t[val_key], t["crash_reason"])
        return ("Survived All", "NONE")

    boundaries = {}
    for cid, clabel in controllers:
        v_fail, v_reason = find_first_failure(suite1[cid], "speed_mps", "max")
        d_fail, d_reason = find_first_failure(suite2[cid], "distance_m", "min")
        w_fail, w_reason = find_first_failure(suite3[cid], "wind_mps", "max")
        p_fail, p_reason = find_first_failure(suite4[cid], "gap_m", "min")
        n_fail, n_reason = find_first_failure(suite5[cid], "noise_sigma", "max")

        boundaries[cid] = {
            "name": clabel,
            "max_closing_speed": f"{v_fail} ({v_reason})" if v_fail != "Survived All" else "Survived All (>=31 m/s)",
            "min_reaction_dist": f"{d_fail} ({d_reason})" if d_fail != "Survived All" else "Survived All (<=1.8 m)",
            "max_crosswind":     f"{w_fail} ({w_reason})" if w_fail != "Survived All" else "Survived All (>=15 m/s)",
            "pincer_gap_limit":  f"{p_fail} ({p_reason})" if p_fail != "Survived All" else "Survived All (<=0.5 m)",
            "sensor_noise_limit":f"{n_fail} ({n_reason})" if n_fail != "Survived All" else "Survived All (>=1.5 sigma)",
        }

    all_data["crash_boundaries"] = boundaries

    print(f"{'Stress Test Parameter':<30} | {'Proposed Connectome':<18} | {'Classical APF':<18} | {'Baseline Flawed':<18} | {'Ablated (No Haltere)':<18}", flush=True)
    print("-" * 115, flush=True)
    print(f"{'Crash Closing Speed':<30} | {boundaries['proposed_neuromorphic']['max_closing_speed']:<18} | {boundaries['classical_apf']['max_closing_speed']:<18} | {boundaries['baseline_flawed']['max_closing_speed']:<18} | {boundaries['ablated_no_haltere']['max_closing_speed']:<18}", flush=True)
    print(f"{'Min Reaction Distance':<30} | {boundaries['proposed_neuromorphic']['min_reaction_dist']:<18} | {boundaries['classical_apf']['min_reaction_dist']:<18} | {boundaries['baseline_flawed']['min_reaction_dist']:<18} | {boundaries['ablated_no_haltere']['min_reaction_dist']:<18}", flush=True)
    print(f"{'Crosswind Crash Limit':<30} | {boundaries['proposed_neuromorphic']['max_crosswind']:<18} | {boundaries['classical_apf']['max_crosswind']:<18} | {boundaries['baseline_flawed']['max_crosswind']:<18} | {boundaries['ablated_no_haltere']['max_crosswind']:<18}", flush=True)
    print(f"{'Pincer Trap Gap Limit':<30} | {boundaries['proposed_neuromorphic']['pincer_gap_limit']:<18} | {boundaries['classical_apf']['pincer_gap_limit']:<18} | {boundaries['baseline_flawed']['pincer_gap_limit']:<18} | {boundaries['ablated_no_haltere']['pincer_gap_limit']:<18}", flush=True)
    print(f"{'Sensor Noise Sigma Limit':<30} | {boundaries['proposed_neuromorphic']['sensor_noise_limit']:<18} | {boundaries['classical_apf']['sensor_noise_limit']:<18} | {boundaries['baseline_flawed']['sensor_noise_limit']:<18} | {boundaries['ablated_no_haltere']['sensor_noise_limit']:<18}", flush=True)
    print("=" * 115, flush=True)

    # Save to disk
    out_json = os.path.abspath(os.path.join(os.path.dirname(__file__), "honest_benchmark_report.json"))
    with open(out_json, "w") as f:
        json.dump(all_data, f, indent=2)
    print(f"\n[BENCHMARK SAVED] Complete telemetry and raw data saved to: {out_json}", flush=True)

    return all_data


if __name__ == "__main__":
    run_benchmark()
