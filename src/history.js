import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server - use window.location.origin for both local and ngrok
const SERVER_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;
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
      <div style="padding: 0 10px 10px 10px; text-align: center;">
        <button id="descriptionBtn">about</button>
      </div>
      <div id="status" style="padding: 10px; text-align: center; font-weight: bold;">
      </div>
      <div id="gallery" style="flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-content: start;">
        <!-- Gallery items will be inserted here -->
      </div>
    </div>
  </div>
  
  <!-- Description Popup -->
  <div id="descriptionPopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 700px; max-height: 80vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden;">
    <div class="title-bar">
      <div class="title-bar-text">Recursive Self Portraits: #0</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="closeDescriptionBtn"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(80vh - 50px); padding: 15px; box-sizing: border-box;">
      <fieldset style="margin: 0; padding: 25px; font-family: 'Courier New', monospace; font-size: 1.15em; line-height: 1.3;">

        <div style="text-align: center; margin: 15px ;">
          <img src="/fig1.jpg" alt="Figure 1" style="max-width: 100%; height: auto; border: 2px solid #000;" />
          <p style="font-size: 0.8em; margin-top: 5px;"><strong>fig. 1</strong></p>
        </div>
        <p style="margin: 10px 0;">this is a performance art piece, wherein a human artist performs the following:</p>
        <ol style="margin: 10px 0; padding-left: 25px;">
          <li style="margin: 5px 0;">look at your self, and produce a painting of what you see.</li>
          <li style="margin: 5px 0;"><strong><em>WHILE YOU COMPLETE STEP 1:</em></strong>
            <ol style="margin: 5px 0 5px 20px; padding-left: 20px;">
              <li style="margin: 3px 0;">have a vision machine look at your self, and produce an image representation of what it sees.</li>
              <li style="margin: 3px 0;">give the image to an image-to-text machine, and ask it to produce a text representation of what it sees</li>
              <li style="margin: 3px 0;">give that text to a text-to-image machine, and ask it to produce an image of what it describes.</li>
              <li style="margin: 3px 0;">repeat</li>
            </ol>
          </li>
        </ol>
        <p style="margin: 10px 0;">this instance of the piece is complete when step 1 is complete.</p>
      </fieldset>
    </div>
  </div>
  
  <!-- Overlay for popup background -->
  <div id="popupOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999;"></div>
`

const statusDiv = document.querySelector('#status');
const galleryDiv = document.querySelector('#gallery');
const descriptionBtn = document.querySelector('#descriptionBtn');
const descriptionPopup = document.querySelector('#descriptionPopup');
const closeDescriptionBtn = document.querySelector('#closeDescriptionBtn');
const popupOverlay = document.querySelector('#popupOverlay');

// Popup controls
descriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'block';
  popupOverlay.style.display = 'block';
});

closeDescriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'none';
  popupOverlay.style.display = 'none';
});

popupOverlay.addEventListener('click', () => {
  descriptionPopup.style.display = 'none';
  popupOverlay.style.display = 'none';
});

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
        
        statusDiv.textContent = `${generatedImages.length} portraits created in ${timeString}`;
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
