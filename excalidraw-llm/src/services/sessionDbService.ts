// IndexedDB session_turns persistence service with composite key [session_id, turn_id]

export interface SessionTurnRecord {
  session_id: string;
  turn_id: string;
  user_prompt: string;
  chat_reply: string;
  image_blob: string; // Base64 PNG snapshot data URL
  created_at: string;
}

export interface SessionSummary {
  session_id: string;
  first_prompt: string;
  turn_count: number;
  created_at: string;
  latest_created_at: string;
}

const DB_NAME = 'ExcalidrawAISessionsDB';
const DB_VERSION = 1;
const STORE_NAME = 'session_turns';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Composite Primary Key: [session_id, turn_id]
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['session_id', 'turn_id'] });
        store.createIndex('session_id', 'session_id', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionTurn(record: SessionTurnRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      console.log(`[INDEXEDDB] 💾 Saved turn locally: session=${record.session_id}, turn=${record.turn_id}`);
      resolve();
    };
    request.onerror = () => {
      console.error(`[INDEXEDDB] ❌ Failed to save turn: session=${record.session_id}, turn=${record.turn_id}`, request.error);
      reject(request.error);
    };
  });
}

export async function getSessionTurns(sessionId: string): Promise<SessionTurnRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('session_id');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const turns: SessionTurnRecord[] = request.result || [];
      // Sort chronologically by created_at then turn_id
      turns.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.turn_id.localeCompare(b.turn_id));
      console.log(`[INDEXEDDB] 📖 Retrieved ${turns.length} turns for session=${sessionId}`);
      resolve(turns);
    };
    request.onerror = () => {
      console.error(`[INDEXEDDB] ❌ Failed to get turns for session=${sessionId}:`, request.error);
      reject(request.error);
    };
  });
}

export async function getAllSessionsSummary(): Promise<SessionSummary[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const allTurns: SessionTurnRecord[] = request.result || [];
      const sessionMap: { [sessionId: string]: SessionTurnRecord[] } = {};

      for (const turn of allTurns) {
        if (!sessionMap[turn.session_id]) {
          sessionMap[turn.session_id] = [];
        }
        sessionMap[turn.session_id].push(turn);
      }

      const summaries: SessionSummary[] = Object.keys(sessionMap).map((sid) => {
        const turns = sessionMap[sid];
        turns.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return {
          session_id: sid,
          first_prompt: turns[0]?.user_prompt || 'Untitled Session',
          turn_count: turns.length,
          created_at: turns[0]?.created_at || new Date().toISOString(),
          latest_created_at: turns[turns.length - 1]?.created_at || new Date().toISOString()
        };
      });

      // Sort sessions by latest activity descending
      summaries.sort((a, b) => b.latest_created_at.localeCompare(a.latest_created_at));
      console.log(`[INDEXEDDB] 📜 Loaded ${summaries.length} sessions from local cache`);
      resolve(summaries);
    };
    request.onerror = () => {
      console.error('[INDEXEDDB] ❌ Failed to load session summaries:', request.error);
      reject(request.error);
    };
  });
}

export async function deleteSessionTurns(sessionId: string): Promise<void> {
  const db = await openDatabase();
  const turns = await getSessionTurns(sessionId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const turn of turns) {
      store.delete([turn.session_id, turn.turn_id]);
    }

    tx.oncomplete = () => {
      console.log(`[INDEXEDDB] 🗑️ Deleted session=${sessionId} (${turns.length} turns)`);
      resolve();
    };
    tx.onerror = () => {
      console.error(`[INDEXEDDB] ❌ Failed to delete session=${sessionId}:`, tx.error);
      reject(tx.error);
    };
  });
}

export async function clearAllLocalCache(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => {
      console.log('[INDEXEDDB] 🧹 Cleared entire local cache database');
      resolve();
    };
    request.onerror = () => {
      console.error('[INDEXEDDB] ❌ Failed to clear local cache database:', request.error);
      reject(request.error);
    };
  });
}
