"""
BIOPHYSICAL LEAKY INTEGRATE-AND-FIRE (LIF) NEURAL ENGINE
Vectorized biological conductance-based spiking dynamics for Drosophila connectome.
Constants from Shiu et al. (Nature 2024).
"""

from typing import Dict, List, Tuple
import numpy as np
from fly_connectome_drone.connectome.synaptic_matrix import ConnectomeGraph


class BiophysicalLIFEngine:
    """
    Simulates conductance-based Leaky Integrate-and-Fire dynamics across the
    reconstructed Drosophila flight sub-connectome.
    """

    def __init__(self, graph: ConnectomeGraph, dt_ms: float = 0.5):
        self.graph = graph
        self.dt = dt_ms * 1e-3  # seconds
        self.n = graph.n_total

        # Biophysical Constants (Nature 2024 Drosophila standard)
        self.v_rest = -52.0 * 1e-3      # -52 mV
        self.v_threshold = -45.0 * 1e-3 # -45 mV
        self.v_reset = -55.0 * 1e-3     # -55 mV
        self.tau_m = 15.0 * 1e-3        # 15 ms membrane time constant
        self.refractory_period = 2.2 * 1e-3  # 2.2 ms refractory period

        self.tau_syn_exc = 5.0 * 1e-3   # 5 ms excitatory decay
        self.tau_syn_inh = 10.0 * 1e-3  # 10 ms inhibitory decay
        self.e_exc = 0.0 * 1e-3         # 0 mV excitatory reversal
        self.e_inh = -80.0 * 1e-3       # -80 mV inhibitory reversal

        # State Variables
        self.v = np.full(self.n, self.v_rest, dtype=np.float32)
        self.g_exc = np.zeros(self.n, dtype=np.float32)
        self.g_inh = np.zeros(self.n, dtype=np.float32)
        self.refractory_timer = np.zeros(self.n, dtype=np.float32)
        self.spikes = np.zeros(self.n, dtype=bool)

        # Precompute positive (excitatory) and negative (inhibitory) connection weights
        w = self.graph.weights
        self.w_exc = np.maximum(w, 0.0)
        self.w_inh = np.maximum(-w, 0.0)

        # Decay factors per timestep
        self.decay_v = np.exp(-self.dt / self.tau_m)
        self.decay_exc = np.exp(-self.dt / self.tau_syn_exc)
        self.decay_inh = np.exp(-self.dt / self.tau_syn_inh)

    def reset(self):
        """Reset all neural potentials to resting state."""
        self.v.fill(self.v_rest)
        self.g_exc.fill(0.0)
        self.g_inh.fill(0.0)
        self.refractory_timer.fill(0.0)
        self.spikes.fill(False)

    def step(self, external_currents: np.ndarray) -> np.ndarray:
        """
        Execute one biophysical simulation step.
        Args:
            external_currents: [N_total] float vector of sensory inputs (mA or normalized pA)
        Returns:
            spikes: [N_total] boolean array of action potentials generated in this step
        """
        # 1. Update synaptic conductances from previous spikes
        spike_float = self.spikes.astype(np.float32)
        syn_input_exc = np.dot(self.w_exc.T, spike_float) * 0.8
        syn_input_inh = np.dot(self.w_inh.T, spike_float) * 0.8

        self.g_exc = self.g_exc * self.decay_exc + syn_input_exc
        self.g_inh = self.g_inh * self.decay_inh + syn_input_inh

        # 2. Update refractory timers
        is_refractory = self.refractory_timer > 0.0
        self.refractory_timer = np.maximum(0.0, self.refractory_timer - self.dt)

        # 3. Calculate synaptic driving forces
        i_syn_exc = self.g_exc * (self.e_exc - self.v)
        i_syn_inh = self.g_inh * (self.e_inh - self.v)
        i_total = i_syn_exc + i_syn_inh + external_currents

        # 4. Integrate membrane potential for non-refractory neurons
        dv = (-(self.v - self.v_rest) + i_total * 25.0) * (self.dt / self.tau_m)
        self.v = np.where(is_refractory, self.v_reset, self.v + dv)

        # 5. Threshold detection and action potential generation
        self.spikes = self.v >= self.v_threshold
        if np.any(self.spikes):
            self.v[self.spikes] = self.v_reset
            self.refractory_timer[self.spikes] = self.refractory_period

        return self.spikes

    def get_spike_counts(self, neuron_names: List[str]) -> np.ndarray:
        """Helper to get instantaneous spike states for specific neurons."""
        indices = [self.graph.neuron_index_map[name] for name in neuron_names]
        return self.spikes[indices]
