import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  insertCameraImage,
  getLatestCameraImage,
  getAllCameraImages,
  getCameraImageById,
  insertTextDescription,
  getDescriptionByCameraImageId,
  insertGeneratedImage,
  getGeneratedImageById,
  getAllGeneratedImages,
  getFullPipeline,
  clearAllData,
  getPendingCameraImages,
  updateCameraImageStatus,
  deleteUndescribedImagesExcept,
  insertQuestionnaireResponse,
  getAllQuestionnaireResponses,
  getRecentResponsesByIP
} from './db.js';
import { describeImage } from './ollama.js';
import * as boothDb from './booth-db.js';
import Replicate from 'replicate';

const replicate = new Replicate(); // reads REPLICATE_API_TOKEN from env

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from Vite build and captures folder
app.use(express.static(path.join(__dirname, '../dist')));
app.use('/captures', express.static(path.join(__dirname, '../public/captures')));
// Booth (public photobooth) captures are served separately from installation captures
app.use('/booth-captures', express.static(path.join(__dirname, '../public/booth-captures')));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const capturesDir = path.join(__dirname, '../public/captures');
    if (!fs.existsSync(capturesDir)) {
      fs.mkdirSync(capturesDir, { recursive: true });
    }
    cb(null, capturesDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `capture_${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

// Booth uploads land in a separate directory so public photobooth captures
// never mix with the installation's public/captures.
const boothStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const boothDir = path.join(__dirname, '../public/booth-captures');
    if (!fs.existsSync(boothDir)) {
      fs.mkdirSync(boothDir, { recursive: true });
    }
    cb(null, boothDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `capture_${timestamp}${ext}`);
  }
});

const boothUpload = multer({ storage: boothStorage });

// Booth realtime channel — isolated Socket.IO namespace so booth pages and
// installation pages don't receive each other's events.
const boothIo = io.of('/booth');

// API Routes

// Upload camera image
app.post('/api/camera-images', upload.single('image'), (req, res) => {
  try {
    const { cameraId, frameRate } = req.body;
    const filename = req.file.filename;
    
    const imageId = insertCameraImage(filename, cameraId, parseInt(frameRate));
    const image = getCameraImageById(imageId);
    
    // Emit new frame event to all connected clients
    io.emit('new-frame', {
      id: image.id,
      filename: image.filename,
      timestamp: image.captured_at,
      cameraId: image.camera_id,
      frameRate: image.frame_rate
    });
    
    res.json({ success: true, image });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest camera image
app.get('/api/camera-images/latest', (req, res) => {
  try {
    const image = getLatestCameraImage();
    res.json({ success: true, image });
  } catch (error) {
    console.error('Error getting latest image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all camera images
app.get('/api/camera-images', (req, res) => {
  try {
    const images = getAllCameraImages();
    res.json({ success: true, images });
  } catch (error) {
    console.error('Error getting images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific camera image
app.get('/api/camera-images/:id', (req, res) => {
  try {
    const image = getCameraImageById(req.params.id);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    res.json({ success: true, image });
  } catch (error) {
    console.error('Error getting image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create text description
app.post('/api/text-descriptions', (req, res) => {
  try {
    const { cameraImageId, description } = req.body;
    const descId = insertTextDescription(cameraImageId, description);
    const desc = getDescriptionByCameraImageId(cameraImageId);
    res.json({ success: true, description: desc });
  } catch (error) {
    console.error('Error creating description:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get description by camera image ID
app.get('/api/text-descriptions/:cameraImageId', (req, res) => {
  try {
    const desc = getDescriptionByCameraImageId(req.params.cameraImageId);
    res.json({ success: true, description: desc });
  } catch (error) {
    console.error('Error getting description:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create generated image
app.post('/api/generated-images', upload.single('image'), (req, res) => {
  try {
    const { textDescriptionId, prompt } = req.body;
    const filename = req.file.filename;
    
    const genId = insertGeneratedImage(filename, textDescriptionId, prompt);
    const genImage = getGeneratedImageById(genId);
    
    // Broadcast to all clients (especially history page)
    io.emit('generation-complete', {
      generatedImageId: genImage.id,
      filename: genImage.filename,
      description: prompt,
      timestamp: genImage.generated_at
    });
    
    res.json({ success: true, generatedImage: genImage });
  } catch (error) {
    console.error('Error creating generated image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all generated images
app.get('/api/generated-images', (req, res) => {
  try {
    const images = getAllGeneratedImages();
    res.json({ success: true, images });
  } catch (error) {
    console.error('Error getting generated images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current state (latest of everything)
app.get('/api/current-state', (req, res) => {
  try {
    const latestCapture = getLatestCameraImage();
    const latestDescription = latestCapture ? getDescriptionByCameraImageId(latestCapture.id) : null;
    const allGenerated = getAllGeneratedImages();
    const latestGeneration = allGenerated.length > 0 ? allGenerated[allGenerated.length - 1] : null;
    
    res.json({
      success: true,
      state: {
        latestCapture,
        latestDescription,
        latestGeneration
      }
    });
  } catch (error) {
    console.error('Error getting current state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper to ensure minimum time has passed
async function waitForMinimumTime(startTime, minimumMs) {
  const elapsed = Date.now() - startTime;
  const remaining = minimumMs - elapsed;
  if (remaining > 0) {
    console.log(`⏳ Waiting ${remaining}ms to reach minimum ${minimumMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, remaining));
  }
}

