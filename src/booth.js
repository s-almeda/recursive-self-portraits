import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';
import * as faceapi from 'face-api.js';

// Connect to the isolated booth namespace on the WebSocket server
const SERVER_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;
const socket = io(`${SERVER_URL}/booth`);

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 90vw; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">👁️</div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; flex-direction: column; padding: 10px; font-size: 1.3em; box-sizing: border-box;">

      <!-- Setup bar (operator picks the camera, then it hides) -->
      <div id="setupBar" class="field-row" style="gap: 8px; margin-bottom: 10px; align-items: center; justify-content: center;">
        <label for="cameraSelect">Camera:</label>
        <select id="cameraSelect"><option value="">Choose a camera...</option></select>
        <button id="startBtn">Start</button>
      </div>

      <!-- Instruction / status text: plain pixelated MS Sans, black, centered above the fieldset -->
      <div id="overlayText" style="text-align: center; color: #000; font-family: 'Pixelated MS Sans Serif', Arial, sans-serif; padding: 4px 0 10px; min-height: 1.4em;"></div>

      <div style="flex: 1; display: flex; gap: 10px; min-height: 0;">
        <!-- Live/captured view (≈50% of the row) -->
        <fieldset style="flex: 2; display: flex; flex-direction: column; align-self: stretch; min-height: 0; min-width: 0;">
          <legend>👁️</legend>
          <div style="flex: 1; display: flex; align-items: stretch; justify-content: center; background: #fff; overflow: hidden; padding: 10px;">
            <div id="viewWrap" style="position: relative; flex: 1; min-height: 0;">
              <video id="webcam" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; display: block; transform: scaleX(-1);"></video>
              <img id="capturedImage" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: none; transform: scaleX(-1);" />
              <canvas id="overlay" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"></canvas>
            </div>
          </div>
        </fieldset>

        <!-- Progress (≈25% of the row) -->
        <div id="progressContainer" style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px;">
          <img id="hourglassImg" src="/hourglass.gif" style="width: 64px; height: 64px;" alt="Idle" />
          <progress id="progressBar" max="100" value="0" style="display: none; width: 200px;"></progress>
          <div id="progressLabel" style="font-size: 0.7em; color: #000; text-align: center;"></div>
        </div>

        <!-- Description (≈25% of the row) -->
        <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch; min-height: 0; min-width: 0;">
          <legend>💬</legend>
          <div style="flex: 1; display: flex; flex-direction: column; padding: 10px; overflow: hidden;">
            <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000; line-height: 1.4;">...</textarea>
          </div>
        </fieldset>
      </div>
    </div>
  </div>

  <canvas id="canvas" style="display: none;"></canvas>
