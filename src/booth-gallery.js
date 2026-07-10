import './style.css'
import 'xp.css'
import { io } from 'socket.io-client';

// Connect to the isolated booth namespace on the WebSocket server
const SERVER_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;
const socket = io(`${SERVER_URL}/booth`);

let generatedImages = [];

document.querySelector('#app').innerHTML = `
  <div class="window" style="width: calc(100vw - 40px); height: calc(100vh - 70px); margin: auto; margin-top: 50px; max-width: 95vw; box-sizing: border-box; display: flex; flex-direction: column;">
    <div class="title-bar">
      <div class="title-bar-text">🖼️</div>
    </div>
    <div class="window-body" style="flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 10px; font-size: 1.1em; overflow: hidden;">
      <div style="padding: 0 10px 10px 10px; text-align: center; display: flex; gap: 10px; justify-content: center;">
        <button id="descriptionBtn">about</button>
      </div>
      <div id="status" style="padding: 10px; text-align: center; font-weight: bold;"></div>
      <div id="gallery" style="flex: 1; min-height: 0; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-content: start;">
        <!-- Gallery items will be inserted here -->
      </div>
    </div>
  </div>

  <!-- Description Popup -->
  <div id="descriptionPopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 700px; max-height: 80vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden; pointer-events: auto;">
    <div class="title-bar">
      <div class="title-bar-text">about</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="closeDescriptionBtn"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(80vh - 50px); padding: 15px; box-sizing: border-box;">
      <fieldset style="margin: 0; padding: 25px; font-family: 'Courier New', monospace;">
        <p style="margin: 10px 0;">this is a public kiosk version of the system shm will use in their performance of <em>Artist-in-the-Loop</em>, part of the RECURSIVE SELF PORTRAIT SERIES.</p>
        <p style="margin: 10px 0;">the next performance will take place on <strong>Wednesday, July 15, at 4:30PM.</strong></p>
        <div style="text-align: center; margin: 15px;">
          <img style="width: 10vw; max-width: 100%; height: auto; border: 2px solid #000;" src="/aitl.png" alt="Artist-in-the-Loop" />
          <p style="font-size: 1.1em; margin-top: 5px;">visit <strong><u>shmuh.co/aitl</u></strong> to learn more.</p>
        </div>
      </fieldset>
    </div>
  </div>

  <!-- Delete confirmation popup -->
  <div id="deletePopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 600px; max-height: 85vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden; pointer-events: auto;">
    <div class="title-bar">
      <div class="title-bar-text">delete this capture?</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="cancelDeleteX"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(85vh - 40px); padding: 15px; box-sizing: border-box; text-align: center;">
      <p style="margin: 5px 0 15px;">This deletes both images below. This action cannot be undone.</p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <div>
          <img id="deleteCamImg" src="" style="max-width: 200px; max-height: 200px; object-fit: contain; border: 2px solid #000; background: #fff;" />
          <div style="font-size: 0.8em; margin-top: 4px;">capture</div>
        </div>
        <div>
          <img id="deleteGenImg" src="" style="max-width: 200px; max-height: 200px; object-fit: contain; border: 2px solid #000; background: #fff;" />
          <div style="font-size: 0.8em; margin-top: 4px;">portrait</div>
        </div>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
        <button id="confirmDeleteBtn">delete</button>
        <button id="cancelDeleteBtn">cancel</button>
      </div>
      <div id="deleteStatus" style="margin-top: 10px; font-size: 0.85em;"></div>
    </div>
  </div>

  <!-- View portrait popup -->
  <div id="viewPopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70%; max-width: 620px; max-height: 75vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden; pointer-events: auto;">
    <div class="title-bar">
      <div class="title-bar-text"><img src="/magnify_note.ico" alt="view" style="width: 1em; height: 1em; image-rendering: pixelated;" /></div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="closeViewX"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(88vh - 40px); padding: 15px; box-sizing: border-box;">
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <div style="text-align: center;">
          <img id="viewCamImg" src="" style="max-width: 240px; max-height: 240px; object-fit: contain; border: 2px solid #000; background: #fff;" />
          <div style="font-size: 0.8em; margin-top: 4px;">capture</div>
        </div>
        <div style="text-align: center;">
          <img id="viewGenImg" src="" style="max-width: 240px; max-height: 240px; object-fit: contain; border: 2px solid #000; background: #fff;" />
          <div style="font-size: 0.8em; margin-top: 4px;">portrait</div>
        </div>
      </div>
      <div id="viewDescText" style="margin-top: 10px; font-family: 'Arial'; font-size: 1.15em; line-height: 1.6; background: #fff; border: 2px inset #dfdfdf; color: #000; padding: 10px; max-height: 25vh; overflow-y: auto; white-space: pre-wrap;"></div>
    </div>
  </div>

  <!-- Overlay for popup background (click to close) -->
  <div id="popupOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; pointer-events: auto; cursor: pointer;"></div>
`

