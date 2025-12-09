import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to WebSocket server
const socket = io('http://localhost:3000');

let generatedImages = [];

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: 85vh; margin: auto; margin-top: 50px; max-width: 95vw; box-sizing: border-box;">
    <div class="title-bar">
      <div class="title-bar-text">History - Generated Images Gallery</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body" style="height: calc(85vh - 50px); display: flex; flex-direction: column; padding: 10px; font-size: 1.1em;">
      <div id="status" style="padding: 10px; text-align: center; font-weight: bold;">
        Loading history...
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
    
    const response = await fetch('http://localhost:3000/api/generated-images');
    const result = await response.json();
    
    if (result.success) {
      generatedImages = result.images || [];
      console.log(`📚 Loaded ${generatedImages.length} generated images`);
      
      if (generatedImages.length === 0) {
        statusDiv.textContent = 'No generated images yet. Visit /tti to generate some!';
        galleryDiv.innerHTML = '';
      } else {
        statusDiv.textContent = `${generatedImages.length} generated image${generatedImages.length !== 1 ? 's' : ''}`;
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
  `;
  
  // Add cache-busting timestamp for new items to avoid stale cache
  const cacheBuster = isNewItem ? `?t=${Date.now()}` : '';
  
  div.innerHTML = `
    <div style="background: #fff; padding: 5px; margin-bottom: 5px; text-align: center; min-height: 200px; display: flex; align-items: center; justify-content: center;">
      <img src="/captures/${item.filename}${cacheBuster}" style="max-width: 100%; max-height: 200px; object-fit: contain;" onerror="this.dataset.retries = (this.dataset.retries || 0); if (this.dataset.retries < 5) { this.dataset.retries++; setTimeout(() => this.src = '/captures/${item.filename}?t=' + Date.now(), 200 * this.dataset.retries); }" />
    </div>
    <textarea readonly style="width: 100%; height: 90px; resize: none; font-family: 'Courier New', monospace; font-size: 0.8em; padding: 5px; background: #fff; border: 2px inset #dfdfdf; color: #000; box-sizing: border-box;">${item.prompt || 'No description'}</textarea>
    <div style="font-size: 0.7em; color: #666; margin-top: 5px; text-align: right;">${new Date(item.generated_at).toLocaleString()}</div>
  `;
  
  return div;
}

// Add new item with animation (for real-time updates)
function addNewItem(item) {
  generatedImages.push(item);
  
  // Update status
  statusDiv.textContent = `${generatedImages.length} generated image${generatedImages.length !== 1 ? 's' : ''}`;
  
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
  }
`;
document.head.appendChild(style);

console.log('🚀 History page initialized');
