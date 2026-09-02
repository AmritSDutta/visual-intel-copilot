export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'TOOL';
  tag: string;
  message: string;
  details?: any;
}

const MAX_LOGS = 300;
const logBuffer: LogEntry[] = [];
const subscribers = new Set<(logs: LogEntry[]) => void>();

function notifySubscribers() {
  const snapshot = [...logBuffer];
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {}
  });
}

function sendToTerminal(entry: LogEntry) {
  if (typeof window === 'undefined') return;
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: entry.level,
      tag: entry.tag,
      message: entry.message,
      details: entry.details
    })
  }).catch(() => {});
}

function recordLog(level: LogEntry['level'], tag: string, message: string, details?: any) {
  const timestamp = new Date().toLocaleTimeString();
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    level,
    tag,
    message,
    details
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  // Also print to browser console
  const consolePrefix = `[${timestamp}] [${level}] [${tag}]`;
  if (level === 'ERROR') {
    console.error(consolePrefix, message, details || '');
  } else if (level === 'WARN') {
    console.warn(consolePrefix, message, details || '');
  } else {
    console.log(consolePrefix, message, details || '');
  }

  // Forward to terminal stdout
  sendToTerminal(entry);
  notifySubscribers();
}

export const appLogger = {
  info: (tag: string, message: string, details?: any) => recordLog('INFO', tag, message, details),
  warn: (tag: string, message: string, details?: any) => recordLog('WARN', tag, message, details),
  error: (tag: string, message: string, details?: any) => recordLog('ERROR', tag, message, details),
  tool: (tag: string, message: string, details?: any) => recordLog('TOOL', tag, message, details),
  getLogs: (): LogEntry[] => [...logBuffer],
  subscribe: (callback: (logs: LogEntry[]) => void): (() => void) => {
    subscribers.add(callback);
    callback([...logBuffer]);
    return () => subscribers.delete(callback);
  },
  clear: () => {
    logBuffer.length = 0;
    notifySubscribers();
  }
};