const statusDiv = document.querySelector('#status');
const galleryDiv = document.querySelector('#gallery');
const descriptionBtn = document.querySelector('#descriptionBtn');
const descriptionPopup = document.querySelector('#descriptionPopup');
const closeDescriptionBtn = document.querySelector('#closeDescriptionBtn');
const popupOverlay = document.querySelector('#popupOverlay');
const deletePopup = document.querySelector('#deletePopup');
const deleteGenImg = document.querySelector('#deleteGenImg');
const deleteCamImg = document.querySelector('#deleteCamImg');
const confirmDeleteBtn = document.querySelector('#confirmDeleteBtn');
const cancelDeleteBtn = document.querySelector('#cancelDeleteBtn');
const cancelDeleteX = document.querySelector('#cancelDeleteX');
const deleteStatus = document.querySelector('#deleteStatus');
const viewPopup = document.querySelector('#viewPopup');
const viewCamImg = document.querySelector('#viewCamImg');
const viewGenImg = document.querySelector('#viewGenImg');
const viewDescText = document.querySelector('#viewDescText');
const closeViewX = document.querySelector('#closeViewX');

let pendingDeleteId = null;

// Close any open popup + the dark overlay
function closeAllPopups() {
  descriptionPopup.style.display = 'none';
  deletePopup.style.display = 'none';
  viewPopup.style.display = 'none';
  popupOverlay.style.display = 'none';
  pendingDeleteId = null;
}

// Clicking the darkened background closes whatever is open
popupOverlay.addEventListener('click', closeAllPopups);

// ---- View-a-portrait popup (capture left, generated right, description below) ----
async function openViewPopup(item) {
  viewGenImg.src = `/booth-captures/${item.filename}?t=${Date.now()}`;
  viewCamImg.src = '';
  viewDescText.textContent = item.prompt || 'No description';
  viewPopup.style.display = 'block';
  popupOverlay.style.display = 'block';

  // Fetch the webcam capture (and full description) for this generated image
  try {
    const response = await fetch(`${SERVER_URL}/api/booth/pipeline/${item.id}`);
    const result = await response.json();
    if (result.success && result.pipeline) {
      viewCamImg.src = `/booth-captures/${result.pipeline.cam_filename}`;
      if (result.pipeline.description) viewDescText.textContent = result.pipeline.description;
    }
  } catch (error) {
    console.error('Error loading portrait for view popup:', error);
  }
}

closeViewX.addEventListener('click', closeAllPopups);

// ---- Delete-a-capture popup ----
async function openDeletePopup(item) {
  pendingDeleteId = item.id;
  deleteStatus.textContent = '';
  deleteGenImg.src = `/booth-captures/${item.filename}?t=${Date.now()}`;
  deleteCamImg.src = '';
  deletePopup.style.display = 'block';
  popupOverlay.style.display = 'block';

  // Fetch the webcam capture filename for this generated image
  try {
    const response = await fetch(`${SERVER_URL}/api/booth/pipeline/${item.id}`);
    const result = await response.json();
    if (result.success && result.pipeline) {
      deleteCamImg.src = `/booth-captures/${result.pipeline.cam_filename}`;
    }
  } catch (error) {
    console.error('Error loading capture for delete popup:', error);
  }
}

function closeDeletePopup() {
  deletePopup.style.display = 'none';
  popupOverlay.style.display = 'none';
  pendingDeleteId = null;
}

