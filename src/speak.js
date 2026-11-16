// Read-aloud with a built-in Turkish voice (Piper, runs on the device; the voice is downloaded once).
// Falls back to the phone's own voice if the built-in one can't load (e.g. offline before the first download).
const title = s => s.toLocaleLowerCase('tr').replace(/(^|[\s.])(\p{L})/gu, (m, a, c) => a + c.toLocaleUpperCase('tr'));

export const speechText = (b, withName = true) => b.type === 'line' && withName ? `${title(b.speaker)}. ${b.text}` : b.text;

// indexes of the blocks to read, in order
export const readable = (blocks, withActions) => blocks.flatMap((b, i) => withActions || b.type === 'line' ? [i] : []);

const VOICE = 'tr_TR-fahrettin-medium';
const BASE = new URL('../vendor/piper/', import.meta.url).href;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let run = 0;
let progress; // download progress callback of the latest speak() call
let engine; // Promise<synth(text) -> wav Blob>
const audio = typeof Audio !== 'undefined' ? new Audio() : null;

function load() {
  return engine ??= import(BASE + 'piper-tts-web.js').then(async m => {
    const tts = await m.TtsSession.create({
      voiceId: VOICE,
      progress: p => p.total && p.url !== m.INFERENCE_PROGRESS_URL && progress?.(Math.round(p.loaded * 100 / p.total)),
      wasmPaths: { onnxWasm: BASE, piperData: BASE + 'piper_phonemize.data', piperWasm: BASE + 'piper_phonemize.wasm' },
    });
    let queue = Promise.resolve();
    // one inference at a time: the model session can't run two at once
    return text => (queue = queue.catch(() => {}).then(() => tts.predict(text)));
  }).catch(e => { engine = null; throw e; });
}

export function stop() {
  run++;
  audio?.pause();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

// speak texts one by one, gap ms apart; onStart(i) before each, onDone() at the end (not called after stop),
// onProgress(percent) while the voice downloads the first time
export function speak(texts, { onStart, onDone, onProgress, gap = 0 }) {
  stop();
  const my = run;
  progress = onProgress;
  audio.src = SILENT;
  audio.play().catch(() => {}); // unlock playback while still inside the tap (iOS)
  load().then(synth => {
    const wavs = [];
    const get = i => wavs[i] ??= synth(texts[i]);
    const play = async i => {
      if (my !== run) return;
      if (i >= texts.length) return onDone();
      try {
        const wav = await get(i);
        if (my !== run) return;
        if (i + 1 < texts.length) get(i + 1); // prepare the next line while this one plays
        onStart(i);
        URL.revokeObjectURL(audio.src);
        audio.src = URL.createObjectURL(wav);
        audio.onended = () => setTimeout(() => play(i + 1), gap);
        await audio.play();
      } catch {
        play(i + 1); // skip a line that failed
      }
    };
    play(0);
  }, () => my === run && speakSystem(texts, onStart, onDone, gap, my));
}

let current; // keep a reference: Chrome drops onend for garbage-collected utterances

function speakSystem(texts, onStart, onDone, gap, my) {
  const voice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('tr'));
  const next = i => {
    if (my !== run) return;
    if (i >= texts.length) return onDone();
    current = new SpeechSynthesisUtterance(texts[i]);
    current.lang = 'tr-TR';
    if (voice) current.voice = voice;
    current.onend = current.onerror = () => setTimeout(() => next(i + 1), gap);
    onStart(i);
    speechSynthesis.speak(current);
  };
  next(0);
}
