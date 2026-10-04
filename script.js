// cfg
const CFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxk7rjjFRobxTh2h2SpJBJ2XN8CaBxIDAMlbtXN72dcFkmooyiw7PJv9ORRLrfoJFHAcA/exec',
  FINANCE_URL: 'https://mingsr.github.io/tabugan-pribadi/', 
  TZ: 'Asia/Jakarta',
  TIMEOUT_MS: 30000,
  EVENT_COLORS: { jadwal: '#3b82f6', tugas: '#eab308', acara: '#22c55e', deadline: '#ef4444', lainnya: '#a855f7' }
};
const $ = (id) => document.getElementById(id);

// ses
const SES = {
  get token() { return sessionStorage.getItem('pld_token') || ''; },
  get name() { return sessionStorage.getItem('pld_name') || ''; },
  set(token, name) { sessionStorage.setItem('pld_token', token); sessionStorage.setItem('pld_name', name || ''); },
  setName(name) { sessionStorage.setItem('pld_name', name || ''); },
  clear() { sessionStorage.removeItem('pld_token'); sessionStorage.removeItem('pld_name'); }
};

/** Panggil backend. Mengembalikan data, atau melempar Error dengan .code. */
async function api(action, data) {
  if (CFG.API_URL.indexOf('GANTI') === 0) throw mkErr('CONFIG', 'URL API belum diisi di script.js (CFG.API_URL).');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CFG.TIMEOUT_MS);
  let json;
  try {
    const res = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tanpa preflight CORS
      body: JSON.stringify({ action: action, token: SES.token || undefined, data: data }),
      signal: ctl.signal
    });
    json = await res.json();
  } catch (e) {
    throw mkErr('NETWORK', e.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Tidak bisa terhubung ke server.');
  } finally {
    clearTimeout(timer);
  }
  if (!json || json.ok !== true) {
    const code = (json && json.code) || 'INTERNAL';
    if (code === 'UNAUTHORIZED' && action !== 'auth.login') { endSession('Sesi berakhir, silakan login ulang.'); }
    throw mkErr(code, (json && json.error) || 'Terjadi kesalahan.');
  }
  return json.data;
}
function mkErr(code, msg) { const e = new Error(msg); e.code = code; return e; }

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3500);
}

const VIEWS = ['login', 'select', 'personal', 'gsr'];
function show(name) {
  VIEWS.forEach((v) => { $('v-' + v).hidden = (v !== name); });
  if (name === 'personal') persEnter(); else persLeave();
  window.scrollTo(0, 0);
}

function endSession(msg) {
  SES.clear();
  show('login');
  $('l-pass').value = '';
  if (msg) showLoginError(msg);
}

async function boot() {
  $('l-btn').disabled = false;
  if (!SES.token) { show('login'); $('boot').hidden = true; return; }
  try {
    const me = await api('auth.me');
    SES.setName(me.displayName);
    setName(me.displayName);
    // Refresh di halaman Personal (#/tugas dst.) tetap di halaman itu.
    show(/^#\/[a-z]+$/.test(location.hash) ? 'personal' : 'select');
  } catch (e) {
    if (e.code !== 'UNAUTHORIZED') { SES.clear(); show('login'); showLoginError(e.message); }
  }
  $('boot').hidden = true;
}
document.addEventListener('DOMContentLoaded', boot);

function setName(n) { document.querySelectorAll('.js-name').forEach((el) => { el.textContent = n || '-'; }); }

// login
function showLoginError(msg) { const el = $('l-err'); el.textContent = msg; el.hidden = !msg; }

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const username = $('l-user').value.trim();
  const password = $('l-pass').value;
  showLoginError('');
  if (!username || !password) { showLoginError('Username dan password wajib diisi.'); return; }
  const btn = $('l-btn');
  btn.disabled = true; btn.textContent = 'Memeriksa...';
  try {
    const r = await api('auth.login', { username: username, password: password });
    SES.set(r.token, r.displayName);
    $('l-pass').value = '';
    setName(r.displayName);
    show('select');
  } catch (e) {
    showLoginError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
});

