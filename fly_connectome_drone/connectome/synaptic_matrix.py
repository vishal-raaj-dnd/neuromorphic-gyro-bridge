"""
SYNAPTIC CONNECTIVITY MATRIX - DROSOPHILA FLIGHT SUB-CONNECTOME
Constructs the biologically grounded directed synaptic graph between visual,
looming, motion, and descending flight command neurons.
"""

from typing import Dict, List, Tuple
import numpy as np


class ConnectomeGraph:
    """
    Biological circuit graph for Drosophila flight control.
    Contains both Left (L) and Right (R) visual hemispheres feeding into
    bilateral descending flight control motor neurons.
    """

    def __init__(self, n_ommatidia_per_eye: int = 32):
        self.n_eye = n_ommatidia_per_eye
        self.neuron_names: List[str] = []
        self.neuron_index_map: Dict[str, int] = {}
        self.neuron_types: List[str] = []
        self.reversal_potentials_mv: List[float] = []

        self._build_neuron_registry()
        self.n_total = len(self.neuron_names)

        # Adjacency weight matrix [N_total x N_total] (pre -> post)
        self.weights = np.zeros((self.n_total, self.n_total), dtype=np.float32)
        self._wire_biological_synapses()

    def _register_neuron(self, name: str, neuron_type: str, e_rev: float):
        idx = len(self.neuron_names)
        self.neuron_names.append(name)
        self.neuron_index_map[name] = idx
        self.neuron_types.append(neuron_type)
        self.reversal_potentials_mv.append(e_rev)
        return idx

    def _build_neuron_registry(self):
        """Instantiate all bilateral biological neurons in strict order."""
        for side in ["L", "R"]:
            # 1. Photoreceptors
            for i in range(self.n_eye):
                self._register_neuron(f"R1_6_{side}_{i}", "Photoreceptor", 0.0)

            # 2. Lamina Interneurons (L1: ON, L2: OFF)
            for i in range(self.n_eye):
                self._register_neuron(f"L1_{side}_{i}", "Lamina_ON", -70.0)
                self._register_neuron(f"L2_{side}_{i}", "Lamina_OFF", 0.0)

            # 3. Medulla Delay Lines
            for i in range(self.n_eye):
                self._register_neuron(f"Mi1_{side}_{i}", "Medulla_Fast", 0.0)
                self._register_neuron(f"Tm3_{side}_{i}", "Medulla_Delayed", 0.0)
                self._register_neuron(f"Tm1_{side}_{i}", "Medulla_OFF_Fast", -80.0)
                self._register_neuron(f"Tm2_{side}_{i}", "Medulla_OFF_Delayed", -80.0)

            # 4. Lobula Plate Directional Detectors
            # Front-to-Back (a), Back-to-Front (b), Up (c), Down (d)
            for d in ["a", "b", "c", "d"]:
                self._register_neuron(f"T4_{side}_{d}", f"T4_{d}", 0.0)
                self._register_neuron(f"T5_{side}_{d}", f"T5_{d}", 0.0)

            # 5. Looming & Collision Feature Detectors
            self._register_neuron(f"LC4_{side}", "Looming_Velocity", 0.0)
            self._register_neuron(f"LC6_{side}", "Looming_Expansion", 0.0)
            self._register_neuron(f"LPLC2_{side}", "Radial_Looming", 0.0)

            # 6. Wide-field Tangential Cells
            self._register_neuron(f"HS_{side}", "Horizontal_System", -80.0)
            self._register_neuron(f"VS_{side}", "Vertical_System", -80.0)

        # 7. Descending Motor Command Flight Neurons (Thoracic flight drivers)
        self._register_neuron("DNa01_L", "Steering_Yaw_L", 0.0)
        self._register_neuron("DNa01_R", "Steering_Yaw_R", 0.0)
        self._register_neuron("DNa02_L", "Steering_Roll_L", 0.0)
        self._register_neuron("DNa02_R", "Steering_Roll_R", 0.0)
        self._register_neuron("DNp01", "Forward_Propulsion", 0.0)
        self._register_neuron("DNb01", "Vertical_Pitch_Elevation", 0.0)
        self._register_neuron("GiantFiber_L", "Emergency_Escape_L", 0.0)
        self._register_neuron("GiantFiber_R", "Emergency_Escape_R", 0.0)

    def _add_synapse(self, pre_name: str, post_name: str, weight: float):
        if pre_name in self.neuron_index_map and post_name in self.neuron_index_map:
            u = self.neuron_index_map[pre_name]
            v = self.neuron_index_map[post_name]
            self.weights[u, v] += weight

    def _wire_biological_synapses(self):
        """
        Wiring rules matching Drosophila connectome publications:
        - R1-6 -> Lamina (L1 inhibitory sign inversion, L2 excitatory)
        - Lamina -> Medulla delay lines
        - Medulla -> T4/T5 motion correlators (Hassenstein-Reichardt biological implementation)
        - T4/T5 -> HS/VS widefield optic flow integrators
        - Ommatidia array spatial expansion -> LC4/LC6/LPLC2 looming detectors
        - Looming + HS/VS -> Descending flight neurons (DNa01, DNa02, DNp01, DNb01, GiantFiber)
        """
        w_retina_lamina = 1.2
        w_lamina_medulla = 1.0
        w_emd = 1.4

        for side in ["L", "R"]:
            for i in range(self.n_eye):
                r = f"R1_6_{side}_{i}"
                l1 = f"L1_{side}_{i}"
                l2 = f"L2_{side}_{i}"
                mi1 = f"Mi1_{side}_{i}"
                tm3 = f"Tm3_{side}_{i}"
                tm1 = f"Tm1_{side}_{i}"
                tm2 = f"Tm2_{side}_{i}"

                # Photoreceptor to Lamina
                self._add_synapse(r, l1, -w_retina_lamina)  # Glutamatergic sign-inversion
                self._add_synapse(r, l2, w_retina_lamina)

                # Lamina to Medulla
                self._add_synapse(l1, mi1, w_lamina_medulla)
                self._add_synapse(l1, tm3, w_lamina_medulla * 0.8)
                self._add_synapse(l2, tm1, -w_lamina_medulla)
                self._add_synapse(l2, tm2, -w_lamina_medulla * 0.8)

                # Medulla to T4 (ON) / T5 (OFF)
                # Front-to-back (a) vs Back-to-front (b)
                if i < self.n_eye // 2:
                    self._add_synapse(mi1, f"T4_{side}_a", w_emd / self.n_eye)
                    self._add_synapse(tm1, f"T5_{side}_a", w_emd / self.n_eye)
                else:
                    self._add_synapse(mi1, f"T4_{side}_b", w_emd / self.n_eye)
                    self._add_synapse(tm1, f"T5_{side}_b", w_emd / self.n_eye)

                # Looming detection: wide convergence onto LC4 and LC6
                # LC4 responds to rapid boundary velocity
                self._add_synapse(l2, f"LC4_{side}", 0.35 / np.sqrt(self.n_eye))
                # LC6 responds to sustained edge expansion
                self._add_synapse(l1, f"LC6_{side}", -0.35 / np.sqrt(self.n_eye))
                # LPLC2 receives center excitation with inhibitory lamina surround to reject ambient DC light
                self._add_synapse(r, f"LPLC2_{side}", 0.35 / np.sqrt(self.n_eye))
                self._add_synapse(l1, f"LPLC2_{side}", -0.32 / np.sqrt(self.n_eye))

            # T4/T5 integration onto HS and VS
            self._add_synapse(f"T4_{side}_a", f"HS_{side}", 2.0)
            self._add_synapse(f"T4_{side}_b", f"HS_{side}", -2.0)
            self._add_synapse(f"T5_{side}_a", f"HS_{side}", 1.5)
            self._add_synapse(f"T5_{side}_b", f"HS_{side}", -1.5)

            self._add_synapse(f"T4_{side}_c", f"VS_{side}", 2.0)
            self._add_synapse(f"T4_{side}_d", f"VS_{side}", -2.0)

        # Descending Flight Motor Wiring (Cross-hemispheric steering & escape)
        # 1. Looming on LEFT eye excites RIGHT steering neurons (Turn RIGHT away from obstacle)
        self._add_synapse("LC4_L", "DNa01_R", 2.5)
        self._add_synapse("LC6_L", "DNa02_R", 2.2)
        self._add_synapse("LPLC2_L", "GiantFiber_R", 2.2)

        # 2. Looming on RIGHT eye excites LEFT steering neurons (Turn LEFT away from obstacle)
        self._add_synapse("LC4_R", "DNa01_L", 2.5)
        self._add_synapse("LC6_R", "DNa02_L", 2.2)
        self._add_synapse("LPLC2_R", "GiantFiber_L", 2.2)

        # 3. Bilateral / Central looming activates both Giant Fibers -> Pitch up & emergency throttle burst
        self._add_synapse("GiantFiber_L", "DNb01", 3.0)
        self._add_synapse("GiantFiber_R", "DNb01", 3.0)

        # 4. Optic flow balance onto steering (Damping rotational drift)
        self._add_synapse("HS_L", "DNa01_L", 1.8)
        self._add_synapse("HS_R", "DNa01_R", 1.8)
        self._add_synapse("VS_L", "DNb01", 1.5)
        self._add_synapse("VS_R", "DNb01", 1.5)

        # 5. Tonic cruise drive
        self._add_synapse("T4_L_a", "DNp01", 0.8)
        self._add_synapse("T4_R_a", "DNp01", 0.8)
