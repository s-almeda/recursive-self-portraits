import path from 'path';
import { fileURLToPath } from 'url';
import {
  getPendingCameraImages,
  updateCameraImageStatus,
  insertTextDescription,
  getCameraImageById
} from './db.js';
import { describeImage, checkOllamaAvailable } from './ollama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let isProcessing = false;
let io = null;

/**
 * Initialize the worker with Socket.io instance
 * @param {Server} socketIo - Socket.io server instance
 */
export function initWorker(socketIo) {
  io = socketIo;
  console.log('Description worker initialized');
}

/**
 * Process a single image: describe it and save to DB
 * @param {object} image - Camera image record from DB
 */
async function processImage(image) {
  const imagePath = path.join(__dirname, '../public/captures', image.filename);
  
  try {
    console.log(`Processing image: ${image.id}`);
    
    // Update status to 'processing'
    updateCameraImageStatus(image.id, 'processing');
    
    // Emit status update
    if (io) {
      io.emit('description-status', {
        imageId: image.id,
        status: 'seeing',
        message: 'Analyzing image...'
      });
    }
    
    // Call Ollama to describe the image
    const description = await describeImage(imagePath);
    
    console.log(`Description generated for ${image.id}: ${description.substring(0, 100)}...`);
    
    // Emit describing status
    if (io) {
      io.emit('description-status', {
        imageId: image.id,
        status: 'describing',
        message: 'Generating description...'
      });
    }
    
    // Save description to database
    const descId = insertTextDescription(image.id, description);
    
    // Update status to 'described'
    updateCameraImageStatus(image.id, 'described');
    
    // Emit completion with description
    if (io) {
      io.emit('description-complete', {
        imageId: image.id,
        descriptionId: descId,
        description: description,
        status: 'described'
      });
      
      // Also emit for TTI page to start generation
      io.emit('description-ready', {
        descriptionId: descId,
        cameraImageId: image.id,
        description: description
      });
    }
    
    console.log(`Successfully processed image: ${image.id}`);
    
  } catch (error) {
    console.error(`Error processing image ${image.id}:`, error);
    
    // Update status to 'error'
    updateCameraImageStatus(image.id, 'error');
    
    if (io) {
      io.emit('description-status', {
        imageId: image.id,
        status: 'error',
        message: error.message
      });
    }
  }
}

/**
 * Process all pending images in the queue
 */
export async function processQueue() {
  if (isProcessing) {
    console.log('Already processing, skipping...');
    return;
  }
  
  // Check if Ollama is available
  const ollamaAvailable = await checkOllamaAvailable();
  if (!ollamaAvailable) {
    console.log('Ollama not available, skipping queue processing');
    return;
  }
  
  isProcessing = true;
  
  try {
    const pendingImages = getPendingCameraImages();
    
    if (pendingImages.length === 0) {
      console.log('No pending images to process');
      isProcessing = false;
      return;
    }
    
    console.log(`Found ${pendingImages.length} pending image(s) to process`);
    
    // Process one at a time to avoid overwhelming Ollama
    for (const image of pendingImages) {
      await processImage(image);
    }
    
  } catch (error) {
    console.error('Error in processQueue:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the worker loop (checks for new images every 5 seconds)
 */
export function startWorker() {
  console.log('Starting description worker...');
  
  // Process immediately
  processQueue();
  
  // Then check every 5 seconds
  setInterval(() => {
    processQueue();
  }, 5000);
}
