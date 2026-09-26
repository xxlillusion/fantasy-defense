// Stream E: 16-bit mono PCM WAV encoder (pure, no DOM; unit-tested in node).

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const job = createWavJob(samples, sampleRate);
  job.step(Infinity);
  return job.result!;
}

/** Time-sliced WAV encoder for long buffers (music stems): call step(budgetMs) until it returns true. */
export function createWavJob(samples: Float32Array, sampleRate: number): { step(budgetMs: number): boolean; readonly result: ArrayBuffer | null } {
  const { buf, v } = wavHeader(samples.length, sampleRate);
  const CHUNK = 16384;
  let i = 0;
  let done = false;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    get result() {
      return done ? buf : null;
    },
    step(budgetMs) {
      const start = now();
      while (i < samples.length) {
        const end = Math.min(samples.length, i + CHUNK);
        writePcm16(v, samples, i, end);
        i = end;
        if (now() - start > budgetMs) return false;
      }
      done = true;
      return true;
    },
  };
}

function writePcm16(v: DataView, samples: Float32Array, from: number, to: number): void {
  let off = 44 + from * 2;
  for (let i = from; i < to; i++, off += 2) {
    const x = samples[i];
    const c = x !== x ? 0 : x > 1 ? 1 : x < -1 ? -1 : x; // NaN-safe clamp
    v.setInt16(off, c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff), true);
  }
}

function wavHeader(length: number, sampleRate: number): { buf: ArrayBuffer; v: DataView } {
  const samples = { length };
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  v.setUint16(32, bytesPerSample, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  return { buf, v };
}

/** Wrap WAV bytes in an object URL (falls back to a data URL). Browser only. */
export function wavToUrl(wav: ArrayBuffer): string {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(wav);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
