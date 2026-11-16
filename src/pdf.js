// PDF -> lines per page. pdfjs module is injected (Node legacy build in tests, vendor build in browser).
export async function extractPages(data, pdfjs, onProgress) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(it);
    }
    const lines = [];
    for (const [y, row] of rows) {
      row.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = '', end = null;
      for (const it of row) {
        const x = it.transform[4];
        // fragments often split mid-word; only a real gap means a space
        if (end !== null && x - end > 1 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
        text += it.str;
        end = x + it.width;
      }
      lines.push({ x: row[0].transform[4], y, text: text.replace(/\s+/g, ' ').trim() });
    }
    lines.sort((a, b) => b.y - a.y);
    pages.push(lines);
    onProgress?.(p, doc.numPages);
  }
  return pages;
}
