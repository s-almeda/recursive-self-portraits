import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

let stream = null;
let isCapturing = false;
let canvas = null;
let ctx = null;

// Connect to WebSocket server - use current host so it works locally and remotely
const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.prompt();
const socket = io(SERVER_URL);

socket.on('connect', () => {
  console.log('Connected to server');
});

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: 800px; margin: 2rem auto; overflow: auto;">
    <div class="title-bar">
      <div class="title-bar-text">Webcam Feed - Recording Station</div>
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
        <legend>Capture Mode</legend>
        <div style="margin-bottom: 10px; padding: 0 10px;">
          <p style="margin: 5px 0; font-size: 0.9em;">Enable capture mode. The ITT page will request frames on-demand.</p>
        </div>
        <div class="field-row" style="gap: 8px;">
          <button id="startRecordingBtn" disabled>Enable Capture</button>
          <button id="stopRecordingBtn" disabled>Disable Capture</button>
          <span id="recordingIndicator" style="display: none; color: green; font-weight: bold; margin-left: 10px;">✓ READY</span>
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
        <p class="status-bar-field" id="frameCountText">Frames captured: 0</p>
      </div>
    </div>
  </div>
`

const video = document.querySelector('#webcam');
const cameraSelect = document.querySelector('#cameraSelect');
const startBtn = document.querySelector('#startBtn');
const stopBtn = document.querySelector('#stopBtn');
const startRecordingBtn = document.querySelector('#startRecordingBtn');
const stopRecordingBtn = document.querySelector('#stopRecordingBtn');
const recordingIndicator = document.querySelector('#recordingIndicator');
const statusText = document.querySelector('#statusText');
const frameCountText = document.querySelector('#frameCountText');
const clearDbBtn = document.querySelector('#clearDbBtn');

canvas = document.querySelector('#canvas');
ctx = canvas.getContext('2d');

let frameCount = 0;

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
    cameraSelect.disabled = false;
    startRecordingBtn.disabled = false;
    
    statusText.textContent = 'Webcam active';
  } catch (error) {
    console.error('Error accessing webcam:', error);
    alert('Error accessing webcam: ' + error.message);
    statusText.textContent = 'Error: ' + error.message;
  }
}

// Stop webcam
function stopWebcam() {
  if (stream) {
    // Stop capturing if active
    if (isCapturing) {
      stopCapturing();
    }
    
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    stream = null;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    cameraSelect.disabled = false;
    startRecordingBtn.disabled = true;
    
    statusText.textContent = 'Webcam stopped';
  }
}

// Capture frame from video
async function captureFrame() {
  if (!stream || !video.videoWidth) {
    console.error('Video not ready');
    return;
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

// Upload frame to server
async function uploadFrame() {
  try {
    const blob = await captureFrame();
    const formData = new FormData();
    formData.append('image', blob, `capture_${Date.now()}.jpg`);
    formData.append('cameraId', cameraSelect.value);
    formData.append('frameRate', 0); // Not using frame rate anymore
    
    const response = await fetch(`${SERVER_URL}/api/camera-images`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      frameCount++;
      frameCountText.textContent = `Frames captured: ${frameCount}`;
      statusText.textContent = `Captured at ${new Date().toLocaleTimeString()}`;
      console.log('📸 Frame uploaded:', data.image);
    } else {
      console.error('Upload failed:', data.error);
      statusText.textContent = 'Error uploading frame';
    }
  } catch (error) {
    console.error('Error uploading frame:', error);
    statusText.textContent = 'Error: ' + error.message;
  }
}

// Start capture mode (ready to receive requests)
function startCapturing() {
  if (!stream) {
    alert('Please start the webcam first');
    return;
  }
  
  isCapturing = true;
  
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = false;
  recordingIndicator.style.display = 'inline';
  stopBtn.disabled = true; // Prevent stopping webcam while in capture mode
  
  statusText.textContent = 'Capture mode enabled - waiting for ITT requests';
  console.log('✅ Capture mode enabled');
}

// Stop capture mode
function stopCapturing() {
  isCapturing = false;
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
  recordingIndicator.style.display = 'none';
  stopBtn.disabled = false;
  statusText.textContent = 'Capture mode disabled';
  console.log('🛑 Capture mode disabled');
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
      frameCount = 0;
      frameCountText.textContent = 'Frames captured: 0';
      statusText.textContent = 'Database cleared successfully';
      alert('All images and database records have been deleted.');
    } else {
      console.error('Clear failed:', data.error);
      statusText.textContent = 'Error clearing database';
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    statusText.textContent = 'Error: ' + error.message;
    alert('Error clearing database: ' + error.message);
  }
}

// Event listeners
startBtn.addEventListener('click', startWebcam);
stopBtn.addEventListener('click', stopWebcam);
startRecordingBtn.addEventListener('click', startCapturing);
stopRecordingBtn.addEventListener('click', stopCapturing);
clearDbBtn.addEventListener('click', clearDatabase);

// WebSocket listeners
socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('request-capture', async () => {
  console.log('📸 Capture requested by ITT page');
  if (isCapturing && stream) {
    statusText.textContent = 'Capturing frame...';
    await uploadFrame();
    statusText.textContent = 'Capture mode enabled - waiting for ITT requests';
  } else {
    console.warn('⚠️ Capture request ignored - not in capture mode');
  }
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
