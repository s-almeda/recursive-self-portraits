import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// CONFIGURATION - Easy to edit
const CAPTURE_DELAY_MS = 3000; // Time between captures (after description is shown)

// Connect to WebSocket server
const socket = io('http://localhost:3000');

let currentImageId = null;
let isWaitingForCapture = false;

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 90vw ; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">ITT - Live Camera Feed View</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: 500px; display: flex; gap: 10px; padding: 10px; font-size: 1.3em; align-items: center;">
      <fieldset style="flex: 1; max-height: 70%; display: flex; flex-direction: column;">
        <legend>Latest Capture</legend>
        <div id="imageContainer" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden;">
          <p id="noImageText" style="color: #000; text-align: center; padding: 20px;">No images captured yet.<br>Start recording on the main page.</p>
          <img id="latestImage" style="display: none; max-width: 100%; max-height: 100%; height: auto; width: auto; object-fit: contain;" />
        </div>
      </fieldset>
      
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center;">
        <div style="width: 100%;">
          <p id="aiStatus" style="font-size: 1.3em; font-weight: bold; margin-bottom: 20px;">Waiting for images...</p>
          <progress id="progressBar" style="width: 80%; display: none;"></progress>
        </div>
      </div>
      
      <fieldset style="flex: 1; max-height: 70%; display: flex; flex-direction: column;">
        <legend>Image Description</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000;">No description yet.</textarea>
        </div>
      </fieldset>
    </div>
  </div>
`

const latestImage = document.querySelector('#latestImage');
const noImageText = document.querySelector('#noImageText');
const aiStatus = document.querySelector('#aiStatus');
const progressBar = document.querySelector('#progressBar');
const descriptionText = document.querySelector('#descriptionText');

// Request a new capture from the main page
function requestCapture() {
  console.log('📡 Requesting new capture...');
  socket.emit('request-capture');
  isWaitingForCapture = true;
  aiStatus.textContent = 'Requesting capture...';
}

// Main loop - request capture, wait for description, display, repeat
async function processLoop() {
  try {
    // Step 1: Request a new capture
    requestCapture();
    
    // Step 2: Wait for the new frame to arrive
    await waitForNewFrame();
    
    // Step 3: Wait for description
    await waitForDescription();
    
    // Step 4: Wait before next capture
    console.log(`⏱️ Waiting ${CAPTURE_DELAY_MS}ms before next capture`);
    await sleep(CAPTURE_DELAY_MS);
    
  } catch (error) {
    console.error('❌ Error in process loop:', error);
    aiStatus.textContent = `Error: ${error.message}`;
    await sleep(2000);
  }
  
  // Loop again
  setTimeout(processLoop, 100);
}

// Wait for a new frame to be captured
function waitForNewFrame() {
  return new Promise((resolve) => {
    const handler = (data) => {
      if (isWaitingForCapture) {
        console.log('📸 New frame received:', data.id);
        isWaitingForCapture = false;
        currentImageId = data.id;
        
        // Display the image
        latestImage.src = `http://localhost:3000/captures/${data.filename}`;
        latestImage.style.display = 'block';
        noImageText.style.display = 'none';
        
        // Show progress
        progressBar.style.display = 'block';
        progressBar.removeAttribute('value');
        aiStatus.textContent = 'Waiting for AI...';
        descriptionText.value = 'AI is analyzing...';
        
        // Flash effect
        latestImage.style.opacity = '0.3';
        setTimeout(() => {
          latestImage.style.opacity = '1';
        }, 200);
        
        socket.off('new-frame', handler);
        resolve();
      }
    };
    
    socket.on('new-frame', handler);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      socket.off('new-frame', handler);
      resolve();
    }, 10000);
  });
}

// Wait for description to complete
function waitForDescription() {
  return new Promise((resolve) => {
    const handler = (data) => {
      if (data.imageId === currentImageId) {
        console.log('✅ Description received');
        
        progressBar.style.display = 'none';
        aiStatus.textContent = 'Described ✓';
        descriptionText.value = data.description;
        
        // Flash effect
        descriptionText.style.backgroundColor = '#ffffcc';
        setTimeout(() => {
          descriptionText.style.backgroundColor = '#fff';
        }, 500);
        
        socket.off('description-complete', handler);
        resolve();
      }
    };
    
    socket.on('description-complete', handler);
    
    // Timeout after 2 minutes
    setTimeout(() => {
      socket.off('description-complete', handler);
      resolve();
    }, 120000);
  });
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  aiStatus.textContent = 'Connected - starting capture loop...';
  // Start the process loop
  setTimeout(processLoop, 1000);
});

socket.on('description-status', (data) => {
  if (data.imageId === currentImageId) {
    console.log('📊 Status update:', data.status);
    if (data.status === 'processing' || data.status === 'seeing') {
      aiStatus.textContent = 'AI is analyzing...';
    } else if (data.status === 'describing') {
      aiStatus.textContent = 'Generating description...';
    }
  }
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  latestImage.style.display = 'none';
  noImageText.style.display = 'block';
  aiStatus.textContent = 'Database cleared';
  descriptionText.value = 'No description yet.';
  progressBar.style.display = 'none';
  currentImageId = null;
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  aiStatus.textContent = 'Disconnected from server';
});

console.log('🚀 ITT page initialized (on-demand capture mode)');
console.log(`⚙️ Capture delay: ${CAPTURE_DELAY_MS}ms`);
