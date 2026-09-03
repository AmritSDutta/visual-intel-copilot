/**
 * Stdio Logger - Pipes all browser console logs (log, info, warn, error, debug)
 * and unhandled window errors directly to the terminal stdout / stdio console.
 */

// Retain references to native browser console methods
export const nativeConsole = {
  log: typeof console !== 'undefined' ? console.log.bind(console) : () => {},
  info: typeof console !== 'undefined' ? console.info.bind(console) : () => {},
  warn: typeof console !== 'undefined' ? console.warn.bind(console) : () => {},
  error: typeof console !== 'undefined' ? console.error.bind(console) : () => {},
  debug: typeof console !== 'undefined' ? (console.debug ? console.debug.bind(console) : console.log.bind(console)) : () => {},
};

function safeSerialize(arg: any): any {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack
    };
  }
  if (typeof arg === 'symbol') {
    return arg.toString();
  }
  if (typeof arg === 'function') {
    return `[Function: ${arg.name || 'anonymous'}]`;
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      // Circular reference safe serialization
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(arg, (_key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        })
      );
    } catch {
      return String(arg);
    }
  }
  return arg;
}

function sendLogToStdio(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TOOL', args: any[]) {
  if (typeof window === 'undefined' || args.length === 0) return;

  try {
    const first = args[0];
    let tag = 'BROWSER';
    let message = '';
    let details: any = undefined;

    // Parse tag if formatted like "[Tag] Message"
    if (typeof first === 'string' && first.startsWith('[') && first.includes(']')) {
      const match = first.match(/^\[(.*?)\]\s*(.*)$/);
      if (match) {
        tag = match[1];
        message = match[2];
        const rest = args.slice(1).map(safeSerialize);
        details = rest.length === 1 ? rest[0] : (rest.length > 1 ? rest : undefined);
      } else {
        message = String(first);
        const rest = args.slice(1).map(safeSerialize);
        details = rest.length === 1 ? rest[0] : (rest.length > 1 ? rest : undefined);
      }
    } else {
      message = typeof first === 'string' ? first : (typeof first === 'object' ? JSON.stringify(safeSerialize(first)) : String(first));
      const rest = args.slice(1).map(safeSerialize);
      details = rest.length === 1 ? rest[0] : (rest.length > 1 ? rest : undefined);
    }

    // Post to Vite server /api/log middleware
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        tag,
        message,
        details
      })
    }).catch(() => {});
  } catch {
    // Fail silently without disrupting page execution
  }
}

/**
 * Initializes the global pipe routing all browser console output to the terminal stdio.
 */
export function initConsoleToStdioPipe(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__stdioConsolePipeActive) return;
  (window as any).__stdioConsolePipeActive = true;

  console.log = (...args: any[]) => {
    nativeConsole.log(...args);
    sendLogToStdio('INFO', args);
  };

  console.info = (...args: any[]) => {
    nativeConsole.info(...args);
    sendLogToStdio('INFO', args);
  };

  console.warn = (...args: any[]) => {
    nativeConsole.warn(...args);
    sendLogToStdio('WARN', args);
  };

  console.error = (...args: any[]) => {
    nativeConsole.error(...args);
    sendLogToStdio('ERROR', args);
  };

  console.debug = (...args: any[]) => {
    nativeConsole.debug(...args);
    sendLogToStdio('DEBUG', args);
  };

  // Capture unhandled window exceptions and send to stdio
  window.addEventListener('error', (event) => {
    sendLogToStdio('ERROR', [
      `[UncaughtException] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      event.error ? { stack: event.error.stack } : undefined
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    sendLogToStdio('ERROR', [
      `[UnhandledPromiseRejection] ${event.reason?.message || String(event.reason)}`,
      event.reason?.stack ? { stack: event.reason.stack } : undefined
    ]);
  });
}

// Automatically initialize upon module load
initConsoleToStdioPipe();
