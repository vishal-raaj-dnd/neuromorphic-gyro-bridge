/**
 * DROSOPHILA CONNECTOME NEUROMORPHIC DRONE FLIGHT SIMULATOR (3D)
 * Ultra-realistic Three.js 6-DoF Rigid-Body Simulation with in-browser
 * Spiking Connectome Engine, Neuromorphic Gyro Bridge, and FPV/TPV Cameras.
 */

// ============================================================================
// GLOBAL APPLICATION STATE
// ============================================================================
const state = {
  controllerMode: 'neuromorphic', // 'neuromorphic' or 'baseline'
  cameraMode: 'tpv',              // 'tpv', 'fpv', 'top', 'side', 'orbit'
  flightMode: 'hover',            // 'hover' or 'cruise'
  environmentMode: 'nature',      // 'nature' (Lush Green Meadow) or 'hangar' (Cyber Hangar)
  hudCollapsed: false,
  audioEnabled: false,
  threatSpeedKmh: 28.0,
  threatOffsetM: 0.0,
  crosswindKmh: 0.0,

  // Manual Flight Input
  keys: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    yawLeft: false,
    yawRight: false
  },

  // Drone State
  drone: {
    pos: new THREE.Vector3(0, 1.5, 0), // Y is UP in Three.js
    vel: new THREE.Vector3(0, 0, 0),   // Starts in stable hover
    euler: new THREE.Euler(0, 0, 0, 'YXZ'), // roll, pitch, yaw
    omega: new THREE.Vector3(0, 0, 0), // rad/s
    thrust: 4.41,
    mass: 0.45,
    rotors: [],
    rotorBlades: [],
    downwashRings: [],
    halteres: [],
    headlights: []
  },

  // Obstacle Threat State & Shape Aspect Ratio
  obstacle: {
    active: false,
    pos: new THREE.Vector3(0, 1.5, 26.0),
    vel: new THREE.Vector3(0, 0, -7.78), // 28 km/h = ~7.78 m/s
    geomMode: 'point', // 'point', 'tall', 'wide'
    radius: 0.28,
    width: 0.35,
    height: 0.35,
    mesh: null,
    pointGroup: null,
    tallGroup: null,
    wideGroup: null,
    exhaustMesh: null,
    targetLockBox: null,
    trail: []
  },

  // Biological Spiking Connectome State
  brain: {
    n_ommatidia: 32,
    trace_dna01_l: 0.0,
    trace_dna01_r: 0.0,
    trace_dna02_l: 0.0,
    trace_dna02_r: 0.0,
    trace_gf_l: 0.0,
    trace_gf_r: 0.0,
    trace_dnp01: 0.0,
    trace_dnb01: 0.0,
    spikes: {
      dna01_l: false, dna01_r: false,
      dna02_l: false, dna02_r: false,
      gf_l: false, gf_r: false
    },
    looming_metric: 0.0,
    min_clearance: 999.0,
    reaction_detected: false,
    latency_ms: 0.0,
    trial_start_time: 0.0
  },

  // 3-Phase Evasion & Haltere Recovery State Machine
  evasion: {
    active: false,
    phase: 'idle', // 'idle' | 'saccade' | 'recovery'
    evasionType: 'lateral', // 'lateral' (DNa02 roll bank) or 'vertical' (DNb01 pop-up flare)
    direction: 0,  // +1 (dodge right) or -1 (dodge left)
    targetRoll: 0.0,
    targetAltitude: 1.5,
    targetPitch: 0.0,
    originX: 0.0,
    originY: 1.5,
    saccadeStartTime: 0.0,
    recoveryStartTime: 0.0,
    saccadeDuration: 0.38
  },

  // Flight Path Visual Trail
  trail: {
    points: []
  }
};

// ============================================================================
// WEB AUDIO API SOUND SYNTHESIS
// ============================================================================
let audioCtx = null;
let motorOsc = null;
let motorGain = null;

function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    motorOsc = audioCtx.createOscillator();
    motorGain = audioCtx.createGain();

    motorOsc.type = 'sawtooth';
    motorOsc.frequency.setValueAtTime(140, audioCtx.currentTime); // 140 Hz quadrotor idle hum
    motorGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

    motorOsc.connect(motorGain);
    motorGain.connect(audioCtx.destination);
    motorOsc.start();
  } catch (e) {
    console.warn("Audio Context blocked until user gesture", e);
  }
}

function playSpikeClick() {
  if (!state.audioEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820 + Math.random() * 300, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.025);
  } catch (e) {}
}

// ============================================================================
// PROCEDURAL TEXTURE GENERATORS (High Fidelity, Zero External Dependencies)
// ============================================================================

// 1. High-Tech Aerospace Hangar Floor Texture (1024x1024)
function createHangarFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Base metallic dark concrete
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle industrial grid tiles
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  const tileSize = 64;
  for (let x = 0; x <= 1024; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Central runway corridor strip
  ctx.fillStyle = '#141e33';
  ctx.fillRect(360, 0, 304, 1024);

  // Runway glowing cyan edges
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(360, 0); ctx.lineTo(360, 1024);
  ctx.moveTo(664, 0); ctx.lineTo(664, 1024);
  ctx.stroke();

  // Dashed glowing centerline
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 6;
  ctx.setLineDash([48, 48]);
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 1024);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Caution Hazard Chevron Borders (Yellow/Black)
  const drawChevrons = (startX) => {
    ctx.fillStyle = '#eab308';
    ctx.fillRect(startX, 0, 32, 1024);
    ctx.fillStyle = '#0f172a';
    for (let y = -32; y < 1056; y += 48) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + 32, y + 24);
      ctx.lineTo(startX + 32, y + 36);
      ctx.lineTo(startX, y + 12);
      ctx.closePath();
      ctx.fill();
    }
  };
  drawChevrons(328);
  drawChevrons(664);

  // Distance Milestone Text
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  for (let y = 120; y < 1024; y += 256) {
    ctx.fillText(`◄ RUNWAY VECTOR 01 ►`, 512, y);
  }

  // Central Helipad / Launch Circle
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(512, 512, 220, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(512, 512, 180, 0, Math.PI * 2);
  ctx.stroke();

  // Helipad Letter 'H'
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 140px "Outfit", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 512, 512);

  // Facility text
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillText('CONNECTOME RESEARCH FLIGHT FACILITY', 512, 512 + 130);
  ctx.fillText('DROSOPHILA BIOLOGICAL SACCADE TESTBED', 512, 512 - 130);

  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 8);
  texture.anisotropy = 16;
  return texture;
}

// 1B. Ultra-Realistic Lush Green Grass & Meadow Landscape Texture (1024x1024)
function createGrassMeadowTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base vibrant meadow gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
  bgGrad.addColorStop(0, '#214e1a');
  bgGrad.addColorStop(0.5, '#2e6624');
  bgGrad.addColorStop(1, '#1b4315');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Layered organic grass blades and moss mottling
  const bladeColors = ['#38732a', '#448533', '#4f943c', '#29571f', '#5ca846', '#224a1b'];
  for (let i = 0; i < 4000; i++) {
    const gx = Math.random() * 1024;
    const gy = Math.random() * 1024;
    const len = 4 + Math.random() * 9;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    ctx.strokeStyle = bladeColors[Math.floor(Math.random() * bladeColors.length)];
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(angle) * len, gy + Math.sin(angle) * len);
    ctx.stroke();
  }

  // 3. Natural soil/gravel pathway along central runway strip (x: 400 to 624)
  const pathGrad = ctx.createLinearGradient(390, 0, 634, 0);
  pathGrad.addColorStop(0, 'rgba(56, 44, 32, 0)');
  pathGrad.addColorStop(0.15, 'rgba(102, 88, 68, 0.45)');
  pathGrad.addColorStop(0.5, 'rgba(138, 122, 98, 0.75)');
  pathGrad.addColorStop(0.85, 'rgba(102, 88, 68, 0.45)');
  pathGrad.addColorStop(1, 'rgba(56, 44, 32, 0)');
  ctx.fillStyle = pathGrad;
  ctx.fillRect(390, 0, 244, 1024);

  // Gravel pebbles along the runway
  for (let i = 0; i < 900; i++) {
    const px = 410 + Math.random() * 204;
    const py = Math.random() * 1024;
    ctx.fillStyle = Math.random() > 0.5 ? '#b8a994' : '#6e5f4d';
    ctx.beginPath();
    ctx.arc(px, py, 1 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Wildflowers in the grass (poppies, buttercups, daisies, lavender)
  const flowers = [
    { color: '#eab308', size: 2.6 }, // Buttercup yellow
    { color: '#f8fafc', size: 2.2 }, // White daisy
    { color: '#dc2626', size: 2.8 }, // Red poppy
    { color: '#a855f7', size: 2.0 }  // Purple clover
  ];
  for (let i = 0; i < 500; i++) {
    let fx = Math.random() * 1024;
    if (fx > 380 && fx < 644) {
      if (Math.random() > 0.15) fx = (fx < 512) ? fx - 160 : fx + 160;
    }
    const fy = Math.random() * 1024;
    const flw = flowers[Math.floor(Math.random() * flowers.length)];
    ctx.fillStyle = flw.color;
    ctx.beginPath();
    ctx.arc(fx, fy, flw.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Rustic Stone Helipad Circle at (512, 512)
  ctx.strokeStyle = '#47533f';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(512, 512, 190, 0, Math.PI * 2);
  ctx.stroke();

  // Stepping stones around the ring
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const sx = 512 + Math.cos(a) * 190;
    const sy = 512 + Math.sin(a) * 190;
    ctx.fillStyle = (Math.sin(a * 8) > 0) ? '#78826e' : '#5c6454';
    ctx.beginPath();
    ctx.arc(sx, sy, 9 + Math.sin(a * 4) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helipad Letter 'H' in weathered rustic lime white
  ctx.fillStyle = 'rgba(238, 248, 232, 0.88)';
  ctx.font = 'bold 130px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 512, 512);

  // Compass Rose Markings
  ctx.fillStyle = '#8fad7a';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.fillText('N', 512, 512 - 145);
  ctx.fillText('S', 512, 512 + 145);
  ctx.fillText('W', 512 - 145, 512);
  ctx.fillText('E', 512 + 145, 512);

  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 6);
  texture.anisotropy = 16;
  return texture;
}

// 1C. Natural Granite Boulder Texture (256x256)
function createRockTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5 ? '#475569' : '#94a3b8';
    ctx.fillRect(rx, ry, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  for (let i = 0; i < 200; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 128; // moss on top
    ctx.fillStyle = Math.random() > 0.5 ? '#3b6e2d' : '#2d5423';
    ctx.fillRect(rx, ry, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  return new THREE.CanvasTexture(c);
}

// 1D. Organic Tree Bark Texture (256x256)
function createBarkTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#382214';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 4) {
    ctx.fillStyle = Math.random() > 0.5 ? '#26170d' : '#4a2f1b';
    ctx.fillRect(x, 0, 2 + Math.random() * 3, 256);
  }
  return new THREE.CanvasTexture(c);
}

// 2. Carbon-Fiber Twill Weave Texture (256x256)
function createCarbonTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 256);

  const pSize = 8;
  for (let y = 0; y < 256; y += pSize) {
    for (let x = 0; x < 256; x += pSize) {
      const isAlt = ((x / pSize) + (y / pSize)) % 2 === 0;
      ctx.fillStyle = isAlt ? '#0f172a' : '#334155';
      ctx.fillRect(x, y, pSize, pSize);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// 3. Hexagonal Ommatidia Texture (256x256)
function createOmmatidiaFacetTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  const rad = 14;
  const h = rad * Math.sqrt(3);

  for (let y = 0; y < 256 + h; y += h) {
    for (let x = 0; x < 256 + rad * 3; x += rad * 3) {
      const cy = y + (Math.floor(x / (rad * 3)) % 2 === 0 ? 0 : h / 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = x + rad * Math.cos(a);
        const py = cy + rad * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // glowing facet center
      ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(x, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

// 4. Spinning Propeller Blur Texture (256x256)
function createPropBlurTexture(accentColor) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
  grad.addColorStop(0.88, accentColor);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(c);
}

// ============================================================================
// THREE.JS SCENE, CAMERAS, RENDERER, AND LIGHTING
// ============================================================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();

// Initial background & fog configured for Lush Green Nature Environment
scene.background = new THREE.Color(0x82c8f8); // Bright azure outdoor sky
scene.fog = new THREE.Fog(0xb8dbf8, 55, 260); // Soft atmospheric outdoor depth haze

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 350);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent clipping beneath ground
controls.minDistance = 0.5;
controls.maxDistance = 60;

// ============================================================================
// DUAL LIGHTING RIGS: OUTDOOR SUNLIGHT vs INDOOR HANGAR FLOODLIGHTS
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

// 1. Natural Outdoor Sun & Sky Lighting (Active in Nature Mode)
const natureSun = new THREE.DirectionalLight(0xfff7e6, 1.8);
natureSun.position.set(45, 65, 35);
natureSun.castShadow = true;
natureSun.shadow.mapSize.width = 2048;
natureSun.shadow.mapSize.height = 2048;
natureSun.shadow.camera.near = 1.0;
natureSun.shadow.camera.far = 160;
natureSun.shadow.camera.left = -35;
natureSun.shadow.camera.right = 35;
natureSun.shadow.camera.top = 35;
natureSun.shadow.camera.bottom = -35;
natureSun.shadow.bias = -0.0004;
scene.add(natureSun);

const natureHemi = new THREE.HemisphereLight(0x87ceeb, 0x38662e, 0.85); // Sky blue to lush grass bounce
scene.add(natureHemi);

// 2. Indoor Cybernetic Hangar Lighting (Active in Hangar Mode)
const sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
sunLight.position.set(15, 30, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 120;
sunLight.shadow.bias = -0.0005;
sunLight.visible = false;
scene.add(sunLight);

const cyanLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
cyanLight.position.set(-20, 25, -15);
cyanLight.visible = false;
scene.add(cyanLight);

const warmLight = new THREE.DirectionalLight(0xf43f5e, 0.45);
warmLight.position.set(0, 15, -30);
warmLight.visible = false;
scene.add(warmLight);

// ============================================================================
// ENVIRONMENT 1: HIGH-TECH AEROSPACE CYBER HANGAR
// ============================================================================
const hangarEnvGroup = new THREE.Group();
hangarEnvGroup.visible = false; // default is nature

// Hangar Floor
const floorGeo = new THREE.PlaneGeometry(160, 400);
const floorMat = new THREE.MeshStandardMaterial({
  map: createHangarFloorTexture(),
  roughness: 0.35,
  metalness: 0.45
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.set(0, 0, 100);
floorMesh.receiveShadow = true;
hangarEnvGroup.add(floorMesh);

// Architectural Structural Support Pylons
const pylonGroup = new THREE.Group();
const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 });
const pylonNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
const pylonBaseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

for (let z = -20; z <= 220; z += 20) {
  [-14, 14].forEach(x => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), pylonBaseMat);
    base.position.set(x, 0.6, z);
    base.castShadow = true;
    base.receiveShadow = true;
    pylonGroup.add(base);

    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16.0, 0.8), pylonMat);
    col.position.set(x, 8.6, z);
    col.castShadow = true;
    pylonGroup.add(col);

    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 14.0, 0.2), pylonNeonMat);
    neon.position.set(x + (x > 0 ? -0.42 : 0.42), 8.6, z);
    pylonGroup.add(neon);

    const arch = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.5, 0.6), pylonMat);
    arch.position.set(x + (x > 0 ? -2.5 : 2.5), 16.0, z);
    pylonGroup.add(arch);
  });
}
hangarEnvGroup.add(pylonGroup);