confirmDeleteBtn.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  deleteStatus.style.color = '#000';
  deleteStatus.textContent = 'Deleting...';
  try {
    const response = await fetch(`${SERVER_URL}/api/booth/generated-images/${pendingDeleteId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (result.success) {
      // Card removal is handled by the 'capture-deleted' socket event
      closeDeletePopup();
    } else {
      deleteStatus.style.color = 'red';
      deleteStatus.textContent = result.error || 'Error deleting';
    }
  } catch (error) {
    console.error('Error deleting capture:', error);
    deleteStatus.style.color = 'red';
    deleteStatus.textContent = 'Error connecting to server';
  }
});

cancelDeleteBtn.addEventListener('click', closeDeletePopup);
cancelDeleteX.addEventListener('click', closeDeletePopup);

// Remove a card from the grid (fired for every client when a capture is deleted)
function removeCard(genId) {
  generatedImages = generatedImages.filter((it) => it.id !== genId);
  const card = galleryDiv.querySelector(`[data-gen-id="${genId}"]`);
  if (card) card.remove();
}

// Popup controls - Description / about
descriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'block';
  popupOverlay.style.display = 'block';
});

closeDescriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'none';
  popupOverlay.style.display = 'none';
});

// Compute a human-readable duration string across all portraits
function durationString() {
  const earliestImage = generatedImages[0];
  const latestImage = generatedImages[generatedImages.length - 1];
  const durationMs = new Date(latestImage.generated_at).getTime() - new Date(earliestImage.generated_at).getTime();

  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    let s = `${days} day${days !== 1 ? 's' : ''}`;
    if (remainingHours > 0) s += ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    return s;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    let s = `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (remainingMinutes > 0) s += ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    return s;
  }
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return 'less than a minute';
}

// Load all generated images from the booth server
async function loadHistory() {
  try {
    const response = await fetch(`${SERVER_URL}/api/booth/generated-images`);
    const result = await response.json();

    if (result.success) {
      generatedImages = result.images || [];

      if (generatedImages.length === 0) {
        statusDiv.textContent = '';
        galleryDiv.innerHTML = '';
      } else {
        // NO STATUS NEEDED FOR THE BOOTH VERSION — just render the grid
        renderGallery();
      }
    } else {
      statusDiv.textContent = 'Error loading gallery';
      console.error('Error loading gallery:', result.error);
    }
  } catch (error) {
    console.error('❌ Error loading gallery:', error);
    statusDiv.textContent = 'Error connecting to server';
  }
}

// Render the gallery grid — newest first (oldest at the bottom)
function renderGallery() {
  galleryDiv.innerHTML = '';
  for (let i = generatedImages.length - 1, pos = 0; i >= 0; i--, pos++) {
    galleryDiv.appendChild(createGalleryItem(generatedImages[i], pos));
  }
}

// Create a single gallery item (flip between generated and camera image)
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
  div.dataset.genId = item.id;

  const cacheBuster = isNewItem ? `?t=${Date.now()}` : '';

  div.innerHTML = `
    <div class="delete-row" style="display: flex; justify-content: flex-end; margin-bottom: 5px;">
    <p style="font-family: 'Pixelated MS Sans Serif', monospace; font-size: 0.8em; margin: 1ch;">click to delete this capture --></p>
      <button class="delete-x" aria-label="delete this capture" title="delete this capture"><img src="/recycling_bin.ico" alt="delete" /></button>
    </div>
    <button class="view-btn" aria-label="view this portrait" title="view this portrait"><img src="/magnify_note.ico" alt="view" /></button>
    <div class="image-container" style="background: #fff; padding: 5px; margin-bottom: 5px; text-align: center; min-height: 200px; display: flex; align-items: center; justify-content: center; position: relative;">
      <img class="generated-img" src="/booth-captures/${item.filename}${cacheBuster}" style="max-width: 100%; max-height: 200px; object-fit: contain;" onerror="this.dataset.retries = (this.dataset.retries || 0); if (this.dataset.retries < 5) { this.dataset.retries++; setTimeout(() => this.src = '/booth-captures/${item.filename}?t=' + Date.now(), 200 * this.dataset.retries); }" />
      <img class="camera-img" src="" style="max-width: 100%; max-height: 200px; object-fit: contain; display: none;" />
      <div class="loading-msg" style="display: none; position: absolute; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px;">Loading...</div>
    </div>
    <textarea readonly style="width: 100%; height: 90px; resize: none; font-family: 'Courier New', monospace; font-size: 0.8em; padding: 5px; background: #fff; border: 2px inset #dfdfdf; color: #000; box-sizing: border-box;">${item.prompt || 'No description'}</textarea>
    <div style="font-size: 0.7em; color: #666; margin-top: 5px; text-align: right;">${new Date(item.generated_at).toLocaleString()}</div>
    <div class="flip-hint" style="font-size: 0.75em; color: #000; text-align: center; margin-top: 3px; font-weight: bold;">click to see webcam capture</div>
  `;

  let isFlipped = false;
  let cameraImageLoaded = false;

  // Grey X → delete-confirmation popup (don't let it trigger the flip)
  div.querySelector('.delete-x').addEventListener('click', (e) => {
    e.stopPropagation();
    openDeletePopup(item);
  });

  // Magnify → view-portrait popup (don't let it trigger the flip)
  div.querySelector('.view-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openViewPopup(item);
  });

  div.addEventListener('click', async () => {
    const generatedImg = div.querySelector('.generated-img');
    const cameraImg = div.querySelector('.camera-img');
    const loadingMsg = div.querySelector('.loading-msg');
    const flipHint = div.querySelector('.flip-hint');

    if (!isFlipped) {
      if (!cameraImageLoaded) {
        loadingMsg.style.display = 'block';
        try {
          const response = await fetch(`${SERVER_URL}/api/booth/pipeline/${item.id}`);
          const result = await response.json();
          if (result.success && result.pipeline) {
            cameraImg.src = `/booth-captures/${result.pipeline.cam_filename}`;
            cameraImageLoaded = true;
          }
        } catch (error) {
          console.error('Error loading camera image:', error);
        }
        loadingMsg.style.display = 'none';
      }

      generatedImg.style.display = 'none';
      cameraImg.style.display = 'block';
      flipHint.textContent = 'click to see generated portrait';
      isFlipped = true;
    } else {
      generatedImg.style.display = 'block';
      cameraImg.style.display = 'none';
      flipHint.textContent = 'click to see capture 👁️';
      isFlipped = false;
    }
  });

  return div;
}

