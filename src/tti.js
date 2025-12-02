import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// CONFIGURATION - Easy to edit
const DISPLAY_DELAY_MS = 6000; // Time between generations (after image is shown)

// Connect to WebSocket server
const socket = io('http://localhost:3000');

let currentDescriptionId = null;
let currentCameraImageId = null;
let isWaitingForDescription = false;

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 90vw ; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">TTI - Text to Image Generation</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; gap: 10px; padding: 10px; font-size: 1.3em; align-items: center;">
      <fieldset style="flex: 1; display: flex; flex-direction: column; align-self: stretch;">
        <legend>Latest Description</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px; overflow: hidden;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf; color: #000; line-height: 1.4;">Waiting for descriptions...</textarea>
        </div>
      </fieldset>
      
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center;">
        <div style="width: 100%; max-width: 300px;">
          <p id="aiStatus" style="font-size: 1.3em; font-weight: bold; margin-bottom: 20px;">Waiting for descriptions...</p>
          <progress id="progressBar" value="0" max="100" style="width: 100%; display: none;"></progress>
        </div>
      </div>
      
      <fieldset style="flex: 1; max-height: 60%; display: flex; flex-direction: column;">
        <legend>Generated Image</legend>
        <div id="imageContainer" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden;">
          <p id="noImageText" style="color: #000; text-align: center; padding: 20px;">No images generated yet.<br>Waiting for ITT descriptions.</p>
          <img id="generatedImage" style="display: none; max-width: 100%; max-height: 100%; height: auto; width: auto; object-fit: contain;" />
        </div>
      </fieldset>
    </div>
  </div>
`

const descriptionText = document.querySelector('#descriptionText');
const aiStatus = document.querySelector('#aiStatus');
const progressBar = document.querySelector('#progressBar');
const generatedImage = document.querySelector('#generatedImage');
const noImageText = document.querySelector('#noImageText');

// Main loop - wait for description, generate image, display, repeat
async function processLoop() {
  try {
    // Step 1: Wait for a new description from ITT
    await waitForNewDescription();
    
    // Step 2: Mock image generation
    await generateImage();
    
    // Step 3: Wait before next cycle
    console.log(`⏱️ Waiting ${DISPLAY_DELAY_MS}ms before next generation`);
    await sleep(DISPLAY_DELAY_MS);
    
  } catch (error) {
    console.error('❌ Error in process loop:', error);
    aiStatus.textContent = `Error: ${error.message}`;
    await sleep(2000);
  }
  
  // Loop again
  setTimeout(processLoop, 100);
}

// Wait for a new description from ITT
function waitForNewDescription() {
  return new Promise((resolve) => {
    isWaitingForDescription = true;
    aiStatus.textContent = 'Waiting for new description...';
    
    const handler = (data) => {
      if (isWaitingForDescription) {
        console.log('📝 New description received:', data.descriptionId);
        isWaitingForDescription = false;
        currentDescriptionId = data.descriptionId;
        currentCameraImageId = data.cameraImageId;
        
        // Display the description
        descriptionText.value = data.description;
        
        // Flash effect
        descriptionText.style.backgroundColor = '#ffffcc';
        setTimeout(() => {
          descriptionText.style.backgroundColor = '#fff';
        }, 300);
        
        socket.off('description-ready', handler);
        resolve();
      }
    };
    
    socket.on('description-ready', handler);
    
    // Timeout after 5 minutes
    setTimeout(() => {
      socket.off('description-ready', handler);
      resolve();
    }, 300000);
  });
}

// Mock image generation
async function generateImage() {
  console.log('🎨 Starting image generation (mock)...');
  
  // Show progress
  progressBar.style.display = 'block';
  progressBar.value = 0;
  progressBar.max = 100;
  aiStatus.style.display = 'none';
  
  // Animate progress to 95% over 10 seconds
  animateProgress(95, 10000);
  
  // Simulate generation time
  await sleep(10000);
  
  // Stop oscillation and complete
  stopOscillation();
  progressBar.value = 100;
  
  // For now, just show the original camera image (mock)
  // In the future, this will be the actual generated image
  try {
    const response = await fetch(`http://localhost:3000/api/camera-images/${currentCameraImageId}`);
    const data = await response.json();
    
    if (data.success && data.image) {
      generatedImage.src = `http://localhost:3000/captures/${data.image.filename}`;
      generatedImage.style.display = 'block';
      noImageText.style.display = 'none';
      
      // Flash effect
      generatedImage.style.opacity = '0.3';
      setTimeout(() => {
        generatedImage.style.opacity = '1';
      }, 200);
      
      console.log('✅ Image displayed (mock)');
    }
  } catch (error) {
    console.error('Error loading image:', error);
  }
  
  // Hide progress after brief moment
  setTimeout(() => {
    progressBar.style.display = 'none';
    aiStatus.style.display = 'block';
    aiStatus.textContent = 'Waiting for descriptions...';
  }, 1000);
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Animate progress bar from current value to target
let progressInterval = null;
let oscillateInterval = null;
function animateProgress(targetPercent, durationMs) {
  if (progressInterval) {
    clearInterval(progressInterval);
  }
  if (oscillateInterval) {
    clearInterval(oscillateInterval);
  }
  
  const startValue = progressBar.value;
  const startTime = Date.now();
  
  progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    // Ease out curve
    const eased = 1 - Math.pow(1 - progress, 3);
    progressBar.value = startValue + (targetPercent - startValue) * eased;
    
    if (progress >= 1) {
      clearInterval(progressInterval);
      progressInterval = null;
      
      // Start oscillating at the end
      if (targetPercent >= 90) {
        startOscillation();
      }
    }
  }, 50);
}

function startOscillation() {
  let direction = -1; // Start by going down
  const minValue = 92;
  const maxValue = 95;
  
  oscillateInterval = setInterval(() => {
    progressBar.value += direction * 0.3;
    
    if (progressBar.value <= minValue) {
      direction = 1;
    } else if (progressBar.value >= maxValue) {
      direction = -1;
    }
  }, 50);
}

function stopOscillation() {
  if (oscillateInterval) {
    clearInterval(oscillateInterval);
    oscillateInterval = null;
  }
}

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  aiStatus.textContent = 'Connected - waiting for descriptions...';
  // Start the process loop
  setTimeout(processLoop, 1000);
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  generatedImage.style.display = 'none';
  noImageText.style.display = 'block';
  aiStatus.textContent = 'Database cleared';
  descriptionText.value = 'Waiting for descriptions...';
  progressBar.style.display = 'none';
  currentDescriptionId = null;
  currentCameraImageId = null;
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  aiStatus.textContent = 'Disconnected from server';
});

console.log('🚀 TTI page initialized (text-to-image mode)');
console.log(`⚙️ Display delay: ${DISPLAY_DELAY_MS}ms`);
