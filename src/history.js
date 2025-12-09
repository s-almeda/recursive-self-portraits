import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server - use port 3000 for both local and network access
const SERVER_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `http://${window.location.hostname}:3000`;
const socket = io(SERVER_URL);


let generatedImages = [];

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 95vw; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">gallery</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; flex-direction: column; padding: 10px; font-size: 1.1em; overflow-y: hidden;">
      <div id="status" style="padding: 10px; text-align: center; font-weight: bold;">
      </div>
      <div id="gallery" style="flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-content: start;">
        <!-- Gallery items will be inserted here -->
      </div>
    </div>
  </div>
`

const statusDiv = document.querySelector('#status');
const galleryDiv = document.querySelector('#gallery');

// Load all generated images from the server
async function loadHistory() {
  try {
    statusDiv.textContent = 'Loading history...';
    
    const response = await fetch(`${SERVER_URL}/api/generated-images`);
    const result = await response.json();
    
    if (result.success) {
      generatedImages = result.images || [];
      //console.log(`📚 Loaded ${generatedImages.length} generated images`);
      
      if (generatedImages.length === 0) {
       // statusDiv.textContent = 'No generated images yet. Visit /tti to generate some!';
        galleryDiv.innerHTML = '';
      } else {
        // Calculate time duration from earliest to latest image
        const earliestImage = generatedImages[0];
        const latestImage = generatedImages[generatedImages.length - 1];
        const earliestTime = new Date(earliestImage.generated_at).getTime();
        const latestTime = new Date(latestImage.generated_at).getTime();
        const durationMs = latestTime - earliestTime;
        
        // Convert to appropriate unit
        const minutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        let timeString;
        if (days > 0) {
          const remainingHours = hours % 24;
          timeString = `${days} day${days !== 1 ? 's' : ''}`;
          if (remainingHours > 0) {
            timeString += ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
          }
        } else if (hours > 0) {
          const remainingMinutes = minutes % 60;
          timeString = `${hours} hour${hours !== 1 ? 's' : ''}`;
          if (remainingMinutes > 0) {
            timeString += ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
          }
        } else if (minutes > 0) {
          timeString = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
          timeString = 'less than a minute';
        }
        
        statusDiv.textContent = `${generatedImages.length} representations created over ${timeString}`;
        renderGallery();
      }
    } else {
      statusDiv.textContent = 'Error loading history';
      console.error('Error loading history:', result.error);
    }
  } catch (error) {
    console.error('❌ Error loading history:', error);
    statusDiv.textContent = 'Error connecting to server';
  }
}

// Render the gallery grid
function renderGallery() {
  galleryDiv.innerHTML = '';
  
  // Render in order (oldest first)
  generatedImages.forEach((item, index) => {
    const galleryItem = createGalleryItem(item, index);
    galleryDiv.appendChild(galleryItem);
  });
}

// Create a single gallery item
function createGalleryItem(item, index, isNewItem = false) {
  const div = document.createElement('div');
  div.className = 'gallery-item';
  div.style.cssText = `
    display: flex;
    flex-direction: column;
    border: 2px solid #000;
    background: #c0c0c0;
    padding: 5px;
    opacity: 0;
    animation: fadeIn 0.5s forwards;
    animation-delay: ${index * 0.05}s;
    cursor: pointer;
    position: relative;
  `;
  
  // Add cache-busting timestamp for new items to avoid stale cache
  const cacheBuster = isNewItem ? `?t=${Date.now()}` : '';
  
  div.innerHTML = `
    <div class="image-container" style="background: #fff; padding: 5px; margin-bottom: 5px; text-align: center; min-height: 200px; display: flex; align-items: center; justify-content: center; position: relative;">
      <img class="generated-img" src="/captures/${item.filename}${cacheBuster}" style="max-width: 100%; max-height: 200px; object-fit: contain;" onerror="this.dataset.retries = (this.dataset.retries || 0); if (this.dataset.retries < 5) { this.dataset.retries++; setTimeout(() => this.src = '/captures/${item.filename}?t=' + Date.now(), 200 * this.dataset.retries); }" />
      <img class="camera-img" src="" style="max-width: 100%; max-height: 200px; object-fit: contain; display: none;" />
      <div class="loading-msg" style="display: none; position: absolute; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px;">Loading...</div>
    </div>
    <textarea readonly style="width: 100%; height: 90px; resize: none; font-family: 'Courier New', monospace; font-size: 0.8em; padding: 5px; background: #fff; border: 2px inset #dfdfdf; color: #000; box-sizing: border-box;">${item.prompt || 'No description'}</textarea>
    <div style="font-size: 0.7em; color: #666; margin-top: 5px; text-align: right;">${new Date(item.generated_at).toLocaleString()}</div>
    <div class="flip-hint" style="font-size: 0.75em; color: #000; text-align: center; margin-top: 3px; font-weight: bold;">click to see capture 👁️</div>
  `;
  
  let isFlipped = false;
  let cameraImageLoaded = false;
  
  // Click handler to flip between generated and camera image
  div.addEventListener('click', async () => {
    const generatedImg = div.querySelector('.generated-img');
    const cameraImg = div.querySelector('.camera-img');
    const loadingMsg = div.querySelector('.loading-msg');
    const flipHint = div.querySelector('.flip-hint');
    
    if (!isFlipped) {
      // Flip to camera image
      if (!cameraImageLoaded) {
        // Load camera image from pipeline
        loadingMsg.style.display = 'block';
        try {
          const response = await fetch(`${SERVER_URL}/api/pipeline/${item.id}`);
          const result = await response.json();
          
          if (result.success && result.pipeline) {
            cameraImg.src = `/captures/${result.pipeline.cam_filename}`;
            cameraImageLoaded = true;
          }
        } catch (error) {
          console.error('Error loading camera image:', error);
        }
        loadingMsg.style.display = 'none';
      }
      
      // Show camera image
      generatedImg.style.display = 'none';
      cameraImg.style.display = 'block';
      flipHint.textContent = 'click to see generated representation';
      isFlipped = true;
    } else {
      // Flip back to generated image
      generatedImg.style.display = 'block';
      cameraImg.style.display = 'none';
      flipHint.textContent = 'click to see capture 👁️';
      isFlipped = false;
    }
  });
  
  return div;
}

// Add new item with animation (for real-time updates)
function addNewItem(item) {
  generatedImages.push(item);
  
  // Update status with time duration
  if (generatedImages.length > 0) {
    const earliestImage = generatedImages[0];
    const latestImage = generatedImages[generatedImages.length - 1];
    const earliestTime = new Date(earliestImage.generated_at).getTime();
    const latestTime = new Date(latestImage.generated_at).getTime();
    const durationMs = latestTime - earliestTime;
    
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    let timeString;
    if (days > 0) {
      const remainingHours = hours % 24;
      timeString = `${days} day${days !== 1 ? 's' : ''}`;
      if (remainingHours > 0) {
        timeString += ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
      }
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      timeString = `${hours} hour${hours !== 1 ? 's' : ''}`;
      if (remainingMinutes > 0) {
        timeString += ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
      }
    } else if (minutes > 0) {
      timeString = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      timeString = 'less than a minute';
    }
    
    statusDiv.textContent = `${generatedImages.length} generated in ${timeString}`;
  }
  
  // Create and append the new item (with isNewItem=true for cache busting)
  const galleryItem = createGalleryItem(item, generatedImages.length - 1, true);
  galleryDiv.appendChild(galleryItem);
  
  // Scroll to bottom to show new item
  setTimeout(() => {
    galleryDiv.scrollTop = galleryDiv.scrollHeight;
  }, 100);
  
  console.log('✨ New image added to gallery:', item.filename);
}

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  loadHistory();
});

socket.on('generation-complete', (data) => {
  console.log('🎉 New generation complete:', data);
  
  // Add the new item to our gallery
  addNewItem({
    id: data.generatedImageId,
    filename: data.filename,
    prompt: data.description,
    generated_at: data.timestamp
  });
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  generatedImages = [];
  statusDiv.textContent = 'No generated images yet. Visit /tti to generate some!';
  galleryDiv.innerHTML = '';
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  statusDiv.textContent = 'Disconnected from server';
});

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .gallery-item:hover {
    transform: scale(1.02);
    transition: transform 0.2s;
    box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
  }
  
  .image-container {
    transition: transform 0.3s;
  }
  
  .gallery-item:active .image-container {
    transform: rotateY(180deg);
  }
`;
document.head.appendChild(style);

console.log('🚀 History page initialized');
