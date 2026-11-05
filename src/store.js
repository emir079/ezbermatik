import { parseScript } from './parse.js';

// IndexedDB: saved scripts (keyed by file name, so re-import overwrites) + small prefs.
let dbp;
const db = () => dbp ??= new Promise((ok, fail) => {
  const r = indexedDB.open('ezbermatik', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('scripts', { keyPath: 'fileName' });
    r.result.createObjectStore('prefs');
  };
  r.onsuccess = () => { r.result.onclose = () => { dbp = null; }; ok(r.result); }; // iOS drops idle connections
  r.onerror = () => { dbp = null; fail(r.error); };
});

async function run(store, mode, fn) {
  const tx = (await db()).transaction(store, mode);
  const req = fn(tx.objectStore(store));
  return new Promise((ok, fail) => {
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('Kayıt başarısız (depolama dolu olabilir).'));
  });
}

// raw PDF lines are stored and re-parsed on load, so parser fixes reach already-imported episodes
export const saveScript = (fileName, pages) => run('scripts', 'readwrite', s => s.put({ fileName, savedAt: Date.now(), pages }));
export const loadScript = async fileName => {
  const rec = await run('scripts', 'readonly', s => s.get(fileName));
  return rec && (rec.pages ? parseScript(rec.pages) : rec.script); // .script: records saved by v1
};
export const deleteScript = fileName => run('scripts', 'readwrite', s => s.delete(fileName));
export const listScripts = async () =>
  (await run('scripts', 'readonly', s => s.getAll())).map(({ fileName, savedAt }) => ({ fileName, savedAt })).sort((a, b) => b.savedAt - a.savedAt);
export const getPref = key => run('prefs', 'readonly', s => s.get(key));
export const setPref = (key, value) => run('prefs', 'readwrite', s => s.put(value, key));
