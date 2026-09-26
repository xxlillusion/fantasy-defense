// Pure-logic tests for Stream E audio helpers (no DOM / WebAudio needed).
import { describe, expect, it } from 'vitest';
import { createMusicJob } from '../../src/audio/music';
import { SFX_DEFS, SFX_IDS } from '../../src/audio/sfxBank';
import { renderSound } from '../../src/audio/synth';
import { VoiceLimiter } from '../../src/audio/voiceLimiter';
import { encodeWav } from '../../src/audio/wav';

describe('wav encoder', () => {
  it('writes a valid 16-bit mono PCM header and length', () => {
    const samples = new Float32Array([0, 1, -1, 0.5, 2, Number.NaN]);
    const buf = encodeWav(samples, 22050);
    const v = new DataView(buf);
    const str = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n));
    expect(buf.byteLength).toBe(44 + samples.length * 2);
    expect(str(0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(str(8, 4)).toBe('WAVE');
    expect(str(12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(28, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(str(36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(samples.length * 2);
    expect(v.getInt16(44 + 2, true)).toBe(32767);
    expect(v.getInt16(44 + 4, true)).toBe(-32768);
    expect(v.getInt16(44 + 8, true)).toBe(32767); // clamped
    expect(v.getInt16(44 + 10, true)).toBe(0); // NaN -> 0
  });
});

describe('synth', () => {
  it('renders every sfx deterministically, finite and within -1..1', () => {
    for (const id of SFX_IDS) {
      const a = renderSound(SFX_DEFS[id], 22050);
      const b = renderSound(SFX_DEFS[id], 22050);
      expect(a.length).toBeGreaterThan(100);
      expect(a.length).toBeLessThan(22050 * 5);
      expect(a.every((x, i) => x === b[i])).toBe(true);
      let peak = 0;
      let finite = true;
      for (const x of a) {
        if (!Number.isFinite(x)) finite = false;
        peak = Math.max(peak, Math.abs(x));
      }
      expect(finite).toBe(true);
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.1);
    }
  });

  it('renders the music loop to two equal-length stems', () => {
    const job = createMusicJob(8000);
    let guard = 0;
    while (!job.step(50) && guard++ < 1000);
    const r = job.result!;
    expect(r.calm.length).toBe(r.battle.length);
    expect(r.calm.length / r.sampleRate).toBeCloseTo(48, 0);
    expect(r.calm.every(Number.isFinite) && r.battle.every(Number.isFinite)).toBe(true);
  });
});

describe('voice limiter', () => {
  it('enforces min interval and max voices, and ducks under load', () => {
    const l = new VoiceLimiter(2);
    const rule = { maxVoices: 2, minInterval: 50 };
    expect(l.tryStart('a', rule, 0, 1000)).toBe(true);
    expect(l.tryStart('a', rule, 10, 1000)).toBe(false); // too soon
    expect(l.tryStart('a', rule, 60, 1000)).toBe(true);
    expect(l.tryStart('a', rule, 120, 1000)).toBe(false); // voice cap
    expect(l.tryStart('a', rule, 1001, 1000)).toBe(true); // first voice ended
    expect(l.duckGain(1001)).toBe(1);
    l.tryStart('b', { maxVoices: 5, minInterval: 0 }, 1002, 1000);
    l.tryStart('c', { maxVoices: 5, minInterval: 0 }, 1002, 1000);
    expect(l.duckGain(1003)).toBeLessThan(1);
    expect(l.activeCount(5000)).toBe(0);
  });
});
