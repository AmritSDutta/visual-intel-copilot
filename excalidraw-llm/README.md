# Inquisitive | Visual Intel — AI Diagram Generator 🎨⚡

An intelligent, interactive diagramming assistant built with **React 19**, **TypeScript**, **Vite**, and **@excalidraw/excalidraw** — powered by **Ollama** (local or cloud models like `gemma4:31b-cloud`) and the **Google Gemini API** (`gemini-3.1-flash-lite`). Describe a system in plain English and watch a full Excalidraw diagram render live on canvas.

> **In-app brand:** *Inquisitive — Visual Intelligence*

---

## 🌟 Key Features

### 1. 📐 70% / 30% Split Layout Workspace
- **Left Panel (70%)**: Full-featured Excalidraw editor canvas.
- **Right Panel (30%)**: Sleek dark-mode AI Chat UI for issuing diagram requests and managing settings.

### 2. 🦙 Ollama Integration (Cloud & Remote Models)
- Connects to the Ollama cloud host (`https://ollama.com`) or custom remote cloud/proxy endpoints with optional Bearer API key.
- Automatic routing through the built-in `/api/proxy` relay when direct browser calls are blocked by CORS/mixed-content policies.

### 3. ✨ Gemini Cloud API Integration (`@google/genai` SDK)
- Supports `gemini-3.1-flash-lite` (default) with automatic fallback through candidate models on failure.
- **Canvas-aware editing**: the current canvas is attached to the request as a PNG snapshot (`inlineData`), so Gemini can *edit and extend* an existing diagram — not just create new ones.

### 4. 🎙️ Voice Mode (`/voice`)
- A dedicated voice workspace route with **Gemini Live native audio** models (`gemini-2.5-flash-native-audio-preview-12-2025` and `gemini-3.1-flash-live-preview`) plus a **Web Speech API** fallback (speech recognition + speech synthesis).
- Live mic indicator, mute toggle, and audio signal visualization in the header.

### 5. 🔐 Supabase Authentication (Google OAuth)
- Mandatory sign-in via **Google OAuth** (Supabase Auth), with an auth landing screen and a configuration-missing fallback screen when env vars are absent.
- All cloud session data is **Row Level Security (RLS) isolated** per user.

### 6. 🗂️ Session History — Local & Cloud
- Every turn auto-saves to **IndexedDB** (`ExcalidrawAISessionsDB`, store `session_turns`, composite key `[session_id, turn_id]`) including a base64 PNG snapshot of the canvas.
- Signed-in users get the same history synced to **Supabase** (`user_sessions` + `session_turns` tables).
- History panel supports **restore-to-canvas** and **delete**.

### 7. 📄 PDF & 📷 PNG Export
- Export any session as a paginated **PDF report** (jsPDF) with prompts, canvas snapshots, and AI responses per turn.
- Export the current canvas as a **PNG** via Excalidraw's dynamically imported `exportToCanvas` / `exportToBlob`.

### 8. 📚 Advanced `.excalidrawlib` Library Catalog Indexer
- **Compact Catalog Indexer**: reads `public/my-custom-library.excalidrawlib` (73+ custom stencil items like servers, databases, cloud icons) into a lightweight `{ id, name }` JSON index (**only ~550 tokens overhead**) injected into the AI system prompt.
- **Element Hydrator**: clones matched library vector groups and offsets them to the requested `(x, y)` at render time — full vector definitions are never sent to the LLM.

### 9. 💬 2-Part Structured AI Response
- The AI returns a single JSON payload:
  1. `chatReply` (string): structured plain-text architectural explanation (300–500 words, markdown stripped) shown in the Chat UI bubble.
  2. `elements` (array): complete Excalidraw vector elements and library items rendered live on the canvas.

### 10. 🔗 Perimeter Edge-to-Edge Arrow Connections
- Automatically calculates shape bounding boxes and connects arrows from the **outer edge of Shape A to the outer edge of Shape B**, preventing lines from crossing inside text labels.
- Injects relative vector points `[[0,0], [dx,dy]]`, `strokeWidth: 2`, and triangle `endArrowhead`.

### 11. 🧠 Resilient JSON Repair
- `repairAndParseJson` tolerates truncated/loose LLM output: trailing commas, unescaped newlines in strings, unclosed braces/brackets, and strings cut off mid-quote.

### 12. 🧹 Scene Lifecycle & 🔒 AI-Only Canvas Mode
- Every prompt calls `excalidrawAPI.resetScene()` before rendering — each turn **replaces** the canvas rather than stacking shapes.
- `<Excalidraw viewModeEnabled={isCanvasFrozen} />` (defaulting to `true`) locks manual mouse drawing/editing to prevent accidental canvas clutter.
- Canvas navigation (pan & zoom) remains 100% active, while all diagram updates are exclusively driven by AI. Includes a lock toggle button in the header (`🔒` / `✏️`).