// Runway Edge LED Stanchions
const stanchionGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.45, 12);
const stanchionMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
const stanchionBulbMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

for (let z = -10; z <= 180; z += 10) {
  [-4.2, 4.2].forEach(x => {
    const post = new THREE.Mesh(stanchionGeo, stanchionMat);
    post.position.set(x, 0.22, z);
    post.castShadow = true;
    hangarEnvGroup.add(post);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), stanchionBulbMat);
    bulb.position.set(x, 0.48, z);
    hangarEnvGroup.add(bulb);
  });
}

// Distance Illuminated Gate Arches
for (let z = 25; z <= 175; z += 25) {
  const gateGeo = new THREE.RingGeometry(3.4, 3.6, 32);
  const gateMat = new THREE.MeshBasicMaterial({
    color: z % 50 === 0 ? 0x00f0ff : 0x1e3a5f,
    side: THREE.DoubleSide
  });
  const gate = new THREE.Mesh(gateGeo, gateMat);
  gate.position.set(0, 1.8, z);
  hangarEnvGroup.add(gate);
}
scene.add(hangarEnvGroup);

// ============================================================================
// ENVIRONMENT 2: ULTRA-REALISTIC LUSH GREEN NATURE LANDSCAPE & ALPINE FIELD
// ============================================================================
const natureEnvGroup = new THREE.Group();
natureEnvGroup.visible = true; // active by default!

// 1. Lush Green Rolling Meadow Terrain (320m x 600m)
const terrainGeo = new THREE.PlaneGeometry(320, 600, 48, 96);
const posAttr = terrainGeo.attributes.position;
// Displace perimeter vertices into gentle rolling hills while keeping center flight runway perfectly flat
for (let i = 0; i < posAttr.count; i++) {
  const vx = posAttr.getX(i);
  const vz = posAttr.getY(i); // plane in XY before rotation
  const absX = Math.abs(vx);
  if (absX > 14.0) {
    const hillHeight = Math.sin(vx * 0.025) * Math.cos(vz * 0.018) * 3.8 + Math.sin(vx * 0.07) * 1.2;
    posAttr.setZ(i, Math.max(0, hillHeight));
  }
}
terrainGeo.computeVertexNormals();

const grassTex = createGrassMeadowTexture();
const terrainMat = new THREE.MeshStandardMaterial({
  map: grassTex,
  roughness: 0.88,
  metalness: 0.08
});
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.rotation.x = -Math.PI / 2;
terrainMesh.position.set(0, 0, 150);
terrainMesh.receiveShadow = true;
natureEnvGroup.add(terrainMesh);

// Common Nature Materials
const barkTex = createBarkTexture();
const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.9, metalness: 0.1 });
const rockTex = createRockTexture();
const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.92, metalness: 0.15 });

// 2. Procedural Evergreen Pine Trees
function createPineTree(x, z, scale = 1.0) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.38 * scale, 3.6 * scale, 8), barkMat);
  trunk.position.y = 1.8 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  const tiers = [
    { r: 2.3 * scale, h: 3.2 * scale, y: 3.2 * scale, col: 0x1f4a23 },
    { r: 1.9 * scale, h: 2.8 * scale, y: 5.0 * scale, col: 0x275a2a },
    { r: 1.5 * scale, h: 2.4 * scale, y: 6.6 * scale, col: 0x306934 },
    { r: 0.95 * scale, h: 2.0 * scale, y: 8.0 * scale, col: 0x39783d }
  ];
  tiers.forEach(t => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(t.r, t.h, 8),
      new THREE.MeshStandardMaterial({ color: t.col, roughness: 0.85, metalness: 0.08, flatShading: true })
    );
    cone.position.y = t.y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    tree.add(cone);
  });
  tree.position.set(x, 0, z);
  return tree;
}

// 3. Procedural Deciduous Broadleaf Trees
function createDeciduousTree(x, z, scale = 1.0) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.45 * scale, 4.2 * scale, 8), barkMat);
  trunk.position.y = 2.1 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x428a30,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true
  });
  const crownSpheres = [
    { r: 2.2 * scale, x: 0, y: 5.0 * scale, z: 0 },
    { r: 1.8 * scale, x: -0.8 * scale, y: 4.6 * scale, z: 0.6 * scale },
    { r: 1.7 * scale, x: 0.8 * scale, y: 4.7 * scale, z: -0.5 * scale },
    { r: 1.5 * scale, x: 0.3 * scale, y: 6.0 * scale, z: 0.2 * scale }
  ];
  crownSpheres.forEach(cs => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(cs.r, 1), leafMat);
    m.position.set(cs.x, cs.y, cs.z);
    m.castShadow = true;
    m.receiveShadow = true;
    tree.add(m);
  });
  tree.position.set(x, 0, z);
  return tree;
}

// Populate 65+ Trees naturally clustered along left and right meadow borders
const treeList = [];
for (let z = -30; z <= 240; z += 18) {
  // Left side tree grove (outside runway corridor x < -16)
  const lx1 = -18 - Math.random() * 25;
  const lx2 = -45 - Math.random() * 35;
  const pTreeL = createPineTree(lx1, z + (Math.random() - 0.5) * 12, 0.85 + Math.random() * 0.45);
  const dTreeL = createDeciduousTree(lx2, z + (Math.random() - 0.5) * 12, 0.9 + Math.random() * 0.4);
  natureEnvGroup.add(pTreeL);
  natureEnvGroup.add(dTreeL);
  treeList.push(pTreeL, dTreeL);

  // Right side tree grove (outside runway corridor x > 16)
  const rx1 = 18 + Math.random() * 25;
  const rx2 = 45 + Math.random() * 35;
  const pTreeR = createPineTree(rx1, z + (Math.random() - 0.5) * 12, 0.85 + Math.random() * 0.45);
  const dTreeR = createDeciduousTree(rx2, z + (Math.random() - 0.5) * 12, 0.9 + Math.random() * 0.4);
  natureEnvGroup.add(pTreeR);
  natureEnvGroup.add(dTreeR);
  treeList.push(pTreeR, dTreeR);
}

// 4. Granite Boulders along the Meadow Edge
for (let i = 0; i < 24; i++) {
  const side = (i % 2 === 0) ? -1 : 1;
  const bx = side * (12.5 + Math.random() * 22);
  const bz = -20 + Math.random() * 250;
  const bScale = 0.6 + Math.random() * 1.2;
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(bScale, 1), rockMat);
  boulder.position.set(bx, bScale * 0.65, bz);
  boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  boulder.castShadow = true;
  boulder.receiveShadow = true;
  natureEnvGroup.add(boulder);
}

// 5. Low Flowering Meadow Shrubs & Bushes
const bushMat = new THREE.MeshStandardMaterial({ color: 0x347a28, roughness: 0.9, flatShading: true });
for (let i = 0; i < 35; i++) {
  const side = (i % 2 === 0) ? -1 : 1;
  const shx = side * (7.5 + Math.random() * 15);
  const shz = -15 + Math.random() * 240;
  const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + Math.random() * 0.6, 1), bushMat);
  bush.position.set(shx, 0.45, shz);
  bush.castShadow = true;
  natureEnvGroup.add(bush);
}