// Add new item with animation (real-time updates)
function addNewItem(item) {
  generatedImages.push(item);
  // NO STATUS NEEDED FOR THE BOOTH VERSION

  const galleryItem = createGalleryItem(item, 0, true);
  galleryDiv.prepend(galleryItem);

  // Newest is at the top — scroll up so it's visible
  setTimeout(() => {
    galleryDiv.scrollTop = 0;
  }, 100);

  console.log('✨ New image added to gallery:', item.filename);
}

// Socket event handlers (booth namespace)
socket.on('connect', () => {
  console.log('✅ Connected to booth server');
  loadHistory();
});

socket.on('generation-complete', (data) => {
  console.log('🎉 New generation complete:', data);
  addNewItem({
    id: data.generatedImageId,
    filename: data.filename,
    prompt: data.description,
    generated_at: data.timestamp
  });
});

socket.on('capture-deleted', (data) => {
  console.log('🗑️ Capture deleted:', data.generatedImageId);
  removeCard(data.generatedImageId);
});

socket.on('data-cleared', () => {
  console.log('🗑️ Data cleared');
  generatedImages = [];
  statusDiv.textContent = '';
  galleryDiv.innerHTML = '';
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  statusDiv.textContent = 'Disconnected from server';
});

// CSS animation (matches history.js)
const style = document.createElement('style');
style.textContent = `
  /* Only #gallery scrolls — never the page itself (avoids the xp.css double scrollbar) */
  html, body { margin: 0; height: 100%; overflow: hidden; }

  /* xp.css renders a bogus 2nd (wrong-direction) arrow at each end of the scrollbar.
     Hide the mirrored buttons so only one up (top) and one down (bottom) remain. */
  ::-webkit-scrollbar-button:vertical:start:increment,
  ::-webkit-scrollbar-button:vertical:end:decrement,
  ::-webkit-scrollbar-button:horizontal:start:increment,
  ::-webkit-scrollbar-button:horizontal:end:decrement {
    display: none;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .gallery-item:hover {
    transform: scale(1.02);
    transition: transform 0.2s;
    box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
  }
  /* Flip-rotate when pressing the image itself — the recycle bin sits in a
     sibling row above, so pressing it never triggers this. */
  .image-container { transition: transform 0.3s; }
  .image-container:active { transform: rotateY(180deg); }

  /* Win98-style grey square icon buttons (delete = recycle bin, view = magnify) */
  .delete-x, .view-btn {
    width: 24px;
    height: 24px;
    min-width: 0;
    min-height: 0;
    padding: 2px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #c0c0c0;
    border-top: 2px solid #ffffff;
    border-left: 2px solid #ffffff;
    border-right: 2px solid #808080;
    border-bottom: 2px solid #808080;
    cursor: pointer;
  }
  .delete-x img, .view-btn img {
    width: 16px;
    height: 16px;
    display: block;
    image-rendering: pixelated;
  }
  .delete-x:active, .view-btn:active {
    border-top: 2px solid #808080;
    border-left: 2px solid #808080;
    border-right: 2px solid #ffffff;
    border-bottom: 2px solid #ffffff;
  }
  /* View button lives in the bottom-left corner of the card */
  .view-btn {
    position: absolute;
    bottom: 6px;
    left: 6px;
    z-index: 4;
  }
`;
document.head.appendChild(style);

console.log('🚀 Booth gallery page initialized');
