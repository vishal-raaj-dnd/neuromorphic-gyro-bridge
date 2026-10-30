"""
BIOLOGICAL NEURON CATALOG - DROSOPHILA FLIGHT & VISUAL CONNECTOME
Pure biological connectome specification for Drosophila melanogaster flight control.
Based on FlyWire (Nature 2024) and Shiu et al. biophysical parameters.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Tuple
import numpy as np


class Neurotransmitter(Enum):
    ACETYLCHOLINE = 1    # Fast excitatory in insect CNS (+ reversal potential: 0 mV)
    GABA = -1            # Ionotropic inhibitory (- reversal potential: -80 mV)
    GLUTAMATE = -2       # Glutamate is predominantly INHIBITORY in insect brain via GluCl (-70 mV)
    OCTOPAMINE = 2       # Modulatory flight arousal


class VisualHemisphere(Enum):
    LEFT = 0
    RIGHT = 1
    BILATERAL = 2


@dataclass(frozen=True)
class BiologicalNeuronType:
    type_name: str
    super_class: str
    neurotransmitter: Neurotransmitter
    reversal_potential_mv: float
    description: str


# Canonical biological cell types extracted from FlyWire / Hemibrain
CELL_TYPES: Dict[str, BiologicalNeuronType] = {
    # 1. Photoreceptors
    "R1_6": BiologicalNeuronType(
        "R1_6", "Photoreceptor", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Retinula cells R1-R6 mediating motion vision"
    ),
    
    # 2. Lamina Interneurons (First visual processing synaptic layer)
    "L1": BiologicalNeuronType(
        "L1", "Lamina", Neurotransmitter.GLUTAMATE, -70.0,
        "Primary ON-pathway feed, inverts and high-pass filters photoreceptor input"
    ),
    "L2": BiologicalNeuronType(
        "L2", "Lamina", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Primary OFF-pathway feed, fast transient signaling"
    ),
    "L3": BiologicalNeuronType(
        "L3", "Lamina", Neurotransmitter.GLUTAMATE, -70.0,
        "Sensitivity regulation under dim light & wide-field contrast"
    ),
    
    # 3. Medulla Delay Lines & Interneurons
    "Mi1": BiologicalNeuronType(
        "Mi1", "Medulla", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Non-delayed branch of ON Elementary Motion Detector"
    ),
    "Tm3": BiologicalNeuronType(
        "Tm3", "Medulla", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Delayed branch of ON Elementary Motion Detector"
    ),
    "Tm1": BiologicalNeuronType(
        "Tm1", "Medulla", Neurotransmitter.GABA, -80.0,
        "Non-delayed branch of OFF Elementary Motion Detector"
    ),
    "Tm2": BiologicalNeuronType(
        "Tm2", "Medulla", Neurotransmitter.GABA, -80.0,
        "Delayed branch of OFF Elementary Motion Detector"
    ),
    
    # 4. Lobula Plate Motion Detectors (Elementary Motion Detectors / T4-T5)
    "T4a": BiologicalNeuronType("T4a", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Front-to-Back ON motion"),
    "T4b": BiologicalNeuronType("T4b", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Back-to-Front ON motion"),
    "T4c": BiologicalNeuronType("T4c", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Upward ON motion"),
    "T4d": BiologicalNeuronType("T4d", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Downward ON motion"),
    
    "T5a": BiologicalNeuronType("T5a", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Front-to-Back OFF motion"),
    "T5b": BiologicalNeuronType("T5b", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Back-to-Front OFF motion"),
    "T5c": BiologicalNeuronType("T5c", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Upward OFF motion"),
    "T5d": BiologicalNeuronType("T5d", "Lobula_Plate_In", Neurotransmitter.ACETYLCHOLINE, 0.0, "Downward OFF motion"),
    
    # 5. Lobula Columnar (Looming & Threat Neurons)
    "LC4": BiologicalNeuronType(
        "LC4", "Lobula_Columnar", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Fires to looming stimuli proportional to angular expansion velocity (theta_dot)"
    ),
    "LC6": BiologicalNeuronType(
        "LC6", "Lobula_Columnar", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Fires to looming stimuli proportional to target angular size (theta)"
    ),
    "LPLC2": BiologicalNeuronType(
        "LPLC2", "Lobula_Plate_Columnar", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Radial expansion optical flow detector, triggers rapid escape reflex"
    ),

    # 6. Lobula Plate Tangential Cells (LPTCs - Wide-field motion integration)
    "HSN": BiologicalNeuronType("HSN", "LPTC", Neurotransmitter.GABA, -80.0, "Horizontal System North - Yaw/Roll wide-field flow"),
    "HSE": BiologicalNeuronType("HSE", "LPTC", Neurotransmitter.GABA, -80.0, "Horizontal System Equatorial - Yaw/Roll wide-field flow"),
    "HSS": BiologicalNeuronType("HSS", "LPTC", Neurotransmitter.GABA, -80.0, "Horizontal System South - Yaw/Roll wide-field flow"),
    "VS_Group": BiologicalNeuronType("VS_Group", "LPTC", Neurotransmitter.GABA, -80.0, "Vertical System 1-10 - Pitch/Lift wide-field flow"),

    # 7. Central Flight Descending Command Neurons (Brain -> Thoracic Flight Motor Center)
    "DNa01": BiologicalNeuronType(
        "DNa01", "Descending", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Bilateral steering neuron: asymmetric firing commands sharp yaw/roll turns"
    ),
    "DNa02": BiologicalNeuronType(
        "DNa02", "Descending", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Primary high-gain flight saccade steering neuron"
    ),
    "DNp01": BiologicalNeuronType(
        "DNp01", "Descending", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Propulsive forward drive and base wingbeat frequency regulation"
    ),
    "DNb01": BiologicalNeuronType(
        "DNb01", "Descending", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Pitch elevation and vertical climb control"
    ),
    "GiantFiber": BiologicalNeuronType(
        "GiantFiber", "Descending", Neurotransmitter.ACETYLCHOLINE, 0.0,
        "Ultra-fast high-caliber escape neuron triggering emergency collision dodge"
    ),
}
