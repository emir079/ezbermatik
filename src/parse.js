// Column layout of the Yeraltı scripts: action/headings on the left, dialogue in a narrow right column.
const ACTION_MAX_X = 200;
const DIALOGUE_MIN_X = 250;
const SCENE_RE = /^(\d+)\)\s*(.*)$/;
const SPEAKER_RE = /^([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9. ]{0,24}):\s*(.*)$/;
import { ALIASES } from './aliases.js';

const isNoise = t => t === 'Yeraltı' || t === '.' || /^\d+$/.test(t);

export const nameKey = name => name.replace(/[.\s]/g, '');
const canonical = new Map(Object.entries(ALIASES).flatMap(([main, others]) => [main, ...others].map(n => [nameKey(n), main])));

export function parseScript(pages) {
  const scenes = [];
  let scene = null;
  const spellings = new Map(); // key -> Map(spelling -> count)

  for (const page of pages) for (const { x, text } of page) {
    if (!text || isNoise(text)) continue;
    const blocks = scene?.blocks;
    const last = blocks?.[blocks.length - 1];
    if (x < ACTION_MAX_X) {
      const m = text.match(SCENE_RE);
      if (m) { scene = { no: m[1].padStart(2, '0'), title: m[2].trim(), blocks: [] }; scenes.push(scene); continue; }
      if (!scene) continue; // title page text before scene 01
      if (last?.type === 'action') last.text += ' ' + text;
      else blocks.push({ type: 'action', text });
    } else if (x >= DIALOGUE_MIN_X && scene) {
      const m = text.match(SPEAKER_RE);
      if (m) {
        const spelling = m[1].trim(), raw = nameKey(spelling), key = canonical.has(raw) ? nameKey(canonical.get(raw)) : raw;
        if (!spellings.has(key)) spellings.set(key, new Map());
        spellings.get(key).set(spelling, (spellings.get(key).get(spelling) ?? 0) + 1);
        blocks.push({ type: 'line', speaker: key, text: m[2] });
      } else if (last?.type === 'line') last.text = (last.text + ' ' + text).trim();
      else blocks.push({ type: 'action', text }); // shortcut: dialogue-column text with no speaker is treated as action
    }
  }

  // replace keys with the most frequent spelling
  const display = new Map();
  for (const [key, m] of spellings) display.set(key, canonical.get(key) ?? [...m].sort((a, b) => b[1] - a[1])[0][0]);
  const counts = new Map();
  for (const sc of scenes) for (const b of sc.blocks) if (b.type === 'line') {
    b.speaker = display.get(b.speaker);
    counts.set(b.speaker, (counts.get(b.speaker) ?? 0) + 1);
  }
  const characters = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { scenes, characters };
}
