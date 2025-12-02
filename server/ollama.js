import ollama from 'ollama';
import fs from 'fs';
import path from 'path';

const MODEL = 'granite3.2-vision';

/**
 * Describe an image using Ollama vision model
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<string>} - Description text
 */
export async function describeImage(imagePath) {
  try {
    // Read image file as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Call Ollama with vision model
    const response = await ollama.chat({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: 'Describe what you see in this image in detail. Focus on the main subjects, actions, setting, and any notable details.',
          images: [base64Image]
        }
      ],
    });
    
    return response.message.content;
  } catch (error) {
    console.error('Error describing image with Ollama:', error);
    throw error;
  }
}

/**
 * Check if Ollama is available
 * @returns {Promise<boolean>}
 */
export async function checkOllamaAvailable() {
  try {
    await ollama.list();
    return true;
  } catch (error) {
    console.error('Ollama not available:', error.message);
    return false;
  }
}

/**
 * Check if the vision model is downloaded
 * @returns {Promise<boolean>}
 */
export async function checkModelAvailable() {
  try {
    const models = await ollama.list();
    return models.models.some(m => m.name.includes(MODEL));
  } catch (error) {
    console.error('Error checking model availability:', error);
    return false;
  }
}
