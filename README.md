# Inquisitive - Visual 🎨 | Audio⚡ Visual 🎨 system design , analysis ⚡

An intelligent, interactive diagramming assistant built with **React 19**, **TypeScript**, **Vite**, and **@excalidraw/excalidraw** — powered by the **Google Gemini API** (`gemini-3.5-flash-lite`) and **Ollama** (cloud models like `gemma4:31b-cloud`). A **tool-calling orchestrator agent** plans and drives a live Excalidraw canvas through **WebMCP (Model Context Protocol) tools** — describe a system in plain English (type it or say it) and watch the diagram render in real time.

> **In-app brand:** *Inquisitive — Visual Intelligence*

---

## 🌟 Key Features

### 1. 📐 70% / 30% Split Layout Workspace
- **Left Panel (70%)**: Full-featured Excalidraw editor canvas (`ExcalidrawCanvas.tsx`).
- **Right Panel (30%)**: Sleek dark-mode AI Chat UI (`ChatPanel.tsx`) for issuing diagram requests and managing settings.

### 2. Agentic Orchestration with WebMCP Tool Calling
- A **Canvas Orchestrator Agent** (`runCanvasOrchestratorAgent`) plans over **9 WebMCP tools** registered on `navigator.modelContext` / `window.modelContext` and executes them against the live canvas via an `ActiveCanvasBridge` (`useMainWorkspace` → `webMcpService`).
- **Gemini track**: native function-calling loop (up to 5 turns). **Ollama track**: native `tools` calling over the `/api/proxy` relay.
- Conceptual/architectural questions are answered directly in the chat; draw/modify requests are routed to the right tool automatically.

### 3. Ollama Integration (Cloud & Remote Proxies)
- Connects to the Ollama cloud host (`https://ollama.com`) or custom remote cloud/proxy endpoints with optional Bearer API key.
- Automatic routing through the built-in `/api/proxy` relay when direct browser calls are blocked by CORS/mixed-content policies.
- Model presets from the centralized registry: `gemma4:31b-cloud` (default), `gpt-oss:120b`, `nemotron-3-super`.

### 4. ✨ Gemini Cloud API Integration (`@google/genai` SDK)
- **Centralized model registry** (`config/aiModelsConfig.ts`): a single `TASK_MODEL_REGISTRY` maps every AI task (Canvas orchestrator, Canvas diagram engine, Voice live agent, Ollama chat) to a primary model, fallback chain, temperature, and token budget.
- `gemini-3.5-flash-lite` (primary) with automatic fallback to `gemini-3.1-flash-lite` on failure.
- A dedicated **Canvas Diagram Engine subagent** produces the structured vector payload; prompts live as editable `.md` templates in `src/aiServices/prompt/` (inlined at build time).

### 5. 🎙️ Voice Agent (`/voice`)
- A dedicated voice workspace route driven by **Gemini Live native audio** (`gemini-2.5-flash-native-audio-preview-12-2025` primary, `gemini-3.1-flash-live-preview` fallback) with the **same 9 WebMCP tools available mid-conversation** — say *"add a Redis cache"* and watch the canvas update while you talk.
- **Web Speech API** fallback (speech recognition + speech synthesis) when Live models are unavailable, plus studio voice selection.
- Live mic indicator, mute toggle, and audio signal visualization in the header.

### 6. 🔐 Encrypted API Key Vault (AES-GCM-256)
- Gemini/Ollama API keys are **encrypted at rest** in `localStorage` using the Web Cryptography API (`utils/cryptoStorage.ts`) with a **non-extractable AES-GCM-256 master key** persisted in IndexedDB (`ExcalidrawSecureVault`) — raw key bytes can't be lifted even via XSS.
- Ciphertext carries a `__ENC__:v1:` prefix; corrupt/un-decryptable ciphertext is purged and never surfaced to the UI or state.

### 7. 🔐 Supabase Authentication (Google OAuth)
- Mandatory sign-in via **Google OAuth** (Supabase Auth), with an auth landing screen and a configuration-missing fallback screen when env vars are absent.
- Cloud session data is **Row Level Security (RLS) isolated** per user.

