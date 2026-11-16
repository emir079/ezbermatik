import { ALIASES } from './aliases.js';

const lower = s => s.toLocaleLowerCase('tr');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// name or alias at a word start (suffixes like "Yavuz'un" still match)
const nameRe = (name, flags = 'u') =>
  new RegExp(`(^|[^\\p{L}])(${[name, ...(ALIASES[name] ?? [])].map(n => escape(lower(n))).join('|')})`, flags);

export function sceneStatus(scene, name) {
  if (scene.blocks.some(b => b.speaker === name)) return 'speaks';
  const re = nameRe(name);
  return scene.blocks.some(b => b.type === 'action' && re.test(lower(b.text))) ? 'maybe' : null;
}

// [start, end] of each name mention in text (Turkish lowercasing keeps positions)
export const nameSpans = (text, name) =>
  [...lower(text).matchAll(nameRe(name, 'gu'))].map(m => [m.index + m[1].length, m.index + m[0].length]);

export const lineCount = (scene, name) => scene.blocks.filter(b => b.speaker === name).length;

export function viewBlocks(scene, name, mode) {
  if (mode === 'all') return scene.blocks.map(b => b.speaker === name ? { ...b, mine: true } : b);
  const out = [];
  let prevLine = null;
  for (const b of scene.blocks) {
    if (b.type !== 'line') continue;
    if (b.speaker === name) {
      if (mode === 'cue' && prevLine && prevLine.speaker !== name) out.push({ ...prevLine, cue: true });
      out.push({ ...b, mine: true });
    }
    prevLine = b;
  }
  return out;
}
