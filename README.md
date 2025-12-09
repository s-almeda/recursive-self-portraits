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

**Note:** Run `npm run build` whenever you make frontend changes that need to appear on ngrok URLs.