// 6. Rustic Timber Runway Boundary Markers with Warm Amber Solar Caps
const timberMat = new THREE.MeshStandardMaterial({ color: 0x593d25, roughness: 0.85 });
const amberSolarMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
for (let z = -10; z <= 200; z += 12) {
  [-5.8, 5.8].forEach(x => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.75, 8), timberMat);
    post.position.set(x, 0.35, z);
    post.castShadow = true;
    natureEnvGroup.add(post);

    const solarCap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), amberSolarMat);
    solarCap.position.set(x, 0.75, z);
    natureEnvGroup.add(solarCap);
  });
}

// 7. Functional Real-Life Animated Windsock on Wooden Mast
const windsockGroup = new THREE.Group();
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8), timberMat);
mast.position.y = 2.2;
mast.castShadow = true;
windsockGroup.add(mast);

const swivelRing = new THREE.Group();
swivelRing.position.y = 4.2;

const sockGeo = new THREE.ConeGeometry(0.35, 1.8, 12, 1, true);
sockGeo.rotateZ(Math.PI / 2); // point horizontal
const sockMat = new THREE.MeshStandardMaterial({ color: 0xef4444, side: THREE.DoubleSide, roughness: 0.6 });
const sockMesh = new THREE.Mesh(sockGeo, sockMat);
sockMesh.position.x = 0.9;
sockMesh.castShadow = true;
swivelRing.add(sockMesh);

const stripeGeo = new THREE.RingGeometry(0.18, 0.3, 12);
stripeGeo.rotateY(Math.PI / 2);
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const stripe1 = new THREE.Mesh(stripeGeo, whiteMat);
stripe1.position.x = 0.55;
swivelRing.add(stripe1);
const stripe2 = new THREE.Mesh(stripeGeo, whiteMat);
stripe2.position.x = 1.15;
swivelRing.add(stripe2);

windsockGroup.add(swivelRing);
windsockGroup.position.set(-8.5, 0, 10.0);
natureEnvGroup.add(windsockGroup);

// 8. 3D Drifting Cumulus Clouds
const cloudsGroup = new THREE.Group();
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.95,
  metalness: 0.0,
  transparent: true,
  opacity: 0.88
});
const cloudList = [];
for (let i = 0; i < 14; i++) {
  const cloud = new THREE.Group();
  const nPuffs = 5 + Math.floor(Math.random() * 4);
  for (let j = 0; j < nPuffs; j++) {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(8 + Math.random() * 7, 1), cloudMat);
    puff.position.set(
      (j - nPuffs / 2) * 8 + (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 8
    );
    cloud.add(puff);
  }
  cloud.position.set(
    (Math.random() - 0.5) * 280,
    50 + Math.random() * 25,
    -40 + Math.random() * 340
  );
  cloudsGroup.add(cloud);
  cloudList.push(cloud);
}
natureEnvGroup.add(cloudsGroup);

scene.add(natureEnvGroup);

// ============================================================================
// ENVIRONMENT SWITCHER FUNCTION
// ============================================================================
function switchEnvironment(env) {
  state.environmentMode = env;
  const envText = document.getElementById('env-mode-text');

  if (env === 'nature') {
    natureEnvGroup.visible = true;
    hangarEnvGroup.visible = false;
    natureSun.visible = true;
    natureHemi.visible = true;
    sunLight.visible = false;
    cyanLight.visible = false;
    warmLight.visible = false;

    scene.background = new THREE.Color(0x82c8f8); // Clear outdoor blue sky
    scene.fog = new THREE.Fog(0xb8dbf8, 55, 260); // Atmospheric nature haze
    if (envText) envText.innerHTML = '🌲 Lush Nature';
  } else {
    natureEnvGroup.visible = false;
    hangarEnvGroup.visible = true;
    natureSun.visible = false;
    natureHemi.visible = false;
    sunLight.visible = true;
    cyanLight.visible = true;
    warmLight.visible = true;

    scene.background = new THREE.Color(0x0a101f); // Dark cyber hangar
    scene.fog = new THREE.Fog(0x0a101f, 35, 140);
    if (envText) envText.innerHTML = '🏢 Cyber Hangar';
  }
}

// Initialize with Nature Mode
switchEnvironment('nature');

// ============================================================================
// ULTRA-REALISTIC 3D QUADROTOR DRONE MODEL
// ============================================================================
const droneGroup = new THREE.Group();
const carbonTex = createCarbonTexture();
const carbonMat = new THREE.MeshStandardMaterial({
  map: carbonTex,
  roughness: 0.35,
  metalness: 0.6
});
const anodizedMat = new THREE.MeshStandardMaterial({
  color: 0x0284c7, // Metallic Anodized Cyan-Blue
  roughness: 0.2,
  metalness: 0.85
});
const titaniumMat = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  roughness: 0.25,
  metalness: 0.9
});
const copperMat = new THREE.MeshStandardMaterial({
  color: 0xb45309,
  roughness: 0.4,
  metalness: 0.8
});

// Top Chassis Plate
const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.36), carbonMat);
topPlate.position.set(0, 0.04, 0);
topPlate.castShadow = true;
droneGroup.add(topPlate);

// Bottom Chassis Plate
const bottomPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.38), carbonMat);
bottomPlate.position.set(0, -0.04, 0);
bottomPlate.castShadow = true;
droneGroup.add(bottomPlate);

// Standoffs connecting plates
const standoffGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8);
[
  [-0.1, 0.14], [0.1, 0.14],
  [-0.1, -0.14], [0.1, -0.14]
].forEach(([sx, sz]) => {
  const st = new THREE.Mesh(standoffGeo, anodizedMat);
  st.position.set(sx, 0, sz);
  droneGroup.add(st);
});

// 4S LiPo Battery Pack
const batteryMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 });
const battery = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.065, 0.22), batteryMat);
battery.position.set(0, 0.08, -0.02);
battery.castShadow = true;
droneGroup.add(battery);

// Battery Yellow XT60 Lead
const xt60Mat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
const xt60 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.035), xt60Mat);
xt60.position.set(0.04, 0.10, -0.14);
droneGroup.add(xt60);

// Avionics Stack (FC + ESC) with Status Micro-LEDs
const fcBoard = new THREE.Mesh(
  new THREE.BoxGeometry(0.11, 0.015, 0.11),
  new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.4 })
);
fcBoard.position.set(0, 0, 0);
droneGroup.add(fcBoard);

const ledHeartbeat = new THREE.Mesh(
  new THREE.SphereGeometry(0.01, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0x00ff88 })
);
ledHeartbeat.position.set(-0.03, 0.012, 0.03);
droneGroup.add(ledHeartbeat);

const ledLoomingAlert = new THREE.Mesh(
  new THREE.SphereGeometry(0.01, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0055 })
);
ledLoomingAlert.position.set(0.03, 0.012, 0.03);
droneGroup.add(ledLoomingAlert);

// 4 Extended Carbon Arms & Brushless Motors
const armPositions = [
  { x: 0.26, z: 0.26, front: true, right: true },   // Front Right
  { x: -0.26, z: 0.26, front: true, right: false },  // Front Left
  { x: 0.26, z: -0.26, front: false, right: true },  // Rear Right
  { x: -0.26, z: -0.26, front: false, right: false } // Rear Left
];

const armGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.36, 12);
const motorBellGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.045, 16);
const motorStatorGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.035, 12);
const motorShaftGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8);

const frontBlurMat = new THREE.MeshBasicMaterial({
  map: createPropBlurTexture('rgba(0, 240, 255, 0.8)'),
  transparent: true,
  opacity: 0.75,
  side: THREE.DoubleSide
});
const rearBlurMat = new THREE.MeshBasicMaterial({
  map: createPropBlurTexture('rgba(255, 120, 0, 0.8)'),
  transparent: true,
  opacity: 0.75,
  side: THREE.DoubleSide
});

armPositions.forEach(pos => {
  // Carbon Arm
  const arm = new THREE.Mesh(armGeo, carbonMat);
  arm.rotation.z = Math.PI / 2;
  arm.rotation.y = Math.atan2(pos.z, pos.x);
  arm.position.set(pos.x / 2, 0, pos.z / 2);
  arm.castShadow = true;
  droneGroup.add(arm);

  // Motor Assembly Group
  const motorGroup = new THREE.Group();
  motorGroup.position.set(pos.x, 0.01, pos.z);

  // Stator (Copper Coils)
  const stator = new THREE.Mesh(motorStatorGeo, copperMat);
  stator.position.y = 0.02;
  motorGroup.add(stator);

  // Rotor Bell (Anodized Aluminum)
  const bell = new THREE.Mesh(motorBellGeo, anodizedMat);
  bell.position.y = 0.025;
  bell.castShadow = true;
  motorGroup.add(bell);

  // Motor Shaft & Prop Nut
  const shaft = new THREE.Mesh(motorShaftGeo, titaniumMat);
  shaft.position.y = 0.055;
  motorGroup.add(shaft);

  // 3-Blade Propeller Mesh Group
  const bladeGroup = new THREE.Group();
  bladeGroup.position.y = 0.055;
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.004, 0.16),
      pos.front ? anodizedMat : titaniumMat
    );
    blade.position.set(Math.sin(angle) * 0.08, 0, Math.cos(angle) * 0.08);
    blade.rotation.y = -angle;
    bladeGroup.add(blade);
  }
  motorGroup.add(bladeGroup);
  state.drone.rotorBlades.push(bladeGroup);

  // Spinning Motion Blur Disc
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 24),
    pos.front ? frontBlurMat : rearBlurMat
  );
  blurDisc.rotation.x = Math.PI / 2;
  blurDisc.position.y = 0.058;
  motorGroup.add(blurDisc);
  state.drone.rotors.push(blurDisc);

  // Arm Navigation LEDs
  let ledColor = 0x00f0ff; // default cyan
  if (pos.front && !pos.right) ledColor = 0xff0055; // Left Front: Aviation Red
  if (pos.front && pos.right) ledColor = 0x00ff88;  // Right Front: Aviation Green
  if (!pos.front) ledColor = 0xffaa00;             // Rear: Amber/White

  const navLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 8, 8),
    new THREE.MeshBasicMaterial({ color: ledColor })
  );
  navLed.position.set(0, -0.025, 0);
  motorGroup.add(navLed);

  droneGroup.add(motorGroup);

  // Ground Downwash Air Wash Ring (Beneath each rotor)
  const downwashGeo = new THREE.RingGeometry(0.15, 0.28, 24);
  const downwashMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const downwashRing = new THREE.Mesh(downwashGeo, downwashMat);
  downwashRing.rotation.x = -Math.PI / 2;
  downwashRing.position.set(pos.x, 0.02, pos.z);
  scene.add(downwashRing);
  state.drone.downwashRings.push({ ring: downwashRing, offset: pos });
});

// Front Dual Headlights (With real SpotLight beam projections!)
const headlightL = new THREE.SpotLight(0xffffff, 2.5, 40, Math.PI / 6, 0.35, 1.2);
headlightL.position.set(-0.06, 0.02, 0.18);
const headlightR = new THREE.SpotLight(0xffffff, 2.5, 40, Math.PI / 6, 0.35, 1.2);
headlightR.position.set(0.06, 0.02, 0.18);

