import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server
const SERVER_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `http://${window.location.hostname}:3000`;
const socket = io(SERVER_URL);

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 90vw; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">tti</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; gap: 10px; padding: 10px; font-size: 1.3em;">
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>💬</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px; overflow: hidden;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000; line-height: 1.4;">...</textarea>
        </div>
      </fieldset>
      
      <div id="progressContainer" style="flex: 0.5; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px;">
        <img id="hourglassImg" src="/hourglass.gif" style="width: 64px; height: 64px;" alt="Idle" />
        <progress id="progressBar" max="100" value="0" style="display: none; width: 200px;"></progress>
      </div>
      
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>🖌️</legend>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; padding: 10px;">
          <img id="generatedImage" style="max-width: 100%; max-height: 100%; object-fit: contain; display: none;" />
          <p id="noImageText" style="color: #000; text-align: center;">...</p>
        </div>
        <div style="padding: 5px 10px; font-size: 0.7em; color: #666;" id="timestamp"></div>
      </fieldset>
    </div>
  </div>
`

const descriptionText = document.querySelector('#descriptionText');
const generatedImage = document.querySelector('#generatedImage');
const noImageText = document.querySelector('#noImageText');
const timestamp = document.querySelector('#timestamp');
const progressBar = document.querySelector('#progressBar');
const hourglassImg = document.querySelector('#hourglassImg');

let progressInterval = null;
let pendingGeneration = null;
let progressStartTime = null;

// Load current state from server
async function loadCurrentState() {
  try {
    const response = await fetch(`${SERVER_URL}/api/current-state`);
    const data = await response.json();
    
    if (data.success && data.state) {
      updateDescription(data.state.latestDescription);
      updateGeneration(data.state.latestGeneration);
    }
  } catch (error) {
    console.error('Error loading current state:', error);
  }
}

// Update description display and start progress bar
function updateDescription(description) {
  if (description) {
    descriptionText.value = description.description;
    
    // Flash effect
    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => {
      descriptionText.style.backgroundColor = '#fff';
    }, 300);
    
    // Start 5-second progress bar
    startProgressBar();
  }
}

// Update generated image display (waits for progress to complete)
function updateGeneration(generation) {
  if (generation) {
    // If progress bar is still running, store it and wait
    if (progressInterval) {
      pendingGeneration = generation;
    } else {
      // Progress already complete, update immediately
      applyGeneration(generation);
    }
  }
}

// Actually apply the generated image to the UI
function applyGeneration(generation) {
  generatedImage.src = `${SERVER_URL}/captures/${generation.filename}`;
  generatedImage.style.display = 'block';
  noImageText.style.display = 'none';
  timestamp.textContent = `${new Date(generation.generated_at).toLocaleString()}`;
  
  // Flash effect
  generatedImage.style.opacity = '0.3';
  setTimeout(() => {
    generatedImage.style.opacity = '1';
  }, 200);
  
  pendingGeneration = null;
}

// Start 5-second progress bar
function startProgressBar() {
  // Clear any existing progress
  if (progressInterval) {
    clearInterval(progressInterval);
  }
  
  // Show progress bar, hide hourglass
  progressBar.style.display = 'block';
  hourglassImg.style.display = 'none';
  progressBar.value = 0;
  progressStartTime = Date.now();
  
  const duration = 5000; // 5 seconds
  const updateInterval = 50; // Update every 50ms
  
  progressInterval = setInterval(() => {
    const elapsed = Date.now() - progressStartTime;
    const percent = Math.min((elapsed / duration) * 100, 100);
    progressBar.value = percent;
    
    if (percent >= 100) {
      clearInterval(progressInterval);
      progressInterval = null;
      
      // If generation arrived while we were waiting, apply it now
      if (pendingGeneration) {
        applyGeneration(pendingGeneration);
      }
      
      // Show hourglass again (idle state)
      progressBar.style.display = 'none';
      hourglassImg.style.display = 'block';
    }
  }, updateInterval);
}

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  loadCurrentState();
});

socket.on('state-updated', (data) => {
  console.log('📡 State updated:', data.type);
  
  if (data.type === 'description') {
    updateDescription(data.latestDescription);
  } else if (data.type === 'generation') {
    updateGeneration(data.latestGeneration);
  }
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  generatedImage.style.display = 'none';
  noImageText.style.display = 'block';
  descriptionText.value = '...';
  timestamp.textContent = '';
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

console.log('🚀 TTI page initialized (display-only mode)');