### 13. 🌗 Dark / Light Theme
- Toggle between themes from the header; persisted to `localStorage` (`APP_THEME`).

### 14. 📦 100% Self-Hosted Excalidraw Assets
- Configured `window.EXCALIDRAW_ASSET_PATH = "/"` with 230+ font and asset files self-hosted in `public/`, eliminating third-party CDN dependencies.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or later
- **Supabase project** (required for auth — free tier works): [supabase.com](https://supabase.com)
- **Ollama** (for local/offline AI): install from [ollama.com](https://ollama.com)
- **Gemini API key** (for Gemini or Voice mode): from [Google AI Studio](https://aistudio.google.com)

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/AmritSDutta/visual-intel-copilot.git
cd visual-intel-copilot/excalidraw-llm

# Install dependencies
npm install

# Create the required environment file (.env.local) — see Supabase Setup below

# Start the Vite development server
npm run dev
```

> ⚠️ The app **enforces Supabase configuration** — without the env vars you'll see the `ConfigMissingScreen` instead of the app.

### 3. Supabase Setup
1. Create a Supabase project, then run `supabase/schema.sql` (SQL editor) to create the `user_sessions` and `session_turns` tables with strict per-user RLS policies.
2. Enable the **Google** OAuth provider under *Authentication → Providers*.
3. Create `.env.local` in the `excalidraw-llm` directory:
   ```text
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
4. Restart the dev server.

### 4. Running with Ollama
The app connects to **Ollama Cloud (`https://ollama.com`)** by default. Calls to `https://ollama.com` are securely relayed through the `/api/proxy` backend (a Cloudflare Pages function in production, and a Vite dev middleware locally). Custom remote proxy/server URLs can also be configured in the in-app Settings (⚙️) panel.

---

## ⚙️ Configuration & Settings

### Environment Variables (`.env.local`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (**required**) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key (**required**) |

### In-App Settings Panel

Click the **⚙️** button in the header to configure:

| Setting | Storage key | Default |
|---|---|---|
| AI Provider | `AI_PROVIDER` | `ollama` (Canvas) / `gemini` (Voice) |
| Ollama Endpoint | `OLLAMA_ENDPOINT` | `https://ollama.com` |
| Ollama Model | `OLLAMA_MODEL` | `gemma4:31b-cloud` |
| Ollama API Key (optional) | `OLLAMA_API_KEY` | — |
| Gemini Model | `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| Gemini API Key | `GEMINI_API_KEY` | — |

> 🔒 All AI provider settings are stored in **`sessionStorage`** (cleared when the tab closes — never persisted or committed). Only the theme (`APP_THEME`) is stored in `localStorage`.

---

## 🏗️ Architecture

A prompt flows through a **5-stage pipeline** spanning `aiService.ts`, `libraryIndexer.ts`, `jsonRepair.ts`, and the workspace components:

1. **Contract** — `getSystemInstruction()` in `aiService.ts` builds the system prompt that forces the model to return a single JSON object with `chatReply` and `elements`, and injects the compact library catalog. **This prompt is the contract for both backends.**
2. **Backend call** — `generateDiagramWithOllama` (REST `POST {endpoint}/api/chat`, `format: 'json'`) or `generateDiagramFromPrompt` (Gemini SDK, `responseMimeType: 'application/json'`, `temperature: 0.2`). The Gemini path also attaches the current canvas as a PNG so the model can edit existing diagrams.
3. **Parse** — `extractJsonPayload` strips code fences; `repairAndParseJson` repairs truncated/loose LLM JSON.
4. **Hydrate** — `hydrateSkeletonsWithLibrary` resolves `libraryItem` references by cloning library vectors, and computes perimeter edge-to-edge arrow endpoints from shape bounds.
5. **Render** — `processResponseJson` runs `convertToExcalidrawElements(skeletons, { regenerateIds: false })`, then the workspace calls `resetScene()` + `updateScene({ elements, scrollToContent: true })`.

**Data flow:** AI settings → `sessionStorage` · theme → `localStorage` · session turns → **IndexedDB** (`ExcalidrawAISessionsDB`) locally, **Supabase** (`user_sessions` / `session_turns` with RLS) for signed-in users · sessions exportable to PDF.

---

## 📁 Project Structure

```
excalidraw-llm/
├── index.html                  # Sets window.EXCALIDRAW_ASSET_PATH = "/"
├── vite.config.ts              # React plugin + local /api/proxy middleware
├── supabase/
│   └── schema.sql              # Tables + RLS policies (run in Supabase SQL editor)
├── functions/
│   └── api/proxy.ts            # Cloudflare Pages function: CORS relay for Ollama
├── public/
│   ├── my-custom-library.excalidrawlib   # 73+ custom stencils
│   └── fonts/…                 # ~230 self-hosted Excalidraw assets
└── src/
    ├── App.tsx                 # Canvas workspace (70/30 split), routing, state
    ├── main.tsx                # Entry point
    ├── components/
    │   ├── AppHeader.tsx       # Brand, route pills, provider/status badges
    │   ├── AuthLandingView.tsx # Google OAuth sign-in screen
    │   ├── ConfigMissingScreen.tsx  # Missing .env fallback
    │   ├── UserMenu.tsx        # Account menu / sign-out
    │   └── VoiceWorkspace.tsx  # /voice route (mic + native audio)
    ├── context/
    │   └── AuthContext.tsx     # Supabase auth state
    ├── services/
    │   ├── aiService.ts        # System prompt contract + Ollama/Gemini backends
    │   ├── sessionDbService.ts # IndexedDB session persistence
    │   ├── supabaseDbService.ts# Cloud session persistence
    │   ├── supabaseClient.ts   # Supabase client factory
    │   ├── pdfExportService.ts # jsPDF session report export
    │   └── voiceService.ts     # Gemini Live audio + Web Speech fallback
    └── utils/
        ├── jsonRepair.ts       # Resilient LLM JSON parser
        └── libraryIndexer.ts   # Catalog builder + skeleton hydrator
```

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript (~6.0), Vite 8
- **Canvas Engine**: `@excalidraw/excalidraw` (v0.18)
- **AI Engines**: Ollama API (`gemma4:31b-cloud`), Google Gemini (`@google/genai`, `gemini-3.1-flash-lite` + Gemini Live native audio for Voice Mode), Web Speech API
- **Auth & Cloud**: Supabase (`@supabase/supabase-js`) — Google OAuth, RLS-isolated session storage
- **Export**: jsPDF (session PDF reports), Excalidraw `exportToCanvas` (PNG)
- **Styling**: Pure vanilla CSS with dark/light themes

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (includes local `/api/proxy` middleware) |
| `npm run build` | Type-check (`tsc -b`) then production build — type errors block the build |
| `npm run lint` | ESLint (flat config) |
| `npm run preview` | Preview the production build |

---

## 🛠️ WebMCP Tools & Real-World Examples

All workspaces (**Canvas Chat `/`**, **Voice Mode `/voice`**, and **Live Audio Studio `/agentic`**) have direct access to a unified suite of **WebMCP (Web Model Context Protocol)** tools registered on `navigator.modelContext` and available to Gemini, Ollama, and Subagents.

---

### 1. 🕒 `get_current_ist_date` (System Date & Time)
Returns the current date and time in Indian Standard Time (IST).

* **Example 1 — Direct Chat Query:**
  * **User Prompt:** *"What is the current time and date in IST right now?"*
  * **Tool Execution:** `get_current_ist_date({})`
  * **Result:** `{ "ist": "Thursday, September 3, 2026 at 2:45:00 PM GMT+5:30" }`
* **Example 2 — Diagram Timestamping:**
  * **User Prompt:** *"Generate a Kubernetes cluster diagram and append a text note with the current timestamp."*
  * **Model Action:** Calls `get_current_ist_date()`, then places a formatted timestamp node onto the canvas.

---

### 2. 🗺️ `inspect_canvas_topology` (Canvas Perception & ASCII Graph)
Extracts structured node coordinates, dimensions, connector bindings, and an ASCII dependency graph from the active canvas scene.

* **Example 1 — Architectural Review:**
  * **User Prompt:** *"Analyze the diagram on screen and explain what data flow paths exist."*
  * **Tool Execution:** `inspect_canvas_topology({})`
  * **Result:**
    ```json
    {
      "status": "success",
      "summary": "3 nodes, 2 connectors on canvas.",
      "topologyGraph": "1. [Client SPA] --[1. POST /login]--> [API Gateway]\n2. [API Gateway] --[2. Query User]--> [PostgreSQL DB]"
    }
    ```
* **Example 2 — Pre-modification Inspection:**
  * **User Prompt:** *"Do we have single points of failure in this current architecture?"*
  * **Model Action:** Inspects the topology graph to identify nodes with a single ingress/egress.

---

### 3. 🔍 `find_canvas_nodes` (Targeted Component Search)
Searches for specific nodes, services, databases, or components across the canvas by keyword, name, or role.

* **Example 1 — Component Lookup:**
  * **User Prompt:** *"Where is the Redis cache located in this diagram?"*
  * **Tool Execution:** `find_canvas_nodes({ "query": "redis" })`
  * **Result:**
    ```json
    {
      "query": "redis",
      "matchCount": 1,
      "nodes": [{ "id": "redis_node_1", "label": "Redis Cache", "x": 650, "y": 200, "type": "rectangle" }]
    }
    ```
* **Example 2 — Role Search:**
  * **User Prompt:** *"Find all databases on the canvas."*
  * **Tool Execution:** `find_canvas_nodes({ "query": "database" })`

---

### 4. ✏️ `modify_canvas_node` (Targeted In-Place Modification)
Updates a specific node's label text, border `strokeColor`, or fill `backgroundColor` **in-place without clearing or re-drawing other elements**.

* **Example 1 — Rename Component:**
  * **User Prompt:** *"Rename the 'API Gateway' box to 'Kong Gateway V2'."*
  * **Tool Execution:**
    ```json
    modify_canvas_node({
      "nodeId": "api_gateway",
      "newLabel": "Kong Gateway V2"
    })
    ```
  * **Outcome:** Only the targeted Gateway box is renamed; all connectors, database shapes, and coordinates remain intact.
* **Example 2 — Highlight / Change Colors:**
  * **User Prompt:** *"Make the Payment Service box green to indicate it's active."*
  * **Tool Execution:**
    ```json
    modify_canvas_node({
      "nodeId": "payment_service",
      "backgroundColor": "#064e3b",
      "strokeColor": "#10b981"
    })
    ```

---

### 5. ➕ `append_canvas_elements` (Incremental Vector Injection)
Appends new shapes, library stencils, or connector arrows into the active scene **without removing or overwriting existing elements**.

* **Example 1 — Add Cache & Connector Beside Existing Gateway:**
  * **User Prompt:** *"Add a Redis cache box beside the API Gateway and connect them with an arrow."*
  * **Tool Execution:**
    ```json
    append_canvas_elements({
      "elements": [
        {
          "id": "redis_cache",
          "type": "rectangle",
          "x": 650,
          "y": 200,
          "width": 150,
          "height": 70,
          "label": { "text": "Redis Cache" },
          "backgroundColor": "#7c2d12",
          "strokeColor": "#f97316"
        },
        {
          "type": "arrow",
          "start": { "id": "api_gateway" },
          "end": { "id": "redis_cache" },
          "label": { "text": "Cache Lookup" },
          "strokeColor": "#9ca3af"
        }
      ]
    })
    ```
* **Example 2 — Add Ingress Layer:**
  * **User Prompt:** *"Put a Cloudflare CDN in front of the Client."*
  * **Model Action:** Injects the CDN node and updates the client arrow binding without redrawing the backend.

---

### 6. 🗑️ `clear_canvas` (Canvas Reset)
Resets and clears all vector elements and text from the active scene.

* **Example 1 — Start Fresh Request:**
  * **User Prompt:** *"Wipe the canvas, let's draw an Event-Driven Kafka pipeline from scratch."*
  * **Tool Execution:** `clear_canvas({})`
  * **Outcome:** Canvas returns to blank state ready for a new architecture.
* **Example 2 — Voice Mode Reset:**
  * **User Voice Command:** *"Clear the screen."*
  * **Model Action:** Executes `clear_canvas()` during live voice stream.

---

### 7. 📷 `get_canvas_visual_snapshot` (Multimodal Visual Capture)
Captures a high-resolution base64 PNG screenshot of the canvas for multimodal image analysis.

* **Example 1 — Layout Symmetry Inspection:**
  * **User Prompt:** *"Look at the canvas. Are the arrows aligned cleanly without overlapping text?"*
  * **Tool Execution:** `get_canvas_visual_snapshot({})`
  * **Result:** Returns base64 image data payload for visual model inspection.
* **Example 2 — Live Audio Studio Spatial Reasoning:**
  * **Live Agent Action:** Automatically captures visual snapshot mid-conversation to verify spatial node distribution before answering user voice questions.

---

### 8. 💬 `read_chat_messages` (Chat & Notes Perception)
Reads recent user specifications, notes, and previous architectural requirements from the active chat stream.

* **Example 1 — Technical Constraints Summarization:**
  * **User Prompt:** *"Summarize all the database requirements we discussed earlier."*
  * **Tool Execution:** `read_chat_messages({ "limit": 10 })`
  * **Result:**
    ```json
    {
      "status": "success",
      "totalMessages": 6,
      "recentUserNotes": [
        "We need high-throughput writes for telemetry data.",
        "Must use PostgreSQL with read replicas."
      ]
    }
    ```
* **Example 2 — Live Studio Agent Hand-off:**
  * **Live Agent Action:** Reads notes typed in the chat panel before generating or modifying the canvas.

---

## 📜 License

MIT License. Built for seamless AI-driven diagramming!

