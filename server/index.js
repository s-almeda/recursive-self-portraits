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
  deleteUndescribedImagesExcept
} from './db.js';
import { describeImage } from './ollama.js';

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
    
    // Step 3: Generate image with Reagent API (minimum 5 seconds)
    console.log('🎨 Generating image...');
    const generationStartTime = Date.now();
    const imageGenResponse = await fetch(
      'https://noggin.rea.gent/willing-raccoon-7030',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer rg_v1_jj5u5a2wpjk8iog49161uxx0stpepagsa9c3_ngk',
        },
        body: JSON.stringify({ prompt: description }),
      }
    );
    
    const imageBlob = await imageGenResponse.arrayBuffer();
    const genFilename = `generated_${Date.now()}.webp`;
    const genPath = path.join(__dirname, '../public/captures', genFilename);
    
    // Save generated image to filesystem
    fs.writeFileSync(genPath, Buffer.from(imageBlob));
    
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

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Main page: http://localhost:${PORT}/`);
  console.log(`ITT page: http://localhost:${PORT}/itt`);
  console.log(`TTI page: http://localhost:${PORT}/tti`);
  console.log(`History page: http://localhost:${PORT}/history`);
});