// Start full pipeline (capture → describe → generate)
app.post('/api/start-pipeline', upload.single('image'), async (req, res) => {
  try {
    const { cameraId } = req.body;
    const filename = req.file.filename;
    
    console.log('🚀 Starting pipeline for:', filename);
    
    // Step 1: Save camera image
    const imageId = insertCameraImage(filename, cameraId, 0);
    const image = getCameraImageById(imageId);
    const imagePath = path.join(__dirname, '../public/captures', filename);
    
    io.emit('state-updated', {
      type: 'capture',
      latestCapture: image
    });
    
    // Step 2: Generate description with Ollama (minimum 5 seconds)
    console.log('📝 Generating description...');
    const descriptionStartTime = Date.now();
    const description = await describeImage(imagePath);
    const descId = insertTextDescription(imageId, description);
    const descRecord = getDescriptionByCameraImageId(imageId);
    
    // Wait for minimum 10 seconds before broadcasting description
    await waitForMinimumTime(descriptionStartTime, 10000);
    
    io.emit('state-updated', {
      type: 'description',
      latestDescription: descRecord
    });
    
    // Step 3: Generate image with Replicate FLUX schnell (minimum 5 seconds)
    console.log('🎨 Generating image...');
    const generationStartTime = Date.now();
    const output = await replicate.run('black-forest-labs/flux-schnell', {
      input: { prompt: description },
    });

    // output is an array of FileOutput objects; grab the first image as a Buffer
    const imageBlob = await output[0].blob();
    const genFilename = `generated_${Date.now()}.webp`;
    const genPath = path.join(__dirname, '../public/captures', genFilename);

    // Save generated image to filesystem
    fs.writeFileSync(genPath, Buffer.from(await imageBlob.arrayBuffer()));
    
    // Save to database
    const genId = insertGeneratedImage(genFilename, descId, description);
    const genImage = getGeneratedImageById(genId);
    
    // Wait for minimum 5 seconds before broadcasting generation
    await waitForMinimumTime(generationStartTime, 5000);
    
    io.emit('state-updated', {
      type: 'generation',
      latestGeneration: genImage
    });
    
    // Also emit for history page
    io.emit('generation-complete', {
      generatedImageId: genImage.id,
      filename: genImage.filename,
      description: description,
      timestamp: genImage.generated_at
    });
    
    console.log('✅ Pipeline complete');
    
    res.json({
      success: true,
      result: {
        capture: image,
        description: descRecord,
        generation: genImage
      }
    });
  } catch (error) {
    console.error('❌ Pipeline error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// Get full pipeline for generated image
app.get('/api/pipeline/:generatedImageId', (req, res) => {
  try {
    const pipeline = getFullPipeline(req.params.generatedImageId);
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline not found' });
    }
    res.json({ success: true, pipeline });
  } catch (error) {
    console.error('Error getting pipeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all data (database and files)
app.delete('/api/clear-all', (req, res) => {
  try {
    // Clear database
    clearAllData();
    
    // Clear all capture files (includes both camera captures and generated images)
    const capturesDir = path.join(__dirname, '../public/captures');
    if (fs.existsSync(capturesDir)) {
      const files = fs.readdirSync(capturesDir);
      files.forEach(file => {
        const filePath = path.join(capturesDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    // Notify all clients
    io.emit('data-cleared');
    
    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete undescribed images except specified one
app.post('/api/cleanup-undescribed/:keepImageId', (req, res) => {
  try {
    const { keepImageId } = req.params;
    const deletedCount = deleteUndescribedImagesExcept(keepImageId);
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Error cleaning up undescribed images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit questionnaire response
app.post('/api/questionnaire-response', (req, res) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Rate limiting: check if IP has submitted in last 5 seconds
    const recentResponses = getRecentResponsesByIP(ipAddress, 5 / 60); // 5 seconds in minutes
    if (recentResponses.length > 0) {
      return res.status(429).json({ 
        success: false, 
        error: 'Please wait a few seconds before submitting another response.' 
      });
    }
    
    const responseData = {
      ai_role: req.body.ai_role || null,
      ai_role_other: req.body.ai_role_other || null,
      camera_role: req.body.camera_role || null,
      camera_role_other: req.body.camera_role_other || null,
      human_role: req.body.human_role || null,
      human_role_other: req.body.human_role_other || null,
      painting_role: req.body.painting_role || null,
      painting_role_other: req.body.painting_role_other || null,
      obsolete_systems: req.body.obsolete_systems || null, // JSON string of array
      obsolete_other: req.body.obsolete_other || null,
      free_response: req.body.free_response || null,
      ip_address: ipAddress
    };
    
    const responseId = insertQuestionnaireResponse(responseData);
    
    console.log('📝 New questionnaire response submitted:', responseId);
    
    res.json({ 
      success: true, 
      message: 'Thank you for your response!',
      responseId 
    });
  } catch (error) {
    console.error('Error saving questionnaire response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all questionnaire responses (optional - for viewing submissions)
app.get('/api/questionnaire-responses', (req, res) => {
  try {
    const responses = getAllQuestionnaireResponses();
    res.json({ success: true, responses });
  } catch (error) {
    console.error('Error getting questionnaire responses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for root route
// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Serve itt.html for /itt route
app.get('/itt', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/itt.html'));
});

// Serve tti.html for /tti route
app.get('/tti', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/tti.html'));
});

// Serve history.html for /history route
app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/history.html'));
});

// ============================================================================
// BOOTH ("shm-is-not-present" public photobooth) — isolated pipeline.
// Mirrors the installation routes above but uses boothDb, public/booth-captures,
// and the /booth Socket.IO namespace. Reuses describeImage + replicate.
// ============================================================================

// Start booth pipeline (capture → describe → generate), triggered by spacebar
app.post('/api/booth/start-pipeline', boothUpload.single('image'), async (req, res) => {
  try {
    const { cameraId } = req.body;
    const filename = req.file.filename;

    console.log('🎪 Starting BOOTH pipeline for:', filename);

    // Step 1: Save camera image
    const imageId = boothDb.insertCameraImage(filename, cameraId, 0);
    const image = boothDb.getCameraImageById(imageId);
    const imagePath = path.join(__dirname, '../public/booth-captures', filename);

    boothIo.emit('state-updated', {
      type: 'capture',
      latestCapture: image
    });

    // Step 2: Generate description with Ollama (minimum 10 seconds)
    console.log('📝 [booth] Generating description...');
    const descriptionStartTime = Date.now();
    const description = await describeImage(imagePath);
    const descId = boothDb.insertTextDescription(imageId, description);
    const descRecord = boothDb.getDescriptionByCameraImageId(imageId);

    await waitForMinimumTime(descriptionStartTime, 10000);

    boothIo.emit('state-updated', {
      type: 'description',
      latestDescription: descRecord
    });

    // Step 3: Generate image with Replicate FLUX schnell (minimum 5 seconds)
    console.log('🎨 [booth] Generating image...');
    const generationStartTime = Date.now();
    const output = await replicate.run('black-forest-labs/flux-schnell', {
      input: { prompt: description },
    });

    const imageBlob = await output[0].blob();
    const genFilename = `generated_${Date.now()}.webp`;
    const genPath = path.join(__dirname, '../public/booth-captures', genFilename);

    fs.writeFileSync(genPath, Buffer.from(await imageBlob.arrayBuffer()));

    const genId = boothDb.insertGeneratedImage(genFilename, descId, description);
    const genImage = boothDb.getGeneratedImageById(genId);

    await waitForMinimumTime(generationStartTime, 5000);

    boothIo.emit('state-updated', {
      type: 'generation',
      latestGeneration: genImage
    });

    boothIo.emit('generation-complete', {
      generatedImageId: genImage.id,
      filename: genImage.filename,
      description: description,
      timestamp: genImage.generated_at
    });

    console.log('✅ [booth] Pipeline complete');

    res.json({
      success: true,
      result: { capture: image, description: descRecord, generation: genImage }
    });
  } catch (error) {
    console.error('❌ [booth] Pipeline error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Booth current state (latest of everything) — for Monitor 2 initial load
app.get('/api/booth/current-state', (req, res) => {
  try {
    const latestCapture = boothDb.getLatestCameraImage();
    const latestDescription = latestCapture ? boothDb.getDescriptionByCameraImageId(latestCapture.id) : null;
    const allGenerated = boothDb.getAllGeneratedImages();
    const latestGeneration = allGenerated.length > 0 ? allGenerated[allGenerated.length - 1] : null;

    res.json({
      success: true,
      state: { latestCapture, latestDescription, latestGeneration }
    });
  } catch (error) {
    console.error('Error getting booth state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Booth generated images — for the gallery load
app.get('/api/booth/generated-images', (req, res) => {
  try {
    const images = boothDb.getAllGeneratedImages();
    res.json({ success: true, images });
  } catch (error) {
    console.error('Error getting booth generated images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Booth full pipeline — for gallery flip-to-capture
app.get('/api/booth/pipeline/:generatedImageId', (req, res) => {
  try {
    const pipeline = boothDb.getFullPipeline(req.params.generatedImageId);
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline not found' });
    }
    res.json({ success: true, pipeline });
  } catch (error) {
    console.error('Error getting booth pipeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete one booth capture (files + db chain). Lets participants remove
// captures they don't want saved.
app.delete('/api/booth/generated-images/:id', (req, res) => {
  try {
    const pipeline = boothDb.getFullPipeline(req.params.id);
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Capture not found' });
    }

    // Remove the generated image and the webcam capture files
    for (const fname of [pipeline.gen_filename, pipeline.cam_filename]) {
      if (!fname) continue;
      const p = path.join(__dirname, '../public/booth-captures', fname);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Remove the db rows (cascade from the camera image)
    boothDb.deleteCameraImage(pipeline.cam_id);

    // Tell every booth gallery client to drop the card
    boothIo.emit('capture-deleted', { generatedImageId: req.params.id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting booth capture:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve booth pages (production / dist) for clean URLs
app.get('/booth', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/booth.html'));
});
app.get('/booth-tti', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/booth-tti.html'));
});
app.get('/booth-gallery', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/booth-gallery.html'));
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Booth namespace connection logging
boothIo.on('connection', (socket) => {
  console.log('Booth client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Booth client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Main page: http://localhost:${PORT}/`);
  console.log(`ITT page: http://localhost:${PORT}/itt`);
  console.log(`TTI page: http://localhost:${PORT}/tti`);
  console.log(`History page: http://localhost:${PORT}/history`);
  console.log(`Booth (capture): http://localhost:${PORT}/booth`);
  console.log(`Booth (tti): http://localhost:${PORT}/booth-tti`);
  console.log(`Booth (gallery): http://localhost:${PORT}/booth-gallery`);
});
