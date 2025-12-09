import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

let stream = null;
let isRunning = false;
let canvas = null;
let ctx = null;

// Connect to WebSocket server
const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.prompt();
const socket = io(SERVER_URL);

const CYCLE_DELAY_MS = 5000; // 5 seconds between cycles

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: 900px; margin: 2rem auto; overflow: auto;">
    <div class="title-bar">
      <div class="title-bar-text">Recursive Self-Portrait - Control Center</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body">
      <fieldset>
        <legend>Camera Controls</legend>
        <div class="field-row" style="margin-bottom: 10px;">
          <label for="cameraSelect">Select Camera:</label>
          <select id="cameraSelect">
            <option value="">Choose a camera...</option>
          </select>
        </div>
        <div class="field-row" style="gap: 8px; margin-bottom: 10px;">
          <button id="startBtn">Start Webcam</button>
          <button id="stopBtn" disabled>Stop Webcam</button>
        </div>
      </fieldset>
      
      <fieldset style="margin-top: 16px;">
        <legend>Pipeline Control</legend>
        <div style="margin-bottom: 10px; padding: 0 10px;">
          <p style="margin: 5px 0; font-size: 0.9em;">Start the recursive self-portrait loop: Capture → Describe → Generate → Wait 5s → Repeat</p>
        </div>
        <div class="field-row" style="gap: 8px;">
          <button id="startPipelineBtn" disabled>Enable Pipeline</button>
          <button id="stopPipelineBtn" disabled>Disable Pipeline</button>
          <span id="runningIndicator" style="display: none; color: green; font-weight: bold; margin-left: 10px;">● RUNNING</span>
        </div>
      </fieldset>
      
      <fieldset style="margin-top: 16px;">
        <legend>Current Status</legend>
        <div style="padding: 10px; font-family: monospace; background: #000; color: #0f0; min-height: 120px; max-height: 200px; overflow-y: auto;" id="statusLog">
          <div>Ready to start...</div>
        </div>
      </fieldset>
      
      <fieldset style="margin-top: 16px;">
        <legend>Database Management</legend>
        <div class="field-row" style="gap: 8px;">
          <button id="clearDbBtn">Clear Database & Images</button>
        </div>
      </fieldset>
      
      <div style="margin-top: 16px; text-align: center;">
        <video id="webcam" autoplay playsinline style="max-width: 100%; width: 640px; background-color: #000; border: 2px solid #808080;"></video>
        <canvas id="canvas" style="display: none;"></canvas>
      </div>
      <div class="status-bar">
        <p class="status-bar-field" id="statusText">Ready</p>
        <p class="status-bar-field" id="cycleCountText">Cycles: 0</p>
      </div>
    </div>
  </div>
