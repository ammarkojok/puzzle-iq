let audioCtx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
  detune = 0,
) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.08) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

export function playSelect() {
  playTone(880, 0.06, "sine", 0.1);
}

export function playPour() {
  playNoise(0.25, 0.06);
  playTone(300, 0.2, "sine", 0.04);
}

export function playTubeComplete() {
  playTone(660, 0.15, "sine", 0.12);
  setTimeout(() => playTone(880, 0.15, "sine", 0.12), 80);
  setTimeout(() => playTone(1100, 0.2, "sine", 0.1), 160);
}

export function playLevelComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, "sine", 0.1), i * 100);
  });
  setTimeout(() => {
    playTone(784, 0.5, "triangle", 0.08);
    playTone(1047, 0.5, "triangle", 0.08);
  }, 400);
}

export function playError() {
  playTone(200, 0.12, "square", 0.06);
}

export function playIQTick() {
  playTone(1200, 0.03, "sine", 0.06);
}
