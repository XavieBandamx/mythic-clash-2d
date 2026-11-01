// Una escritura activa y una copia reciente pendiente; nunca una cola de cuadros viejos.
export class LatestOutbox<T> {
  private busy = false;
  private pending: T | undefined;
  private closed = false;
  constructor(private write: (value: T) => Promise<void>, private merge = (_previous: T, next: T) => next) {}
  offer(value: T) {
    if (this.closed) return;
    if (this.busy) { this.pending = this.pending === undefined ? value : this.merge(this.pending, value); return; }
    this.busy = true;
    void this.flush(value);
  }
  private async flush(value: T) {
    try { await this.write(value); }
    finally {
      this.busy = false;
      const next = this.pending; this.pending = undefined;
      if (next !== undefined && !this.closed) this.offer(next);
    }
  }
  clear() { this.pending = undefined; }
  close() { this.closed = true; this.clear(); }
}
