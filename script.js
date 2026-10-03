// cfg
const CFG = {
  API_URL: 'GANTI_DENGAN_URL_EXEC',        // URL Web App Apps Script (berakhiran /exec)
  FINANCE_URL: 'https://GANTI-URL-KEUANGAN', // URL web keuangan
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
    show('select');
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
  try { await api('auth.logout'); } catch (e) { /* tetap keluar walau server gagal */ }
  SES.clear();
  $('l-user').value = '';
  show('login');
}

// sel
$('s-personal').addEventListener('click', () => show('personal'));
$('s-gsr').addEventListener('click', () => show('gsr'));
$('s-logout').addEventListener('click', logout);

// pers
let clockTimer = null;
function persEnter() {
  setName(SES.name);
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
}
function persLeave() { clearInterval(clockTimer); clockTimer = null; }

function tick() {
  const now = new Date();
  $('p-clock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  $('p-date').textContent = new Intl.DateTimeFormat('id-ID', { timeZone: CFG.TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}
$('p-back').addEventListener('click', () => show('select'));
$('p-logout').addEventListener('click', logout);

// jdw
// (Fase berikutnya: jadwal hari ini, kehadiran, kelola jadwal)

// tgs
// (Fase berikutnya: tugas terdekat, progress, CRUD tugas)

// ctt
// (Fase berikutnya: catatan tambah/edit/hapus)

// fin
$('fin-open').addEventListener('click', () => {
  if (CFG.FINANCE_URL.indexOf('GANTI') !== -1) { toast('URL keuangan belum diisi di script.js (CFG.FINANCE_URL).'); return; }
  window.open(CFG.FINANCE_URL, '_blank', 'noopener');
});

// gsr
$('g-back').addEventListener('click', () => show('select'));
