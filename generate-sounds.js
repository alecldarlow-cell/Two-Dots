// Run with: node generate-sounds.js
// Generates all game sound effects as 44.1kHz 16-bit mono WAV files.
'use strict';
const fs   = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

function sine(freq, dur, amp = 0.7, decay = 15) {
  const n   = Math.round(SR * dur);
  const atk = Math.round(SR * 0.005);
  const buf = [];
  for (let i = 0; i < n; i++) {
    const v   = Math.sin(2 * Math.PI * freq * i / SR);
    const env = i < atk ? i / atk : Math.exp(-decay * (i - atk) / SR);
    buf.push(v * amp * env);
  }
  return buf;
}

function delay(samples, delaySec) {
  return new Array(Math.round(SR * delaySec)).fill(0).concat(samples);
}

function mix(...tracks) {
  const L = Math.max(...tracks.map(t => t.length));
  const m = new Array(L).fill(0);
  for (const t of tracks) t.forEach((v, i) => { m[i] += v; });
  const pk = Math.max(...m.map(Math.abs));
  if (pk > 0.85) m.forEach((v, i) => { m[i] = v * 0.85 / pk; });
  return m;
}

function writeWav(name, samples) {
  const nSamples   = samples.length;
  const dataBytes  = nSamples * 2;
  const buf        = Buffer.alloc(44 + dataBytes);
  // RIFF header
  buf.write('RIFF',  0); buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE',  8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);   // chunk size
  buf.writeUInt16LE(1,  20);   // PCM
  buf.writeUInt16LE(1,  22);   // mono
  buf.writeUInt32LE(SR, 24);   // sample rate
  buf.writeUInt32LE(SR * 2, 28); // byte rate
  buf.writeUInt16LE(2,  32);   // block align
  buf.writeUInt16LE(16, 34);   // bits per sample
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < nSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  const filePath = path.join(OUT, name);
  fs.writeFileSync(filePath, buf);
  console.log(`  ${name}  (${buf.length} bytes)`);
}

console.log('Generating sounds → assets/sounds/\n');

writeWav('jump_l.wav',   sine(380, 0.04));
writeWav('jump_r.wav',   sine(520, 0.04));
writeWav('tap.wav',      sine(440, 0.05));
writeWav('pause_on.wav', sine(330, 0.05));

for (let t = 1; t <= 8; t++) {
  const freq = 500 + (t - 1) * 40;
  const dur  = t >= 7 ? 0.06 : 0.08;
  writeWav(`blip_t${t}.wav`, sine(freq, dur));
}

writeWav('chord_tier.wav', mix(
  sine(660, 0.22),
  delay(sine(880, 0.24), 0.08),
  delay(sine(1320, 0.30), 0.18),
));

writeWav('chord_five.wav', mix(
  sine(880, 0.18),
  delay(sine(1320, 0.22), 0.09),
));

writeWav('close_call.wav', sine(1100, 0.05));

writeWav('death.wav', mix(
  sine(240, 0.16),
  delay(sine(160, 0.26), 0.08),
));

console.log('\nDone.');
