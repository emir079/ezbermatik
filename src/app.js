import * as pdfjs from '../vendor/pdf.min.mjs';
import { extractPages } from './pdf.js';
import { parseScript } from './parse.js';
import { sceneStatus, lineCount, viewBlocks } from './query.js';
import { toText, sceneList, heading } from './export-text.js';
import { toImages } from './export-image.js';
import * as store from './store.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

const app = document.getElementById('app');

// installed app only: show the startup image briefly (Android/Windows have no custom launch screen)
if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
  const sp = document.getElementById('splash');
  sp.hidden = false;
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.hidden = true, 400); }, 1000);
}
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const S = { file: null, script: null, name: null, listMode: 'mine', mode: 'cue' };
const episode = f => f.replace(/\.pdf$/i, '');

async function openFile(fileName) {
  S.file = fileName;
  S.script = await store.loadScript(fileName);
  if (!S.script) { S.file = null; return; }
  const saved = await store.getPref('name:' + fileName);
  S.name = S.script.characters.some(c => c.name === saved) ? saved : (await store.getPref('lastName')) ?? S.script.characters[0]?.name;
  if (!S.script.characters.some(c => c.name === S.name)) S.name = S.script.characters[0]?.name;
  await store.setPref('lastFile', fileName);
}

async function setName(name) {
  S.name = name;
  await store.setPref('name:' + S.file, name);
  await store.setPref('lastName', name);
}

// ---------- screens ----------

async function home() {
  const eps = await store.listScripts();
  app.innerHTML = `
    <header><h1>Ezbermatik</h1></header>
    <label class="btn primary" style="display:block;text-align:center;margin:12px 0">Senaryo aç (PDF)
      <input id="pick" type="file" accept="application/pdf,.pdf" hidden></label>
    <p id="status" class="muted"></p>
    ${eps.length ? '<p class="muted" style="margin:16px 0 0">Bölümler</p>' : ''}
    <ul class="list">${eps.map(e => `
      <li data-open="${esc(e.fileName)}"><span>${esc(episode(e.fileName))}</span>
        <button class="icon" data-del="${esc(e.fileName)}" aria-label="Sil">Sil</button></li>`).join('')}</ul>`;
  const status = app.querySelector('#status');
  app.querySelector('#pick').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const pages = await extractPages(await f.arrayBuffer(), pdfjs, (p, n) => status.textContent = `Okunuyor… ${p}/${n}`);
      const script = parseScript(pages);
      if (!script.scenes.length || !script.characters.length) throw new Error('Bu dosyada sahne ya da replik bulunamadı.');
      await store.saveScript(f.name, pages);
      await openFile(f.name);
      location.hash = '#/scenes';
    } catch (err) {
      e.target.value = ''; // allow picking the same file again
      status.innerHTML = `<span class="err">${esc(err.message || 'Dosya okunamadı.')}</span>`;
    }
  };
  app.querySelectorAll('[data-open]').forEach(li => li.onclick = async () => { await openFile(li.dataset.open); location.hash = '#/scenes'; });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    if (!confirm(`${episode(b.dataset.del)} silinsin mi?`)) return;
    await store.deleteScript(b.dataset.del);
    if (S.file === b.dataset.del) { S.file = S.script = null; await store.setPref('lastFile', null); }
    home();
  });
}

function scenes() {
  const { script, name } = S;
  const st = new Map(script.scenes.map(sc => [sc.no, sceneStatus(sc, name)]));
  const mine = script.scenes.filter(sc => st.get(sc.no));
  const shown = S.listMode === 'mine' ? mine : script.scenes;
  app.innerHTML = `
    <header><button class="icon" data-go="#/" aria-label="Geri">‹</button><h1>${esc(episode(S.file))}</h1>
      <button class="icon" data-go="#/export">Dışa aktar</button></header>
    <select id="who" style="width:100%">${script.characters.map(c =>
      `<option value="${esc(c.name)}" ${c.name === name ? 'selected' : ''}>${esc(c.name)} (${c.count})</option>`).join('')}</select>
    <div class="seg">
      <button data-lm="all" class="${S.listMode === 'all' ? 'on' : ''}">Tüm sahneler (${script.scenes.length})</button>
      <button data-lm="mine" class="${S.listMode === 'mine' ? 'on' : ''}">${esc(name)} sahneleri (${mine.length})</button>
    </div>
    <ul class="list">${shown.map(sc => {
      const s = st.get(sc.no);
      const right = s === 'maybe' ? '<span class="tag maybe">muhtemel</span>'
        : s === 'speaks' ? (S.listMode === 'mine' ? `<span class="sub">${lineCount(sc, name)} replik</span>` : `<span class="tag mine">${esc(name)}</span>`) : '';
      return `<li data-go="#/scene/${sc.no}"><span>${esc(heading(sc))}</span>${right}</li>`;
    }).join('')}</ul>
    ${shown.length ? '' : '<p class="muted">Bu karakter için sahne bulunamadı.</p>'}`;
  app.querySelector('#who').onchange = async e => { await setName(e.target.value); scenes(); };
  app.querySelectorAll('[data-lm]').forEach(b => b.onclick = () => { S.listMode = b.dataset.lm; scenes(); });
}

const modeFor = sc => sceneStatus(sc, S.name) === 'speaks' ? S.mode : 'all';