`

const video = document.querySelector('#webcam');
const capturedImage = document.querySelector('#capturedImage');
const overlay = document.querySelector('#overlay');
const octx = overlay.getContext('2d');
const overlayText = document.querySelector('#overlayText');
const descriptionText = document.querySelector('#descriptionText');
const progressBar = document.querySelector('#progressBar');
const progressLabel = document.querySelector('#progressLabel');
const hourglassImg = document.querySelector('#hourglassImg');
const setupBar = document.querySelector('#setupBar');
const cameraSelect = document.querySelector('#cameraSelect');
const startBtn = document.querySelector('#startBtn');
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');

// Face-detection tuning
const HAPPY_THRESHOLD = 0.7;   // min "happy" probability to count as a smile
const HAPPY_FRAMES = 2;        // consecutive smiling frames required to trigger
const DETECT_INTERVAL_MS = 200;

let stream = null;
let started = false;      // webcam running, in LIVE mode
let busy = false;         // a capture→describe→generate cycle is in flight
let modelsLoaded = false;
let detecting = false;    // detection loop running
let happyStreak = 0;
let armed = true;         // must see a non-smiling / no-face frame before firing again
let progressInterval = null;
let capturedURL = null;

// ---- Load face-api models (tiny detector + expressions) ----
async function loadModels() {
  try {
    // Ensure a tfjs backend is actually initialized before any inference,
    // otherwise detectSingleFace can hang forever waiting on tf.ready().
    try {
      await faceapi.tf.setBackend('webgl');
    } catch (e) {
      console.warn('webgl backend unavailable, falling back to cpu', e);
      await faceapi.tf.setBackend('cpu');
    }
    await faceapi.tf.ready();
    console.log('🧠 tfjs backend:', faceapi.tf.getBackend());

    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceExpressionNet.loadFromUri('/models');
    modelsLoaded = true;
    console.log('✅ face-api models loaded');
  } catch (error) {
    console.error('Error loading face-api models:', error);
    overlayText.textContent = 'could not load face detection';
  }
}

// ---- Camera setup (reused pattern from main.js) ----
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    cameraSelect.innerHTML = '<option value="">Choose a camera...</option>';
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error getting cameras:', error);
  }
}

async function startWebcam() {
  const deviceId = cameraSelect.value;
  if (!deviceId) {
    alert('Please select a camera first');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    video.srcObject = stream;
    started = true;
    setupBar.style.display = 'none';   // operator done — hide setup, go live
    enterLiveMode();
    startDetection();
  } catch (error) {
    console.error('Error accessing webcam:', error);
    alert('Error accessing webcam: ' + error.message);
  }
}

// ---- Capture (reused pattern from main.js) ----
function captureFrameToBlob() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error('Failed to create blob'));
    }, 'image/jpeg', 0.95);
  });
}

// ---- White bounding box drawn over the live video ----
function drawBox(box) {
  const cw = overlay.clientWidth, ch = overlay.clientHeight;
  overlay.width = cw;
  overlay.height = ch;
  octx.clearRect(0, 0, cw, ch);

  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !box) return;

  // Map detection coords (video-intrinsic space) into the letterboxed display
  const scale = Math.min(cw / vw, ch / vh);
  const offX = (cw - vw * scale) / 2;
  const offY = (ch - vh * scale) / 2;

  const y = offY + box.y * scale;
  const w = box.width * scale;
  const h = box.height * scale;
  // The video is displayed mirrored (scaleX -1), but the overlay canvas is NOT
  // mirrored (so the label text stays readable). Flip the box's x to match the
  // mirrored video.
  const x = offX + vw * scale - box.x * scale - w;

  // thin white box
  octx.strokeStyle = '#ffffff';
  octx.lineWidth = 1.5;
  octx.strokeRect(x, y, w, h);

  // "face detected" label along the top edge of the box
  octx.font = "14px 'Pixelated MS Sans Serif', monospace";
  octx.textBaseline = 'bottom';
  octx.fillStyle = '#ffffff';
  let labelY = y - 4;
  if (labelY < 16) labelY = y + h + 16; // drop below the box if it's near the top edge
  octx.save();
  octx.shadowColor = 'rgba(0,0,0,0.85)';
  octx.shadowBlur = 3;
  octx.fillText('face detected', x, labelY);
  octx.restore();
}

function clearBox() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
}

// ---- Face + smile detection loop ----
function startDetection() {
  if (detecting) return;
  detecting = true;
  console.log('🔎 detection loop started');
  detectionLoop();
}

async function detectionLoop() {
  if (!started) { detecting = false; return; }

  // Only run inference once the video is actually producing frames
  if (modelsLoaded && !busy && video.readyState >= 2 && video.videoWidth > 0) {
    try {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceExpressions();

      if (!busy) {
        if (!result) {
          happyStreak = 0;
          armed = true; // no face re-arms the trigger
          clearBox();
          overlayText.textContent = 'SHOW ME A FACE';
        } else {
          drawBox(result.detection.box);
          if (result.expressions.happy >= HAPPY_THRESHOLD) {
            // Only fire if armed (prevents one held smile from making many captures)
            if (armed) {
              happyStreak++;
              if (happyStreak >= HAPPY_FRAMES) {
                happyStreak = 0;
                armed = false; // disarm until they relax / leave the frame
                takeCapture();
              }
            }
            overlayText.textContent = 'SMILE TO LET ME CAPTURE YOU';
          } else {
            happyStreak = 0;
            armed = true; // a non-smiling frame re-arms the trigger
            overlayText.textContent = 'SMILE TO LET ME CAPTURE YOU';
          }
        }
      }
    } catch (error) {
      if (!window.__dbgErr) { window.__dbgErr = true; console.error('[booth detect] error:', error); }
    }
  }

  setTimeout(detectionLoop, DETECT_INTERVAL_MS);
}

// ---- State transitions ----
function enterLiveMode() {
  busy = false;
  happyStreak = 0;
  video.style.display = 'block';
  capturedImage.style.display = 'none';
  clearBox();
  overlayText.textContent = 'SHOW ME A FACE';
  descriptionText.value = '...';
  showIdle();
}

async function takeCapture() {
  if (!started || busy) return;
  busy = true;
  // Note: we deliberately DON'T clearBox() here — the last box freezes over the
  // captured still so the person can see where their face was. It lives on the
  // overlay canvas only, so it's never part of the JPEG sent to the pipeline.

  const blob = await captureFrameToBlob();

  // Freeze the view to the captured still
  if (capturedURL) URL.revokeObjectURL(capturedURL);
  capturedURL = URL.createObjectURL(blob);
  capturedImage.src = capturedURL;
  capturedImage.style.display = 'block';
  video.style.display = 'none';
  overlayText.textContent = 'CAPTURE TAKEN. PLEASE WAIT';
  descriptionText.value = '...';
  showLoading('...seeing, describing...');

  // Send to the booth pipeline; UI updates arrive via socket events
  const formData = new FormData();
  formData.append('image', blob, `capture_${Date.now()}.jpg`);
  formData.append('cameraId', cameraSelect.value || 'booth');

  try {
    const response = await fetch(`${SERVER_URL}/api/booth/start-pipeline`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'pipeline failed');
  } catch (error) {
    console.error('Booth pipeline error:', error);
    overlayText.textContent = 'something went wrong — try again';
    setTimeout(enterLiveMode, 3000);
  }
}

// ---- Progress states: loading bar (describing) → hourglass (creating) → idle ----
function clearProgressTimer() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

// Loading bar that eases toward 100% without ever looping or resetting.
// Used while the description is being generated.
function showLoading(label) {
  clearProgressTimer();
  progressLabel.textContent = label;
  hourglassImg.style.display = 'none';
  progressBar.style.display = 'block';
  progressBar.value = 0;

  const tau = 7000; // time constant; approaches but never reaches 100%
  const start = Date.now();
  progressInterval = setInterval(() => {
    const t = Date.now() - start;
    progressBar.value = 100 * (1 - Math.exp(-t / tau));
  }, 50);
}

// Hourglass animation, shown while the portrait is being created (Monitor 2).
function showHourglass(label) {
  clearProgressTimer();
  progressLabel.textContent = label || '';
  progressBar.style.display = 'none';
  hourglassImg.style.display = 'block';
}

// Idle: nothing at all (no bar, no hourglass).
function showIdle() {
  clearProgressTimer();
  progressLabel.textContent = '';
  progressBar.style.display = 'none';
  hourglassImg.style.display = 'none';
}

startBtn.addEventListener('click', startWebcam);

// ---- Socket events (booth namespace) ----
socket.on('connect', () => {
  console.log('✅ Connected to booth server');
});

socket.on('state-updated', (data) => {
  if (!busy) return; // ignore events not tied to our in-flight capture
  console.log('📡 [booth] State updated:', data.type);

  if (data.type === 'description' && data.latestDescription) {
    // Description is in → switch the bar to the hourglass (portrait being created).
    descriptionText.value = data.latestDescription.description;
    overlayText.textContent = 'CAPTURE TAKEN. PLEASE WAIT';
    showHourglass('...creating portrait...');
    // flash
    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => { descriptionText.style.backgroundColor = '#fff'; }, 300);
  } else if (data.type === 'generation') {
    // Portrait is ready (shown on Monitor 2). Hold, then reset to live.
    showIdle();
    overlayText.textContent = 'done.';
    setTimeout(enterLiveMode, 5000);
  }
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from booth server');
});

// ---- Init ----
loadModels();
getCameras();
// Ask for permission up front so the camera dropdown shows real labels
navigator.mediaDevices.getUserMedia({ video: true })
  .then((s) => {
    s.getTracks().forEach((t) => t.stop());
    getCameras();
  })
  .catch(() => console.log('Camera permission needed for labels'));

console.log('🚀 Booth page initialized (face-detection mode) — build v2 smile-detect');
