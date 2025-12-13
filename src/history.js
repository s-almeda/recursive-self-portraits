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
      <div style="padding: 0 10px 10px 10px; text-align: center; display: flex; gap: 10px; justify-content: center;">
        <button id="descriptionBtn">about</button>
        <button id="questionnaireBtn">questionnaire</button>
      </div>
      <div id="status" style="padding: 10px; text-align: center; font-weight: bold;">
      </div>
      <div id="gallery" style="flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-content: start;">
        <!-- Gallery items will be inserted here -->
      </div>
    </div>
  </div>
  
  <!-- Description Popup -->
  <div id="descriptionPopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 700px; max-height: 80vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden; pointer-events: auto;">
    <div class="title-bar">
      <div class="title-bar-text">Recursive Self Portraits: #0</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="closeDescriptionBtn"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(80vh - 50px); padding: 15px; box-sizing: border-box;">
      <fieldset style="margin: 0; padding: 25px; font-family: 'Courier New', monospace;">

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
  
  <!-- Questionnaire Popup -->
  <div id="questionnairePopup" class="window" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 700px; max-height: 85vh; z-index: 1000; box-shadow: 4px 4px 10px rgba(0,0,0,0.5); overflow: hidden; pointer-events: auto;">
    <div class="title-bar">
      <div class="title-bar-text">questionnaire</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="closeQuestionnaireBtn"></button>
      </div>
    </div>
    <div class="window-body" style="overflow-y: auto; max-height: calc(85vh - 33px); padding: 15px; box-sizing: border-box;">
      <fieldset style="margin: 0; padding: 15px; font-family: 'Courier New', monospace; font-size: 0.9em;">
        <legend>Dear Viewer,</legend>
        <p style="margin: 10px 0;">Thank you for visiting. Please write your answers to some or all of the following questions.</p>
        <p style="margin: 10px 0; font-style: italic; font-size: 0.9em;">
          We intend to compile and publicly share the submissions collected from this piece in a format that anyone can use as they please. In submitting a response, you consent to release what you have written here as 100% free to use.
        </p>
        
        <form id="questionnaireForm" style="margin-top: 15px;">
          <!-- Question 1: AI -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">1. the AI is...</p>
            <div class="field-row">
              <input id="ai_artist" type="checkbox" name="ai_role" value="artist">
              <label for="ai_artist">an artist</label>
            </div>
            <div class="field-row">
              <input id="ai_medium" type="checkbox" name="ai_role" value="medium">
              <label for="ai_medium">a medium</label>
            </div>
            <div class="field-row">
              <input id="ai_system" type="checkbox" name="ai_role" value="system">
              <label for="ai_system">a system for generating images</label>
            </div>
            <div style="margin-top: 3px; margin-bottom: 3px;">
              <div class="field-row" style="display: inline-block;">
                <input id="ai_other" type="checkbox" name="ai_role" value="other">
                <label for="ai_other">other:</label>
              </div>
              <input id="ai_other_text" type="text" name="ai_role_other" style="width: 200px; padding: 3px; font-family: 'Courier New', monospace; color: #000; background: #fff; margin-left: 5px;" onfocus="document.getElementById('ai_other').checked = true;">
            </div>
          </div>
          
          <!-- Question 2: Camera -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">2. the camera is...</p>
            <div class="field-row">
              <input id="camera_artist" type="checkbox" name="camera_role" value="artist">
              <label for="camera_artist">an artist</label>
            </div>
            <div class="field-row">
              <input id="camera_medium" type="checkbox" name="camera_role" value="medium">
              <label for="camera_medium">a medium</label>
            </div>
            <div class="field-row">
              <input id="camera_system" type="checkbox" name="camera_role" value="system">
              <label for="camera_system">a system for generating images</label>
            </div>
            <div style="margin-top: 3px; margin-bottom: 3px;">
              <div class="field-row" style="display: inline-block;">
                <input id="camera_other" type="checkbox" name="camera_role" value="other">
                <label for="camera_other">other:</label>
              </div>
              <input id="camera_other_text" type="text" name="camera_role_other" style="width: 200px; padding: 3px; font-family: 'Courier New', monospace; color: #000; background: #fff; margin-left: 5px;" onfocus="document.getElementById('camera_other').checked = true;">
            </div>
          </div>
          
          <!-- Question 3: Human -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">3. the human is...</p>
            <div class="field-row">
              <input id="human_artist" type="checkbox" name="human_role" value="artist">
              <label for="human_artist">an artist</label>
            </div>
            <div class="field-row">
              <input id="human_medium" type="checkbox" name="human_role" value="medium">
              <label for="human_medium">a medium</label>
            </div>
            <div class="field-row">
              <input id="human_system" type="checkbox" name="human_role" value="system">
              <label for="human_system">a system for generating images</label>
            </div>
            <div style="margin-top: 3px; margin-bottom: 3px;">
              <div class="field-row" style="display: inline-block;">
                <input id="human_other" type="checkbox" name="human_role" value="other">
                <label for="human_other">other:</label>
              </div>
              <input id="human_other_text" type="text" name="human_role_other" style="width: 200px; padding: 3px; font-family: 'Courier New', monospace; color: #000; background: #fff; margin-left: 5px;" onfocus="document.getElementById('human_other').checked = true;">
            </div>
          </div>
          
          <!-- Question 4: Painting -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">4. painting is...</p>
            <div class="field-row">
              <input id="painting_artist" type="checkbox" name="painting_role" value="artist">
              <label for="painting_artist">an artist</label>
            </div>
            <div class="field-row">
              <input id="painting_medium" type="checkbox" name="painting_role" value="medium">
              <label for="painting_medium">a medium</label>
            </div>
            <div class="field-row">
              <input id="painting_system" type="checkbox" name="painting_role" value="system">
              <label for="painting_system">a system for generating images</label>
            </div>
            <div style="margin-top: 3px; margin-bottom: 3px;">
              <div class="field-row" style="display: inline-block;">
                <input id="painting_other" type="checkbox" name="painting_role" value="other">
                <label for="painting_other">other:</label>
              </div>
              <input id="painting_other_text" type="text" name="painting_role_other" style="width: 200px; padding: 3px; font-family: 'Courier New', monospace; color: #000; background: #fff; margin-left: 5px;" onfocus="document.getElementById('painting_other').checked = true;">
            </div>
          </div>
          
          <!-- Question 5: Obsolete -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">5. which systems are (or are <em>at risk of</em>) becoming obsolete? select all that apply.</p>
            <div class="field-row">
              <input id="obsolete_ai" type="checkbox" name="obsolete" value="AI">
              <label for="obsolete_ai">AI</label>
            </div>
            <div class="field-row">
              <input id="obsolete_camera" type="checkbox" name="obsolete" value="camera">
              <label for="obsolete_camera">camera</label>
            </div>
            <div class="field-row">
              <input id="obsolete_human" type="checkbox" name="obsolete" value="human">
              <label for="obsolete_human">human</label>
            </div>
            <div class="field-row">
              <input id="obsolete_painting" type="checkbox" name="obsolete" value="painting">
              <label for="obsolete_painting">painting</label>
            </div>
            <div style="margin-top: 3px; margin-bottom: 3px;">
              <div class="field-row" style="display: inline-block;">
                <input id="obsolete_other_checkbox" type="checkbox" name="obsolete" value="other">
                <label for="obsolete_other_checkbox">other:</label>
              </div>
              <input id="obsolete_other_text" type="text" name="obsolete_other" style="width: 250px; padding: 3px; font-family: 'Courier New', monospace; color: #000; background: #fff; margin-left: 5px;" onfocus="document.getElementById('obsolete_other_checkbox').checked = true;">
            </div>
          </div>
          
          <!-- Question 6: Free response -->
          <div style="margin: 15px 0;">
            <p style="margin: 5px 0; font-weight: bold;">6. you are invited to use this space to write a free-form response or elaboration on your responses:</p>
            <textarea id="free_response_text" name="free_response" rows="6" style="width: 100%; box-sizing: border-box; font-family: 'Courier New', monospace; padding: 5px; margin-top: 5px; color: #000; background: #fff; border: 1px solid #000;"></textarea>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <button type="submit" style="padding: 5px 20px;">submit</button>
            <div id="submitStatus" style="margin-top: 10px; font-weight: bold;"></div>
          </div>
        </form>
      </fieldset>
    </div>
  </div>
  
  <!-- Overlay for popup background -->
  <div id="popupOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; pointer-events: none;"></div>
