# Excalidraw AI Copilot 🎨⚡

An intelligent, interactive diagramming assistant built with **React**, **Vite**, **TypeScript**, **@excalidraw/excalidraw**, and powered by **Local Ollama (`gemma4:31b-cloud`)** and **Gemini Cloud API (`gemini-3.1-flash-lite`)**.

---

## 🌟 Key Features

### 1. 📐 70% / 30% Split Layout Workspace
- **Left Panel (70%)**: Full-featured Excalidraw editor canvas.
- **Right Panel (30%)**: Sleek dark-mode AI Chat UI for issuing diagram requests and managing settings.

### 2. 🦙 100% Local Offline AI (Ollama Integration)
- Connects directly to local Ollama running on `http://localhost:11434` with model `gemma4:31b-cloud`.
- **Zero data leak**: Generate system architecture and flow diagrams completely offline.

### 3. ✨ Gemini Cloud API Integration (`@google/genai` SDK)
- Connected to Google's official `@google/genai` SDK.
- Supports **`gemini-3.1-flash-lite`** (default) or custom Gemini models with your API key.

### 4. 📚 Advanced `.excalidrawlib` Library Catalog Indexer
- **Compact Catalog Indexer**: Reads `public/my-custom-library.excalidrawlib` (73+ custom stencil items like servers, databases, cloud icons) and parses a lightweight JSON index (**only ~550 tokens overhead**).
- **Element Hydrator**: Dynamically clones and positions vector library groups at requested `(x, y)` coordinates.

### 5. 💬 2-Part Structured AI Response
- The AI returns a 2-part JSON payload:
  1. `chatReply` (string): Concise summary (< 200 words) displayed inside the Chat UI bubble answering your request.
  2. `elements` (array): Complete Excalidraw vector elements and library items rendered live on the canvas.

### 6. 🔗 Perimeter Edge-to-Edge Arrow Connections
- Automatically calculates shape bounding boxes and connects arrows from the **outer edge of Shape A to the outer edge of Shape B**, preventing lines from crossing inside text labels.
- Injects relative vector points `[[0,0], [dx,dy]]`, `strokeWidth: 2`, and triangle `endArrowhead`.

### 7. 🧹 Automatic Scene Reset
- Invokes `excalidrawAPI.resetScene()` before rendering every new AI diagram, keeping the canvas clean and preventing shape stacking.

### 8. 🔒 AI-Only Frozen Canvas Mode
- `<Excalidraw viewModeEnabled={isCanvasFrozen} />` (defaulting to `true`) locks manual mouse drawing/editing to prevent accidental canvas clutter.
- Canvas navigation (pan & zoom) remains 100% active, while all diagram updates are exclusively driven by AI. Includes a lock toggle button in the header (`🔒 AI Canvas (Frozen)` / `✏️ Unlocked`).

### 9. 📦 100% Self-Hosted Excalidraw Assets
- Configured `window.EXCALIDRAW_ASSET_PATH = "/"` with 230+ font and asset files self-hosted in `public/`, eliminating third-party CDN dependencies.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or later
- **Ollama** (optional, for local offline AI): Install from [ollama.com](https://ollama.com)

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/your-repo/excalidraw-llm.git
cd excalidraw-llm

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### 3. Running Local Ollama (Recommended)
To enable browser requests to local Ollama from deployed web origins (such as `https://inquisitive.amritai.org`), configure `OLLAMA_ORIGINS`. For official details, see the [Ollama Web Origins FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).

#### Quick Test (PowerShell Session)
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve

# Pull the model (in a separate terminal)
ollama pull gemma4:31b-cloud
```

#### Permanent Windows Environment Variable Setup
1. Press `Win + R`, type `sysdm.cpl`, and press **Enter**.
2. Select the **Advanced** tab and click **Environment Variables...**.
3. Under **User variables**, find and select `OLLAMA_ORIGINS` (or click **New...** if it doesn't exist).
4. Set the value to:
   ```text
   http://localhost:*,https://inquisitive.amritai.org
   ```
5. Click **OK** on all dialog boxes.
6. Right-click the Ollama icon in your system tray (bottom-right taskbar) and select **Quit**.
7. Relaunch Ollama from your Start menu.

---

## ⚙️ Configuration & Settings

Click the **⚙️ Settings** button in the top-right chat panel to configure:
1. **AI Provider**: Switch between `🦙 Ollama (Local)`, `✨ Gemini (Cloud)`, and `🎙️ Gemini Live Audio`.
2. **Ollama Endpoint**: Defaults to `http://localhost:11434`.
3. **Model Name**: Set model to `gemma4:31b-cloud`, `gemini-2.5-flash`, etc.
4. **Gemini API Key**: Input your Google Gemini API Key for Cloud or Live Audio modes.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Canvas Engine**: `@excalidraw/excalidraw`
- **AI Engines**: Ollama API (`gemma4:31b-cloud`), Google Gemini REST API (`gemini-2.5-flash`), Web Speech API (VAD & Audio Synthesis)
- **Styling**: Pure Vanilla CSS with sleek dark theme

---

## 📜 License

MIT License. Built for seamless AI-driven diagramming!