const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, 15);
droneGroup.add(lightTarget);
headlightL.target = lightTarget;
headlightR.target = lightTarget;
droneGroup.add(headlightL);
droneGroup.add(headlightR);
state.drone.headlights.push(headlightL, headlightR);

// Front Headlight Housing Pods
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
[-0.06, 0.06].forEach(lx => {
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), titaniumMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(lx, 0.02, 0.18);
  droneGroup.add(lamp);

  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), lampMat);
  glass.position.set(lx, 0.02, 0.195);
  droneGroup.add(glass);
});

// Biological Drosophila Compound Eye Sensor Dome
const eyeMat = new THREE.MeshStandardMaterial({
  map: createOmmatidiaFacetTexture(),
  emissive: 0x00f0ff,
  emissiveIntensity: 0.65,
  roughness: 0.2,
  metalness: 0.8
});
const compoundEyeDome = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 24, 24),
  eyeMat
);
compoundEyeDome.position.set(0, 0.07, 0.16);
droneGroup.add(compoundEyeDome);

// Biological Halteres (Dual vibrating gyroscopic sensor stalks behind wings)
[-0.08, 0.08].forEach(hx => {
  const stalkGroup = new THREE.Group();
  stalkGroup.position.set(hx, 0.02, -0.16);

  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6),
    titaniumMat
  );
  stalk.rotation.x = -Math.PI / 4;
  stalkGroup.add(stalk);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff })
  );
  knob.position.set(0, 0.03, -0.03);
  stalkGroup.add(knob);

  droneGroup.add(stalkGroup);
  state.drone.halteres.push(stalkGroup);
});

scene.add(droneGroup);

// Dynamic 3D Evasive Trajectory Ribbon (Traces flight path in real-time)
const maxTrailPoints = 220;
const trailPositions = new Float32Array(maxTrailPoints * 3);
const trailColors = new Float32Array(maxTrailPoints * 3);
// Initialize with default hover position
for (let i = 0; i < maxTrailPoints; i++) {
  trailPositions[i * 3 + 0] = 0.0;
  trailPositions[i * 3 + 1] = 1.5;
  trailPositions[i * 3 + 2] = 0.0;
  trailColors[i * 3 + 0] = 0.22;
  trailColors[i * 3 + 1] = 0.74;
  trailColors[i * 3 + 2] = 0.97;
}
const evasionTrailGeo = new THREE.BufferGeometry();
evasionTrailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
evasionTrailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
const evasionTrailMat = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  linewidth: 2.5
});
const evasionTrailLine = new THREE.Line(evasionTrailGeo, evasionTrailMat);
evasionTrailLine.frustumCulled = false;
scene.add(evasionTrailLine);
const obstacleGroup = new THREE.Group();

// ----------------------------------------------------------------------------
// THREAT GEOMETRY 1: MATHEMATICAL PRECISION POINT EPICENTER (x₀, y₀, z₀)
// ----------------------------------------------------------------------------
const pointGroup = new THREE.Group();

// Concentric orthogonal holographic laser reticle rings
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: false });
const reticleRingXY = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.008, 8, 36), ringMat);
const reticleRingXZ = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.008, 8, 36), ringMat);
reticleRingXZ.rotation.x = Math.PI / 2;
const reticleRingYZ = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.008, 8, 36), ringMat);
reticleRingYZ.rotation.y = Math.PI / 2;
pointGroup.add(reticleRingXY, reticleRingXZ, reticleRingYZ);

// Pulsing center point epicenter sphere
const centerPointMat = new THREE.MeshBasicMaterial({ color: 0xff2266 });
const centerPointSphere = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), centerPointMat);
pointGroup.add(centerPointSphere);

// Precision Crosshair Laser Ticks
const crosshairMat = new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 2 });
[-0.55, 0.55].forEach(x => {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, 0, 0),
    new THREE.Vector3(x * 0.45, 0, 0)
  ]);
  pointGroup.add(new THREE.Line(geo, crosshairMat));
});
[-0.55, 0.55].forEach(y => {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, y, 0),
    new THREE.Vector3(0, y * 0.45, 0)
  ]);
  pointGroup.add(new THREE.Line(geo, crosshairMat));
});

// Rocket Thruster Exhaust Flare for Point Projectile
const exhaustGeo = new THREE.ConeGeometry(0.14, 0.75, 12);
const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.85 });
const exhaustMesh = new THREE.Mesh(exhaustGeo, exhaustMat);
exhaustMesh.rotation.x = Math.PI / 2;
exhaustMesh.position.set(0, 0, 0.5);
pointGroup.add(exhaustMesh);

// Point Light Glow
const pointLight = new THREE.PointLight(0xff0044, 2.2, 4.5);
pointGroup.add(pointLight);

// 3D Augmented Reality (AR) Target Lock Reticle Box
const lockGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
const lockMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true, transparent: true, opacity: 0.65 });
const targetLockBox = new THREE.Mesh(lockGeo, lockMat);
pointGroup.add(targetLockBox);

obstacleGroup.add(pointGroup);

// ----------------------------------------------------------------------------
// THREAT GEOMETRY 2: TALL PILLAR (H > W) -> Vertical Column Requiring Lateral Bank
// ----------------------------------------------------------------------------
const tallGroup = new THREE.Group();

// Tall Column Cylinder (H = 3.8m, W = 0.48m)
const tallColGeo = new THREE.CylinderGeometry(0.24, 0.24, 3.8, 16);
const tallColMat = new THREE.MeshStandardMaterial({
  color: 0x1f2937,
  roughness: 0.35,
  metalness: 0.8
});
const tallColMesh = new THREE.Mesh(tallColGeo, tallColMat);
tallColMesh.castShadow = true;
tallGroup.add(tallColMesh);

// Alternating Hazard Yellow/Black Stripes along Column
for (let y = -1.6; y <= 1.6; y += 0.4) {
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.18, 16),
    new THREE.MeshBasicMaterial({ color: 0xeab308 })
  );
  stripe.position.y = y;
  tallGroup.add(stripe);
}

// Top Flashing Red Hazard Strobe
const tallStrobe = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xff0044 })
);
tallStrobe.position.y = 1.95;
tallGroup.add(tallStrobe);

// AR Bounding Cage (H = 3.9m, W = 0.8m)
const tallCage = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 3.9, 0.7),
  new THREE.MeshBasicMaterial({ color: 0xeab308, wireframe: true, transparent: true, opacity: 0.45 })
);
tallGroup.add(tallCage);
tallGroup.visible = false;
obstacleGroup.add(tallGroup);

// ----------------------------------------------------------------------------
// THREAT GEOMETRY 3: WIDE BARRIER (W > H) -> Horizontal Span Requiring Vertical Flare
// ----------------------------------------------------------------------------
const wideGroup = new THREE.Group();

// Wide Horizontal Beam (W = 4.8m, H = 0.38m, D = 0.25m)
const wideBeamGeo = new THREE.BoxGeometry(4.8, 0.38, 0.25);
const wideBeamMat = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  roughness: 0.4,
  metalness: 0.75
});
const wideBeamMesh = new THREE.Mesh(wideBeamGeo, wideBeamMat);
wideBeamMesh.castShadow = true;
wideGroup.add(wideBeamMesh);

// Diagonal Yellow Hazard Markings across Wide Face
for (let x = -2.1; x <= 2.1; x += 0.5) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.39, 0.26),
    new THREE.MeshBasicMaterial({ color: 0xeab308 })
  );
  stripe.position.set(x, 0, 0);
  wideGroup.add(stripe);
}

// Left and Right Wingtip Hazard Strobes
[-2.4, 2.4].forEach(x => {
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff0044 })
  );
  strobe.position.set(x, 0, 0);
  wideGroup.add(strobe);
});

// AR Bounding Cage (W = 4.9m, H = 0.65m)
const wideCage = new THREE.Mesh(
  new THREE.BoxGeometry(4.9, 0.65, 0.6),
  new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.45 })
);
wideGroup.add(wideCage);
wideGroup.visible = false;
obstacleGroup.add(wideGroup);

obstacleGroup.visible = false;
scene.add(obstacleGroup);

state.obstacle.mesh = obstacleGroup;
state.obstacle.pointGroup = pointGroup;
state.obstacle.tallGroup = tallGroup;
state.obstacle.wideGroup = wideGroup;
state.obstacle.exhaustMesh = exhaustMesh;
state.obstacle.targetLockBox = targetLockBox;

// Switch Threat Geometry Type
function setThreatGeometry(mode) {
  state.obstacle.geomMode = mode;
  pointGroup.visible = (mode === 'point');
  tallGroup.visible = (mode === 'tall');
  wideGroup.visible = (mode === 'wide');

  const desc = document.getElementById('geom-desc');
  document.querySelectorAll('#threat-geom-point, #threat-geom-tall, #threat-geom-wide').forEach(b => b.classList.remove('active'));

  if (mode === 'point') {
    state.obstacle.radius = 0.28;
    state.obstacle.width = 0.35;
    state.obstacle.height = 0.35;
    const btn = document.getElementById('threat-geom-point');
    if (btn) btn.classList.add('active');
    if (desc) desc.innerText = "Point Epicenter: Laser-locked spatial coordinate (x₀, y₀, z₀). Drosophila connectome evaluates precision collision ray.";
  } else if (mode === 'tall') {
    state.obstacle.radius = 0.32;
    state.obstacle.width = 0.48;
    state.obstacle.height = 3.8;
    const btn = document.getElementById('threat-geom-tall');
    if (btn) btn.classList.add('active');
    if (desc) desc.innerText = "Tall Pillar (H > W): Aspect ratio H/W = 7.9. Compound eye triggers DNa02/GF lateral bank roll to slip past side.";
  } else if (mode === 'wide') {
    state.obstacle.radius = 0.32;
    state.obstacle.width = 4.8;
    state.obstacle.height = 0.38;
    const btn = document.getElementById('threat-geom-wide');
    if (btn) btn.classList.add('active');
    if (desc) desc.innerText = "Wide Barrier (W > H): Aspect ratio W/H = 12.6. Lateral evasion impossible; compound eye triggers DNb01 vertical pop-up flare!";
  }
}

