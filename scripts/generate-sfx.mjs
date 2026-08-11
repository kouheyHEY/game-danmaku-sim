import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';

const SAMPLE_RATE = 22050;
const BIT_RATE = 48;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'public', 'sfx');
const TAU = Math.PI * 2;

const square = (phase, duty = 0.5) => (phase % TAU) / TAU < duty ? 1 : -1;
const clamp = (value) => Math.max(-1, Math.min(1, value));
const decay = (t, duration, power = 1.8) => Math.max(0, 1 - t / duration) ** power;
const envelope = (t, duration, attack, power) => Math.min(1, t / attack) * decay(t, duration, power);

function tone(duration, sample) {
  const data = new Int16Array(Math.ceil(duration * SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < data.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const result = sample(t, duration, phase);
    phase += TAU * result.frequency / SAMPLE_RATE;
    data[i] = Math.round(clamp(result.value) * 32767);
  }
  return data;
}

/**
 * 短いAttack / Sustain 0 / Release 0 の原音へ、短い初期反射と2段エコーだけを足す。
 * 原音のDecayを崩さず、8bitらしい輪郭を残したまま乾きを和らげる。
 */
function addAmbience(samples, echoMs, mix) {
  const taps = [
    { delay: 0.017, gain: mix * 0.24 },
    { delay: 0.031, gain: mix * 0.15 },
    { delay: echoMs / 1000, gain: mix },
    { delay: echoMs / 500, gain: mix * 0.36 },
  ];
  const tail = Math.max(...taps.map((tap) => Math.round(tap.delay * SAMPLE_RATE)));
  const output = new Int16Array(samples.length + tail);
  for (let i = 0; i < output.length; i += 1) {
    let value = i < samples.length ? samples[i] * 0.94 : 0;
    for (const tap of taps) {
      const source = i - Math.round(tap.delay * SAMPLE_RATE);
      if (source >= 0 && source < samples.length) value += samples[source] * tap.gain;
    }
    output[i] = Math.round(Math.max(-32767, Math.min(32767, value)));
  }
  return output;
}

const drySounds = {
  'player-shot': tone(0.045, (t, d, phase) => {
    const frequency = 920 - 360 * (t / d);
    return { frequency, value: square(phase, 0.32) * envelope(t, d, 0.008, 1.8) * 0.18 };
  }),
  'enemy-shot-aimed': tone(0.14, (t, d, phase) => {
    const frequency = 420 - 150 * (t / d);
    return { frequency, value: square(phase, 0.42) * envelope(t, d, 0.006, 1.4) * 0.3 };
  }),
  'enemy-shot-burst': tone(0.19, (t, d, phase) => {
    const gate = Math.floor(t / 0.045) % 2 === 0 ? 1 : 0.18;
    const frequency = 560 + (Math.floor(t / 0.045) % 3) * 85;
    return { frequency, value: square(phase, 0.28) * envelope(t, d, 0.005, 0.8) * gate * 0.29 };
  }),
  'enemy-shot-heavy': tone(0.24, (t, d, phase) => {
    const frequency = 185 - 65 * (t / d);
    const body = square(phase, 0.48) * 0.23 + square(phase * 1.97, 0.31) * 0.055;
    return { frequency, value: body * envelope(t, d, 0.007, 1.25) };
  }),
  'enemy-defeat': tone(0.31, (t, d, phase) => {
    const frequency = 720 - 560 * (t / d);
    const body = square(phase, 0.35) * 0.24 + square(phase * 1.71, 0.25) * 0.1;
    return { frequency, value: body * envelope(t, d, 0.008, 1.15) };
  }),
  'player-hit': tone(0.48, (t, d, phase) => {
    const frequency = Math.max(75, 360 - 470 * (t / d));
    const stepped = Math.floor(t * 28) % 2 ? 0.65 : 1;
    const body = square(phase, 0.5) * 0.2 + square(phase * 0.53, 0.3) * 0.11;
    return { frequency, value: body * envelope(t, d, 0.01, 0.85) * stepped };
  }),
  'power-up': tone(0.56, (t, d, phase) => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const note = Math.min(notes.length - 1, Math.floor(t / (d / notes.length)));
    const local = (t % (d / notes.length)) / (d / notes.length);
    const body = square(phase, 0.32) * 0.23 + square(phase * 0.5, 0.42) * 0.075;
    return { frequency: notes[note], value: body * (1 - local * 0.28) * envelope(t, d, 0.008, 0.18) };
  }),
};

const ambience = {
  'player-shot': { echoMs: 18, mix: 0.02 },
  'enemy-shot-aimed': { echoMs: 44, mix: 0.12 },
  'enemy-shot-burst': { echoMs: 40, mix: 0.09 },
  'enemy-shot-heavy': { echoMs: 52, mix: 0.14 },
  'enemy-defeat': { echoMs: 58, mix: 0.16 },
  'player-hit': { echoMs: 62, mix: 0.14 },
  'power-up': { echoMs: 70, mix: 0.17 },
};

const sounds = Object.fromEntries(Object.entries(drySounds).map(([name, samples]) => {
  const effect = ambience[name];
  return [name, addAmbience(samples, effect.echoMs, effect.mix)];
}));

function encodeMp3(samples) {
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, BIT_RATE);
  const chunks = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    const chunk = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
    if (chunk.length > 0) chunks.push(Buffer.from(chunk));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

await mkdir(OUTPUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const data = encodeMp3(samples);
  const path = resolve(OUTPUT, `${name}.mp3`);
  await writeFile(path, data);
  console.log(`${name}.mp3  ${data.length} bytes`);
}
