// Draws sections as tall PNGs. iOS Safari blanks very large canvases, so pages are capped at MAX_H.
const MAX_H = 4000, PAD = 60, FONT = 36, LH = 52, GAP = 18;
const COLORS = { text: '#1a1a1a', muted: '#8a8a8a', accent: '#2563eb', heading: '#444', bg: '#ffffff' };

function wrap(ctx, text, width) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function toImages(sections, { width = 1080 } = {}) {
  const ctx = document.createElement('canvas').getContext('2d');
  const font = (bold, size = FONT) => `${bold ? '600 ' : ''}${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const inner = width - PAD * 2;
  // layout pass: each item is an atomic chunk of rows drawn together
  const items = [];
  for (const s of sections) {
    ctx.font = font(true, 32);
    items.push({ kind: 'heading', indent: 0, rows: wrap(ctx, s.heading, inner), font: font(true, 32), color: COLORS.heading, gapBefore: items.length ? 40 : 0 });
    for (const b of s.blocks) {
      const indent = b.mine ? 24 : 0;
      const label = b.type === 'line' && !b.mine ? `${b.speaker}: ` : '';
      ctx.font = font(false);
      items.push({
        kind: b.mine ? 'mine' : b.cue ? 'cue' : b.type, indent,
        rows: wrap(ctx, label + b.text, inner - indent), font: b.type === 'action' ? `italic ${font(false)}` : font(false),
        color: b.cue || b.type === 'action' ? COLORS.muted : COLORS.text, gapBefore: GAP,
      });
    }
  }
  // paginate; shortcut: a single block taller than MAX_H (~75 rows) is clipped, split items by row if that ever happens
  const pages = [[]];
  let h = PAD;
  for (const it of items) {
    const ih = it.gapBefore + it.rows.length * LH;
    if (h + ih + PAD > MAX_H && pages.at(-1).length) { pages.push([]); h = PAD; it.gapBefore = 0; }
    pages.at(-1).push(it);
    h += it.gapBefore + it.rows.length * LH;
  }
  const blobs = [];
  for (const page of pages) {
    const ph = PAD * 2 + page.reduce((n, it) => n + it.gapBefore + it.rows.length * LH, 0);
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.min(ph, MAX_H);
    const g = c.getContext('2d');
    g.fillStyle = COLORS.bg; g.fillRect(0, 0, c.width, c.height);
    g.textBaseline = 'top';
    let y = PAD;
    for (const it of page) {
      y += it.gapBefore;
      if (it.kind === 'mine') { g.fillStyle = COLORS.accent; g.fillRect(PAD, y + 4, 6, it.rows.length * LH - 8); }
      g.font = it.font; g.fillStyle = it.color;
      for (const r of it.rows) { g.fillText(r, PAD + it.indent, y + (LH - FONT) / 2); y += LH; }
    }
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    c.width = c.height = 0; // free canvas memory (iOS has a low total limit)
    if (!blob) throw new Error('Görsel oluşturulamadı.');
    blobs.push(blob);
  }
  return blobs;
}