### 8. 🗂️ Session History — Local-First, Cloud Fallback
- Every turn auto-saves to **IndexedDB** (`ExcalidrawAISessionsDB`, store `session_turns`, composite key `[session_id, turn_id]`) including a base64 PNG snapshot of the canvas.
- History, **restore-to-canvas**, PDF export, and delete flows all read **local IndexedDB first**, falling back to **Supabase** (`user_sessions` + `session_turns` with RLS) only when local is empty and you're signed in.

### 9. 📄 PDF & 📷 PNG Export
- Export any session as a paginated **PDF report** (jsPDF) with prompts, canvas snapshots, and AI responses per turn.
- Export the current canvas as a **PNG** via Excalidraw's dynamically imported `exportToCanvas` / `exportToBlob`.

### 10. 📚 Advanced `.excalidrawlib` Library Catalog Indexer
- **Compact Catalog Indexer**: reads `public/my-custom-library.excalidrawlib` (73+ custom stencil items like servers, databases, cloud icons) into a lightweight `{ id, name }` JSON index (**only ~550 tokens overhead**) injected into the AI system prompt.
- **Element Hydrator**: clones matched library vector groups and offsets them to the requested `(x, y)` at render time — full vector definitions are never sent to the LLM.

### 11. 💬 2-Part Structured AI Response
- The diagram engine returns a single JSON payload:
  1. `chatReply` (string): structured plain-text architectural explanation (markdown stripped) shown in the Chat UI bubble.
  2. `elements` (array): complete Excalidraw vector elements and library items rendered live on the canvas.

### 12. 🔗 Perimeter Edge-to-Edge Arrow Connections
- Automatically calculates shape bounding boxes and connects arrows from the **outer edge of Shape A to the outer edge of Shape B**, preventing lines from crossing inside text labels.
- Injects relative vector points `[[0,0], [dx,dy]]`, `strokeWidth: 2`, and triangle `endArrowhead`.

### 13. 🧠 Resilient JSON Repair
- `repairAndParseJson` tolerates truncated/loose LLM output: trailing commas, unescaped newlines in strings, unclosed braces/brackets, and strings cut off mid-quote.

### 14. 🧹 Scene Lifecycle & 🔒 AI-Only Canvas Mode
- Diagram turns replace the canvas scene via `updateScene` with `commitToHistory` + `scrollToContent`; incremental tool actions (`append_canvas_elements`, `modify_canvas_node`) mutate the live scene without wiping it. New sessions reset the scene with `resetScene()`.
- `<Excalidraw viewModeEnabled={isCanvasFrozen} />` (defaulting to `true`) locks manual mouse drawing/editing to prevent accidental canvas clutter.
- Canvas navigation (pan & zoom) remains 100% active, while all diagram updates are exclusively driven by AI. Includes a lock toggle button in the header (`🔒` / `✏️`).

### 15. 🌗 Dark / Light Theme
- Toggle between themes from the header; persisted to `localStorage` (`APP_THEME`).

### 16. 📦 100% Self-Hosted Excalidraw Assets
- Configured `window.EXCALIDRAW_ASSET_PATH = "/"` with 230+ font and asset files self-hosted in `public/`, eliminating third-party CDN dependencies.