// ============================================================================
// IN-BROWSER DROSOPHILA CONNECTOME & NEUROMORPHIC GYRO ENGINE
// ============================================================================
function updateConnectomeBrain(dt) {
  const d = state.drone;
  const obs = state.obstacle;
  const ev = state.evasion;

  if (!obs.active) {
    state.brain.looming_metric = 0;
    state.brain.spikes.dna01_l = false;
    state.brain.spikes.dna01_r = false;
    state.brain.spikes.dna02_l = false;
    state.brain.spikes.dna02_r = false;
    state.brain.spikes.gf_l = false;
    state.brain.spikes.gf_r = false;
    compoundEyeDome.material.emissiveIntensity = 0.4;

    // Transition active saccade to recovery if obstacle disappears
    if (ev.phase === 'saccade') {
      ev.phase = 'recovery';
      ev.recoveryStartTime = performance.now();
    }
  } else {
    // Relative vector from drone to incoming threat
    const rel = new THREE.Vector3().subVectors(obs.pos, d.pos);
    const dist = rel.length();

    if (dist < state.brain.min_clearance) {
      state.brain.min_clearance = dist;
      document.getElementById('diag-clearance').innerText = dist.toFixed(2) + " m";
    }

    // Closing speed along line of sight
    const relVel = new THREE.Vector3().subVectors(obs.vel, d.vel);
    const closingSpeed = -rel.dot(relVel) / (dist + 1e-4);

    // Biological Compound Eye Looming & Aspect Ratio Analysis
    if (rel.z > 0 && closingSpeed > 0) { // Threat is in front and approaching
      const theta_w = 2.0 * Math.atan2(obs.width / 2, dist);
      const theta_h = 2.0 * Math.atan2(obs.height / 2, dist);
      const opticalAspect = theta_w / (theta_h + 1e-4);

      const charRadius = Math.max(obs.radius, Math.min(obs.width, obs.height) / 2);
      const theta = Math.max(theta_w, theta_h);
      const theta_dot = (2.0 * charRadius * closingSpeed) / (dist * dist + charRadius * charRadius);
      const looming = theta * 1.6 + theta_dot * 3.2;
      state.brain.looming_metric = Math.min(looming, 5.0);

      // Dynamic retinal intensity on compound eyes
      compoundEyeDome.material.emissiveIntensity = 0.5 + looming * 0.8;

      // Trigger biological evasion when looming exceeds threshold
      if (looming > 0.65) {
        if (!state.brain.reaction_detected) {
          state.brain.reaction_detected = true;
          state.brain.latency_ms = performance.now() - state.brain.trial_start_time;
        }

        // Phase 1: Onset & Mathematical Escape Vector Selection
        if (ev.phase === 'idle') {
          ev.active = true;
          ev.phase = 'saccade';
          ev.originX = d.pos.x;
          ev.originY = d.pos.y;
          ev.saccadeStartTime = performance.now();

          // Mathematical Shape Analysis:
          // If Wide Barrier (W > H, aspect ratio > 2.2):
          // Lateral evasion requires clearing W/2 = 2.4m which takes > 0.8s.
          // Minimum energy path is a vertical pop-up flare (DNb01) jumping over the 0.38m barrier!
          if (obs.geomMode === 'wide' || opticalAspect > 2.2) {
            ev.evasionType = 'vertical';
            ev.targetAltitude = 2.85; // Climb 1.35m above obstacle height
            ev.targetPitch = 0.16;   // +9 deg pitch-up flare
            ev.targetRoll = 0.0;
            ev.saccadeDuration = 0.44;
          } else {
            // Point Epicenter or Tall Pillar (H >= W):
            // Lateral roll saccade (DNa02 / GF) is optimal minimum-energy path
            ev.evasionType = 'lateral';
            ev.targetAltitude = 1.50;
            ev.targetPitch = 0.0;
            ev.saccadeDuration = 0.38;

            if (rel.x > 0.04) {
              ev.direction = -1; // Dodge left
            } else if (rel.x < -0.04) {
              ev.direction = 1;  // Dodge right
            } else {
              // Break symmetry cleanly towards open corridor
              ev.direction = (d.pos.x > 0.2) ? -1 : 1;
            }
            // Target bank angle: ~30 deg (0.52 rad)
            ev.targetRoll = -ev.direction * 0.52;
          }
          playSpikeClick();
        }

        // Phase 2: Active Saccade Execution
        if (ev.phase === 'saccade') {
          if (ev.evasionType === 'vertical') {
            // Vertical Pop-Up Flare: Activate Giant Fiber & Descending Lift
            state.brain.spikes.gf_l = true;
            state.brain.spikes.gf_r = true;
            state.brain.spikes.dna01_l = false;
            state.brain.spikes.dna01_r = false;
            state.brain.spikes.dna02_l = false;
            state.brain.spikes.dna02_r = false;
          } else {
            // Lateral Roll Saccade
            if (ev.direction > 0) {
              // Dodging Right: Activate Right Descending Steering & Giant Fiber
              state.brain.spikes.dna02_r = true;
              state.brain.spikes.dna01_r = true;
              state.brain.spikes.gf_r = (looming > 1.2);
              state.brain.spikes.dna02_l = false;
              state.brain.spikes.dna01_l = false;
              state.brain.spikes.gf_l = false;
            } else {
              // Dodging Left: Activate Left Descending Steering & Giant Fiber
              state.brain.spikes.dna02_l = true;
              state.brain.spikes.dna01_l = true;
              state.brain.spikes.gf_l = (looming > 1.2);
              state.brain.spikes.dna02_r = false;
              state.brain.spikes.dna01_r = false;
              state.brain.spikes.gf_r = false;
            }
          }

          // Check if threat has passed the drone's collision plane
          const threatPassed = (obs.pos.z <= d.pos.z + 0.35);
          const elapsedSaccade = (performance.now() - ev.saccadeStartTime) / 1000;
          if (threatPassed || elapsedSaccade > ev.saccadeDuration) {
            // Transition to Phase 3: Recovery
            ev.phase = 'recovery';
            ev.recoveryStartTime = performance.now();
          }
        }

      } else if (ev.phase === 'idle') {
        state.brain.spikes.dna02_l = false;
        state.brain.spikes.dna02_r = false;
        state.brain.spikes.dna01_l = false;
        state.brain.spikes.dna01_r = false;
        state.brain.spikes.gf_l = false;
        state.brain.spikes.gf_r = false;
      }
    } else {
      state.brain.looming_metric = 0;
      // Threat has passed behind drone
      if (ev.phase === 'saccade') {
        ev.phase = 'recovery';
        ev.recoveryStartTime = performance.now();
      }
    }
  }

  // Phase 3: Haltere-Stabilized Optomotor Recovery (Always runs until stabilized)
  if (ev.phase === 'recovery') {
    state.brain.spikes.dna02_l = false;
    state.brain.spikes.dna02_r = false;
    state.brain.spikes.dna01_l = false;
    state.brain.spikes.dna01_r = false;
    state.brain.spikes.gf_l = false;
    state.brain.spikes.gf_r = false;

    // Active counter-banking to arrest lateral velocity and guide drone back to corridor center (X = 0)
    const lateralVx = d.vel.x;
    const xDistFromCenter = d.pos.x - 0.0;
    const counterBank = THREE.MathUtils.clamp(0.26 * lateralVx + 0.14 * xDistFromCenter, -0.42, 0.42);
    ev.targetRoll = counterBank;

    // Smooth altitude recovery back to nominal hover 1.50m
    const altErr = 1.50 - d.pos.y;
    ev.targetAltitude = 1.50;
    ev.targetPitch = 0.0;

    // Transition to idle when velocity is damped and attitude leveled
    const elapsedRec = (performance.now() - ev.recoveryStartTime) / 1000;
    const lateralSettled = (Math.abs(lateralVx) < 0.06 && Math.abs(xDistFromCenter) < 0.12);
    const verticalSettled = (Math.abs(d.vel.y) < 0.08 && Math.abs(altErr) < 0.12);

    if ((lateralSettled && verticalSettled) || elapsedRec > 1.8) {
      ev.phase = 'idle';
      ev.active = false;
      ev.targetRoll = 0.0;
      ev.targetAltitude = 1.50;
    }
  }

  // Leaky integration of descending traces (tau = 15 ms)
  const decay = Math.exp(-dt / 0.015);
  const b = state.brain;
  b.trace_dna01_l = b.trace_dna01_l * decay + (b.spikes.dna01_l ? 1.0 : 0.0);
  b.trace_dna01_r = b.trace_dna01_r * decay + (b.spikes.dna01_r ? 1.0 : 0.0);
  b.trace_dna02_l = b.trace_dna02_l * decay + (b.spikes.dna02_l ? 1.0 : 0.0);
  b.trace_dna02_r = b.trace_dna02_r * decay + (b.spikes.dna02_r ? 1.0 : 0.0);
  b.trace_gf_l = b.trace_gf_l * decay + (b.spikes.gf_l ? 2.0 : 0.0);
  b.trace_gf_r = b.trace_gf_r * decay + (b.spikes.gf_r ? 2.0 : 0.0);
}

