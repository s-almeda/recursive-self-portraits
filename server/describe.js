// Describe step with a runtime switch between local Ollama and Replicate.
// Two independent toggles in .env (change + restart the server to apply):
//   MAIN_DESCRIBER  = ollama | replicate   (installation pipeline; default ollama)
//   BOOTH_DESCRIBER = ollama | replicate   (public booth pipeline; default replicate)
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

// Route to Ollama or Replicate based on the given mode string.
async function describeByMode(imagePath, mode, tag) {
  if (mode === 'ollama') {
    console.log(`📝 [${tag}] describing with local Ollama`);
    return describeImage(imagePath);
  }
  console.log(`📝 [${tag}] describing with Replicate granite-vision`);
  return describeViaReplicate(imagePath);
}

// Installation pipeline — default local Ollama
export async function describeMain(imagePath) {
  return describeByMode(imagePath, (process.env.MAIN_DESCRIBER || 'ollama').toLowerCase(), 'main');
}

// Public booth pipeline — default cloud Replicate (no local Ollama needed)
export async function describeBooth(imagePath) {
  return describeByMode(imagePath, (process.env.BOOTH_DESCRIBER || 'replicate').toLowerCase(), 'booth');
}