### 17. 📡 Terminal Stdio Logging
- Browser-side logs, AI tool executions, and errors are streamed to your **dev terminal** through the `/api/log` Vite middleware (color-coded levels) and mirrored in production by the `functions/api/log.ts` Cloudflare Pages function.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or later
- **Supabase project** (required for auth — free tier works): [supabase.com](https://supabase.com)
- **Gemini API key** (for Gemini canvas mode + the Voice agent): from [Google AI Studio](https://aistudio.google.com)
- **Ollama cloud account** (optional, for Ollama models like `gemma4:31b-cloud`): [ollama.com](https://ollama.com)

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

   # Optional AI key fallbacks (in-app keys take priority)
   VITE_GEMINI_API_KEY=your-gemini-api-key
   VITE_OLLAMA_API_KEY=your-ollama-api-key
   ```
4. Restart the dev server.

### 4. Running with Ollama
The app connects to **Ollama Cloud (`https://ollama.com`)** by default. Calls to `https://ollama.com` are securely relayed through the `/api/proxy` backend (a Cloudflare Pages function in production, and a Vite dev middleware locally). Custom remote proxy/server URLs can also be configured in the in-app Settings (⚙️) panel. Switch providers (Ollama ⇄ Gemini) from the Settings panel at any time.

---

## ⚙️ Configuration & Settings

### Environment Variables (`.env.local`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (**required**) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key (**required**) |
| `VITE_GEMINI_API_KEY` | Optional Gemini key fallback (in-app key takes priority) |
| `VITE_OLLAMA_API_KEY` | Optional Ollama key fallback (in-app key takes priority) |

### In-App Settings Panel

Click the **⚙️** button in the header to configure:

| Setting | Storage key | Default |
|---|---|---|
| AI Provider | `AI_PROVIDER` | `ollama` |
| Ollama Endpoint | `OLLAMA_ENDPOINT` | `https://ollama.com` |
| Ollama Model | `OLLAMA_MODEL` | `gemma4:31b-cloud` |
| Ollama API Key (optional) | `OLLAMA_API_KEY` | — (encrypted) |
| Gemini Model | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| Gemini API Key | `GEMINI_API_KEY` | — (encrypted) |

> 🔒 **Key hygiene**: provider/model settings mirror to `sessionStorage` (fast session reads) and `localStorage` (persistence). API keys are **never stored in plaintext at rest** — they are AES-GCM-256 encrypted in `localStorage` (see Feature 6) and only kept as plaintext in in-memory `sessionStorage` for the current tab. Only the theme (`APP_THEME`) is stored in `localStorage` unencrypted.

### AI Task Model Registry (`src/config/aiModelsConfig.ts`)

A single source of truth maps every AI task to its primary model, fallback chain, temperature, and token budget:

| Task | Primary model | Fallback | Temp | Max tokens |
|---|---|---|---|---|
| `CANVAS_MAIN_AGENT` (orchestrator) | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | 0.2 | 8192 |
| `CANVAS_DIAGRAM_ENGINE` (subagent) | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | 0.2 | 8192 |
| `VOICE_LIVE_AGENT` | `gemini-2.5-flash-native-audio-preview-12-2025` | `gemini-3.1-flash-live-preview` | 0.3 | 4096 |
| `OLLAMA_CHAT` | `gemma4:31b-cloud` | — | 0.2 | 8192 |

---

## 🏗️ Architecture

A prompt flows through an **agentic tool-calling pipeline** spanning `aiService.ts`, `webMcpService.ts`, `libraryIndexer.ts`, and `jsonRepair.ts`:

1. **Orchestrate** — `runCanvasOrchestratorAgent()` in `aiService.ts` sends the recent conversation + current query with all **9 WebMCP tools as function declarations** to the `CANVAS_MAIN_AGENT` model. Gemini uses native function calling; Ollama uses native `tools` calling (relayed through `/api/proxy` when remote) — both loop for up to **5 tool turns**. Conceptual questions are answered directly without touching the canvas.
2. **Execute tools** — tool calls execute against the live scene through the `ActiveCanvasBridge` registered by `useMainWorkspace.ts` (`getElements` / `setElements` / `generateDiagram` / `getSnapshotBase64` / `getChatMessages`). `generate_diagram_and_explanation` delegates to the **Canvas Diagram Engine subagent** (`CANVAS_DIAGRAM_ENGINE` task).
3. **Contract** — `getSystemInstruction()` (from the editable `src/aiServices/prompt/*.md` templates, with `{{PLACEHOLDER}}` tokens filled at runtime) builds the system prompt that forces the diagram engine to return a single JSON object with `chatReply` and `elements`, and injects the compact library catalog. **This prompt is the contract for both backends.**
4. **Parse** — `extractJsonPayload` strips code fences; `repairAndParseJson` repairs truncated/loose LLM JSON.
5. **Hydrate** — `hydrateSkeletonsWithLibrary` resolves `libraryItem` references by cloning library vectors, and computes perimeter edge-to-edge arrow endpoints from shape bounds.
6. **Render** — `processResponseJson` runs `convertToExcalidrawElements(skeletons, { regenerateIds: false })`, then the bridge calls `updateScene({ elements, scrollToContent: true, commitToHistory: true })`.

**Voice flow:** `VoiceWorkspace.tsx` → `voiceService.ts` opens a persistent **Gemini Live** native-audio session with the same 9 tools as function declarations; the voice agent calls tools mid-conversation against the same canvas bridge, with a **Web Speech API** fallback when Live models are unavailable.

**Data flow:** AI settings → `sessionStorage` + `localStorage` (API keys **AES-GCM-256 encrypted**) · theme → `localStorage` · session turns → **IndexedDB** (`ExcalidrawAISessionsDB`) locally first, **Supabase** (`user_sessions` / `session_turns` with RLS) as signed-in fallback · browser logs → `/api/log` → terminal stdio · sessions exportable to PDF.

---

## 📁 Project Structure

```
excalidraw-llm/
├── index.html                  # Sets window.EXCALIDRAW_ASSET_PATH = "/"
├── vite.config.ts              # React plugin + local /api/proxy + /api/log middlewares
├── supabase/
│   └── schema.sql              # Tables + RLS policies (run in Supabase SQL editor)
├── functions/
│   └── api/
│       ├── proxy.ts            # Cloudflare Pages function: CORS relay for Ollama
│       └── log.ts              # Cloudflare Pages function: stdio log sink
├── public/
│   ├── my-custom-library.excalidrawlib   # 73+ custom stencils
│   └── fonts/…                 # ~230 self-hosted Excalidraw assets
└── src/
    ├── App.tsx                 # Routing (/ and /voice), auth gates, workspace composition
    ├── main.tsx                # Entry point
    ├── components/
    │   ├── AppHeader.tsx       # Brand, route pills, provider/status badges
    │   ├── AuthLandingView.tsx # Google OAuth sign-in screen
    │   ├── ChatPanel.tsx       # Right 30% chat UI
    │   ├── ConfigMissingScreen.tsx  # Missing .env fallback
    │   ├── DeleteConfirmModal.tsx   # Session delete confirmation
    │   ├── ExcalidrawCanvas.tsx     # Left 70% canvas (view-mode lock aware)
    │   ├── HistoryModal.tsx         # Session history / restore / export
    │   ├── SettingsModal.tsx        # Provider cards + model dropdowns
    │   ├── UserMenu.tsx             # Account menu / sign-out
    │   └── VoiceWorkspace.tsx       # /voice route (mic + native audio)
    ├── config/
    │   └── aiModelsConfig.ts   # TASK_MODEL_REGISTRY + UI model presets (single source of truth)
    ├── context/
    │   └── AuthContext.tsx     # Supabase auth state
    ├── hooks/
    │   ├── useMainWorkspace.ts # Send flow, canvas bridge, export, theme, lock
    │   ├── useSessionHistory.ts# Local-first history, restore/delete/PDF
    │   └── useSettings.ts      # Provider settings + encrypted key hydration
    ├── aiServices/
    │   ├── prompts.ts          # Loads .md templates, fills {{PLACEHOLDER}} tokens
    │   ├── parse.ts            # extractJsonPayload
    │   ├── audioUtils.ts       # Live-audio helpers
    │   ├── types.ts            # Shared AI service types
    │   └── prompt/
    │       ├── geminiFullDiagram.md  # 2-part JSON contract (chatReply + elements)
    │       ├── liveAgent.md          # Voice live agent persona
    │       ├── groqTextOnly.md       # Text-only explanation template
    │       └── mistralDiagramOnly.md # Diagram-only template
    ├── services/
    │   ├── aiService.ts        # Orchestrator agent + diagram engines (Gemini/Ollama)
    │   ├── webMcpService.ts    # 9 WebMCP tools + ActiveCanvasBridge + topology extraction
    │   ├── voiceService.ts     # Gemini Live audio + Web Speech fallback + live tool calling
    │   ├── sessionDbService.ts # IndexedDB session persistence
    │   ├── supabaseDbService.ts# Cloud session persistence (RLS)
    │   ├── supabaseClient.ts   # Supabase client factory
    │   └── pdfExportService.ts # jsPDF session report export
    ├── types/
    │   └── chat.ts             # Message types
    └── utils/
        ├── cryptoStorage.ts    # AES-GCM-256 encrypted localStorage vault
        ├── jsonRepair.ts       # Resilient LLM JSON parser
        ├── libraryIndexer.ts   # Catalog builder + skeleton hydrator + normalizers
        └── stdioLogger.ts      # Browser → /api/log stdio logger
```

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript (~6.0), Vite 8
- **Canvas Engine**: `@excalidraw/excalidraw` (v0.18)
- **AI Engines**: Google Gemini (`@google/genai` — `gemini-3.5-flash-lite` + Gemini Live native audio for the Voice agent), Ollama API (`gemma4:31b-cloud`), Web Speech API
- **Tooling Protocol**: WebMCP — 9 tools registered on `navigator.modelContext`, callable from Gemini function calling, Ollama tool calling, and any WebMCP-compatible client
- **Auth & Cloud**: Supabase (`@supabase/supabase-js`) — Google OAuth, RLS-isolated session storage
- **Security**: Web Cryptography API (AES-GCM-256, non-extractable keys) for the API key vault
- **Export**: jsPDF (session PDF reports), Excalidraw `exportToCanvas` (PNG)
- **Styling**: Pure vanilla CSS with dark/light themes

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (includes local `/api/proxy` + `/api/log` middleware) |
| `npm run build` | Type-check (`tsc -b`) then production build — type errors block the build |
| `npm run lint` | ESLint (flat config) |
| `npm run preview` | Preview the production build |

---

## 🛠️ WebMCP Tools & Real-World Examples

Both workspaces (**Canvas Chat `/`** and **Voice Agent `/voice`**) share a unified suite of **9 WebMCP (Web Model Context Protocol) tools** registered on `navigator.modelContext` / `window.modelContext` and exposed to Gemini (function calling), Ollama (tool calling), and any WebMCP-compatible agent. The Canvas orchestrator decides which tool to call; the Voice agent calls the same tools mid-conversation.

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
* **Example 2 — Voice Agent Reset:**
  * **User Voice Command:** *"Clear the screen."*
  * **Model Action:** Executes `clear_canvas()` during live voice stream.

---

### 7. 📷 `get_canvas_visual_snapshot` (Multimodal Visual Capture)
Captures a high-resolution base64 PNG screenshot of the canvas for multimodal image analysis.

* **Example 1 — Layout Symmetry Inspection:**
  * **User Prompt:** *"Look at the canvas. Are the arrows aligned cleanly without overlapping text?"*
  * **Tool Execution:** `get_canvas_visual_snapshot({})`
  * **Result:** Returns base64 image data payload for visual model inspection.
* **Example 2 — Voice Agent Spatial Reasoning:**
  * **Voice Agent Action:** Automatically captures visual snapshot mid-conversation to verify spatial node distribution before answering user voice questions.

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
* **Example 2 — Voice Agent Hand-off:**
  * **Voice Agent Action:** Reads notes from the chat panel before generating or modifying the canvas.

---

### 9. 🎨 `generate_diagram_and_explanation` (Full Diagram Synthesis)
The orchestrator's main entry-point tool: delegates to the **Canvas Diagram Engine** subagent to synthesize a complete architecture diagram on the canvas and produce a structured technical breakdown.

* **Example 1 — Full System Design:**
  * **User Prompt:** *"Draw an event-driven payment system with Kafka, Redis, and PostgreSQL."*
  * **Tool Execution:** `generate_diagram_and_explanation({ "prompt": "Event-driven payment system with Kafka, Redis, and PostgreSQL..." })`
  * **Outcome:** The subagent renders the full multi-tier diagram (producers, topics, consumers, stores) and the orchestrator posts the architectural explanation in the chat bubble.
* **Example 2 — Voice-Triggered Generation:**
  * **User Voice Command:** *"Draw a Kubernetes cluster with an ingress and three worker nodes."*
  * **Model Action:** The Voice agent calls the tool mid-stream; the canvas updates live while the explanation is spoken back.

---

## 🛠️ Build & Manual Testing Guide

### 1. Build & Run
```bash
# Navigate to application folder
cd excalidraw-llm

# Install dependencies
npm install

# Run TypeScript compilation and production build
npm run build

# Start local development server
npm run dev

# Or test the production build locally
npm run preview
```

### 2. Manual Test Validation Workflow
* **Canvas Mode (`/`)**:
  1. Open **Settings (⚙️)** in the header. Select your AI provider (**Gemini** or **Ollama Cloud**), enter a temporary API key, and select a model preset.
  2. Enter a system architecture prompt in the Chat panel (e.g., *"Draw an event-driven payment processing system with Kafka, Redis, and PostgreSQL"*).
  3. Verify that the AI orchestrator executes tool calling (`generate_diagram_and_explanation`), streams the chat reply, and renders vector elements on the canvas.
  4. Test the **Canvas Lock toggle (`🔒` / `✏️`)** to verify AI-only view-mode versus manual editing.
  5. Test **Export PDF** and verify the paginated document includes prompts and canvas snapshots.
  6. Open **History** to test turn restoration and turn deletion.
* **Voice Mode (`/voice`)**:
  1. Navigate to `/voice`.
  2. Click the microphone button and grant mic permissions.
  3. Speak a command (e.g., *"Draw a Kubernetes cluster with an ingress and three worker pods"*).
  4. Verify the bidirectional audio stream: the agent speaks back while the canvas updates live.

---

## 🛡️ Security & Local-First Privacy Features

* **🏠 100% Client-Side Privacy (Local-First Storage)**:
  - For the hackathon evaluation, cloud database persistence is turned off so all validator session history, canvas states, and turn snapshots **stay 100% local to your browser in IndexedDB (`ExcalidrawAISessionsDB`)**.
  - No validator diagrams or session data are stored on external shared databases.
* **🔐 Client-Side AES-GCM-256 Encryption**:
  - API keys (`GEMINI_API_KEY`, `OLLAMA_API_KEY`) are encrypted in `localStorage` using the Web Crypto API (`AES-GCM-256`).
  - Master encryption keys are stored non-extractably in browser IndexedDB (`ExcalidrawSecureVault`).
* **🔒 Strict Transport Security (HSTS) & Security Headers**:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` enforces 1-year HTTPS across all routes.
  - Comprehensive `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
* **🛡️ SSRF & Open-Relay Protection**:
  - Edge function proxy (`/api/proxy`) enforces a strict hostname allowlist (`ollama.com`, `generativelanguage.googleapis.com`) and restricts header forwarding to `Authorization`.

---

## 🌐 WebMCP Tools Testing & Credentials Matrix

Validators and evaluators can inspect and execute the **9 WebMCP tools** directly via the browser console (`document.modelContext.listTools()`):

| # | Tool Name | Requires API Key? | Scope / Behavior |
|---|---|:---:|---|
| 0 | `get_current_ist_date` | ❌ **No** | Reads system Indian Standard Time (IST) clock |
| 1 | `inspect_canvas_topology` | ❌ **No** | Reads active nodes, shapes, connectors, and protocols from Excalidraw |
| 2 | `find_canvas_nodes` | ❌ **No** | Searches for components by name or role (`"redis"`, `"database"`) |
| 3 | `get_canvas_visual_snapshot` | ❌ **No** | Captures high-resolution base64 PNG for vision analysis |
| 4 | `read_chat_messages` | ❌ **No** | Reads user notes & recent requirements from chat history |
| 5 | `modify_canvas_node` | ❌ **No** | Targeted in-place node rename and color update without redrawing |
| 6 | `append_canvas_elements` | ❌ **No** | Injects new shapes and connector arrows into the active scene |
| 7 | `clear_canvas` | ❌ **No** | Resets and clears the canvas scene |
| 8 | `generate_diagram_and_explanation` | 🔑 **Yes (Gemini / Ollama)** | Delegates to AI diagram engine subagent to synthesize new architecture from prompt |

### Quick Console Test Example (Zero Credentials)
```javascript
// Test injecting a vector box directly onto the canvas with zero credentials:
const appendTool = document.modelContext.listTools().find(t => t.name === 'append_canvas_elements');
await appendTool.execute({
  elements: [{
    type: "rectangle",
    x: 300,
    y: 200,
    width: 180,
    height: 80,
    label: { text: "WebMCP Gateway" },
    backgroundColor: "#1e3a8a",
    strokeColor: "#3b82f6"
  }]
});
```

---

## ⚠️ Important Advisory for Evaluators & Testers

> [!WARNING]
> **Use Temporary Credentials**: When testing the application with external providers (Google Gemini or Ollama Cloud):
> 1. Always generate a **temporary / restricted test API key**.
> 2. Avoid using production API keys with sensitive billing or project access.
> 3. After completing testing and validation, immediately **delete / revoke** the key from your provider dashboard (e.g. [Google AI Studio](https://aistudio.google.com/app/apikey)).

---

## 📜 License

MIT License. Built for seamless AI-driven diagramming!

