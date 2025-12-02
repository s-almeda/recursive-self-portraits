import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// CONFIGURATION - Easy to edit
const DISPLAY_DELAY_MS = 1000; // Time to display description before moving to next image

// Connect to WebSocket server
const socket = io('http://localhost:3000');

let isProcessing = false;
let currentImage = null;

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

// Main processing loop
async function processNextImage() {
  if (isProcessing) {
    console.log('⏸️ Already processing, skipping');
    return;
  }
  
  isProcessing = true;
  console.log('🔄 ======== Starting next image cycle ========');
  
  try {
    // Step 1: Get the latest image
    console.log('📡 Fetching latest image...');
    const response = await fetch('http://localhost:3000/api/camera-images/latest');
    const data = await response.json();
    console.log('📡 API response:', data);
    
    if (!data.success || !data.image) {
      console.log('⏳ No images available yet');
      aiStatus.textContent = 'Waiting for images...';
      progressBar.style.display = 'none';
      isProcessing = false;
      setTimeout(() => processNextImage(), 2000); // Check again in 2s
      return;
    }
    
    currentImage = data.image;
    console.log('🖼️ Got image:', currentImage.id, 'status:', currentImage.status);
    
    // Display the image
    latestImage.src = `http://localhost:3000/captures/${currentImage.filename}`;
    latestImage.style.display = 'block';
    noImageText.style.display = 'none';
    
    // Show progress bar
    progressBar.style.display = 'block';
    progressBar.removeAttribute('value'); // Indeterminate state
    aiStatus.textContent = 'Processing...';
    descriptionText.value = 'Waiting for AI description...';
    
    // Step 2: Check if description already exists
    console.log('🔍 Checking for existing description...');
    let description = await getDescription(currentImage.id);
    
    if (!description) {
      console.log('📝 No description yet, waiting for AI...');
      // Wait for description to be created via WebSocket
      description = await waitForDescription(currentImage.id);
    } else {
      console.log('✅ Found existing description');
    }
    
    // Step 3: Display description
    console.log('✅ Description received, length:', description.length);
    progressBar.value = 100;
    progressBar.max = 100;
    aiStatus.textContent = 'Complete!';
    descriptionText.value = description;
    
    // Flash effect
    descriptionText.style.backgroundColor = '#ffffcc';
    setTimeout(() => {
      descriptionText.style.backgroundColor = '#fff';
    }, 300);
    
    // Step 4: Wait for display delay
    console.log(`⏱️ Waiting ${DISPLAY_DELAY_MS}ms before next cycle`);
    await sleep(DISPLAY_DELAY_MS);
    
    // Step 5: Clean up undescribed images (except the latest)
    console.log('🗑️ Cleaning up undescribed images (keeping', currentImage.id, ')');
    const cleanupResponse = await fetch(`http://localhost:3000/api/cleanup-undescribed/${currentImage.id}`, {
      method: 'POST'
    });
    const cleanupData = await cleanupResponse.json();
    console.log('🗑️ Cleanup result:', cleanupData);
    
  } catch (error) {
    console.error('❌ Error in processing loop:', error);
    aiStatus.textContent = `Error: ${error.message}`;
    await sleep(2000); // Wait before retrying
  } finally {
    isProcessing = false;
    // Immediately start next cycle
    console.log('🔁 Scheduling next cycle in 100ms');
    setTimeout(() => processNextImage(), 100);
  }
}

// Get existing description
async function getDescription(imageId) {
  try {
    console.log('🔎 Fetching description from API for:', imageId);
    const response = await fetch(`http://localhost:3000/api/text-descriptions/${imageId}`);
    console.log('🔎 API status:', response.status);
    const data = await response.json();
    console.log('🔎 API data:', data);
    if (data.success && data.description) {
      console.log('✅ Description found:', data.description.description.substring(0, 50) + '...');
      return data.description.description;
    }
  } catch (error) {
    console.log('❌ Error fetching description:', error);
  }
  return null;
}

// Wait for description to be completed via WebSocket
function waitForDescription(imageId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Description timeout'));
    }, 120000); // 2 minute timeout
    
    const handler = (data) => {
      console.log('🔔 description-complete event:', data);
      if (data.imageId === imageId) {
        cleanup();
        resolve(data.description);
      }
    };
    
    const statusHandler = (data) => {
      if (data.imageId === imageId) {
        console.log('📊 Status update:', data.status);
        if (data.status === 'processing') {
          aiStatus.textContent = 'AI is analyzing...';
        } else if (data.status === 'error') {
          cleanup();
          reject(new Error(data.message || 'Description failed'));
        }
      }
    };
    
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('description-complete', handler);
      socket.off('description-status', statusHandler);
    };
    
    socket.on('description-complete', handler);
    socket.on('description-status', statusHandler);
  });
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Socket connection handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  // Start processing when connected
  processNextImage();
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  aiStatus.textContent = 'Disconnected from server';
  isProcessing = false;
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  latestImage.style.display = 'none';
  noImageText.style.display = 'block';
  aiStatus.textContent = 'Database cleared - Waiting for new images...';
  descriptionText.value = 'No description yet.';
  progressBar.style.display = 'none';
  currentImage = null;
  isProcessing = false;
  // Restart processing loop
  setTimeout(() => processNextImage(), 1000);
});

// Listen for new frames to trigger immediate processing
socket.on('new-frame', (data) => {
  console.log('📸 New frame captured:', data.id);
  // If not currently processing, kick off a cycle
  if (!isProcessing) {
    processNextImage();
  }
});

console.log('🚀 ITT page initialized');
console.log(`⚙️ Display delay: ${DISPLAY_DELAY_MS}ms`);
