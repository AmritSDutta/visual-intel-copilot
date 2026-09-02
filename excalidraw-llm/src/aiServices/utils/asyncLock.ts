/**
 * Zero-dependency asynchronous mutual exclusion lock (similar to Python's asyncio.Lock).
 * Serializes async turn executions, subagent calls, and tool operations.
 */
export class AsyncLock {
  private _locked = false;
  private _waitingQueue: Array<() => void> = [];

  public isLocked(): boolean {
    return this._locked;
  }

  public async acquire(): Promise<() => void> {
    if (this._locked) {
      await new Promise<void>((resolve) => this._waitingQueue.push(resolve));
    }
    this._locked = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this._waitingQueue.length > 0) {
        const next = this._waitingQueue.shift();
        next?.();
      } else {
        this._locked = false;
      }
    };
  }

  public async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
