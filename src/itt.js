import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server
const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
const socket = io(SERVER_URL);

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 90vw; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">ITT - Image to Text (View Only)</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; gap: 10px; padding: 10px; font-size: 1.3em;">
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>Latest Camera Capture</legend>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; padding: 10px;">
          <img id="latestImage" style="max-width: 100%; max-height: 100%; object-fit: contain; display: none;" />
          <p id="noImageText" style="color: #000; text-align: center;">Waiting for captures from control center...</p>
        </div>
      </fieldset>
      
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>AI Description</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px; overflow: hidden;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000; line-height: 1.4;">No description yet.</textarea>
        </div>
        <div style="padding: 5px 10px; font-size: 0.7em; color: #666;" id="timestamp"></div>
      </fieldset>
    </div>
  </div>
`

const latestImage = document.querySelector('#latestImage');
const noImageText = document.querySelector('#noImageText');
const descriptionText = document.querySelector('#descriptionText');
const timestamp = document.querySelector('#timestamp');

// Load current state from server
async function loadCurrentState() {
  try {
    const response = await fetch(`${SERVER_URL}/api/current-state`);
    const data = await response.json();
    
    if (data.success && data.state) {
      updateCapture(data.state.latestCapture);
      updateDescription(data.state.latestDescription);
    }
  } catch (error) {
    console.error('Error loading current state:', error);
  }
}

// Update capture display
function updateCapture(capture) {
  if (capture) {
    latestImage.src = `${SERVER_URL}/captures/${capture.filename}`;
    latestImage.style.display = 'block';
    noImageText.style.display = 'none';
    
    // Flash effect
    latestImage.style.opacity = '0.3';
    setTimeout(() => {
      latestImage.style.opacity = '1';
    }, 200);
  }
}

// Update description display
function updateDescription(description) {
  if (description) {
    descriptionText.value = description.description;
    timestamp.textContent = `Generated: ${new Date(description.generated_at).toLocaleString()}`;
    
    // Flash effect
    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => {
      descriptionText.style.backgroundColor = '#fff';
    }, 300);
  }
}

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  loadCurrentState();
});

socket.on('state-updated', (data) => {
  console.log('📡 State updated:', data.type);
  
  if (data.type === 'capture') {
    updateCapture(data.latestCapture);
  } else if (data.type === 'description') {
    updateDescription(data.latestDescription);
  }
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  latestImage.style.display = 'none';
  noImageText.style.display = 'block';
  descriptionText.value = 'No description yet.';
  timestamp.textContent = '';
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

console.log('🚀 ITT page initialized (display-only mode)');
