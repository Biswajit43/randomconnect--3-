/**
 * In-memory matchmaking queue. Swap for Redis (sorted sets / lists) once you
 * run more than one server process, since this state must be shared across
 * instances for matching to work behind a load balancer.
 */
class Matchmaker {
  constructor() {
    this.waiting = []; // { socketId, interests, mode, joinedAt }
  }

  addToQueue(entry) {
    this.removeFromQueue(entry.socketId);
    this.waiting.push(entry);
  }

  removeFromQueue(socketId) {
    this.waiting = this.waiting.filter((w) => w.socketId !== socketId);
  }

  /**
   * Finds the best waiting partner for `entry`. Prefers shared interests,
   * falls back to first-available (FIFO) so nobody waits forever.
   */
  findMatch(entry) {
    if (this.waiting.length === 0) return null;

    if (entry.interests?.length) {
      const scored = this.waiting
        .filter((w) => w.socketId !== entry.socketId)
        .map((w) => ({
          candidate: w,
          overlap: w.interests.filter((i) => entry.interests.includes(i)).length,
        }))
        .filter((s) => s.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);

      if (scored.length) {
        this.removeFromQueue(scored[0].candidate.socketId);
        return scored[0].candidate;
      }
    }

    const fifo = this.waiting.find((w) => w.socketId !== entry.socketId);
    if (fifo) {
      this.removeFromQueue(fifo.socketId);
      return fifo;
    }
    return null;
  }

  queueSize() {
    return this.waiting.length;
  }
}

export const matchmaker = new Matchmaker();