// 6-DoF Rigid-Body Dynamics Step
function updatePhysics(dt) {
  const d = state.drone;
  const b = state.brain;
  const ev = state.evasion;

  let roll_rate_sp = 0;
  let pitch_rate_sp = 0;
  let yaw_rate_sp = 0;
  let thrust_sp = 4.41;

  // Handle manual flight inputs from WASD / Arrows
  const k_manual_roll = state.keys.left ? 2.5 : (state.keys.right ? -2.5 : 0.0);
  const k_manual_pitch = state.keys.forward ? 2.0 : (state.keys.backward ? -2.0 : 0.0);
  const k_manual_yaw = state.keys.yawLeft ? -3.0 : (state.keys.yawRight ? 3.0 : 0.0);
  const k_manual_thrust = state.keys.up ? 2.5 : (state.keys.down ? -2.5 : 0.0);

  if (state.controllerMode === 'neuromorphic') {
    // =========================================================================
    // PROPOSED: CONTINUOUS NEUROMORPHIC GYRO BRIDGE + HALTERE RESTORATIVE STIFFNESS
    // =========================================================================
    const k_haltere = 7.0; // Haltere angular velocity damping & restorative stiffness

    // 1. Roll Rate Control:
    let desired_roll = 0.0;
    if (ev.phase === 'saccade' || ev.phase === 'recovery') {
      desired_roll = ev.targetRoll;
    } else if (state.flightMode === 'hover') {
      // Continuous optomotor wide-field stabilization in hover (holds station in center)
      desired_roll = THREE.MathUtils.clamp(0.18 * d.vel.x + 0.08 * (d.pos.x - 0.0), -0.22, 0.22);
    }
    // Haltere feedback: omega_roll_sp = k_haltere * (phi_desired - phi_actual)
    roll_rate_sp = THREE.MathUtils.clamp(k_haltere * (desired_roll - d.euler.z) + k_manual_roll, -6.0, 6.0);

    // 2. Pitch Rate Control:
    let pitch_target = 0.0;
    if (ev.phase === 'saccade' && ev.evasionType === 'vertical') {
      pitch_target = ev.targetPitch; // +0.16 rad (+9 deg) pitch flare for vertical escape
    } else if (state.flightMode === 'cruise') {
      pitch_target = 0.06;
    } else if (state.flightMode === 'hover' && ev.phase === 'idle') {
      // Optomotor longitudinal damping in hover
      pitch_target = THREE.MathUtils.clamp(-0.14 * d.vel.z - 0.05 * (d.pos.z - 0.0), -0.18, 0.18);
    }
    pitch_rate_sp = THREE.MathUtils.clamp(-5.2 * (d.euler.x - pitch_target) + k_manual_pitch, -3.2, 3.2);

    // 3. Yaw Rate Control:
    // Maintain heading alignment along forward flight axis Z
    yaw_rate_sp = THREE.MathUtils.clamp(-3.5 * d.euler.y + k_manual_yaw, -3.5, 3.5);

    // 4. Aerodynamic Coupled Thrust Vectoring with Closed-Loop Altitude Hold:
    const z_target = (ev.phase === 'saccade' || ev.phase === 'recovery') ? ev.targetAltitude : 1.50;
    const z_err = z_target - d.pos.y;
    const kp_z = 8.5;
    const kd_z = 4.0;
    // Commanded vertical acceleration
    const accel_z_des = 9.81 + (kp_z * z_err) - (kd_z * d.vel.y) + k_manual_thrust;
    const accel_z_clamped = THREE.MathUtils.clamp(accel_z_des, 3.5, 16.0);
    const base_thrust = d.mass * accel_z_clamped; // ~4.41 N at hover

    // Biological thrust boost:
    // If vertical pop-up flare: +3.2 N vertical jump thrust (DNb01)
    // If lateral bank saccade: +1.6 N tilt vectoring boost
    let saccade_boost = 0.0;
    if (ev.phase === 'saccade') {
      saccade_boost = (ev.evasionType === 'vertical') ? 3.2 : 1.6;
    }

    // Aerodynamic tilt compensation (capped at 1.4x to prevent vertical runaway)
    const cos_tilt = Math.max(0.72, Math.cos(d.euler.z) * Math.cos(d.euler.x));
    thrust_sp = THREE.MathUtils.clamp((base_thrust + saccade_boost) / cos_tilt, 2.5, 9.8);

  } else {
    // =========================================================================
    // FLAWED BASELINE: Discrete Heuristics (pitch = thrust * 0.5, roll = yaw * 0.3)
    // =========================================================================
    const raw_yaw = b.spikes.dna01_l ? 3.0 : (b.spikes.dna01_r ? -3.0 : 0.0);
    const raw_thrust = (b.spikes.gf_l || b.spikes.gf_r) ? 8.5 : 4.41;
    thrust_sp = raw_thrust + k_manual_thrust;
    yaw_rate_sp = raw_yaw + k_manual_yaw;
    pitch_rate_sp = THREE.MathUtils.clamp(thrust_sp * 0.3 + k_manual_pitch, -2.5, 2.5);
    roll_rate_sp = THREE.MathUtils.clamp(yaw_rate_sp * 0.3 + k_manual_roll, -2.5, 2.5);
  }

  // Inner-Loop Rate PID & Motor Acceleration (22 ms motor time constant)
  const tau_motor = 0.022;
  const motor_decay = Math.exp(-dt / tau_motor);
  d.omega.x = d.omega.x * motor_decay + pitch_rate_sp * (1 - motor_decay);
  d.omega.y = d.omega.y * motor_decay + yaw_rate_sp * (1 - motor_decay);
  d.omega.z = d.omega.z * motor_decay + roll_rate_sp * (1 - motor_decay);

  d.euler.x += d.omega.x * dt;
  d.euler.y += d.omega.y * dt;
  d.euler.z += d.omega.z * dt;

  // Translational Dynamics
  d.thrust = thrust_sp;
  const thrustVec = new THREE.Vector3(0, d.thrust, 0).applyEuler(d.euler);
  const gravity = new THREE.Vector3(0, -d.mass * 9.81, 0);
  const drag = new THREE.Vector3(-0.18 * d.vel.x, -0.28 * d.vel.y, -0.16 * d.vel.z);

  // Crosswind Gust Force
  const windMps = (state.crosswindKmh / 3.6);
  const windForce = new THREE.Vector3(windMps * 0.38, 0, 0);

  // Forward flight thrust if in cruise mode
  const cruiseForward = state.flightMode === 'cruise' ? new THREE.Vector3(0, 0, 1.4) : new THREE.Vector3(0, 0, 0);

  const accel = new THREE.Vector3()
    .add(thrustVec)
    .add(gravity)
    .add(drag)
    .add(windForce)
    .add(cruiseForward)
    .divideScalar(d.mass);

  d.vel.addScaledVector(accel, dt);
  d.pos.addScaledVector(d.vel, dt);

  // Prevent falling through the ground
  if (d.pos.y < 0.12) {
    d.pos.y = 0.12;
    d.vel.y = Math.max(0, d.vel.y);
  }

  // Sync 3D Drone Model
  droneGroup.position.copy(d.pos);
  droneGroup.rotation.copy(d.euler);

  // Spin Propellers & Motion Blur Discs
  const rotorSpeed = 35.0 * (d.thrust / 4.41);
  state.drone.rotorBlades.forEach(b => b.rotation.y += rotorSpeed * dt);
  state.drone.rotors.forEach(r => r.rotation.z += rotorSpeed * dt);

  // Vibrate Haltere Stalks (140 Hz biological wingbeat harmonic)
  const haltereWobble = Math.sin(performance.now() * 0.14) * 0.15;
  state.drone.halteres.forEach(h => h.rotation.y = haltereWobble);

  // Update Floor Downwash Rings (Reposition directly below rotors on the floor)
  state.drone.downwashRings.forEach(item => {
    const worldPos = new THREE.Vector3(item.offset.x, 0, item.offset.z).applyEuler(d.euler).add(d.pos);
    item.ring.position.set(worldPos.x, 0.02, worldPos.z);
    // Pulse downwash size with thrust and ground distance
    const altFactor = Math.max(0.1, 1.8 - d.pos.y * 0.4);
    const scale = (d.thrust / 4.41) * altFactor;
    item.ring.scale.set(scale, scale, 1);
  });

  // Update 3D Evasive Trajectory Trail Ribbon
  if (state.trail && state.trail.points) {
    const pts = state.trail.points;
    // Push new position sampled along flight trajectory
    pts.push({ pos: d.pos.clone(), phase: state.evasion.phase });
    if (pts.length > maxTrailPoints) pts.shift();

    const posAttr = evasionTrailGeo.attributes.position;
    const colAttr = evasionTrailGeo.attributes.color;
    for (let i = 0; i < maxTrailPoints; i++) {
      if (i < pts.length) {
        const pt = pts[i];
        posAttr.setXYZ(i, pt.pos.x, pt.pos.y, pt.pos.z);
        if (pt.phase === 'saccade') {
          colAttr.setXYZ(i, 0.0, 0.95, 1.0); // Electric cyan during rapid banking saccade
        } else if (pt.phase === 'recovery') {
          colAttr.setXYZ(i, 0.1, 0.95, 0.45); // Emerald green during haltere recovery
        } else {
          colAttr.setXYZ(i, 0.22, 0.65, 0.95); // High-tech sky blue during level flight
        }
      } else if (pts.length > 0) {
        const last = pts[pts.length - 1];
        posAttr.setXYZ(i, last.pos.x, last.pos.y, last.pos.z);
        colAttr.setXYZ(i, 0.22, 0.65, 0.95);
      } else {
        posAttr.setXYZ(i, d.pos.x, d.pos.y, d.pos.z);
        colAttr.setXYZ(i, 0.22, 0.65, 0.95);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    evasionTrailGeo.setDrawRange(0, pts.length);
  }

  // Update Obstacle Motion
  if (state.obstacle.active) {
    const obs = state.obstacle;
    obs.pos.addScaledVector(obs.vel, dt);
    obs.mesh.position.copy(obs.pos);

    // Rocket thruster exhaust flicker
    if (obs.exhaustMesh) {
      obs.exhaustMesh.scale.set(1 + Math.random() * 0.3, 1 + Math.random() * 0.5, 1);
    }
    // AR Target Lock Box pulse
    if (obs.targetLockBox) {
      obs.targetLockBox.rotation.z += dt * 3.0;
    }

    // Precise Multi-Geometry Collision Check
    let isCollision = false;
    let clearanceDist = 999.0;
    const dx = Math.abs(d.pos.x - obs.pos.x);
    const dy = Math.abs(d.pos.y - obs.pos.y);
    const dz = Math.abs(d.pos.z - obs.pos.z);

    if (obs.geomMode === 'point') {
      clearanceDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      isCollision = (clearanceDist <= 0.28);
    } else if (obs.geomMode === 'tall') {
      clearanceDist = Math.sqrt(dx * dx + dz * dz);
      isCollision = (dx <= 0.38 && dy <= 1.95 && dz <= 0.38);
    } else if (obs.geomMode === 'wide') {
      clearanceDist = Math.sqrt(dy * dy + dz * dz);
      isCollision = (dx <= 2.45 && dy <= 0.32 && dz <= 0.38);
    }

    if (clearanceDist < state.brain.min_clearance) {
      state.brain.min_clearance = clearanceDist;
      const diagClr = document.getElementById('diag-clearance');
      if (diagClr) diagClr.innerText = clearanceDist.toFixed(2) + " m";
    }

    if (isCollision) {
      triggerTrialEnd(false, clearanceDist);
    } else if (obs.pos.z < d.pos.z - 3.5) {
      triggerTrialEnd(true, state.brain.min_clearance);
    }
  }
}

function triggerTrialEnd(success, clearance) {
  state.obstacle.active = false;
  state.obstacle.mesh.visible = false;

  const banner = document.getElementById('result-banner');
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  const icon = document.getElementById('result-icon');
  const diagStatus = document.getElementById('diag-status');

  banner.classList.remove('hidden');

  if (success) {
    banner.classList.remove('crash');
    icon.innerText = "✓";
    title.innerText = "EVASION SUCCESSFUL!";
    detail.innerText = `Cleared threat with ${clearance.toFixed(2)}m margin at ${state.brain.latency_ms.toFixed(1)}ms reaction latency.`;
    diagStatus.innerText = "DODGED (100%)";
    diagStatus.className = "diag-value status-clear";
  } else {
    banner.classList.add('crash');
    icon.innerText = "✕";
    title.innerText = "COLLISION / CRASH!";
    detail.innerText = `Direct impact! Minimum clearance was ${clearance.toFixed(2)}m. Flawed baseline failed to turn in time.`;
    diagStatus.innerText = "CRASH (FAIL)";
    diagStatus.className = "diag-value status-crash";
  }
}

// ============================================================================
// CAMERA MODES & UI UPDATE LOOP
// ============================================================================
function updateCameras() {
  const d = state.drone;

  if (state.cameraMode === 'tpv') {
    controls.enabled = false;
    // 1. Third Person Chase View: Positioned high and back for clear 3D perspective
    const offset = new THREE.Vector3(0, 0.85, -2.4).applyEuler(d.euler);
    camera.position.copy(d.pos).add(offset);
    camera.lookAt(d.pos.x, d.pos.y + 0.25, d.pos.z + 5.0);

  } else if (state.cameraMode === 'fpv') {
    controls.enabled = false;
    // 2. Front Nose Cockpit View: FPV camera looking directly forward
    const nosePos = new THREE.Vector3(0, 0.08, 0.24).applyEuler(d.euler);
    camera.position.copy(d.pos).add(nosePos);
    const lookTarget = new THREE.Vector3(0, 0, 12.0).applyEuler(d.euler).add(camera.position);
    camera.lookAt(lookTarget);

  } else if (state.cameraMode === 'top') {
    controls.enabled = false;
    // 3. Top-Down Bird's-Eye View: Looking straight down at the flight corridor
    // Perfectly visualizes lateral jink and corridor lane centering (X = 0)
    camera.position.set(0, 14.0, d.pos.z + 5.0);
    camera.lookAt(0, 0, d.pos.z + 5.0);

  } else if (state.cameraMode === 'side') {
    controls.enabled = false;
    // 4. Side Profile Elevation View: Looking at the drone from the port side
    // Clearly demonstrates pitch flare, vertical pop-up jump, and altitude leveling
    camera.position.set(-7.5, d.pos.y + 0.4, d.pos.z + 3.0);
    camera.lookAt(0, d.pos.y + 0.2, d.pos.z + 4.5);

  } else {
    // 5. Orbit Free-Cam: Full 360-degree user-controlled orbital camera
    controls.enabled = true;
    controls.target.copy(d.pos);
  }
}

// Oscilloscope Canvas Render
const scopeCanvas = document.getElementById('spike-raster-canvas');
const scopeCtx = scopeCanvas.getContext('2d');
const rasterHistory = [];

function drawSpikeRaster() {
  const b = state.brain;
  rasterHistory.push({
    dna01_l: b.spikes.dna01_l,
    dna01_r: b.spikes.dna01_r,
    dna02_l: b.spikes.dna02_l,
    dna02_r: b.spikes.dna02_r,
    gf: b.spikes.gf_l || b.spikes.gf_r
  });
  if (rasterHistory.length > 150) rasterHistory.shift();

  scopeCtx.fillStyle = "#080d1a";
  scopeCtx.fillRect(0, 0, scopeCanvas.width, scopeCanvas.height);

  const channels = ['dna01_l', 'dna01_r', 'dna02_l', 'dna02_r', 'gf'];
  const colors = ['#0088ff', '#00f0ff', '#00bb66', '#00ff88', '#ff0055'];

  channels.forEach((ch, chIdx) => {
    const y = 14 + chIdx * 15;
    scopeCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, y);
    scopeCtx.lineTo(scopeCanvas.width, y);
    scopeCtx.stroke();

    scopeCtx.fillStyle = colors[chIdx];
    for (let i = 0; i < rasterHistory.length; i++) {
      if (rasterHistory[i][ch]) {
        const x = (i / 150) * scopeCanvas.width;
        scopeCtx.fillRect(x, y - 6, 2, 12);
      }
    }
  });
}

// Compound Eye Ommatidia Canvas Render
const eyeCanvas = document.getElementById('compound-eye-canvas');
const eyeCtx = eyeCanvas.getContext('2d');

function drawCompoundEye() {
  eyeCtx.fillStyle = 'rgba(8, 13, 26, 0.6)';
  eyeCtx.fillRect(0, 0, eyeCanvas.width, eyeCanvas.height);

  const b = state.brain;
  const n = 32;
  const cellWidth = eyeCanvas.width / (n * 2);

  // Left Eye Ommatidia
  for (let i = 0; i < n; i++) {
    const act = b.trace_dna02_l * 0.45 + (b.spikes.gf_l ? 0.9 : 0.08);
    eyeCtx.fillStyle = `rgba(0, 240, 255, ${Math.min(1.0, act)})`;
    eyeCtx.fillRect(i * cellWidth, 20, cellWidth - 1, 80);
  }

  // Right Eye Ommatidia
  for (let i = 0; i < n; i++) {
    const act = b.trace_dna02_r * 0.45 + (b.spikes.gf_r ? 0.9 : 0.08);
    eyeCtx.fillStyle = `rgba(0, 255, 136, ${Math.min(1.0, act)})`;
    eyeCtx.fillRect(eyeCanvas.width / 2 + i * cellWidth, 20, cellWidth - 1, 80);
  }
}

// ============================================================================
// REAL-TIME DYNAMIC S-CURVE TRAJECTORY & EQUILIBRIUM GRAPH RENDERER
// ============================================================================
const trajCanvas = document.getElementById('trajectory-curve-canvas');
const trajCtx = trajCanvas ? trajCanvas.getContext('2d') : null;

function drawTrajectoryGraph() {
  if (!trajCanvas || !trajCtx) return;
  const d = state.drone;
  const obs = state.obstacle;
  const ev = state.evasion;
  const w = trajCanvas.width;
  const h = trajCanvas.height;

  // Background
  trajCtx.fillStyle = '#060a14';
  trajCtx.fillRect(0, 0, w, h);

  // Coordinate scales:
  // X: Lateral position from -2.4m (left = 0) to +2.4m (right = w)
  const scaleX = (x) => ((x + 2.4) / 4.8) * w;
  const centerX = scaleX(0);

  // Grid lines: safety boundary corridors at ±1.5m and ±0.75m
  trajCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  trajCtx.lineWidth = 1;
  [-1.5, -0.75, 0.75, 1.5].forEach(x => {
    const px = scaleX(x);
    trajCtx.beginPath();
    trajCtx.moveTo(px, 0);
    trajCtx.lineTo(px, h);
    trajCtx.stroke();
  });

  // Center track reference (Green dashed centerline at X = 0.00m)
  trajCtx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
  trajCtx.setLineDash([4, 4]);
  trajCtx.beginPath();
  trajCtx.moveTo(centerX, 0);
  trajCtx.lineTo(centerX, h);
  trajCtx.stroke();
  trajCtx.setLineDash([]);

  // Plot recorded S-curve flight path
  const pts = state.trail.points;
  if (pts && pts.length > 1) {
    trajCtx.lineWidth = 2.5;
    trajCtx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const py = h - 8 - (i / (pts.length - 1)) * (h - 16);
      const px = scaleX(pts[i].pos.x);
      if (i === 0) trajCtx.moveTo(px, py);
      else trajCtx.lineTo(px, py);
    }
    // Gradient stroke along trajectory
    const grad = trajCtx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#0088ff');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#00ff88');
    trajCtx.strokeStyle = grad;
    trajCtx.stroke();
  }

  // Draw Threat Epicenter Marker (Red)
  if (obs.active) {
    const obsPx = scaleX(obs.pos.x);
    // Relative forward distance along corridor
    const relZ = obs.pos.z - d.pos.z;
    const normZ = THREE.MathUtils.clamp(relZ / 26.0, 0.05, 0.95);
    const obsPy = 8 + (1 - normZ) * (h - 20);

    if (obs.geomMode === 'wide') {
      // Wide barrier: draw horizontal hazard span
      const spanPx = (obs.width / 4.8) * w;
      trajCtx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
      trajCtx.lineWidth = 3;
      trajCtx.beginPath();
      trajCtx.moveTo(obsPx - spanPx / 2, obsPy);
      trajCtx.lineTo(obsPx + spanPx / 2, obsPy);
      trajCtx.stroke();
    } else {
      // Precision point epicenter: draw reticle crosshair and radar pulse
      trajCtx.fillStyle = '#ef4444';
      trajCtx.beginPath();
      trajCtx.arc(obsPx, obsPy, 4.5, 0, Math.PI * 2);
      trajCtx.fill();

      // Pulsing radar ring
      const pulseR = 5 + Math.sin(performance.now() * 0.012) * 3;
      trajCtx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
      trajCtx.lineWidth = 1.5;
      trajCtx.beginPath();
      trajCtx.arc(obsPx, obsPy, pulseR, 0, Math.PI * 2);
      trajCtx.stroke();

      // Crosshair ticks
      trajCtx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
      trajCtx.lineWidth = 1;
      trajCtx.beginPath();
      trajCtx.moveTo(obsPx - 8, obsPy);
      trajCtx.lineTo(obsPx + 8, obsPy);
      trajCtx.moveTo(obsPx, obsPy - 8);
      trajCtx.lineTo(obsPx, obsPy + 8);
      trajCtx.stroke();
    }
  }

  // Draw Live Drone Position Marker (Cyan Glowing Marker)
  const dronePx = scaleX(d.pos.x);
  const dronePy = h - 14;

  trajCtx.fillStyle = '#00f0ff';
  trajCtx.beginPath();
  trajCtx.arc(dronePx, dronePy, 4.5, 0, Math.PI * 2);
  trajCtx.fill();

  // Bank angle vector arrow
  const bankLen = 9;
  const bankDx = Math.cos(d.euler.z) * bankLen;
  const bankDy = Math.sin(d.euler.z) * bankLen;
  trajCtx.strokeStyle = '#00f0ff';
  trajCtx.lineWidth = 2;
  trajCtx.beginPath();
  trajCtx.moveTo(dronePx - bankDx, dronePy + bankDy);
  trajCtx.lineTo(dronePx + bankDx, dronePy - bankDy);
  trajCtx.stroke();

  // Dynamic Phase Badge update
  const badge = document.getElementById('graph-phase-badge');
  if (badge) {
    const xDist = d.pos.x;
    const sign = xDist > 0 ? '+' : '';
    if (ev.phase === 'saccade') {
      badge.innerText = `SACCADE ${sign}${xDist.toFixed(2)}m`;
      badge.style.color = '#00f0ff';
    } else if (ev.phase === 'recovery') {
      badge.innerText = `RECOVERING ${sign}${xDist.toFixed(2)}m`;
      badge.style.color = '#eab308';
    } else {
      badge.innerText = `BALANCED ${sign}${xDist.toFixed(2)}m`;
      badge.style.color = '#00ff88';
    }
  }
}