`

const statusDiv = document.querySelector('#status');
const galleryDiv = document.querySelector('#gallery');
const descriptionBtn = document.querySelector('#descriptionBtn');
const descriptionPopup = document.querySelector('#descriptionPopup');
const closeDescriptionBtn = document.querySelector('#closeDescriptionBtn');
const questionnaireBtn = document.querySelector('#questionnaireBtn');
const questionnairePopup = document.querySelector('#questionnairePopup');
const closeQuestionnaireBtn = document.querySelector('#closeQuestionnaireBtn');
const popupOverlay = document.querySelector('#popupOverlay');
const questionnaireForm = document.querySelector('#questionnaireForm');
const submitStatus = document.querySelector('#submitStatus');

// Popup controls - Description
descriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'block';
  popupOverlay.style.display = 'block';
});

closeDescriptionBtn.addEventListener('click', () => {
  descriptionPopup.style.display = 'none';
  popupOverlay.style.display = 'none';
});

// Popup controls - Questionnaire
questionnaireBtn.addEventListener('click', () => {
  questionnairePopup.style.display = 'block';
  popupOverlay.style.display = 'block';
});

closeQuestionnaireBtn.addEventListener('click', () => {
  questionnairePopup.style.display = 'none';
  popupOverlay.style.display = 'none';
});

// Handle questionnaire form submission
questionnaireForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  submitStatus.textContent = 'Submitting...';
  submitStatus.style.color = '#000';
  
  const formData = new FormData(questionnaireForm);
  
  // Collect all checkbox values for each role question
  const aiRoles = formData.getAll('ai_role');
  const cameraRoles = formData.getAll('camera_role');
  const humanRoles = formData.getAll('human_role');
  const paintingRoles = formData.getAll('painting_role');
  const obsoleteSystems = formData.getAll('obsolete');
  
  const responseData = {
    ai_role: JSON.stringify(aiRoles),
    ai_role_other: formData.get('ai_role_other'),
    camera_role: JSON.stringify(cameraRoles),
    camera_role_other: formData.get('camera_role_other'),
    human_role: JSON.stringify(humanRoles),
    human_role_other: formData.get('human_role_other'),
    painting_role: JSON.stringify(paintingRoles),
    painting_role_other: formData.get('painting_role_other'),
    obsolete_systems: JSON.stringify(obsoleteSystems),
    obsolete_other: formData.get('obsolete_other'),
    free_response: formData.get('free_response')
  };
  
  try {
    const response = await fetch(`${SERVER_URL}/api/questionnaire-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(responseData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      submitStatus.textContent = 'Thank you for your response!';
      submitStatus.style.color = 'green';
      questionnaireForm.reset();
      
      // Close popup after 2 seconds
      setTimeout(() => {
        questionnairePopup.style.display = 'none';
        popupOverlay.style.display = 'none';
        submitStatus.textContent = '';
      }, 2000);
    } else {
      submitStatus.textContent = result.error || 'Error submitting response';
      submitStatus.style.color = 'red';
    }
  } catch (error) {
    console.error('Error submitting questionnaire:', error);
    submitStatus.textContent = 'Error connecting to server';
    submitStatus.style.color = 'red';
  }
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
