import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'rsp.db');

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS camera_images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    camera_id TEXT,
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    frame_rate INTEGER,
    status TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS text_descriptions (
    id TEXT PRIMARY KEY,
    camera_image_id TEXT NOT NULL,
    description TEXT NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (camera_image_id) REFERENCES camera_images(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generated_images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    text_description_id TEXT NOT NULL,
    prompt TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (text_description_id) REFERENCES text_descriptions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id TEXT PRIMARY KEY,
    ai_role TEXT,
    ai_role_other TEXT,
    camera_role TEXT,
    camera_role_other TEXT,
    human_role TEXT,
    human_role_other TEXT,
    painting_role TEXT,
    painting_role_other TEXT,
    obsolete_systems TEXT,
    obsolete_other TEXT,
    free_response TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
  );
`);

// Migration: Add status column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(camera_images)").all();
  const hasStatusColumn = tableInfo.some(col => col.name === 'status');
  
  if (!hasStatusColumn) {
    console.log('Adding status column to camera_images table...');
    db.exec(`ALTER TABLE camera_images ADD COLUMN status TEXT DEFAULT 'pending'`);
    console.log('Status column added successfully');
  }
} catch (error) {
  console.error('Migration error:', error);
}

// Helper function to generate prefixed IDs
function generateId(prefix) {
  const randomHex = randomBytes(4).toString('hex');
  return `${prefix}_${randomHex}`;
}

// Camera Images
export function insertCameraImage(filename, cameraId, frameRate) {
  const id = generateId('cam');
  const stmt = db.prepare(`
    INSERT INTO camera_images (id, filename, camera_id, frame_rate)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, filename, cameraId, frameRate);
  return id;
}

export function getLatestCameraImage() {
  const stmt = db.prepare(`
    SELECT * FROM camera_images 
    ORDER BY captured_at DESC 
    LIMIT 1
  `);
  return stmt.get();
}

export function getAllCameraImages() {
  const stmt = db.prepare(`
    SELECT * FROM camera_images 
    ORDER BY captured_at DESC
  `);
  return stmt.all();
}

export function getCameraImageById(id) {
  const stmt = db.prepare('SELECT * FROM camera_images WHERE id = ?');
  return stmt.get(id);
}

// Text Descriptions
export function insertTextDescription(cameraImageId, description) {
  const id = generateId('desc');
  const stmt = db.prepare(`
    INSERT INTO text_descriptions (id, camera_image_id, description)
    VALUES (?, ?, ?)
  `);
  stmt.run(id, cameraImageId, description);
  return id;
}

export function getDescriptionByCameraImageId(cameraImageId) {
  const stmt = db.prepare(`
    SELECT * FROM text_descriptions 
    WHERE camera_image_id = ?
  `);
  return stmt.get(cameraImageId);
}

// Generated Images
export function insertGeneratedImage(filename, textDescriptionId, prompt) {
  const id = generateId('gen');
  const stmt = db.prepare(`
    INSERT INTO generated_images (id, filename, text_description_id, prompt)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, filename, textDescriptionId, prompt);
  return id;
}

export function getGeneratedImageById(id) {
  const stmt = db.prepare('SELECT * FROM generated_images WHERE id = ?');
  return stmt.get(id);
}

export function getAllGeneratedImages() {
  const stmt = db.prepare(`
    SELECT * FROM generated_images 
    ORDER BY generated_at ASC
  `);
  return stmt.all();
}

// Full pipeline query
export function getFullPipeline(generatedImageId) {
  const stmt = db.prepare(`
    SELECT 
      gi.id as gen_id,
      gi.filename as gen_filename,
      gi.generated_at as gen_timestamp,
      td.id as desc_id,
      td.description,
      td.generated_at as desc_timestamp,
      ci.id as cam_id,
      ci.filename as cam_filename,
      ci.captured_at as cam_timestamp,
      ci.camera_id,
      ci.frame_rate
    FROM generated_images gi
    JOIN text_descriptions td ON gi.text_description_id = td.id
    JOIN camera_images ci ON td.camera_image_id = ci.id
    WHERE gi.id = ?
  `);
  return stmt.get(generatedImageId);
}

// Clear all data
export function clearAllData() {
  db.exec(`
    DELETE FROM generated_images;
    DELETE FROM text_descriptions;
    DELETE FROM camera_images;
  `);
}

// Get pending camera images (not yet described)
export function getPendingCameraImages() {
  const stmt = db.prepare(`
    SELECT * FROM camera_images 
    WHERE status = 'pending' 
    ORDER BY captured_at DESC
  `);
  return stmt.all();
}

// Update camera image status
export function updateCameraImageStatus(id, status) {
  const stmt = db.prepare(`
    UPDATE camera_images 
    SET status = ? 
    WHERE id = ?
  `);
  stmt.run(status, id);
}

// Delete all undescribed images except the specified one
export function deleteUndescribedImagesExcept(keepImageId) {
  const stmt = db.prepare(`
    DELETE FROM camera_images 
    WHERE status = 'pending' 
    AND id != ?
  `);
  const result = stmt.run(keepImageId);
  return result.changes;
}

// Questionnaire Responses
export function insertQuestionnaireResponse(data) {
  const id = generateId('qr');
  const stmt = db.prepare(`
    INSERT INTO questionnaire_responses (
      id, ai_role, ai_role_other, camera_role, camera_role_other,
      human_role, human_role_other, painting_role, painting_role_other,
      obsolete_systems, obsolete_other, free_response, ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.ai_role,
    data.ai_role_other,
    data.camera_role,
    data.camera_role_other,
    data.human_role,
    data.human_role_other,
    data.painting_role,
    data.painting_role_other,
    data.obsolete_systems,
    data.obsolete_other,
    data.free_response,
    data.ip_address
  );
  return id;
}

export function getAllQuestionnaireResponses() {
  const stmt = db.prepare(`
    SELECT * FROM questionnaire_responses 
    ORDER BY submitted_at DESC
  `);
  return stmt.all();
}

export function getRecentResponsesByIP(ipAddress, minutesAgo = 5) {
  const stmt = db.prepare(`
    SELECT * FROM questionnaire_responses 
    WHERE ip_address = ? 
    AND submitted_at > datetime('now', '-' || ? || ' minutes')
  `);
  return stmt.all(ipAddress, minutesAgo);
}

export default db;
