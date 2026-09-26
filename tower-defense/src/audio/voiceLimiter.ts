// Stream E: anti-spam bookkeeping. Pure (time is passed in), so it is unit-testable.

export interface VoiceRule {
  maxVoices: number;
  minInterval: number; // ms
  noDuck?: boolean;
}

interface Voice {
  end: number; // ms
  duck: boolean;
}

export class VoiceLimiter {
  private voices = new Map<string, Voice[]>();
  private lastStart = new Map<string, number>();

  /** Ducking kicks in once more than this many (duckable) voices overlap. */
  constructor(private readonly duckThreshold = 6) {}

  private prune(now: number): void {
    for (const [id, list] of this.voices) {
      const alive = list.filter((v) => v.end > now);
      if (alive.length) this.voices.set(id, alive);
      else this.voices.delete(id);
    }
  }

  /** Returns true (and records the voice) if the sound may play now. */
  tryStart(id: string, rule: VoiceRule, now: number, durationMs: number): boolean {
    this.prune(now);
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < rule.minInterval) return false;
    const list = this.voices.get(id) ?? [];
    if (list.length >= rule.maxVoices) return false;
    list.push({ end: now + durationMs, duck: !rule.noDuck });
    this.voices.set(id, list);
    this.lastStart.set(id, now);
    return true;
  }

  /** Number of overlapping duckable voices right now. */
  activeCount(now: number): number {
    this.prune(now);
    let n = 0;
    for (const list of this.voices.values()) for (const v of list) if (v.duck) n++;
    return n;
  }

  /** Gain multiplier (<= 1) to apply to a new voice given current overlap. */
  duckGain(now: number): number {
    const n = this.activeCount(now);
    return n <= this.duckThreshold ? 1 : Math.max(0.35, Math.sqrt(this.duckThreshold / n));
  }

  reset(): void {
    this.voices.clear();
    this.lastStart.clear();
  }
}
