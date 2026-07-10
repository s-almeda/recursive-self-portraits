import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

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
        <!-- Live/captured view -->
        <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch; min-height: 0;">
          <legend>👁️</legend>
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; padding: 10px;">
            <video id="webcam" autoplay playsinline style="max-width: 100%; max-height: 100%; object-fit: contain;"></video>
            <img id="capturedImage" style="max-width: 100%; max-height: 100%; object-fit: contain; display: none;" />
          </div>
        </fieldset>

        <!-- Progress -->
        <div id="progressContainer" style="flex: 0.5; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; min-width: 200px; max-width: 200px;">
          <img id="hourglassImg" src="/hourglass.gif" style="width: 64px; height: 64px;" alt="Idle" />
          <progress id="progressBar" max="100" value="0" style="display: none; width: 200px;"></progress>
          <div id="progressLabel" style="font-size: 0.7em; color: #000; text-align: center;"></div>
        </div>

        <!-- Description -->
        <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch; min-height: 0;">
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

const PROMPT_TEXT = 'press spacebar to let the system take a picture.';

let stream = null;
let started = false;      // webcam running, in LIVE mode
let busy = false;         // a capture→describe→generate cycle is in flight
let progressInterval = null;
let capturedURL = null;

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

// ---- State transitions ----
function enterLiveMode() {
  busy = false;
  video.style.display = 'block';
  capturedImage.style.display = 'none';
  overlayText.textContent = PROMPT_TEXT;
  descriptionText.value = '...';
  showIdle();
}

async function takeCapture() {
  if (!started || busy) return;
  busy = true;

  const blob = await captureFrameToBlob();

  // Freeze the view to the captured still
  if (capturedURL) URL.revokeObjectURL(capturedURL);
  capturedURL = URL.createObjectURL(blob);
  capturedImage.src = capturedURL;
  capturedImage.style.display = 'block';
  video.style.display = 'none';
  overlayText.textContent = 'CAPTURE TAKEN';
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

// ---- Progress states: loading bar (describing) → hourglass (painting) → idle ----
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

// Hourglass animation, shown while the image is being painted (Monitor 2).
function showHourglass(label) {
  clearProgressTimer();
  progressLabel.textContent = label || '';
  progressBar.style.display = 'none';
  hourglassImg.style.display = 'block';
}

// Idle: nothing at all (no bar, no hourglass) while waiting for spacebar.
function showIdle() {
  clearProgressTimer();
  progressLabel.textContent = '';
  progressBar.style.display = 'none';
  hourglassImg.style.display = 'none';
}

// ---- Input ----
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault(); // don't scroll the page
    takeCapture();
  }
});

startBtn.addEventListener('click', startWebcam);

// ---- Socket events (booth namespace) ----
socket.on('connect', () => {
  console.log('✅ Connected to booth server');
});

socket.on('state-updated', (data) => {
  if (!busy) return; // ignore events not tied to our in-flight capture
  console.log('📡 [booth] State updated:', data.type);

  if (data.type === 'description' && data.latestDescription) {
    // Description is in → immediately switch the bar to the hourglass (painting).
    descriptionText.value = data.latestDescription.description;
    overlayText.textContent = 'CAPTURE TAKEN';
    showHourglass('...creating image...');
    // flash
    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => { descriptionText.style.backgroundColor = '#fff'; }, 300);
  } else if (data.type === 'generation') {
    // Generated image is ready (shown on Monitor 2). Hold, then reset to live.
    showIdle();
    overlayText.textContent = 'done — thank you!';
    setTimeout(enterLiveMode, 5000);
  }
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from booth server');
});

// ---- Init ----
getCameras();
// Ask for permission up front so the camera dropdown shows real labels
navigator.mediaDevices.getUserMedia({ video: true })
  .then((s) => {
    s.getTracks().forEach((t) => t.stop());
    getCameras();
  })
  .catch(() => console.log('Camera permission needed for labels'));

console.log('🚀 Booth page initialized');
