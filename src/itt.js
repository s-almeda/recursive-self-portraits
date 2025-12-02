import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server
const socket = io('http://localhost:3000');

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
        <div>
          <p id="aiStatus" style="font-size: 1.3em; font-weight: bold; margin-bottom: 20px;">Waiting for images...</p>
          <div id="aiProgress" style="display: none;">
            <progress id="progressBar" style="width: 200px;"></progress>
          </div>
        </div>
      </div>
      
      <fieldset style="flex: 1; max-height: 70%; display: flex; flex-direction: column;">
        <legend>Image Description</legend>
        <div style="flex: 1; display: flex; flex-direction: column; padding: 10px;">
          <textarea id="descriptionText" readonly style="flex: 1; resize: none; font-family: 'Courier New', monospace; font-size: 0.9em; padding: 10px; background: #fff; border: 2px inset #dfdfdf;">No description yet.</textarea>
        </div>
      </fieldset>
    </div>
  </div>
`

const latestImage = document.querySelector('#latestImage');
const noImageText = document.querySelector('#noImageText');
const aiStatus = document.querySelector('#aiStatus');
const descriptionText = document.querySelector('#descriptionText');

// Load latest image on page load
async function loadLatestImage() {
  try {
    const response = await fetch('http://localhost:3000/api/camera-images/latest');
    const data = await response.json();
    
    if (data.success && data.image) {
      displayImage(data.image);
    } else {
      aiStatus.textContent = 'No images available yet';
    }
  } catch (error) {
    console.error('Error loading latest image:', error);
    aiStatus.textContent = 'Error loading image';
  }
}

// Display image
function displayImage(image) {
  currentImage = image;
  const imageUrl = `http://localhost:3000/captures/${image.filename}`;
  
  latestImage.src = imageUrl;
  latestImage.style.display = 'block';
  noImageText.style.display = 'none';
  
  const timestamp = new Date(image.captured_at).toLocaleString();
  aiStatus.textContent = 'Image loaded - Ready for processing';
  
  // TODO: Load description if it exists
  descriptionText.value = 'Description will appear here after AI processing...';
}

// Listen for new frames via WebSocket
socket.on('connect', () => {
  console.log('Connected to server');
  aiStatus.textContent = 'Connected - Waiting for new frames...';
});

socket.on('new-frame', (data) => {
  console.log('New frame received:', data);
  displayImage({
    id: data.id,
    filename: data.filename,
    captured_at: data.timestamp,
    camera_id: data.cameraId,
    frame_rate: data.frameRate
  });
  
  // Flash effect to show update
  latestImage.style.opacity = '0.5';
  setTimeout(() => {
    latestImage.style.opacity = '1';
  }, 200);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  aiStatus.textContent = 'Disconnected from server';
});

socket.on('data-cleared', () => {
  console.log('Data cleared');
  latestImage.style.display = 'none';
  noImageText.style.display = 'block';
  aiStatus.textContent = 'Database cleared - Waiting for new images...';
  descriptionText.value = 'No description yet.';
  currentImage = null;
});

// Load latest image on page load
loadLatestImage();