// UI Telemetry Update
function updateUI() {
  const d = state.drone;
  const b = state.brain;

  // Meters
  const loomPct = (b.looming_metric / 4.0) * 100;
  document.getElementById('meter-looming-val').innerText = loomPct.toFixed(1) + "%";
  document.getElementById('meter-looming-fill').style.width = Math.min(loomPct, 100) + "%";

  const gfPct = Math.min(100, (b.trace_gf_l + b.trace_gf_r) * 25);
  document.getElementById('meter-gf-val').innerText = gfPct.toFixed(1) + "%";
  document.getElementById('meter-gf-fill').style.width = gfPct + "%";

  const bankPct = Math.min(100, Math.abs(b.trace_dna02_l - b.trace_dna02_r) * 35);
  document.getElementById('meter-dna02-val').innerText = bankPct.toFixed(1) + "%";
  document.getElementById('meter-dna02-fill').style.width = bankPct + "%";

  // Diagnostics
  document.getElementById('diag-roll').innerText = (d.euler.z * 180 / Math.PI).toFixed(1) + "°";
  document.getElementById('diag-thrust').innerText = d.thrust.toFixed(2) + " N";

  // Dynamic Evasion Diagnostics Indicator
  const diagStatus = document.getElementById('diag-status');
  if (diagStatus) {
    if (state.obstacle.active) {
      if (state.evasion.phase === 'saccade') {
        const bankDeg = (state.evasion.targetRoll * 180 / Math.PI).toFixed(0);
        diagStatus.innerText = `SACCADE BANK ${bankDeg > 0 ? '+' : ''}${bankDeg}°`;
        diagStatus.className = "diag-value status-evading";
      } else if (state.evasion.phase === 'recovery') {
        diagStatus.innerText = "HALTERE RECOVERY";
        diagStatus.className = "diag-value status-recovery";
      } else {
        diagStatus.innerText = "TRACKING THREAT";
        diagStatus.className = "diag-value status-evading";
      }
    } else if (state.evasion.phase === 'recovery') {
      diagStatus.innerText = "STABILIZING";
      diagStatus.className = "diag-value status-recovery";
    }
  }

  // FPV HUD Readouts
  document.getElementById('hud-spd').innerText = Math.abs(d.vel.z).toFixed(1);
  document.getElementById('hud-alt').innerText = d.pos.y.toFixed(2);
  document.getElementById('hud-roll').innerText = (d.omega.z * 180 / Math.PI).toFixed(1);
  document.getElementById('hud-pitch').innerText = (d.omega.x * 180 / Math.PI).toFixed(1);

  if (state.obstacle.active) {
    const dist = d.pos.distanceTo(state.obstacle.pos);
    document.getElementById('hud-dist').innerText = dist.toFixed(1);
    document.getElementById('hud-gf').innerText = (state.evasion.phase === 'saccade') ? "EVADING!" : "LOCKED";
  } else {
    document.getElementById('hud-dist').innerText = "--";
    document.getElementById('hud-gf').innerText = "IDLE";
  }

  // Horizon Bar Tilt
  const horizon = document.getElementById('horizon-bar');
  if (horizon) {
    horizon.style.transform = `rotate(${d.euler.z}rad) translateY(${d.euler.x * 60}px)`;
  }
}

