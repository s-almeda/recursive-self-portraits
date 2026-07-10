// Booth describe step with a runtime switch between local Ollama and Replicate.
// Set BOOTH_DESCRIBER=ollama or BOOTH_DESCRIBER=replicate in .env, then restart
// the server. Defaults to 'replicate' so the booth needs no local Ollama.
import fs from 'fs';
import Replicate from 'replicate';
import { describeImage, PORTRAIT_PROMPT } from './ollama.js';

const replicate = new Replicate(); // reads REPLICATE_API_TOKEN from env

// IBM Granite vision on Replicate — same model family as the local granite3.2-vision.
const REPLICATE_VISION_MODEL = 'ibm-granite/granite-vision-3.3-2b';

async function describeViaReplicate(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const dataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`;

  let out = '';
  for await (const event of replicate.stream(REPLICATE_VISION_MODEL, {
    input: { images: [dataUri], prompt: PORTRAIT_PROMPT }
  })) {
    out += `${event}`;
  }
  return out.trim();
}

// Route the booth's describe step based on BOOTH_DESCRIBER (default: replicate)
export async function describeBooth(imagePath) {
  const mode = (process.env.BOOTH_DESCRIBER || 'replicate').toLowerCase();
  if (mode === 'ollama') {
    console.log('📝 [booth] describing with local Ollama');
    return describeImage(imagePath);
  }
  console.log('📝 [booth] describing with Replicate granite-vision');
  return describeViaReplicate(imagePath);
}
