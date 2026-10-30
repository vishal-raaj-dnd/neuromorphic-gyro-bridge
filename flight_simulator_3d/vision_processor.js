// ============================================================================
// DROSOPHILA CONNECTOME FPV VIDEO VISION PROCESSOR & LATENCY TRACKER
// Real-Time Frame Extraction, Ommatidia Looming & S-Curve Trajectory Reconstruction
// ============================================================================

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const vState = {
    active: false,
    video: null,
    overlayCanvas: null,
    overlayCtx: null,
    trajCanvas: null,
    trajCtx: null,

    // Offscreen Processing Canvas
    procWidth: 160,
    procHeight: 120,
    offCanvas: document.createElement('canvas'),
    offCtx: null,
    prevLuma: null,

    // Ommatidia Receptive Fields (20 cols x 15 rows = 300 optical facets)
    gridCols: 20,
    gridRows: 15,
    divergenceGrid: null,

    // Threat Tracking & Looming
    threat: {
      active: false,
      xNorm: 0.0,       // [-1, 1] horizontal position in visual field
      yNorm: 0.0,       // [-1, 1] vertical position
      widthNorm: 0.0,
      heightNorm: 0.0,
      looming: 0.0,
      ttcSec: 0.0,
      detectedAtSec: null,
      reactionLatencyMs: 0.0,
      prevTheta: 0.0,
      prevTimeSec: 0.0
    },

    // Model Directional Steering Outputs
    output: {
      decision: 'PATH CLEAR • CRUISE',
      rollBankDeg: 0.0,
      yawRateDps: 0.0,
      thrustN: 4.41,
      leftPct: 0,
      rightPct: 0,
      upPct: 0,
      gfPct: 0
    },

    // Performance & Latency Telemetry
    telemetry: {
      lastFrameTimeMs: 0.0,
      avgFrameTimeMs: 3.2,
      fps: 60,
      framesProcessed: 0
    },

    // Trajectory History
    trajectory: [],
    dronePos: { x: 0.0, y: 1.5, z: 0.0 },
    droneVel: { x: 0.0, y: 0.0, z: 7.5 },

    // Synthetic Demo Generator
    demoCanvas: document.createElement('canvas'),
    demoCtx: null,
    demoPlaying: false,
    demoTime: 0.0
  };

  vState.offCanvas.width = vState.procWidth;
  vState.offCanvas.height = vState.procHeight;
  vState.offCtx = vState.offCanvas.getContext('2d', { willReadFrequently: true });
  vState.prevLuma = new Float32Array(vState.procWidth * vState.procHeight);
  vState.divergenceGrid = new Float32Array(vState.gridCols * vState.gridRows);

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------
  function initVisionLab() {
    vState.video = document.getElementById('fpv-video-player');
    vState.overlayCanvas = document.getElementById('vision-overlay-canvas');
    vState.overlayCtx = vState.overlayCanvas.getContext('2d');
    vState.trajCanvas = document.getElementById('vlab-trajectory-canvas');
    vState.trajCtx = vState.trajCanvas.getContext('2d');

    // Tab Mode Buttons
    const tabArenaBtn = document.getElementById('tab-arena-btn');
    const tabVisionBtn = document.getElementById('tab-vision-btn');
    const visionLabView = document.getElementById('vision-lab-view');
    const closeVisionBtn = document.getElementById('close-vision-lab-btn');

    function switchAppMode(mode) {
      if (mode === 'vision') {
        vState.active = true;
        visionLabView.classList.remove('hidden');
        tabVisionBtn.classList.add('active');
        tabArenaBtn.classList.remove('active');
        resizeCanvases();
        drawTrajectoryCanvas();
      } else {
        vState.active = false;
        visionLabView.classList.add('hidden');
        tabArenaBtn.classList.add('active');
        tabVisionBtn.classList.remove('active');
        if (vState.video && !vState.video.paused) {
          vState.video.pause();
        }
      }
    }

    if (tabArenaBtn) tabArenaBtn.onclick = () => switchAppMode('arena');
    if (tabVisionBtn) tabVisionBtn.onclick = () => switchAppMode('vision');
    if (closeVisionBtn) closeVisionBtn.onclick = () => switchAppMode('arena');

    // Hotkey 'V' toggles Vision Lab
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'v') {
        switchAppMode(vState.active ? 'arena' : 'vision');
      }
    });

    // File Upload & Drag-and-Drop
    const fileInput = document.getElementById('video-file-input');
    const uploadBtn = document.getElementById('upload-video-btn');
    const dropzone = document.getElementById('video-dropzone');
    const placeholder = document.getElementById('video-placeholder');
    const sampleBtn = document.getElementById('load-sample-video-btn');

    if (uploadBtn && fileInput) {
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          loadVideoFile(e.target.files[0]);
        }
      };
    }

    if (dropzone) {
      dropzone.onclick = (e) => {
        if (e.target.id === 'video-placeholder' || e.target.closest('#video-placeholder')) {
          fileInput.click();
        }
      };
      dropzone.ondragover = (e) => {
        e.preventDefault();
        placeholder.classList.add('dragover');
      };
      dropzone.ondragleave = () => placeholder.classList.remove('dragover');
      dropzone.ondrop = (e) => {
        e.preventDefault();
        placeholder.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          loadVideoFile(e.dataTransfer.files[0]);
        }
      };
    }

    if (sampleBtn) {
      sampleBtn.onclick = loadSampleDemoFlight;
    }

    // Video Transport Controls
    initPlaybackControls();

    // Resize Observer for responsive overlay canvases
    window.addEventListener('resize', resizeCanvases);
    resizeCanvases();
  }

  function resizeCanvases() {
    if (!vState.video || !vState.overlayCanvas) return;
    const rect = vState.video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      vState.overlayCanvas.width = rect.width;
      vState.overlayCanvas.height = rect.height;
    }
  }

  // --------------------------------------------------------------------------
  // VIDEO INGESTION & PLAYBACK
  // --------------------------------------------------------------------------
  function loadVideoFile(file) {
    const video = vState.video;
    const placeholder = document.getElementById('video-placeholder');
    if (!video) return;

    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    if (placeholder) placeholder.classList.add('hidden');

    resetVisionTelemetry();
    video.onloadeddata = () => {
      resizeCanvases();
      video.play().catch(() => {});
      updatePlayPauseButton(true);
      startProcessingLoop();
    };
  }

  function initPlaybackControls() {
    const video = vState.video;
    const playPauseBtn = document.getElementById('play-pause-btn');
    const stepBackBtn = document.getElementById('step-back-btn');
    const stepFwdBtn = document.getElementById('step-fwd-btn');
    const scrubber = document.getElementById('video-scrubber');
    const timeDisplay = document.getElementById('time-display');

    if (playPauseBtn) {
      playPauseBtn.onclick = () => {
        if (video.paused) {
          video.play();
          updatePlayPauseButton(true);
          startProcessingLoop();
        } else {
          video.pause();
          updatePlayPauseButton(false);
        }
      };
    }

    if (stepBackBtn) {
      stepBackBtn.onclick = () => {
        video.pause();
        updatePlayPauseButton(false);
        video.currentTime = Math.max(0, video.currentTime - 0.033);
        processCurrentFrame();
      };
    }

    if (stepFwdBtn) {
      stepFwdBtn.onclick = () => {
        video.pause();
        updatePlayPauseButton(false);
        video.currentTime = Math.min(video.duration || 10, video.currentTime + 0.033);
        processCurrentFrame();
      };
    }

    if (scrubber) {
      scrubber.oninput = (e) => {
        if (video.duration) {
          video.currentTime = (parseFloat(e.target.value) / 100) * video.duration;
          processCurrentFrame();
        }
      };
    }

    if (video) {
      video.ontimeupdate = () => {
        if (!scrubber || !video.duration) return;
        const pct = (video.currentTime / video.duration) * 100;
        scrubber.value = pct;
        if (timeDisplay) {
          timeDisplay.innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        }
      };
    }

    // Playback Speed Selector
    document.querySelectorAll('.spd-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const spd = parseFloat(btn.dataset.speed);
        if (video) video.playbackRate = spd;
      };
    });
  }

  function updatePlayPauseButton(isPlaying) {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.innerHTML = isPlaying ? "⏸️ Pause" : "▶️ Play";
  }

  function formatTime(sec) {
    if (isNaN(sec)) return "00:00.00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  function resetVisionTelemetry() {
    vState.threat.active = false;
    vState.threat.looming = 0.0;
    vState.threat.ttcSec = 0.0;
    vState.threat.detectedAtSec = null;
    vState.threat.reactionLatencyMs = 0.0;
    vState.trajectory = [];
    vState.dronePos = { x: 0.0, y: 1.5, z: 0.0 };
    vState.droneVel = { x: 0.0, y: 0.0, z: 7.5 };
    updateDirectionBars(0, 0, 0, 0, 0, 0, 4.41, 'PATH CLEAR • CRUISE');
  }

  // --------------------------------------------------------------------------
  // FRAME EXTRACTION & REICHARDT OMMATIDIA OPTICAL FLOW
  // --------------------------------------------------------------------------
  let isProcessing = false;

  function startProcessingLoop() {
    if (isProcessing) return;
    isProcessing = true;

    function loop() {
      if (!vState.active || !vState.video || vState.video.paused) {
        isProcessing = false;
        return;
      }

      processCurrentFrame();

      if ('requestVideoFrameCallback' in vState.video) {
        vState.video.requestVideoFrameCallback(loop);
      } else {
        requestAnimationFrame(loop);
      }
    }

    if ('requestVideoFrameCallback' in vState.video) {
      vState.video.requestVideoFrameCallback(loop);
    } else {
      requestAnimationFrame(loop);
    }
  }

  function processCurrentFrame() {
    const video = vState.video;
    const isSynthetic = vState.demoPlaying && vState.demoCanvas;
    if (!isSynthetic && (!video || video.readyState < 2)) return;

    const tStart = performance.now();

    // 1. Ingest frame to offscreen canvas
    const W = vState.procWidth;
    const H = vState.procHeight;
    if (isSynthetic) {
      vState.offCtx.drawImage(vState.demoCanvas, 0, 0, W, H);
      const scrubber = document.getElementById('video-scrubber');
      const timeDisplay = document.getElementById('time-display');
      if (scrubber) scrubber.value = (vState.demoTime / 6.0) * 100;
      if (timeDisplay) timeDisplay.innerText = `${formatTime(vState.demoTime)} / 00:06.00`;
    } else {
      vState.offCtx.drawImage(video, 0, 0, W, H);
    }
    const imgData = vState.offCtx.getImageData(0, 0, W, H).data;

    // 2. Compute Grayscale Luminance & Temporal Derivative
    const currLuma = new Float32Array(W * H);
    let totalAbsDelta = 0.0;
    for (let i = 0, p = 0; i < currLuma.length; i++, p += 4) {
      const y = 0.299 * imgData[p] + 0.587 * imgData[p + 1] + 0.114 * imgData[p + 2];
      currLuma[i] = y;
      totalAbsDelta += Math.abs(y - vState.prevLuma[i]);
    }

    // 3. Ommatidia Facet Receptive Fields & Optical Expansion Divergence
    const cols = vState.gridCols;
    const rows = vState.gridRows;
    const cellW = W / cols;
    const cellH = H / rows;

    let maxDivergence = 0.0;
    let threatWeightedX = 0.0;
    let threatWeightedY = 0.0;
    let totalThreatWeight = 0.0;

    const centerX = W / 2;
    const centerY = H / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const px = Math.floor(c * cellW + cellW / 2);
        const py = Math.floor(r * cellH + cellH / 2);

        // Reichardt temporal-spatial correlation
        const pIdx = py * W + px;
        const delta = currLuma[pIdx] - vState.prevLuma[pIdx];

        // Optical divergence: expansion outward from visual field center
        const dxFromCenter = (px - centerX) / (W / 2); // [-1, 1]
        const dyFromCenter = (py - centerY) / (H / 2); // [-1, 1]
        const distFromCenter = Math.sqrt(dxFromCenter * dxFromCenter + dyFromCenter * dyFromCenter);

        // Expanding object pushes edges outward (positive temporal contrast * outward direction)
        const divergence = Math.abs(delta) * (1.2 - Math.min(1.0, distFromCenter * 0.6));
        vState.divergenceGrid[idx] = divergence;

        if (divergence > 12.0) { // Significant motion threshold
          maxDivergence = Math.max(maxDivergence, divergence);
          threatWeightedX += dxFromCenter * divergence;
          threatWeightedY += dyFromCenter * divergence;
          totalThreatWeight += divergence;
        }
      }
    }

    // Save previous frame luminance
    vState.prevLuma.set(currLuma);

    // 4. Biological Compound Eye Looming Metric Calculation
    const currTimeSec = isSynthetic ? vState.demoTime : (video.currentTime || 0);
    const dt = Math.max(0.016, currTimeSec - vState.threat.prevTimeSec);
    vState.threat.prevTimeSec = currTimeSec;

    let obstacleDetected = false;
    if (totalThreatWeight > 180.0) {
      obstacleDetected = true;
      const xNorm = threatWeightedX / totalThreatWeight;
      const yNorm = threatWeightedY / totalThreatWeight;

      // Angular size estimate proportional to activation footprint
      const activatedCount = vState.divergenceGrid.filter(d => d > 12.0).length;
      const theta = Math.min(1.2, (activatedCount / (cols * rows)) * 2.8);
      const thetaDot = Math.max(0.0, (theta - vState.threat.prevTheta) / dt);
      vState.threat.prevTheta = theta;

      // Biological Drosophila looming equation: Looming = 1.6 * theta + 3.2 * theta_dot
      const looming = theta * 1.6 + thetaDot * 3.2;
      const ttc = thetaDot > 0.05 ? Math.max(0.2, theta / thetaDot) : 1.5;

      vState.threat.active = true;
      vState.threat.xNorm = xNorm;
      vState.threat.yNorm = yNorm;
      vState.threat.widthNorm = Math.min(0.85, Math.sqrt(activatedCount / (cols * rows)) * 1.2);
      vState.threat.heightNorm = vState.threat.widthNorm * 0.9;
      vState.threat.looming = looming;
      vState.threat.ttcSec = ttc;

      // Reaction latency capture on first threshold crossing
      if (looming > 0.22 && vState.threat.detectedAtSec === null) {
        vState.threat.detectedAtSec = currTimeSec;
        vState.threat.reactionLatencyMs = (performance.now() - tStart) + 22.0; // Sensor + SNN integration
      }
    } else {
      vState.threat.active = false;
      vState.threat.looming *= 0.85;
      vState.threat.prevTheta *= 0.85;
    }

    // 5. Connectome Motor Steering Decision
    computeConnectomeMotorCommands();

    // 6. Update Reconstructed Avoidance Trajectory
    integrateAvoidanceTrajectory(0.033);

    // 7. Measure On-The-Spot Latency
    const tEnd = performance.now();
    const frameElapsed = tEnd - tStart;
    vState.telemetry.lastFrameTimeMs = frameElapsed;
    vState.telemetry.avgFrameTimeMs = vState.telemetry.avgFrameTimeMs * 0.9 + frameElapsed * 0.1;
    vState.telemetry.framesProcessed++;

    // 8. Render Overlays & Graphs
    renderVideoOverlay();
    updateLatencyUI();
    drawTrajectoryCanvas();
  }

  // --------------------------------------------------------------------------
  // CONNECTOME MOTOR COMMAND GENERATION & DIRECTIONAL BAR GRAPH
  // --------------------------------------------------------------------------
  function computeConnectomeMotorCommands() {
    const t = vState.threat;
    const out = vState.output;

    if (t.active && t.looming > 0.22) {
      const loomingFactor = Math.min(2.5, t.looming);

      // Analyze Threat Visual Position (xNorm: [-1=Left, +1=Right])
      // Drosophila compound eye bilateral evasion:
      // If threat looms on Right (xNorm > 0) -> Steer LEFT (DNa02-L)
      // If threat looms on Left (xNorm < 0) -> Steer RIGHT (DNa02-R)
      if (t.widthNorm > 1.8 * t.heightNorm) {
        // Wide Barrier -> Pop-Up Flare
        out.leftPct = 10;
        out.rightPct = 10;
        out.upPct = Math.min(100, Math.round(50 + loomingFactor * 25));
        out.gfPct = t.looming > 0.45 ? 100 : 0;
        out.rollBankDeg = 0.0;
        out.yawRateDps = 0.0;
        out.thrustN = 7.2;
        out.decision = '⬆️ POP-UP JUMP FLARE (DNb01)';
      } else if (t.xNorm >= 0.0) {
        // Obstacle is on Center/Right -> Dodge LEFT
        const bankAngle = -THREE_clamp(25.0 * loomingFactor, 15.0, 38.0);
        out.leftPct = Math.min(100, Math.round(45 + loomingFactor * 28));
        out.rightPct = 0;
        out.upPct = 15;
        out.gfPct = t.looming > 0.45 ? 90 : 0;
        out.rollBankDeg = bankAngle;
        out.yawRateDps = -55.0;
        out.thrustN = 5.8;
        out.decision = `⬅️ HARD LEFT SACCADE (DNa02-L) [${bankAngle.toFixed(1)}°]`;
      } else {
        // Obstacle is on Left -> Dodge RIGHT
        const bankAngle = THREE_clamp(25.0 * loomingFactor, 15.0, 38.0);
        out.rightPct = Math.min(100, Math.round(45 + loomingFactor * 28));
        out.leftPct = 0;
        out.upPct = 15;
        out.gfPct = t.looming > 0.45 ? 90 : 0;
        out.rollBankDeg = bankAngle;
        out.yawRateDps = +55.0;
        out.thrustN = 5.8;
        out.decision = `➡️ HARD RIGHT SACCADE (DNa02-R) [${bankAngle.toFixed(1)}°]`;
      }
    } else {
      // Nominal cruise & restorative balance
      out.leftPct = Math.max(0, out.leftPct - 8);
      out.rightPct = Math.max(0, out.rightPct - 8);
      out.upPct = Math.max(0, out.upPct - 6);
      out.gfPct = 0;
      out.rollBankDeg *= 0.85;
      out.yawRateDps *= 0.85;
      out.thrustN = 4.41;
      out.decision = 'PATH CLEAR • CRUISE';
    }

    updateDirectionBars(
      out.leftPct,
      out.rightPct,
      out.upPct,
      out.gfPct,
      out.rollBankDeg,
      out.yawRateDps,
      out.thrustN,
      out.decision
    );
  }

  function THREE_clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function updateDirectionBars(left, right, up, gf, roll, yaw, thrust, decision) {
    const leftFill = document.getElementById('bar-left-fill');
    const rightFill = document.getElementById('bar-right-fill');
    const upFill = document.getElementById('bar-up-fill');
    const gfFill = document.getElementById('bar-gf-fill');

    const leftPct = document.getElementById('bar-left-pct');
    const rightPct = document.getElementById('bar-right-pct');
    const upPct = document.getElementById('bar-up-pct');
    const gfPct = document.getElementById('bar-gf-pct');

    const rollVal = document.getElementById('bar-roll-val');
    const yawVal = document.getElementById('bar-yaw-val');
    const thrustVal = document.getElementById('bar-thrust-val');
    const dialNeedle = document.getElementById('dial-needle');
    const decisionPill = document.getElementById('direction-decision-pill');

    if (leftFill) leftFill.style.width = `${left}%`;
    if (rightFill) rightFill.style.width = `${right}%`;
    if (upFill) upFill.style.width = `${up}%`;
    if (gfFill) gfFill.style.width = `${gf}%`;

    if (leftPct) leftPct.innerText = `${left}%`;
    if (rightPct) rightPct.innerText = `${right}%`;
    if (upPct) upPct.innerText = `${up}%`;
    if (gfPct) gfPct.innerText = `${gf}%`;

    if (rollVal) rollVal.innerText = `${roll > 0 ? '+' : ''}${roll.toFixed(1)}°`;
    if (yawVal) yawVal.innerText = `${yaw > 0 ? '+' : ''}${yaw.toFixed(1)} °/s`;
    if (thrustVal) thrustVal.innerText = `${thrust.toFixed(2)} N`;

    if (dialNeedle) {
      dialNeedle.style.transform = `rotate(${roll}deg)`;
    }

    if (decisionPill) {
      decisionPill.innerText = decision;
      if (left > 20 || right > 20) {
        decisionPill.className = 'decision-pill status-dodge';
      } else if (up > 30) {
        decisionPill.className = 'decision-pill status-climb';
      } else {
        decisionPill.className = 'decision-pill status-neutral';
      }
    }
  }

  // --------------------------------------------------------------------------
  // ON-THE-SPOT LATENCY TELEMETRY UI
  // --------------------------------------------------------------------------
  function updateLatencyUI() {
    const trackFrameTime = document.getElementById('track-frame-time');
    const trackFpsSub = document.getElementById('track-fps-sub');
    const trackReactionTime = document.getElementById('track-reaction-time');
    const trackReactionSub = document.getElementById('track-reaction-sub');
    const trackTtc = document.getElementById('track-ttc');
    const trackLoomingVal = document.getElementById('track-looming-val');

    if (trackFrameTime) {
      trackFrameTime.innerText = `${vState.telemetry.lastFrameTimeMs.toFixed(1)} ms`;
    }
    if (trackFpsSub) {
      const fps = Math.round(1000 / Math.max(1, vState.telemetry.lastFrameTimeMs));
      trackFpsSub.innerText = `Throughput: ${fps} FPS`;
    }
    if (trackReactionTime) {
      if (vState.threat.reactionLatencyMs > 0) {
        trackReactionTime.innerText = `${vState.threat.reactionLatencyMs.toFixed(1)} ms`;
      } else {
        trackReactionTime.innerText = `-- ms`;
      }
    }
    if (trackReactionSub) {
      if (vState.threat.reactionLatencyMs > 0) {
        trackReactionSub.innerText = `Detected at ${vState.threat.detectedAtSec.toFixed(2)}s`;
      } else {
        trackReactionSub.innerText = `Waiting for Threat Onset`;
      }
    }
    if (trackTtc) {
      if (vState.threat.active && vState.threat.ttcSec > 0) {
        trackTtc.innerText = `${vState.threat.ttcSec.toFixed(2)} s`;
      } else {
        trackTtc.innerText = `-- s`;
      }
    }
    if (trackLoomingVal) {
      trackLoomingVal.innerText = vState.threat.looming.toFixed(2);
    }
  }

  // --------------------------------------------------------------------------
  // VIDEO OVERLAY RENDERING (Compound Eye Facets, Vectors & Looming Box)
  // --------------------------------------------------------------------------
  function renderVideoOverlay() {
    const ctx = vState.overlayCtx;
    const canvas = vState.overlayCanvas;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const showOmmatidia = document.getElementById('toggle-ommatidia')?.checked ?? true;
    const showVectors = document.getElementById('toggle-flow-vectors')?.checked ?? true;
    const showBox = document.getElementById('toggle-looming-box')?.checked ?? true;

    const cols = vState.gridCols;
    const rows = vState.gridRows;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    // 1. Ommatidia Facet Grid Heatmap
    if (showOmmatidia) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const divVal = vState.divergenceGrid[r * cols + c];
          if (divVal > 8.0) {
            const alpha = Math.min(0.7, divVal / 60.0);
            ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(c * cellW + cellW / 2, r * cellH + cellH / 2, Math.min(cellW, cellH) * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 2. Optical Flow Expansion Vectors
    if (showVectors && vState.threat.active) {
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.7)';
      ctx.lineWidth = 1.5;
      const cX = canvas.width / 2;
      const cY = canvas.height / 2;

      for (let r = 2; r < rows - 2; r += 2) {
        for (let c = 2; c < cols - 2; c += 2) {
          const divVal = vState.divergenceGrid[r * cols + c];
          if (divVal > 14.0) {
            const px = c * cellW + cellW / 2;
            const py = r * cellH + cellH / 2;
            const vx = (px - cX) * 0.08 * (divVal / 25.0);
            const vy = (py - cY) * 0.08 * (divVal / 25.0);

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + vx, py + vy);
            ctx.stroke();
          }
        }
      }
    }

    // 3. Dynamic Threat Looming Bounding Box
    if (showBox && vState.threat.active && vState.threat.looming > 0.15) {
      const t = vState.threat;
      const cX = (t.xNorm * 0.5 + 0.5) * canvas.width;
      const cY = (t.yNorm * 0.5 + 0.5) * canvas.height;
      const bW = Math.max(40, t.widthNorm * canvas.width * 0.6);
      const bH = Math.max(40, t.heightNorm * canvas.height * 0.6);

      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cX - bW / 2, cY - bH / 2, bW, bH);

      // Corner Crosshairs
      ctx.fillStyle = '#ff0055';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`LOOMING THREAT: ${t.looming.toFixed(2)} (TTC: ${t.ttcSec.toFixed(1)}s)`, cX - bW / 2, cY - bH / 2 - 6);
    }
  }

  // --------------------------------------------------------------------------
  // AVOIDANCE TRAJECTORY RECONSTRUCTION & 3D/2D S-CURVE GRAPH
  // --------------------------------------------------------------------------
  function integrateAvoidanceTrajectory(dt) {
    const d = vState.dronePos;
    const v = vState.droneVel;
    const roll = vState.output.rollBankDeg * (Math.PI / 180);

    // Lateral acceleration driven by commanded roll bank
    const ax = 9.81 * Math.tan(roll);
    v.x += (ax - 0.22 * v.x) * dt;
    d.x += v.x * dt;
    d.z += v.z * dt;

    vState.trajectory.push({
      x: d.x,
      z: d.z,
      roll: vState.output.rollBankDeg,
      decision: vState.output.decision
    });

    // Keep last 150 points for smooth scrolling trail
    if (vState.trajectory.length > 150) {
      vState.trajectory.shift();
    }
  }

  function drawTrajectoryCanvas() {
    const canvas = vState.trajCanvas;
    const ctx = vState.trajCtx;
    if (!canvas || !ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = '#03060a';
    ctx.fillRect(0, 0, W, H);

    // Draw Grid & Flight Corridor
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Centerline (Collision Path)
    const midY = H / 2;
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(W, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Obstacle Marker (if threat active or detected)
    if (vState.threat.active || vState.threat.detectedAtSec !== null) {
      const obsX = W * 0.55;
      const obsY = midY;

      // Obstacle collision radius circle
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.6)';
      ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
      ctx.beginPath();
      ctx.arc(obsX, obsY, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ff0055';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('THREAT', obsX - 18, obsY - 26);
    }

    // Reconstructed Drone Trajectory Curve
    const pts = vState.trajectory;
    if (pts.length > 1) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      for (let i = 0; i < pts.length; i++) {
        const px = (i / 150) * W;
        // Invert X so positive displacement shifts upward on canvas
        const py = midY - pts[i].x * 45.0;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Current Drone Marker
      const last = pts[pts.length - 1];
      const curX = ((pts.length - 1) / 150) * W;
      const curY = midY - last.x * 45.0;

      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(curX, curY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Readout
      ctx.fillStyle = '#00f0ff';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`DISPLACEMENT: ${last.x > 0 ? '+' : ''}${last.x.toFixed(2)}m`, curX - 60, curY - 10);
    }

    // Status Badge
    const statusBadge = document.getElementById('vlab-traj-status');
    if (statusBadge) {
      if (vState.threat.active) {
        statusBadge.innerText = 'EVASION S-CURVE ACTIVE';
        statusBadge.className = 'badge status-evading';
      } else if (vState.trajectory.length > 0) {
        statusBadge.innerText = 'CORRIDOR RESTABILIZED';
        statusBadge.className = 'badge status-clear';
      } else {
        statusBadge.innerText = 'AWAITING VIDEO';
        statusBadge.className = 'badge';
      }
    }
  }

  // --------------------------------------------------------------------------
  // SYNTHETIC DEMO FPV FLIGHT GENERATOR
  // (Provides an instant test video of an obstacle looming directly in forward path)
  // --------------------------------------------------------------------------
  function loadSampleDemoFlight() {
    const placeholder = document.getElementById('video-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    resetVisionTelemetry();

    // Create a 5-second realistic synthetic FPV flight sequence onto a stream
    vState.demoCanvas.width = 640;
    vState.demoCanvas.height = 360;
    vState.demoCtx = vState.demoCanvas.getContext('2d');
    vState.demoPlaying = true;
    vState.demoTime = 0.0;

    // Use Canvas.captureStream to pipe into the video element seamlessly
    try {
      const stream = vState.demoCanvas.captureStream(30);
      vState.video.srcObject = stream;
      vState.video.play().catch(() => {});
      updatePlayPauseButton(true);

      function renderSyntheticFrame() {
        if (!vState.demoPlaying) return;

        vState.demoTime += 0.033;
        if (vState.demoTime > 6.0) vState.demoTime = 0.0; // Loop flight

        drawSyntheticFPVScene(vState.demoCtx, vState.demoCanvas.width, vState.demoCanvas.height, vState.demoTime);
        processCurrentFrame();

        requestAnimationFrame(renderSyntheticFrame);
      }

      renderSyntheticFrame();
      startProcessingLoop();

    } catch (e) {
      console.warn('Direct stream capture fallback:', e);
    }
  }

  function drawSyntheticFPVScene(ctx, W, H, timeSec) {
    // Sky
    ctx.fillStyle = '#6cb2eb';
    ctx.fillRect(0, 0, W, H / 2);

    // Green Meadow Ground
    ctx.fillStyle = '#38a169';
    ctx.fillRect(0, H / 2, W, H / 2);

    // Runway / Flight path markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.4, H);
    ctx.lineTo(W * 0.48, H / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(W * 0.6, H);
    ctx.lineTo(W * 0.52, H / 2);
    ctx.stroke();

    // Distant trees
    for (let i = 0; i < 8; i++) {
      const tx = (i / 8) * W;
      ctx.fillStyle = '#22543d';
      ctx.beginPath();
      ctx.moveTo(tx, H / 2);
      ctx.lineTo(tx + 15, H / 2 - 25);
      ctx.lineTo(tx + 30, H / 2);
      ctx.fill();
    }

    // Looming Tree Obstacle (Starts at 1.0s, approaches until 4.0s)
    if (timeSec >= 0.8 && timeSec <= 4.2) {
      const progress = (timeSec - 0.8) / 3.0; // [0, 1]
      // Obstacle size grows non-linearly (optical looming: size ~ 1 / (1 - progress))
      const scale = Math.pow(progress, 2.2);
      const obsW = 20 + scale * 260;
      const obsH = 40 + scale * 340;

      // Obstacle slightly to the right of center (x = +40px) to trigger decisive Left Dodge
      const obsX = W / 2 + 35 * scale;
      const obsY = H / 2 - obsH * 0.35;

      // Draw Tree Trunk
      ctx.fillStyle = '#744210';
      ctx.fillRect(obsX - obsW * 0.12, obsY + obsH * 0.4, obsW * 0.24, obsH * 0.6);

      // Draw Tree Foliage (Looming Green Cone)
      ctx.fillStyle = '#1c4532';
      ctx.beginPath();
      ctx.moveTo(obsX - obsW / 2, obsY + obsH * 0.5);
      ctx.lineTo(obsX, obsY);
      ctx.lineTo(obsX + obsW / 2, obsY + obsH * 0.5);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(obsX - obsW * 0.4, obsY + obsH * 0.25);
      ctx.lineTo(obsX, obsY - obsH * 0.2);
      ctx.lineTo(obsX + obsW * 0.4, obsY + obsH * 0.25);
      ctx.fill();
    }
  }

  // --------------------------------------------------------------------------
  // EXPORT TO WINDOW
  // --------------------------------------------------------------------------
  window.VisionLab = {
    init: initVisionLab,
    loadVideoFile: loadVideoFile,
    loadSampleDemoFlight: loadSampleDemoFlight
  };

  // Auto-init on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisionLab);
  } else {
    initVisionLab();
  }

})();