function renderBlocks(blocks, mode) {
  return blocks.map(b => {
    const cls = b.mine ? 'mine' : b.cue ? 'cue' : b.type;
    const sp = b.type === 'line' && !(b.mine && mode !== 'all') ? `<span class="sp">${esc(b.speaker)}:</span> ` : '';
    return `<p class="block ${cls}">${sp}${esc(b.text)}</p>`;
  }).join('');
}

function scene(no) {
  const sc = S.script.scenes.find(s => s.no === no);
  if (!sc) { location.hash = '#/scenes'; return; }
  const speaks = sceneStatus(sc, S.name) === 'speaks';
  const mode = modeFor(sc);
  const idx = S.script.scenes.indexOf(sc);
  const prev = S.script.scenes[idx - 1], next = S.script.scenes[idx + 1];
  app.innerHTML = `
    <header><button class="icon" data-go="#/scenes" aria-label="Geri">‹</button><h1>${esc(heading(sc))}</h1>
      <button class="icon" data-go="#/export/${no}">Dışa aktar</button></header>
    <div class="seg">
      <button data-m="all" class="${mode === 'all' ? 'on' : ''}">Tüm sahne</button>
      <button data-m="cue" class="${mode === 'cue' ? 'on' : ''}" ${speaks ? '' : 'disabled'}>+ önceki</button>
      <button data-m="only" class="${mode === 'only' ? 'on' : ''}" ${speaks ? '' : 'disabled'}>Sadece ${esc(S.name)}</button>
    </div>
    ${renderBlocks(viewBlocks(sc, S.name, mode), mode)}
    <div class="row">
      <button data-go="#/scene/${prev?.no}" ${prev ? '' : 'disabled'}>‹ Önceki sahne</button>
      <button data-go="#/scene/${next?.no}" ${next ? '' : 'disabled'}>Sonraki sahne ›</button>
    </div>`;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; scene(no); });
}

function sectionsFor(scope, no) {
  const { script, name } = S;
  if (scope === 'list') return sceneList(script, name);
  const scs = scope === 'scene' ? script.scenes.filter(s => s.no === no) : script.scenes.filter(sc => sceneStatus(sc, name) === 'speaks');
  return scs.map(sc => ({ heading: heading(sc), blocks: viewBlocks(sc, name, scope === 'scene' ? modeFor(sc) : S.mode) }));
}

// iOS can't save a download to Photos, so it gets the share sheet; Android/Windows save straight to Downloads
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function share(files) {
  if (IOS && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: f.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}

function exportScreen(no) {
  const modeLabel = { all: 'Tüm sahne', cue: '+ önceki', only: `Sadece ${S.name}` };
  app.innerHTML = `
    <header><button class="icon" data-go="${no ? '#/scene/' + no : '#/scenes'}" aria-label="Geri">‹</button><h1>Dışa aktar</h1></header>
    ${no ? `<label class="opt"><input type="radio" name="sc" value="scene" checked> Bu sahne (${esc(no)})</label>` : ''}
    <label class="opt"><input type="radio" name="sc" value="mine" ${no ? '' : 'checked'}> ${esc(S.name)}: tüm sahneleri</label>
    <label class="opt"><input type="radio" name="sc" value="list"> ${esc(S.name)}: sahne listesi</label>
    <p class="muted">Görünüm: ${esc(modeLabel[S.mode])} (sahne ekranından değiştirilir)</p>
    <div class="row"><button id="txt">Metin</button><button id="png">Görsel</button></div>
    <p id="status" class="muted"></p>`;
  const scope = () => app.querySelector('input[name=sc]:checked').value;
  const base = () => `${episode(S.file)}-${S.name}-${scope() === 'scene' ? 'sahne' + no : scope() === 'list' ? 'liste' : 'tum'}`.replace(/[\\/:*?"<>|]/g, '');
  app.querySelector('#txt').onclick = () =>
    share([new File([toText(sectionsFor(scope(), no))], base() + '.txt', { type: 'text/plain' })]);
  app.querySelector('#png').onclick = async () => {
    const status = app.querySelector('#status');
    status.textContent = 'Görsel hazırlanıyor…';
    try {
      const blobs = await toImages(sectionsFor(scope(), no));
      const files = blobs.map((b, i) => new File([b], `${base()}${blobs.length > 1 ? '-' + (i + 1) : ''}.png`, { type: 'image/png' }));
      // share from a fresh tap: iOS drops the original gesture while canvases render
      status.innerHTML = `${files.length > 1 ? files.length + ' görsel hazır' : 'Görsel hazır'} <button id="go" class="primary">${IOS ? 'Paylaş / kaydet' : 'Kaydet'}</button>`;
      app.querySelector('#go').onclick = () => share(files);
    } catch (err) {
      status.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  };
}

// ---------- routing ----------

app.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t && !t.disabled) location.hash = t.dataset.go;
});

async function route() {
  const [, page, arg] = location.hash.split('/');
  if (page && !S.script) {
    const last = await store.getPref('lastFile');
    if (last) await openFile(last);
    if (!S.script) { location.hash = '#/'; return; }
  }
  if (page === 'scenes') scenes();
  else if (page === 'scene') scene(arg);
  else if (page === 'export') exportScreen(arg);
  else home();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
