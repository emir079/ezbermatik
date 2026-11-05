import { ALIASES } from './aliases.js';

const lower = s => s.toLocaleLowerCase('tr');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function sceneStatus(scene, name) {
  if (scene.blocks.some(b => b.speaker === name)) return 'speaks';
  const names = [name, ...(ALIASES[name] ?? [])].map(n => escape(lower(n))).join('|');
  const re = new RegExp(`(^|[^\\p{L}])(${names})`, 'u');
  return scene.blocks.some(b => b.type === 'action' && re.test(lower(b.text))) ? 'maybe' : null;
}

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
