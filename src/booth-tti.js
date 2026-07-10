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
      <div class="title-bar-text">tti</div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; gap: 10px; padding: 10px; font-size: 1.3em;">
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>💬</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px; overflow: hidden;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000; line-height: 1.4;">...</textarea>
        </div>
      </fieldset>

      <div id="progressContainer" style="flex: 0.5; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; min-width: 200px; max-width: 200px;">
        <img id="hourglassImg" src="/hourglass.gif" style="width: 64px; height: 64px; display: none;" alt="Working" />
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

// Load current state from booth server
async function loadCurrentState() {
  try {
    const response = await fetch(`${SERVER_URL}/api/booth/current-state`);
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

    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => {
      descriptionText.style.backgroundColor = '#fff';
    }, 300);

    startProgressBar();
  }
}

// Update generated image display (waits for progress to complete)
function updateGeneration(generation) {
  if (generation) {
    if (progressInterval) {
      pendingGeneration = generation;
    } else {
      applyGeneration(generation);
    }
  }
}

// Actually apply the generated image to the UI
function applyGeneration(generation) {
  generatedImage.src = `${SERVER_URL}/booth-captures/${generation.filename}`;
  generatedImage.style.display = 'block';
  noImageText.style.display = 'none';
  timestamp.textContent = `${new Date(generation.generated_at).toLocaleString()}`;

  generatedImage.style.opacity = '0.3';
  setTimeout(() => {
    generatedImage.style.opacity = '1';
  }, 200);

  pendingGeneration = null;
}

// Start 5-second progress bar
function startProgressBar() {
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  progressBar.style.display = 'block';
  hourglassImg.style.display = 'none';
  progressBar.value = 0;
  progressStartTime = Date.now();

  const duration = 5000;
  const updateInterval = 50;

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - progressStartTime;
    const percent = Math.min((elapsed / duration) * 100, 100);
    progressBar.value = percent;

    if (percent >= 100) {
      clearInterval(progressInterval);
      progressInterval = null;

      if (pendingGeneration) {
        applyGeneration(pendingGeneration);
      }

      progressBar.style.display = 'none';
      hourglassImg.style.display = 'none'; // idle: no hourglass
    }
  }, updateInterval);
}

// Socket event handlers (booth namespace)
socket.on('connect', () => {
  console.log('✅ Connected to booth server');
  loadCurrentState();
});

socket.on('state-updated', (data) => {
  console.log('📡 [booth] State updated:', data.type);

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
  console.log('❌ Disconnected from booth server');
});

console.log('🚀 Booth TTI page initialized (display-only mode)');
