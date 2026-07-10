# Recursive Self-Portrait System

## Setup Instructions

### 1. Start Ollama
```bash
ollama serve
```

### 2. Build the Frontend
```bash
npm run build
```

### 3. Start the Backend Server
```bash
npm run server:dev -- --host
```
Note the network IP address (e.g., `http://192.168.4.24:3000`)

### 4. Start the Development Frontend
```bash
npm run dev -- --host
```
Visit `http://localhost:5173/` for the main control center. Note the network IP address (e.g., `http://192.168.4.24:5173`) for other devices on your local network.

### 5. Set Up ngrok for Public Access
```bash
ngrok http 3000
```
Copy the forwarding URL (e.g., `https://a69608dc5502.ngrok-free.app`)

### 6. Access Display Pages

**Public (via ngrok):**
- Gallery: `https://[your-ngrok-url].ngrok-free.app/history`
- ITT: `https://[your-ngrok-url].ngrok-free.app/itt`
- TTI: `https://[your-ngrok-url].ngrok-free.app/tti`

**Local Network:**
- Use the IP address from step 4: `http://192.168.x.x:5173/history` (or `/itt`, `/tti`)

---

## Public Photobooth ("shm-is-not-present" version)

An unattended, single-computer variant. The public presses **spacebar** to trigger one
capture → describe → generate cycle. It runs on the **same server** as the main system but is
fully isolated: its own database (`server/booth.db`), its own captures folder
(`public/booth-captures/`), its own `/api/booth/*` routes, and its own `/booth` socket channel.
The main installation (`/itt`, `/tti`, `/history`, `rsp.db`) is untouched.

### Run it (three browser windows, one server)

1. **Ollama running** with the vision model:
   ```bash
   ollama serve
   ollama pull granite3.2-vision   # first time only
   ```
2. **Replicate token** in `.env` (already set): `REPLICATE_API_TOKEN=...`

   **Describe step is switchable** via `.env`:
   ```
   BOOTH_DESCRIBER=replicate   # cloud granite-vision — no local Ollama needed (default)
   BOOTH_DESCRIBER=ollama      # local Ollama (needs `ollama serve` + granite3.2-vision)
   ```
   If it's slow at the venue, flip to `replicate` (or vice-versa) and restart the server.
   With `replicate` you do **not** need Ollama running at all.
3. **Start the backend** (loads `.env`, creates `booth.db` on first run):
   ```bash
   npm run server
   ```
4. **Start the frontend** (separate terminal):
   ```bash
   npm run dev
   ```
5. **Open the three pages** (dev = Vite on :5173):
   - Monitor 1 — booth capture: `http://localhost:5173/booth.html`
   - Monitor 2 — generated image: `http://localhost:5173/booth-tti.html`
   - Laptop — public gallery: `http://localhost:5173/booth-gallery.html`

   (On the built/ngrok server at :3000 the clean URLs `/booth`, `/booth-tti`, `/booth-gallery` also work.)

### Operating the booth
- On **/booth**, pick your camera and click **Start** — the picker hides and the live view goes
  full-frame with "press spacebar to let the system take a picture."
- Press **spacebar**: the view freezes to the capture ("CAPTURE TAKEN…"), the center bar reads
  "…describing…", then the description appears and it switches to "…painting…".
- **Monitor 2** shows the description, then the generated image.
- The booth waits for the generated image, then auto-resets to live after ~5s for the next person.
- Spacebar is ignored while a cycle is in progress (one person at a time).

---

**Note:** Run `npm run build` whenever you make frontend changes that need to appear on ngrok URLs
(this includes the new `/booth*` pages).