`

const video = document.querySelector('#webcam');
const cameraSelect = document.querySelector('#cameraSelect');
const startBtn = document.querySelector('#startBtn');
const stopBtn = document.querySelector('#stopBtn');
const startPipelineBtn = document.querySelector('#startPipelineBtn');
const stopPipelineBtn = document.querySelector('#stopPipelineBtn');
const runningIndicator = document.querySelector('#runningIndicator');
const statusText = document.querySelector('#statusText');
const cycleCountText = document.querySelector('#cycleCountText');
const clearDbBtn = document.querySelector('#clearDbBtn');
const statusLog = document.querySelector('#statusLog');

canvas = document.querySelector('#canvas');
ctx = canvas.getContext('2d');

let cycleCount = 0;

// Logging helper
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const color = type === 'error' ? '#f00' : type === 'success' ? '#0f0' : '#0ff';
  const div = document.createElement('div');
  div.style.color = color;
  div.textContent = `[${timestamp}] ${message}`;
  statusLog.appendChild(div);
  statusLog.scrollTop = statusLog.scrollHeight;
}

// Get list of available cameras
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    cameraSelect.innerHTML = '<option value="">Choose a camera...</option>';
    
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    
    statusText.textContent = `Found ${videoDevices.length} camera(s)`;
  } catch (error) {
    console.error('Error getting cameras:', error);
    statusText.textContent = 'Error getting cameras';
  }
}

// Start webcam with selected camera
async function startWebcam() {
  const deviceId = cameraSelect.value;
  
  if (!deviceId) {
    alert('Please select a camera first');
    return;
  }
  
  try {
    statusText.textContent = 'Starting webcam...';
    
    const constraints = {
      video: {
        deviceId: { exact: deviceId }
      }
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    cameraSelect.disabled = true;
    startPipelineBtn.disabled = false;
    
    statusText.textContent = 'Webcam active';
    log('Webcam started');
  } catch (error) {
    console.error('Error accessing webcam:', error);
    alert('Error accessing webcam: ' + error.message);
    statusText.textContent = 'Error: ' + error.message;
    log('Error: ' + error.message, 'error');
  }
}

// Stop webcam
function stopWebcam() {
  if (stream) {
    // Stop pipeline if running
    if (isRunning) {
      stopPipeline();
    }
    
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    stream = null;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    cameraSelect.disabled = false;
    startPipelineBtn.disabled = true;
    
    statusText.textContent = 'Webcam stopped';
    log('Webcam stopped');
  }
}

// Capture frame from video
async function captureFrame() {
  if (!stream || !video.videoWidth) {
    throw new Error('Video not ready');
  }
  
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw current video frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/jpeg', 0.95);
  });
}

// Run the full pipeline (capture → describe → generate)
async function runPipelineCycle() {
  try {
    log('🚀 Starting pipeline cycle...');
    statusText.textContent = 'Capturing frame...';
    
    // Capture frame
    const blob = await captureFrame();
    const formData = new FormData();
    formData.append('image', blob, `capture_${Date.now()}.jpg`);
    formData.append('cameraId', cameraSelect.value);
    
    log('📸 Frame captured, sending to server...');
    statusText.textContent = 'Processing pipeline...';
    
    // Send to server for full pipeline processing
    const response = await fetch(`${SERVER_URL}/api/start-pipeline`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      cycleCount++;
      cycleCountText.textContent = `Cycles: ${cycleCount}`;
      log('✅ Pipeline complete! Description and image generated', 'success');
      statusText.textContent = 'Cycle complete';
    } else {
      log('❌ Pipeline failed: ' + data.error, 'error');
      statusText.textContent = 'Error in pipeline';
    }
  } catch (error) {
    console.error('Pipeline error:', error);
    log('❌ Error: ' + error.message, 'error');
    statusText.textContent = 'Error: ' + error.message;
  }
}

// Main pipeline loop
async function pipelineLoop() {
  if (!isRunning) return;
  
  await runPipelineCycle();
  
  if (isRunning) {
    log(`⏳ Waiting ${CYCLE_DELAY_MS / 1000} seconds before next cycle...`);
    statusText.textContent = `Waiting ${CYCLE_DELAY_MS / 1000}s...`;
    setTimeout(pipelineLoop, CYCLE_DELAY_MS);
  }
}

// Start pipeline
function startPipeline() {
  if (!stream) {
    alert('Please start the webcam first');
    return;
  }
  
  isRunning = true;
  
  startPipelineBtn.disabled = true;
  stopPipelineBtn.disabled = false;
  runningIndicator.style.display = 'inline';
  stopBtn.disabled = true; // Prevent stopping webcam while pipeline runs
  
  log('▶️  Pipeline enabled', 'success');
  statusText.textContent = 'Pipeline running';
  
  // Start the loop
  pipelineLoop();
}

// Stop pipeline
function stopPipeline() {
  isRunning = false;
  startPipelineBtn.disabled = false;
  stopPipelineBtn.disabled = true;
  runningIndicator.style.display = 'none';
  stopBtn.disabled = false;
  
  statusText.textContent = 'Pipeline stopped';
  log('⏹️  Pipeline disabled');
}

// Clear database and images
async function clearDatabase() {
  const confirmed = confirm('Are you sure you want to delete ALL images and database records? This cannot be undone!');
  
  if (!confirmed) {
    return;
  }
  
  try {
    statusText.textContent = 'Clearing database...';
    
    const response = await fetch(`${SERVER_URL}/api/clear-all`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.success) {
      cycleCount = 0;
      cycleCountText.textContent = 'Cycles: 0';
      statusText.textContent = 'Database cleared';
      log('🗑️  Database cleared', 'success');
      alert('All images and database records have been deleted.');
    } else {
      console.error('Clear failed:', data.error);
      statusText.textContent = 'Error clearing database';
      log('❌ Clear failed: ' + data.error, 'error');
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    statusText.textContent = 'Error: ' + error.message;
    log('❌ Error: ' + error.message, 'error');
    alert('Error clearing database: ' + error.message);
  }
}

// Event listeners
startBtn.addEventListener('click', startWebcam);
stopBtn.addEventListener('click', stopWebcam);
startPipelineBtn.addEventListener('click', startPipeline);
stopPipelineBtn.addEventListener('click', stopPipeline);
clearDbBtn.addEventListener('click', clearDatabase);

// WebSocket listeners
socket.on('connect', () => {
  console.log('✅ Connected to server');
  log('Connected to server', 'success');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  log('Disconnected from server', 'error');
});

// Initialize camera list on page load
getCameras();

// Request initial permission to get camera labels
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    stream.getTracks().forEach(track => track.stop());
    getCameras();
  })
  .catch(error => {
    console.log('Camera permission needed for labels');
    statusText.textContent = 'Camera permission needed';
  });