// ============================================================================
// INTERACTIVE EVENT LISTENERS & SPAWNERS
// ============================================================================
function launchThreat(speedKmh, offsetM) {
  const d = state.drone;
  const obs = state.obstacle;

  const speedMps = speedKmh / 3.6;
  // Always spawn 26 meters in front of the drone's current position!
  obs.pos.set(d.pos.x + offsetM, 1.5, d.pos.z + 26.0);
  obs.vel.set(0, 0, -speedMps);
  obs.active = true;
  obs.mesh.visible = true;
  obs.mesh.position.copy(obs.pos);

  state.brain.min_clearance = 999.0;
  state.brain.reaction_detected = false;
  state.brain.trial_start_time = performance.now();

  // Reset evasion state machine cleanly
  state.evasion.active = false;
  state.evasion.phase = 'idle';
  state.evasion.direction = 0;
  state.evasion.targetRoll = 0.0;
  state.evasion.targetAltitude = 1.50;
  state.evasion.targetPitch = 0.0;
  state.evasion.originX = d.pos.x;
  state.evasion.originY = d.pos.y;

  // Clear previous trajectory points so new evasion path is crystal clear
  if (state.trail) state.trail.points = [];

  document.getElementById('result-banner').classList.add('hidden');
  document.getElementById('diag-status').innerText = "TRACKING THREAT";
  document.getElementById('diag-status').className = "diag-value status-evading";
}

function resetArena() {
  state.drone.pos.set(0, 1.5, 0);
  state.drone.vel.set(0, 0, 0);
  state.drone.euler.set(0, 0, 0);
  state.drone.omega.set(0, 0, 0);
  state.drone.thrust = 4.41;

  state.obstacle.active = false;
  state.obstacle.mesh.visible = false;
  state.brain.min_clearance = 999.0;
  state.brain.reaction_detected = false;

  state.evasion.active = false;
  state.evasion.phase = 'idle';
  state.evasion.direction = 0;
  state.evasion.targetRoll = 0.0;
  state.evasion.targetAltitude = 1.50;
  state.evasion.targetPitch = 0.0;
  state.evasion.originX = 0.0;
  state.evasion.originY = 1.50;

  if (state.trail) state.trail.points = [];

  document.getElementById('result-banner').classList.add('hidden');
  document.getElementById('diag-status').innerText = "CLEAR";
  document.getElementById('diag-status').className = "diag-value status-clear";
  document.getElementById('diag-clearance').innerText = "-- m";
}

// Camera Mode Switchers (5 Perspectives)
document.getElementById('cam-tpv-btn').onclick = () => switchCamera('tpv');
document.getElementById('cam-fpv-btn').onclick = () => switchCamera('fpv');
document.getElementById('cam-top-btn').onclick = () => switchCamera('top');
document.getElementById('cam-side-btn').onclick = () => switchCamera('side');
document.getElementById('cam-orbit-btn').onclick = () => switchCamera('orbit');

function switchCamera(mode) {
  state.cameraMode = mode;
  document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`cam-${mode}-btn`);
  if (btn) btn.classList.add('active');

  const fpvHud = document.getElementById('fpv-hud');
  if (mode === 'fpv') {
    fpvHud.classList.remove('hidden');
  } else {
    fpvHud.classList.add('hidden');
  }
}

// Threat Geometry Mode Switchers
const pointGeomBtn = document.getElementById('threat-geom-point');
if (pointGeomBtn) pointGeomBtn.onclick = () => setThreatGeometry('point');
const tallGeomBtn = document.getElementById('threat-geom-tall');
if (tallGeomBtn) tallGeomBtn.onclick = () => setThreatGeometry('tall');
const wideGeomBtn = document.getElementById('threat-geom-wide');
if (wideGeomBtn) wideGeomBtn.onclick = () => setThreatGeometry('wide');

// Environment Switcher (Lush Green Nature vs Cyber Hangar)
const envToggleBtn = document.getElementById('env-toggle-btn');
if (envToggleBtn) {
  envToggleBtn.onclick = () => {
    const nextEnv = state.environmentMode === 'nature' ? 'hangar' : 'nature';
    switchEnvironment(nextEnv);
  };
}

// Flight Mode Switcher (Hover vs Cruise)
const flightModeBtn = document.getElementById('flight-mode-btn');
const flightModeText = document.getElementById('flight-mode-text');
if (flightModeBtn) {
  flightModeBtn.onclick = () => {
    state.flightMode = state.flightMode === 'hover' ? 'cruise' : 'hover';
    flightModeText.innerText = state.flightMode === 'hover' ? '🛸 Hover Mode' : '🚀 Cruise 4 m/s';
    if (state.flightMode === 'hover') {
      state.drone.vel.z = 0;
    }
  };
}

// Toggle Side HUD Panels for Full View
const togglePanelsBtn = document.getElementById('toggle-panels-btn');
if (togglePanelsBtn) {
  togglePanelsBtn.onclick = () => {
    state.hudCollapsed = !state.hudCollapsed;
    document.body.classList.toggle('panels-collapsed', state.hudCollapsed);
  };
}

// Controller Selector
document.getElementById('ctrl-neuromorphic-btn').onclick = () => {
  state.controllerMode = 'neuromorphic';
  document.getElementById('ctrl-neuromorphic-btn').classList.add('active');
  document.getElementById('ctrl-baseline-btn').classList.remove('active');
  document.getElementById('model-badge').innerText = "FlyWire Connectome";
  document.getElementById('controller-desc').innerText = "Continuous biological LIF spiking integrated into 3D angular rates with Haltere damping.";
};

document.getElementById('ctrl-baseline-btn').onclick = () => {
  state.controllerMode = 'baseline';
  document.getElementById('ctrl-baseline-btn').classList.add('active');
  document.getElementById('ctrl-neuromorphic-btn').classList.remove('active');
  document.getElementById('model-badge').innerText = "Flawed Baseline (Old)";
  document.getElementById('controller-desc').innerText = "Discrete step commands with arbitrary pitch=thrust*0.5 coupling (Expect crashes!).";
};

// Threat Spawner Buttons
document.getElementById('spawn-headon-btn').onclick = () => launchThreat(state.threatSpeedKmh, 0.0);
document.getElementById('spawn-fast-btn').onclick = () => launchThreat(38.0, 0.0);
document.getElementById('spawn-angled-btn').onclick = () => launchThreat(state.threatSpeedKmh, 1.2);
document.getElementById('spawn-double-btn').onclick = () => {
  launchThreat(state.threatSpeedKmh, -0.6);
  setTimeout(() => { if (state.drone.pos.y > 0.5) launchThreat(state.threatSpeedKmh, 0.6); }, 1100);
};

document.getElementById('reset-sim-btn').onclick = resetArena;

// Sliders
document.getElementById('threat-speed-slider').oninput = (e) => {
  state.threatSpeedKmh = parseFloat(e.target.value);
  document.getElementById('slider-spd-val').innerText = state.threatSpeedKmh.toFixed(1) + " km/h";
};

document.getElementById('threat-offset-slider').oninput = (e) => {
  state.threatOffsetM = parseFloat(e.target.value);
  document.getElementById('slider-angle-val').innerText = state.threatOffsetM.toFixed(1) + " m";
};

document.getElementById('crosswind-slider').oninput = (e) => {
  state.crosswindKmh = parseFloat(e.target.value);
  document.getElementById('slider-wind-val').innerText = state.crosswindKmh.toFixed(1) + " km/h";
};

// Audio Toggle
document.getElementById('audio-toggle-btn').onclick = () => {
  state.audioEnabled = !state.audioEnabled;
  if (state.audioEnabled && !audioCtx) initAudio();
  document.getElementById('audio-icon').innerText = state.audioEnabled ? "🔊 Audio ON" : "🔇 Audio OFF";
};

// Keyboard Shortcuts & Manual Flight Control (5 Camera Hotkeys)
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === '1') switchCamera('tpv');
  if (e.key === '2') switchCamera('fpv');
  if (e.key === '3') switchCamera('top');
  if (e.key === '4') switchCamera('side');
  if (e.key === '5') switchCamera('orbit');
  if (e.code === 'Space') launchThreat(state.threatSpeedKmh, state.threatOffsetM);
  if (k === 'r') resetArena();
  if (k === 't') {
    const nextEnv = state.environmentMode === 'nature' ? 'hangar' : 'nature';
    switchEnvironment(nextEnv);
  }
  if (k === 'h' && togglePanelsBtn) togglePanelsBtn.click();
  if (k === 'f' && flightModeBtn) flightModeBtn.click();
  if (k === 'm') {
    if (state.controllerMode === 'neuromorphic') {
      document.getElementById('ctrl-baseline-btn').click();
    } else {
      document.getElementById('ctrl-neuromorphic-btn').click();
    }
  }

  // Manual Flight WASD / Arrows
  if (k === 'w' || e.key === 'ArrowUp') state.keys.forward = true;
  if (k === 's' || e.key === 'ArrowDown') state.keys.backward = true;
  if (k === 'a' || e.key === 'ArrowLeft') state.keys.left = true;
  if (k === 'd' || e.key === 'ArrowRight') state.keys.right = true;
  if (e.key === 'Shift') state.keys.up = true;
  if (e.key === 'Control') state.keys.down = true;
  if (k === 'q') state.keys.yawLeft = true;
  if (k === 'e') state.keys.yawRight = true;
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') state.keys.forward = false;
  if (k === 's' || e.key === 'ArrowDown') state.keys.backward = false;
  if (k === 'a' || e.key === 'ArrowLeft') state.keys.left = false;
  if (k === 'd' || e.key === 'ArrowRight') state.keys.right = false;
  if (e.key === 'Shift') state.keys.up = false;
  if (e.key === 'Control') state.keys.down = false;
  if (k === 'q') state.keys.yawLeft = false;
  if (k === 'e') state.keys.yawRight = false;
});

// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// MAIN ANIMATION LOOP
// ============================================================================
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  // Run Connectome Brain & Physics
  updateConnectomeBrain(dt);
  updatePhysics(dt);

  // Update Nature Environment (Windsock, drifting clouds, gentle tree sway)
  if (state.environmentMode === 'nature') {
    const windSpeed = state.crosswindKmh / 3.6;
    const windAngle = (state.crosswindKmh >= 0) ? -Math.PI / 2 : Math.PI / 2;
    swivelRing.rotation.y = windAngle;
    sockMesh.rotation.z = Math.min(0.85, Math.abs(windSpeed) * 0.12);

    cloudList.forEach(c => {
      c.position.z -= (0.05 + Math.abs(state.crosswindKmh) * 0.003);
      if (c.position.z < -60) c.position.z = 260;
    });

    const sway = Math.sin(now * 0.002) * (0.008 + Math.abs(state.crosswindKmh) * 0.001);
    for (let i = 0; i < treeList.length; i++) {
      treeList[i].rotation.z = Math.sin(now * 0.002 + i) * sway;
    }
  }

  // Update Cameras & Controls
  updateCameras();
  if (state.cameraMode === 'orbit') controls.update();

  // Render 3D Scene
  renderer.render(scene, camera);

  // Render HUD, Oscilloscope, & Real-Time S-Curve Trajectory Graph
  updateUI();
  drawSpikeRaster();
  drawTrajectoryGraph();
  if (state.cameraMode === 'fpv') drawCompoundEye();
}

// Initialize default threat geometry
setThreatGeometry('point');

// Start Simulator
animate();