async function logout() {
  // Sesi lokal diakhiri SEKETIKA, tanpa menunggu server (cold start Apps Script bisa beberapa detik).
  // api() membaca token saat dipanggil (sinkron), jadi request dibuat dulu, baru token dihapus.
  const req = SES.token ? api('auth.logout') : null;
  SES.clear();
  $('l-user').value = '';
  show('login');
  if (req) { try { await req; } catch (e) { /* server gagal pun tetap sudah keluar di sisi browser */ } }
}

// sel
$('s-personal').addEventListener('click', () => show('personal'));
$('s-gsr').addEventListener('click', () => show('gsr'));
$('s-logout').addEventListener('click', logout);

// pers
const PAGES = { dashboard: 1, kalender: 1, jadwal: 1, tugas: 1, progress: 1, kehadiran: 1, catatan: 1, keuangan: 1 };
let clockTimer = null;

function persEnter() {
  setName(SES.name);
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
  route();
}
function persLeave() {
  clearInterval(clockTimer); clockTimer = null;
  closeMenu(true);
  if (/^#\/[a-z]+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}

function tick() {
  const now = new Date();
  $('p-clock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  $('p-date').textContent = new Intl.DateTimeFormat('id-ID', { timeZone: CFG.TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

// Router: satu halaman tampil sekaligus, alamatnya #/nama. Tombol Back HP ikut bekerja.
function pageFromHash() {
  const m = location.hash.match(/^#\/([a-z]+)$/);
  return (m && PAGES[m[1]]) ? m[1] : 'dashboard';
}
function route() {
  const p = pageFromHash();
  if (location.hash !== '#/' + p) history.replaceState(null, '', location.pathname + location.search + '#/' + p);
  document.querySelectorAll('#p-main .page').forEach((el) => { el.hidden = (el.dataset.page !== p); });
  document.querySelectorAll('#p-drawer a[data-page]').forEach((a) => {
    const on = a.dataset.page === p;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  closeMenu(true);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (!$('v-personal').hidden) route(); });

// Drawer menu
function openMenu() {
  $('p-drawer').classList.add('open');
  $('p-overlay').hidden = false;
  $('p-menu').setAttribute('aria-expanded', 'true');
  const first = $('p-drawer').querySelector('a.on') || $('p-drawer').querySelector('a');
  if (first) first.focus();
}
function closeMenu(noFocus) {
  const d = $('p-drawer');
  if (!d.classList.contains('open')) return;
  d.classList.remove('open');
  $('p-overlay').hidden = true;
  $('p-menu').setAttribute('aria-expanded', 'false');
  if (!noFocus) $('p-menu').focus();
}
$('p-menu').addEventListener('click', () => { $('p-drawer').classList.contains('open') ? closeMenu() : openMenu(); });
$('p-overlay').addEventListener('click', () => closeMenu());
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenu(); });
document.querySelectorAll('#p-drawer a[data-page]').forEach((a) => a.addEventListener('click', () => closeMenu(true)));
$('m-switch').addEventListener('click', () => { closeMenu(true); show('select'); });
$('m-logout').addEventListener('click', () => { closeMenu(true); logout(); });

// jdw
// (Berikutnya: #jdw-today, #jdw-attend, halaman Jadwal #jdw-page, rekap #att-page)

// tgs
// (Berikutnya: #tgs-near, #tgs-progress, halaman Tugas #tgs-page, Progress #prg-page)

// ctt
// (Berikutnya: #ctt-list, halaman Catatan #ctt-page)

// fin
// Keuangan: Coming Soon. Hanya membuka CFG.FINANCE_URL, tanpa API dan tanpa data.
document.querySelectorAll('.js-fin').forEach((b) => b.addEventListener('click', () => {
  if (CFG.FINANCE_URL.indexOf('GANTI') !== -1) { toast('URL keuangan belum diisi di script.js (CFG.FINANCE_URL).'); return; }
  window.open(CFG.FINANCE_URL, '_blank', 'noopener');
}));

// gsr
$('g-back').addEventListener('click', () => show('select'));
