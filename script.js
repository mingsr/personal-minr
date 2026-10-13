// cfg
const CFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxk7rjjFRobxTh2h2SpJBJ2XN8CaBxIDAMlbtXN72dcFkmooyiw7PJv9ORRLrfoJFHAcA/exec',        // URL Web App Apps Script (berakhiran /exec)
  FINANCE_URL: 'https://mingsr.github.io/tabugan-pribadi/', // URL web keuangan
  BACKEND_BUILD: '2026-10-13-reminders',   // versi backend minimum yang dibutuhkan frontend ini (cocokkan dengan BACKEND_BUILD di Main.gs)
  TZ: 'Asia/Jakarta',
  TIMEOUT_MS: 30000,
  EVENT_COLORS: { jadwal: '#3b82f6', berubah: '#f97316', tugas: '#eab308', acara: '#22c55e', deadline: '#ef4444', lainnya: '#a855f7' }
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
    if (code === 'NOT_FOUND' && json && /Action tidak dikenal/.test(String(json.error))) {
      console.warn('[PLD] Backend tidak mengenal action "' + action + '". Deployment Web App kemungkinan masih versi lama.');
      showBackendOld('Backend yang dideploy belum mengenal action "' + action + '".');
      throw mkErr('BACKEND_OLD', 'Backend belum diperbarui (action "' + action + '" tidak dikenal). Lihat pesan di atas.');
    }
    if (code === 'UNAUTHORIZED' && action !== 'auth.login') { endSession('Sesi berakhir, silakan login ulang.'); }
    throw mkErr(code, (json && json.error) || 'Terjadi kesalahan.');
  }
  return json.data;
}
// Diagnosis versi backend: GET /exec mengembalikan { build }. Deployment lama tidak punya field itu.
function showBackendOld(detail) {
  const el = $('backend-old'); if (!el) return;
  el.textContent = detail + ' Buka Apps Script → Deploy → Manage deployments → ikon pensil → Version: "New version" → Deploy. ' +
    'URL /exec harus tetap yang sama dengan CFG.API_URL.';
  el.hidden = false;
}
async function checkBackend() {
  if (CFG.API_URL.indexOf('GANTI') === 0) return;
  try {
    const r = await fetch(CFG.API_URL, { method: 'GET' });
    const j = await r.json();
    const build = j && j.data && j.data.build;
    if (build !== CFG.BACKEND_BUILD) {
      console.warn('[PLD] Build backend: ' + (build || '(tidak ada, deployment lama)') + ' | dibutuhkan: ' + CFG.BACKEND_BUILD);
      showBackendOld('Versi backend yang dideploy: ' + (build || 'lama (tanpa penanda versi)') + ', frontend membutuhkan ' + CFG.BACKEND_BUILD + '.');
    } else { const el = $('backend-old'); if (el) el.hidden = true; }
  } catch (e) { console.warn('[PLD] Tidak bisa memeriksa versi backend (GET /exec): ' + e.message); }
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
  SES.clear(); resetData();
  show('login');
  $('l-pass').value = '';
  if (msg) showLoginError(msg);
}

async function boot() {
  $('l-btn').disabled = false;
  if (!SES.token) { show('login'); $('boot').hidden = true; return; }
  try {
    const me = await api('auth.me');
    DATA.me = me;
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
  SES.clear(); resetData();
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
  checkBackend();
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
  route();
  if (!DATA.me) loadMe().then(() => { if (DATA.tasks) renderTasks(); });
}
function persLeave() {
  clearInterval(clockTimer); clockTimer = null;
  closeMenu(true);
  if (/^#\/[a-z]+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}

function greeting() {
  const hr = parseInt(jktNow().hm.slice(0, 2), 10);
  return hr >= 4 && hr < 11 ? 'Selamat pagi' : hr >= 11 && hr < 15 ? 'Selamat siang' : hr >= 15 && hr < 18 ? 'Selamat sore' : 'Selamat malam';
}
function tick() {
  const now = new Date();
  $('p-greet').textContent = greeting();
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
  loadForPage(p);
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

// jdw: lihat bagian "jadwal" di bawah (ensureToday, ensureJadwal, ensureKalender, ensureAttAll)

// ---------- util tampilan ----------
/** Buat elemen DOM. Teks selalu lewat textContent (tidak ada innerHTML dari data pengguna). */
function h(tag, props, kids) {
  const el = document.createElement(tag);
  Object.keys(props || {}).forEach((k) => {
    const v = props[k];
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  (kids || []).forEach((c) => { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
}

// ---------- waktu (Asia/Jakarta) ----------
function jktNow() {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: CFG.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  return { ymd: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute };
}
function ymdToUtc(ymd) { const a = ymd.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
function daysBetween(fromYmd, toYmd) { return Math.round((ymdToUtc(toYmd) - ymdToUtc(fromYmd)) / 86400000); }
function fmtDeadline(dl) {
  const ymd = dl.slice(0, 10), hm = dl.slice(11, 16);
  const d = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ymdToUtc(ymd)));
  return d + ' · ' + hm;
}

// ---------- data ----------
const DATA = { me: null, tasks: null, notes: null, tasksAt: 0, notesAt: 0, filter: 'aktif',
  sched: null, ovs: null, metaAt: 0, weekStart: null, week: null, weekAt: 0, today: null, todayAt: 0, attAll: null, attAllAt: 0, calMonth: null, cal: null, calAt: 0, notif: null, notifAt: 0 };
const STALE_MS = 30000;
function resetData() {
  DATA.me = null; DATA.tasks = null; DATA.notes = null; DATA.tasksAt = 0; DATA.notesAt = 0; DATA.filter = 'aktif';
  DATA.sched = null; DATA.ovs = null; DATA.metaAt = 0; DATA.weekStart = null; DATA.week = null; DATA.weekAt = 0; DATA.today = null; DATA.todayAt = 0;
  DATA.attAll = null; DATA.attAllAt = 0; DATA.calMonth = null; DATA.cal = null; DATA.calAt = 0; DATA.notif = null; DATA.notifAt = 0;
}
function warnDays() { return (DATA.me && DATA.me.deadlineWarningDays) || 7; }

async function loadMe() {
  try { DATA.me = await api('auth.me'); } catch (e) { /* non-fatal: pakai bawaan 7 hari */ }
}
function loadFailed(slot, msg, retry) {
  clear(slot);
  slot.appendChild(h('div', { class: 'load-err' }, [h('p', { class: 'msg-error', text: msg }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Muat ulang', onclick: retry })]));
}

// ---------- dialog ----------
function confirmDialog(message, yesLabel, danger) {
  return new Promise((resolve) => {
    const d = $('d-confirm');
    $('dc-msg').textContent = message;
    const yes = $('dc-yes');
    yes.textContent = yesLabel || 'Ya';
    yes.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    let result = false;
    const done = () => { d.removeEventListener('close', done); $('dc-form').onsubmit = null; $('dc-no').onclick = null; resolve(result); };
    d.addEventListener('close', done);
    $('dc-form').onsubmit = (ev) => { ev.preventDefault(); result = true; d.close(); };
    $('dc-no').onclick = () => d.close();
    d.showModal();
  });
}

// ---------- tugas ----------
const T_FILTERS = [['aktif', 'Aktif'], ['dekat', 'Mendekati deadline'], ['selesai', 'Selesai'], ['semua', 'Semua']];

function taskState(t) {
  if (t.status === 'SELESAI') return 'done';
  const now = jktNow();
  const dl = t.deadline;
  if (dl < now.ymd + ' ' + now.hm) return 'late';
  if (daysBetween(now.ymd, dl.slice(0, 10)) <= warnDays()) return 'soon';
  return 'normal';
}
function sortTasks(list) {
  return list.slice().sort((a, b) => {
    if ((a.status === 'SELESAI') !== (b.status === 'SELESAI')) return a.status === 'SELESAI' ? 1 : -1;
    if (a.deadline !== b.deadline) return a.status === 'SELESAI' ? (a.deadline < b.deadline ? 1 : -1) : (a.deadline < b.deadline ? -1 : 1);
    return a.title < b.title ? -1 : 1;
  });
}
function filterTasks(list, f) {
  return list.filter((t) => {
    const s = taskState(t);
    if (f === 'aktif') return t.status === 'BELUM';
    if (f === 'dekat') return s === 'late' || s === 'soon';
    if (f === 'selesai') return t.status === 'SELESAI';
    return true;
  });
}
function syncChip(o) {
  const label = { SYNCED: 'Tersinkron', PENDING: 'Menunggu sinkron', FAILED: 'Gagal sinkron' }[o.syncStatus] || o.syncStatus;
  return h('span', { class: 'chip s-' + o.syncStatus, text: label, title: o.syncError || '' });
}
function syncToast(what, rec) {
  if (!rec || !rec.syncStatus || rec.syncStatus === 'SYNCED') return what + '.';
  if (rec.syncStatus === 'FAILED') return what + ', tetapi sinkron ke Calendar gagal' + (rec.syncError ? ' (' + rec.syncError + ')' : '') + '.';
  return what + '. Sinkronisasi ke Calendar belum selesai.';
}
function putTask(t) {
  const i = DATA.tasks.findIndex((x) => x.id === t.id);
  if (i === -1) DATA.tasks.push(t); else DATA.tasks[i] = t;
}

async function ensureTasks(force) {
  if (!force && DATA.tasks && Date.now() - DATA.tasksAt < STALE_MS) { renderTasks(); return; }
  if (DATA.tasks) renderTasks(); // tampilkan data lama sambil memuat
  try {
    const r = await api('task.list');
    DATA.tasks = r.tasks; DATA.tasksAt = Date.now();
    renderTasks();
    if (r.skipped && r.skipped.length) toast(r.skipped.length + ' baris tugas tidak valid di Sheets dilewati.');
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.tasks) {
      ['tgs-page', 'tgs-near', 'tgs-progress', 'prg-page'].forEach((id) => loadFailed($(id), 'Gagal memuat tugas: ' + e.message, () => ensureTasks(true)));
    } else toast('Gagal menyegarkan tugas: ' + e.message);
  }
}

function renderTasks() {
  if (!DATA.tasks) return;
  renderTaskTabs(); renderTaskSyncBar(); renderTaskPage(); renderTaskNear(); renderTaskSummary(); renderProgressPage();
}
function renderTaskTabs() {
  const box = $('tgs-tabs'); clear(box);
  T_FILTERS.forEach((f) => {
    const n = filterTasks(DATA.tasks, f[0]).length;
    box.appendChild(h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(DATA.filter === f[0]), text: f[1] + ' (' + n + ')',
      onclick: () => { DATA.filter = f[0]; renderTaskTabs(); renderTaskPage(); } }));
  });
}
function renderTaskSyncBar() {
  const bar = $('tgs-sync');
  const bad = DATA.tasks.filter((t) => t.syncStatus !== 'SYNCED');
  if (!bad.length) { bar.hidden = true; return; }
  const failed = bad.filter((t) => t.syncStatus === 'FAILED').length;
  clear(bar);
  bar.appendChild(h('span', { text: bad.length + ' tugas belum tersinkron ke Google Calendar' + (failed ? ' (' + failed + ' gagal)' : '') + '. Data tetap aman di Sheets.' }));
  bar.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Sinkronkan ulang', onclick: async (ev) => {
    const b = ev.currentTarget; setBusy(b, true, 'Menyinkronkan...');
    try {
      const r = await api('calendar.resync', {});
      toast('Resync selesai: ' + r.synced + ' berhasil' + (r.failed ? ', ' + r.failed + ' gagal' : '') + (r.remaining ? ', ' + r.remaining + ' tersisa (jalankan lagi)' : '') + '.');
      await ensureTasks(true);
    } catch (e) { toast(e.message); setBusy(b, false); }
  } }));
  bar.hidden = false;
}

function taskItem(t) {
  const st = taskState(t);
  const stateChip = st === 'late' ? h('span', { class: 'chip late', text: 'Terlambat' }) : st === 'soon' ? h('span', { class: 'chip soon', text: 'Mendekati deadline' }) : null;
  const li = h('li', { class: 'item' + (st === 'done' ? ' done' : st === 'late' ? ' late' : st === 'soon' ? ' soon' : ''), 'data-id': t.id });
  li.appendChild(h('div', { class: 'item-head' }, [
    h('div', {}, [h('p', { class: 'item-title', text: t.title }), h('p', { class: 'item-meta', text: t.course + ' · ' + fmtDeadline(t.deadline) })]),
    h('div', {}, [h('span', { class: 'chip p-' + t.priority, text: t.priority.charAt(0) + t.priority.slice(1).toLowerCase() })])
  ]));
  li.appendChild(h('div', { class: 'item-meta' }, [t.status === 'SELESAI' ? h('span', { class: 'chip s-SYNCED', text: 'Selesai' }) : h('span', { class: 'chip', text: 'Belum selesai' }), ' ', stateChip, ' ', syncChip(t)]));
  if (t.latestNote) li.appendChild(h('p', { class: 'item-note', text: t.latestNote }));

  // progres: slider; hanya "change" (lepas jari) yang menyimpan
  const out = h('output', { text: t.progress + '%' });
  const slider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(t.progress), 'aria-label': 'Progres ' + t.title,
    oninput: () => { out.textContent = slider.value + '%'; },
    onchange: async () => {
      const v = parseInt(slider.value, 10);
      if (v === t.progress) return;
      slider.disabled = true;
      try {
        const rec = await api('task.update', { id: t.id, progress: v });
        putTask(rec); renderTasks(); toast(syncToast('Progres disimpan', rec));
      } catch (e) { slider.value = String(t.progress); out.textContent = t.progress + '%'; slider.disabled = false; toast(e.message); }
    } });
  li.appendChild(h('div', { class: 'prog-row' }, [slider, out]));
  li.appendChild(h('div', { class: 'bar' + (t.progress === 100 ? ' full' : '') }, [h('i', { style: 'width:' + t.progress + '%' })]));
  if (t.status === 'BELUM' && t.progress === 100) li.appendChild(h('div', { class: 'banner', text: 'Progres sudah 100%. Tugas ini belum ditandai selesai. Konfirmasi di bawah bila sudah benar-benar selesai.' }));

  const acts = h('div', { class: 'item-actions' });
  if (t.status === 'BELUM') acts.appendChild(h('button', { class: 'btn btn-ok btn-sm', type: 'button', text: 'Tandai selesai', onclick: (ev) => markDone(t, ev.currentTarget) }));
  else acts.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Buka kembali', onclick: (ev) => reopenTask(t, ev.currentTarget) }));
  acts.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ubah', onclick: () => openTaskDialog(t) }));
  acts.appendChild(h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Hapus', onclick: (ev) => deleteTask(t, ev.currentTarget) }));
  li.appendChild(acts);
  if (t.syncStatus === 'FAILED' && t.syncError) li.appendChild(h('p', { class: 'msg-error', text: 'Sinkron Calendar: ' + t.syncError }));
  return li;
}
function renderTaskPage() {
  const box = $('tgs-page'); clear(box);
  const list = sortTasks(filterTasks(DATA.tasks, DATA.filter));
  if (!list.length) { box.appendChild(h('p', { class: 'empty', text: DATA.tasks.length ? 'Tidak ada tugas pada filter ini.' : 'Belum ada tugas. Tekan "+ Tambah Tugas".' })); return; }
  const ul = h('ul', { class: 'list' }); list.forEach((t) => ul.appendChild(taskItem(t))); box.appendChild(ul);
}
function renderTaskNear() {
  const box = $('tgs-near'); clear(box);
  const list = sortTasks(DATA.tasks.filter((t) => { const s = taskState(t); return s === 'late' || s === 'soon'; }));
  if (!list.length) { box.appendChild(h('p', { class: 'empty', text: 'Tidak ada tugas yang mendekati deadline (' + warnDays() + ' hari).' })); return; }
  const m = h('div', { class: 'mini' });
  list.slice(0, 5).forEach((t) => {
    const s = taskState(t);
    m.appendChild(h('div', { class: 'row' }, [h('span', { text: t.title + ' — ' + t.course }), h('span', { class: 'chip ' + s, text: (s === 'late' ? 'Terlambat · ' : '') + fmtDeadline(t.deadline) })]));
  });
  if (list.length > 5) m.appendChild(h('p', { class: 'muted', text: '+' + (list.length - 5) + ' tugas lain' }));
  box.appendChild(m);
}
function taskStats() {
  const all = DATA.tasks, open = all.filter((t) => t.status === 'BELUM'), done = all.length - open.length;
  const avg = open.length ? Math.round(open.reduce((a, t) => a + t.progress, 0) / open.length) : 0;
  return { total: all.length, open: open.length, done: done, avgOpen: avg, late: open.filter((t) => taskState(t) === 'late').length };
}
function renderTaskSummary() {
  const box = $('tgs-progress'); clear(box);
  const s = taskStats();
  if (!s.total) { box.appendChild(h('p', { class: 'empty', text: 'Belum ada tugas.' })); return; }
  box.appendChild(h('p', { class: 'item-meta', text: s.done + ' dari ' + s.total + ' tugas selesai · ' + s.open + ' aktif' }));
  box.appendChild(h('div', { class: 'bar' + (s.done === s.total ? ' full' : '') }, [h('i', { style: 'width:' + Math.round(s.done / s.total * 100) + '%' })]));
  box.appendChild(h('p', { class: 'item-meta', text: 'Rata-rata progres tugas aktif: ' + s.avgOpen + '%' }));
}
function renderProgressPage() {
  const box = $('prg-page'); clear(box);
  const s = taskStats();
  if (!s.total) { box.appendChild(h('p', { class: 'empty', text: 'Belum ada tugas.' })); return; }
  const grid = h('div', { class: 'stat-grid' });
  [[s.total, 'Total tugas'], [s.open, 'Aktif'], [s.done, 'Selesai'], [s.late, 'Terlambat']].forEach((x) => grid.appendChild(h('div', { class: 'stat' }, [h('b', { text: String(x[0]) }), h('span', { text: x[1] })])));
  box.appendChild(grid);
  box.appendChild(h('h2', { text: 'Per mata kuliah / kategori' }));
  const by = {};
  DATA.tasks.forEach((t) => { (by[t.course] = by[t.course] || []).push(t); });
  const m = h('div', { class: 'mini' });
  Object.keys(by).sort().forEach((c) => {
    const l = by[c], done = l.filter((t) => t.status === 'SELESAI').length;
    const open = l.filter((t) => t.status === 'BELUM'), avg = open.length ? Math.round(open.reduce((a, t) => a + t.progress, 0) / open.length) : 100;
    m.appendChild(h('div', {}, [
      h('div', { class: 'row' }, [h('span', { text: c }), h('span', { class: 'muted', text: done + '/' + l.length + ' selesai · progres aktif ' + (open.length ? avg + '%' : '-') })]),
      h('div', { class: 'bar' + (done === l.length ? ' full' : '') }, [h('i', { style: 'width:' + Math.round(done / l.length * 100) + '%' })])
    ]));
  });
  box.appendChild(m);
}

async function markDone(t, btn) {
  if (!(await confirmDialog('Tandai "' + t.title + '" sebagai selesai?', 'Tandai selesai'))) return;
  setBusy(btn, true, 'Menyimpan...');
  try { const rec = await api('task.update', { id: t.id, status: 'SELESAI' }); putTask(rec); renderTasks(); toast(syncToast('Tugas ditandai selesai', rec)); }
  catch (e) { setBusy(btn, false); toast(e.message); }
}
async function reopenTask(t, btn) {
  setBusy(btn, true, 'Menyimpan...');
  try { const rec = await api('task.update', { id: t.id, status: 'BELUM' }); putTask(rec); renderTasks(); toast(syncToast('Tugas dibuka kembali', rec)); }
  catch (e) { setBusy(btn, false); toast(e.message); }
}
async function deleteTask(t, btn) {
  if (!(await confirmDialog('Hapus tugas "' + t.title + '" secara permanen? Event Calendar-nya juga dihapus.', 'Hapus', true))) return;
  setBusy(btn, true, 'Menghapus...');
  try {
    await api('task.delete', { id: t.id });
    DATA.tasks = DATA.tasks.filter((x) => x.id !== t.id); renderTasks(); toast('Tugas dihapus.');
  } catch (e) { setBusy(btn, false); toast(e.message); } // backend membatalkan hapus bila event Calendar gagal dihapus; pesannya ditampilkan apa adanya
}

// dialog tambah/ubah tugas
let editingTask = null;
function openTaskDialog(t) {
  editingTask = t || null;
  $('dt-title-h').textContent = t ? 'Ubah Tugas' : 'Tambah Tugas';
  $('dt-title').value = t ? t.title : '';
  $('dt-course').value = t ? t.course : '';
  $('dt-date').value = t ? t.deadline.slice(0, 10) : '';
  $('dt-time').value = t ? t.deadline.slice(11, 16) : '23:59';
  $('dt-prio').value = t ? t.priority : 'SEDANG';
  $('dt-prog').value = t ? String(t.progress) : '0';
  $('dt-status').value = t ? t.status : 'BELUM';
  $('dt-status-wrap').hidden = !t;
  $('dt-note').value = t ? t.latestNote : '';
  $('dt-err').hidden = true;
  $('d-task').showModal();
  $('dt-title').focus();
}
$('tgs-add').addEventListener('click', () => openTaskDialog(null));
$('dt-cancel').addEventListener('click', () => $('d-task').close());
$('dt-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = (m) => { $('dt-err').textContent = m; $('dt-err').hidden = false; };
  const title = $('dt-title').value.trim(), course = $('dt-course').value.trim();
  const date = $('dt-date').value, time = $('dt-time').value;
  const progRaw = $('dt-prog').value.trim();
  if (!title) return err('Judul wajib diisi.');
  if (!course) return err('Mata kuliah / kategori wajib diisi.');
  if (!date || !time) return err('Tanggal dan jam deadline wajib diisi.');
  if (!/^\d{1,3}$/.test(progRaw) || +progRaw > 100) return err('Progres harus bilangan bulat 0-100.');
  const want = { title: title, course: course, deadline: date + ' ' + time, priority: $('dt-prio').value, progress: parseInt(progRaw, 10), latestNote: $('dt-note').value.trim() };
  const btn = $('dt-save');
  setBusy(btn, true, 'Menyimpan...');
  try {
    let rec;
    if (editingTask) {
      want.status = $('dt-status').value;
      const diff = { id: editingTask.id };
      Object.keys(want).forEach((k) => { if (String(want[k]) !== String(editingTask[k])) diff[k] = want[k]; });
      if (Object.keys(diff).length === 1) { $('d-task').close(); toast('Tidak ada perubahan.'); return; }
      rec = await api('task.update', diff);
    } else {
      rec = await api('task.create', want);
    }
    putTask(rec); $('d-task').close(); renderTasks();
    toast(syncToast(editingTask ? 'Tugas diperbarui' : 'Tugas ditambahkan', rec));
  } catch (e) { err(e.message); }
  finally { setBusy(btn, false); }
});

// ---------- catatan ----------
async function ensureNotes(force) {
  if (!force && DATA.notes && Date.now() - DATA.notesAt < STALE_MS) { renderNotes(); return; }
  if (DATA.notes) renderNotes();
  try {
    const r = await api('note.list');
    DATA.notes = r.notes; DATA.notesAt = Date.now(); renderNotes();
    if (r.skipped && r.skipped.length) toast(r.skipped.length + ' baris catatan tidak valid di Sheets dilewati.');
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.notes) ['ctt-page', 'ctt-list'].forEach((id) => loadFailed($(id), 'Gagal memuat catatan: ' + e.message, () => ensureNotes(true)));
    else toast('Gagal menyegarkan catatan: ' + e.message);
  }
}
function sortedNotes() { return DATA.notes.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)); }
function fmtStamp(s) { return String(s || '').slice(0, 16); }
function renderNotes() {
  if (!DATA.notes) return;
  const page = $('ctt-page'); clear(page);
  const list = sortedNotes();
  if (!list.length) page.appendChild(h('p', { class: 'empty', text: 'Belum ada catatan.' }));
  else {
    const ul = h('ul', { class: 'list' });
    list.forEach((n) => ul.appendChild(h('li', { class: 'item' }, [
      h('p', { class: 'item-note', text: n.content }),
      h('p', { class: 'item-meta', text: 'Diubah ' + fmtStamp(n.updatedAt) }),
      h('div', { class: 'item-actions' }, [
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ubah', onclick: () => openNoteDialog(n) }),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Hapus', onclick: (ev) => deleteNote(n, ev.currentTarget) })
      ])
    ])));
    page.appendChild(ul);
  }
  const mini = $('ctt-list'); clear(mini);
  if (!list.length) mini.appendChild(h('p', { class: 'empty', text: 'Belum ada catatan.' }));
  else {
    const m = h('div', { class: 'mini' });
    list.slice(0, 5).forEach((n) => m.appendChild(h('div', { class: 'row' }, [h('span', { text: n.content.length > 80 ? n.content.slice(0, 80) + '…' : n.content })])));
    mini.appendChild(m);
  }
}
$('ctt-new').addEventListener('input', () => { $('ctt-count').textContent = $('ctt-new').value.length + '/1000'; });
$('ctt-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const content = $('ctt-new').value.trim();
  if (!content) { toast('Catatan tidak boleh kosong.'); return; }
  const btn = $('ctt-save'); setBusy(btn, true, 'Menyimpan...');
  try {
    const rec = await api('note.create', { content: content });
    if (!DATA.notes) DATA.notes = [];
    DATA.notes.push(rec); $('ctt-new').value = ''; $('ctt-count').textContent = '0/1000'; renderNotes(); toast('Catatan disimpan.');
  } catch (e) { toast(e.message); }
  finally { setBusy(btn, false); }
});
let editingNote = null;
function openNoteDialog(n) { editingNote = n; $('dn-content').value = n.content; $('dn-err').hidden = true; $('d-note').showModal(); $('dn-content').focus(); }
$('dn-cancel').addEventListener('click', () => $('d-note').close());
$('dn-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const content = $('dn-content').value.trim();
  const err = (m) => { $('dn-err').textContent = m; $('dn-err').hidden = false; };
  if (!content) return err('Catatan tidak boleh kosong.');
  const btn = $('dn-save'); setBusy(btn, true, 'Menyimpan...');
  try {
    const rec = await api('note.update', { id: editingNote.id, content: content });
    const i = DATA.notes.findIndex((x) => x.id === rec.id); if (i !== -1) DATA.notes[i] = rec;
    $('d-note').close(); renderNotes(); toast('Catatan diperbarui.');
  } catch (e) { err(e.message); }
  finally { setBusy(btn, false); }
});
async function deleteNote(n, btn) {
  if (!(await confirmDialog('Hapus catatan ini secara permanen?', 'Hapus', true))) return;
  setBusy(btn, true, 'Menghapus...');
  try { await api('note.delete', { id: n.id }); DATA.notes = DATA.notes.filter((x) => x.id !== n.id); renderNotes(); toast('Catatan dihapus.'); }
  catch (e) { setBusy(btn, false); toast(e.message); }
}

// ---------- tanggal (kalender Jakarta, semuanya yyyy-MM-dd) ----------
const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
function addDays(ymd, n) { return new Date(ymdToUtc(ymd) + n * 86400000).toISOString().slice(0, 10); }
function dowOf(ymd) { return ((new Date(ymdToUtc(ymd)).getUTCDay() + 6) % 7) + 1; } // 1=Senin ... 7=Minggu (sama dengan backend)
function weekStartOf(ymd) { return addDays(ymd, -(dowOf(ymd) - 1)); }
function fmtDay(ymd) { return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ymdToUtc(ymd))); }
function fmtShort(ymd) { return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ymdToUtc(ymd))); }
function fmtMonth(ym) { return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(ymdToUtc(ym + '-01'))); }
function modeLabel(m) { return m === 'ONLINE' ? 'Online' : 'Offline'; }
function modeChip(m) { return h('span', { class: 'chip ' + (m === 'ONLINE' ? 'online' : 'offline'), text: modeLabel(m) }); }

// ---------- data jadwal / kehadiran ----------
function attMap(list) { const m = {}; list.forEach((a) => { m[a.scheduleId + '|' + a.occurrenceDate] = a; }); return m; }
function invalidateSched() { DATA.metaAt = 0; DATA.weekAt = 0; DATA.todayAt = 0; DATA.attAllAt = 0; DATA.calAt = 0; DATA.notifAt = 0; }
function refreshCurrent() { invalidateSched(); loadForPage(pageFromHash()); }
function noteSkipped(r1, r2) {
  const n = ((r1 && r1.skipped) || []).length + ((r2 && r2.skipped) || []).length;
  if (n) toast(n + ' baris jadwal/override tidak valid di Sheets dilewati.');
}
async function ensureMeta(force) {
  if (!force && DATA.sched && DATA.ovs && Date.now() - DATA.metaAt < STALE_MS) return;
  const r = await Promise.all([api('schedule.list'), api('override.list', {})]);
  DATA.sched = r[0].schedules; DATA.ovs = r[1].overrides; DATA.metaAt = Date.now();
  noteSkipped(r[0], r[1]);
}
async function fetchWeek(from, to) { // pertemuan EFEKTIF (sudah memuat override) + kehadirannya
  const r = await Promise.all([api('schedule.effective', { from: from, to: to }), api('attendance.list', { occurrenceDateFrom: from, occurrenceDateTo: to })]);
  return { from: from, to: to, occ: r[0].occurrences, att: attMap(r[1].attendance) };
}
function schedName(id) { const s = (DATA.sched || []).find((x) => x.id === id); return s ? s.courseName : id; }
function ovFor(scheduleId, originalDate) { return (DATA.ovs || []).find((o) => o.scheduleId === scheduleId && o.originalDate === originalDate) || null; }

// ---------- kartu pertemuan + kehadiran ----------
function attChip(rec, past) {
  if (rec) return h('span', { class: 'chip ' + (rec.status === 'HADIR' ? 'hadir' : 'absen'), text: rec.status === 'HADIR' ? 'Hadir' : 'Tidak hadir' });
  return h('span', { class: 'chip belum', text: past ? 'Belum dicatat' : 'Belum mulai' });
}
function occChips(o, rec, today) {
  const ov = ovFor(o.scheduleId, o.originalDate);
  const kids = [modeChip(o.mode)];
  if (today !== null) kids.push(attChip(rec, o.date <= today)); // null = tanpa kehadiran (mis. detail kalender)
  if (o.isChanged) kids.push(h('span', { class: 'chip changed', text: o.overrideType === 'PINDAH' ? 'Dipindah dari ' + fmtShort(o.originalDate) : o.overrideType === 'UBAH_MODE' ? 'Mode diubah' : 'Diubah' }));
  if (rec && rec.status === 'HADIR' && rec.photoFileId) kids.push(h('span', { class: 'chip photo', text: 'Foto tersimpan' }));
  if (ov && ov.syncStatus !== 'SYNCED') kids.push(syncChip(ov));
  return h('div', { class: 'chips' }, kids);
}
function attButtons(o, rec, today) {
  const box = h('div', { class: 'item-actions' });
  if (o.date > today) { box.appendChild(h('p', { class: 'item-meta', text: 'Kehadiran bisa dicatat mulai tanggal pertemuan.' })); return box; }
  [['HADIR', 'Hadir'], ['TIDAK_HADIR', 'Tidak hadir']].forEach((x) => {
    const on = rec && rec.status === x[0];
    box.appendChild(h('button', { class: 'btn btn-sm ' + (on ? 'btn-ok' : 'btn-ghost'), type: 'button', 'aria-pressed': String(!!on), text: x[1],
      onclick: (ev) => setAttendance(o, rec, x[0], ev.currentTarget) }));
  });
  if (rec && rec.status === 'HADIR') box.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: rec.photoFileId ? 'Ganti foto' : 'Tambah foto', onclick: (ev) => pickPhoto(o, ev.currentTarget) }));
  return box;
}
function occItem(o, att, today, withActions) {
  const rec = att[o.scheduleId + '|' + o.date] || null;
  const li = h('li', { class: 'item' + (o.isChanged ? ' changed' : '') });
  li.appendChild(h('div', { class: 'item-head' }, [h('div', {}, [
    h('p', { class: 'item-title', text: o.courseName }),
    h('p', { class: 'item-meta', text: o.startTime + '–' + o.endTime + (o.location ? ' · ' + o.location : '') })
  ])]));
  li.appendChild(occChips(o, rec, today));
  if (o.note) li.appendChild(h('p', { class: 'item-note', text: o.note }));
  if (withActions) li.appendChild(attButtons(o, rec, today));
  return li;
}

async function setAttendance(o, rec, status, btn) {
  if (rec && rec.status === status) { toast('Status itu sudah tercatat.'); return; }
  if (status === 'TIDAK_HADIR' && rec && rec.photoFileId && !(await confirmDialog('Foto kehadiran untuk pertemuan ini akan dihapus (dipindah ke trash Drive). Lanjutkan?', 'Tandai tidak hadir', true))) return;
  setBusy(btn, true, 'Menyimpan...');
  try {
    await api('attendance.set', { scheduleId: o.scheduleId, occurrenceDate: o.date, status: status });
    toast('Kehadiran dicatat: ' + (status === 'HADIR' ? 'Hadir' : 'Tidak hadir') + '.');
    refreshCurrent();
  } catch (e) { setBusy(btn, false); toast(e.message); }
}

// foto: dikompres di browser menjadi JPEG <= ~1,8 MB (batas backend 2 MB, hanya JPEG)
async function loadBitmap(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* coba cara lain */ } }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(mkErr('VALIDATION_ERROR', 'File tidak bisa dibaca sebagai gambar.')); };
    img.src = url;
  });
}
async function toJpegBase64(file) {
  if (!/^image\//.test(file.type)) throw mkErr('VALIDATION_ERROR', 'File harus berupa gambar.');
  const bmp = await loadBitmap(file);
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const tries = [[1600, 0.85], [1280, 0.75], [1024, 0.65], [800, 0.55]];
  for (let i = 0; i < tries.length; i++) {
    const k = Math.min(1, tries[i][0] / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', tries[i][1]));
    if (blob && blob.size <= 1900000) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1]);
        fr.onerror = () => reject(mkErr('VALIDATION_ERROR', 'Gagal membaca foto.'));
        fr.readAsDataURL(blob);
      });
    }
  }
  throw mkErr('VALIDATION_ERROR', 'Foto terlalu besar. Pilih foto lain.');
}
function pickPhoto(o, btn) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    setBusy(btn, true, 'Mengunggah...');
    try {
      const b64 = await toJpegBase64(f);
      await api('attendance.uploadPhoto', { scheduleId: o.scheduleId, occurrenceDate: o.date, imageBase64: b64, mimeType: 'image/jpeg' });
      toast('Foto kehadiran disimpan.'); refreshCurrent();
    } catch (e) { setBusy(btn, false); toast(e.message); }
  });
  inp.click();
}

function buildSyncBar(bar, bad, noun, onDone) {
  if (!bad) { bar.hidden = true; return; }
  clear(bar);
  bar.appendChild(h('span', { text: bad + ' ' + noun + ' belum tersinkron ke Google Calendar. Data tetap aman di Sheets.' }));
  bar.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Sinkronkan ulang', onclick: async (ev) => {
    const b = ev.currentTarget; setBusy(b, true, 'Menyinkronkan...');
    try {
      const r = await api('calendar.resync', {});
      toast('Resync selesai: ' + r.synced + ' berhasil' + (r.failed ? ', ' + r.failed + ' gagal' : '') + (r.remaining ? ', ' + r.remaining + ' tersisa (jalankan lagi)' : '') + '.');
      onDone();
    } catch (e) { toast(e.message); setBusy(b, false); }
  } }));
  bar.hidden = false;
}
function unsyncedCount() {
  return (DATA.sched || []).filter((s) => s.syncStatus !== 'SYNCED').length + (DATA.ovs || []).filter((o) => o.syncStatus !== 'SYNCED').length;
}

// ---------- beranda: pengingat jadwal mendatang (daftar dari backend; BUKAN push) ----------
async function ensureNotif(force) {
  if (!force && DATA.notif && Date.now() - DATA.notifAt < STALE_MS) { renderNotif(); return; }
  if (DATA.notif) renderNotif();
  try {
    DATA.notif = await api('notification.upcoming', {}); DATA.notifAt = Date.now(); renderNotif();
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.notif) loadFailed($('p-notif'), 'Gagal memuat pengingat: ' + e.message, () => ensureNotif(true));
    else toast('Gagal menyegarkan pengingat: ' + e.message);
  }
}
function renderNotif() {
  const box = $('p-notif'); clear(box);
  const list = (DATA.notif && DATA.notif.reminders) || [];
  if (!list.length) box.appendChild(h('p', { class: 'empty', text: 'Tidak ada pengingat jadwal dalam ' + ((DATA.notif && DATA.notif.hours) || 48) + ' jam ke depan.' }));
  list.slice(0, 8).forEach((r) => {
    const when = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.at));
    box.appendChild(h('div', { class: 'row' }, [h('strong', { text: r.title }), h('div', { class: 'muted', text: when + ' · ' + r.body })]));
  });
  box.appendChild(h('p', { class: 'muted', text: 'Daftar ini hanya tampil saat website dibuka. Pengingat saat website tertutup datang dari aplikasi Google Calendar di HP.' }));
}

// ---------- beranda: jadwal hari ini + kehadiran hari ini ----------
async function ensureToday(force) {
  const today = jktNow().ymd;
  const fresh = DATA.today && DATA.today.from === today && Date.now() - DATA.todayAt < STALE_MS;
  if (!force && fresh && DATA.sched) { renderToday(); return; }
  if (DATA.today && DATA.today.from === today) renderToday();
  try {
    const r = await Promise.all([fetchWeek(today, today), ensureMeta(force)]);
    DATA.today = r[0]; DATA.todayAt = Date.now(); renderToday();
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.today) ['jdw-today', 'jdw-attend'].forEach((id) => loadFailed($(id), 'Gagal memuat jadwal: ' + e.message, () => ensureToday(true)));
    else toast('Gagal menyegarkan jadwal: ' + e.message);
  }
}
function renderToday() {
  const t = DATA.today, today = jktNow().ymd;
  const box = $('jdw-today'); clear(box);
  const at = $('jdw-attend'); clear(at);
  if (!t.occ.length) {
    box.appendChild(h('p', { class: 'empty', text: 'Tidak ada kuliah hari ini.' }));
    at.appendChild(h('p', { class: 'empty', text: 'Tidak ada pertemuan hari ini.' }));
    return;
  }
  const m = h('div', { class: 'mini' });
  t.occ.forEach((o) => m.appendChild(h('div', { class: 'row' }, [h('span', { text: o.startTime + '–' + o.endTime + ' · ' + o.courseName + (o.location ? ' (' + o.location + ')' : '') }), modeChip(o.mode)])));
  box.appendChild(m);
  const ul = h('ul', { class: 'list' });
  t.occ.forEach((o) => {
    const rec = t.att[o.scheduleId + '|' + o.date] || null;
    const li = h('li', { class: 'item' }, [h('div', { class: 'item-head' }, [h('p', { class: 'item-title', text: o.courseName }), attChip(rec, o.date <= today)])]);
    li.appendChild(attButtons(o, rec, today));
    ul.appendChild(li);
  });
  at.appendChild(ul);
}

// ---------- halaman Jadwal ----------
function setWeek(ymd) { DATA.weekStart = weekStartOf(ymd); ensureJadwal(false); }
$('jw-prev').addEventListener('click', () => setWeek(addDays(DATA.weekStart || weekStartOf(jktNow().ymd), -7)));
$('jw-next').addEventListener('click', () => setWeek(addDays(DATA.weekStart || weekStartOf(jktNow().ymd), 7)));
$('jw-now').addEventListener('click', () => setWeek(jktNow().ymd));

async function ensureJadwal(force) {
  if (!DATA.weekStart) DATA.weekStart = weekStartOf(jktNow().ymd);
  const ws = DATA.weekStart, we = addDays(ws, 6);
  $('jw-label').textContent = fmtShort(ws) + ' – ' + fmtShort(we);
  const fresh = DATA.week && DATA.week.from === ws && Date.now() - DATA.weekAt < STALE_MS && DATA.sched;
  if (!force && fresh) { renderJadwal(); return; }
  if (DATA.week && DATA.week.from === ws && DATA.sched) renderJadwal();
  try {
    const r = await Promise.all([fetchWeek(ws, we), ensureMeta(force)]);
    if (DATA.weekStart !== ws) return; // pengguna sudah pindah pekan
    DATA.week = r[0]; DATA.weekAt = Date.now(); renderJadwal();
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.week) { loadFailed($('jdw-page'), 'Gagal memuat jadwal: ' + e.message, () => ensureJadwal(true)); loadFailed($('jdw-list'), 'Gagal memuat jadwal: ' + e.message, () => ensureJadwal(true)); }
    else toast('Gagal menyegarkan jadwal: ' + e.message);
  }
}
function renderJadwal() {
  buildSyncBar($('jdw-sync'), unsyncedCount(), 'jadwal/perubahan', () => refreshCurrent());
  renderWeek(); renderSchedList();
}
function renderWeek() {
  const w = DATA.week, today = jktNow().ymd, box = $('jdw-page'); clear(box);
  for (let i = 0; i < 7; i++) {
    const d = addDays(w.from, i);
    box.appendChild(h('h3', { class: 'day-h' }, [fmtDay(d), d === today ? h('span', { class: 'chip', text: 'Hari ini' }) : null]));
    const list = w.occ.filter((o) => o.date === d);
    if (!list.length) { box.appendChild(h('p', { class: 'empty', text: 'Tidak ada kuliah.' })); continue; }
    const ul = h('ul', { class: 'list' });
    list.forEach((o) => {
      const li = occItem(o, w.att, today, true);
      li.querySelector('.item-actions').appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ubah pertemuan', onclick: () => openOvDialog(o.scheduleId, o.originalDate, o) }));
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  // pertemuan pekan ini yang dibatalkan atau dipindah ke tanggal di luar pekan ini
  const we = addDays(w.from, 6);
  const gone = (DATA.ovs || []).filter((o) => o.originalDate >= w.from && o.originalDate <= we &&
    (o.type === 'BATAL' || (o.type === 'PINDAH' && (o.newDate < w.from || o.newDate > we))));
  if (gone.length) {
    box.appendChild(h('h3', { class: 'day-h', text: 'Dibatalkan / dipindah keluar pekan ini' }));
    const ul = h('ul', { class: 'list' });
    gone.forEach((o) => {
      ul.appendChild(h('li', { class: 'item cancelled' }, [
        h('p', { class: 'item-title', text: schedName(o.scheduleId) }),
        h('p', { class: 'item-meta', text: fmtDay(o.originalDate) + ' · ' + (o.type === 'BATAL' ? 'Dibatalkan' : 'Dipindah ke ' + fmtDay(o.newDate)) }),
        o.syncStatus !== 'SYNCED' ? h('div', { class: 'chips' }, [syncChip(o)]) : null,
        h('div', { class: 'item-actions' }, [
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ubah', onclick: () => openOvDialog(o.scheduleId, o.originalDate, null) }),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: o.type === 'BATAL' ? 'Pulihkan' : 'Kembalikan ke normal', onclick: (ev) => removeOverride(o, ev.currentTarget) })
        ])
      ]));
    });
    box.appendChild(ul);
  }
}
async function removeOverride(o, btn) {
  if (!(await confirmDialog('Kembalikan pertemuan ' + schedName(o.scheduleId) + ' tanggal ' + fmtShort(o.originalDate) + ' ke jadwal normal?', 'Kembalikan'))) return;
  setBusy(btn, true, 'Menyimpan...');
  try { await api('override.delete', { id: o.id }); toast('Pertemuan dikembalikan ke jadwal normal.'); refreshCurrent(); }
  catch (e) { setBusy(btn, false); toast(e.message); }
}

function renderSchedList() {
  const box = $('jdw-list'); clear(box);
  const list = (DATA.sched || []).slice().sort((a, b) => a.dayOfWeek - b.dayOfWeek || (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
  if (!list.length) { box.appendChild(h('p', { class: 'empty', text: 'Belum ada jadwal. Tekan "+ Tambah Jadwal".' })); return; }
  const ul = h('ul', { class: 'list' });
  list.forEach((s) => {
    const chips = [modeChip(s.mode)];
    if (!s.isActive) chips.push(h('span', { class: 'chip belum', text: 'Nonaktif' }));
    chips.push(syncChip(s));
    ul.appendChild(h('li', { class: 'item' + (s.isActive ? '' : ' done') }, [
      h('p', { class: 'item-title', text: s.courseName }),
      h('p', { class: 'item-meta', text: DAYS[s.dayOfWeek - 1] + ' · ' + s.startTime + '–' + s.endTime + (s.location ? ' · ' + s.location : '') }),
      h('p', { class: 'item-meta', text: 'Berlaku ' + fmtShort(s.startDate) + ' – ' + fmtShort(s.endDate) }),
      h('div', { class: 'chips' }, chips),
      s.syncStatus === 'FAILED' && s.syncError ? h('p', { class: 'msg-error', text: 'Sinkron Calendar: ' + s.syncError }) : null,
      h('div', { class: 'item-actions' }, [
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ubah', onclick: () => openSchedDialog(s) }),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Hapus', onclick: (ev) => deleteSched(s, ev.currentTarget) })
      ])
    ]));
  });
  box.appendChild(ul);
}

// dialog tambah/ubah jadwal
let editingSched = null;
(function fillDow() { DAYS.forEach((d, i) => { const o = document.createElement('option'); o.value = String(i + 1); o.textContent = d; $('ds-dow').appendChild(o); }); })();
function openSchedDialog(s) {
  editingSched = s || null;
  $('ds-h').textContent = s ? 'Ubah Jadwal' : 'Tambah Jadwal';
  $('ds-name').value = s ? s.courseName : '';
  $('ds-dow').value = s ? String(s.dayOfWeek) : '1';
  $('ds-start').value = s ? s.startTime : '';
  $('ds-end').value = s ? s.endTime : '';
  $('ds-mode').value = s ? s.mode : 'OFFLINE';
  $('ds-active').value = s ? String(s.isActive) : 'true';
  $('ds-loc').value = s ? s.location : '';
  $('ds-from').value = s ? s.startDate : '';
  $('ds-to').value = s ? s.endDate : '';
  $('ds-hint').hidden = !!s;
  $('ds-err').hidden = true;
  $('d-sched').showModal(); $('ds-name').focus();
}
$('js-add').addEventListener('click', () => openSchedDialog(null));
$('ds-cancel').addEventListener('click', () => $('d-sched').close());
$('ds-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = (m) => { $('ds-err').textContent = m; $('ds-err').hidden = false; };
  const name = $('ds-name').value.trim(), st = $('ds-start').value, en = $('ds-end').value;
  const from = $('ds-from').value, to = $('ds-to').value;
  if (!name) return err('Nama mata kuliah wajib diisi.');
  if (!st || !en) return err('Jam mulai dan selesai wajib diisi.');
  if (en <= st) return err('Jam selesai harus lebih besar dari jam mulai.');
  if (editingSched && (!from || !to)) return err('Tanggal berlaku wajib diisi.');
  if (from && to && to < from) return err('Tanggal akhir tidak boleh sebelum tanggal awal.');
  const want = { courseName: name, dayOfWeek: parseInt($('ds-dow').value, 10), startTime: st, endTime: en, mode: $('ds-mode').value,
    location: $('ds-loc').value.trim(), isActive: $('ds-active').value === 'true' };
  if (from) want.startDate = from;
  if (to) want.endDate = to;
  const btn = $('ds-save'); setBusy(btn, true, 'Menyimpan...');
  try {
    let rec;
    if (editingSched) {
      const diff = { id: editingSched.id };
      Object.keys(want).forEach((k) => { if (String(want[k]) !== String(editingSched[k])) diff[k] = want[k]; });
      if (Object.keys(diff).length === 1) { $('d-sched').close(); toast('Tidak ada perubahan.'); return; }
      rec = await api('schedule.update', diff);
    } else rec = await api('schedule.create', want);
    $('d-sched').close();
    toast(syncToast(editingSched ? 'Jadwal diperbarui' : 'Jadwal ditambahkan', rec));
    refreshCurrent();
  } catch (e) { err(e.message); }
  finally { setBusy(btn, false); }
});
async function deleteSched(s, btn) {
  if (!(await confirmDialog('Hapus jadwal "' + s.courseName + '"? Semua perubahan pertemuan (override) jadwal ini ikut terhapus dan event Calendar-nya dihapus. Catatan kehadiran lama tetap tersimpan.', 'Hapus', true))) return;
  setBusy(btn, true, 'Menghapus...');
  try { await api('schedule.delete', { id: s.id }); toast('Jadwal dihapus.'); refreshCurrent(); }
  catch (e) { setBusy(btn, false); toast(e.message); } // backend membatalkan hapus bila event Calendar gagal dihapus
}

// dialog override (satu-satunya jalur ubah pertemuan: override.save / override.delete di backend)
let ovCtx = null;
function ovFields() {
  const t = $('do-type').value;
  document.querySelectorAll('#d-ov [data-for]').forEach((el) => { el.hidden = el.dataset.for.split(' ').indexOf(t) === -1; });
  const sel = $('do-mode'), cur = sel.value; clear(sel);
  const opts = t === 'PINDAH' ? [['', 'Ikuti jadwal normal'], ['ONLINE', 'Online'], ['OFFLINE', 'Offline']] : [['ONLINE', 'Online'], ['OFFLINE', 'Offline']];
  opts.forEach((x) => sel.appendChild(h('option', { value: x[0], text: x[1] })));
  if (opts.some((x) => x[0] === cur)) sel.value = cur;
}
$('do-type').addEventListener('change', ovFields);
function openOvDialog(scheduleId, originalDate, occ) {
  const ov = ovFor(scheduleId, originalDate);
  ovCtx = { scheduleId: scheduleId, originalDate: originalDate, ov: ov };
  $('do-info').textContent = schedName(scheduleId) + ' · pertemuan asal ' + fmtDay(originalDate) + (occ ? ' · ' + occ.startTime + '–' + occ.endTime : '');
  $('do-type').value = ov ? ov.type : 'PINDAH';
  $('do-mode').value = ''; ovFields();
  $('do-date').value = ov ? ov.newDate : '';
  $('do-start').value = ov ? ov.newStartTime : '';
  $('do-end').value = ov ? ov.newEndTime : '';
  $('do-mode').value = ov ? ov.newMode : '';
  if (ov && ov.type === 'UBAH_MODE' && !ov.newMode) $('do-mode').selectedIndex = 0;
  $('do-loc').value = ov ? ov.newLocation : '';
  $('do-note').value = ov ? ov.note : '';
  $('do-reset').hidden = !ov;
  $('do-err').hidden = true;
  $('d-ov').showModal();
}
$('do-cancel').addEventListener('click', () => $('d-ov').close());
$('do-reset').addEventListener('click', async () => {
  if (!ovCtx || !ovCtx.ov) return;
  const btn = $('do-reset'); setBusy(btn, true, 'Menyimpan...');
  try { await api('override.delete', { id: ovCtx.ov.id }); $('d-ov').close(); toast('Pertemuan dikembalikan ke jadwal normal.'); refreshCurrent(); }
  catch (e) { $('do-err').textContent = e.message; $('do-err').hidden = false; }
  finally { setBusy(btn, false); }
});
$('do-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = (m) => { $('do-err').textContent = m; $('do-err').hidden = false; };
  const type = $('do-type').value;
  const body = { scheduleId: ovCtx.scheduleId, originalDate: ovCtx.originalDate, type: type, newDate: '', newStartTime: '', newEndTime: '', newMode: '', newLocation: '', note: $('do-note').value.trim() };
  if (type === 'PINDAH') {
    body.newDate = $('do-date').value; body.newStartTime = $('do-start').value; body.newEndTime = $('do-end').value;
    if (!body.newDate) return err('Tanggal baru wajib diisi.');
    if (body.newStartTime && body.newEndTime && body.newEndTime <= body.newStartTime) return err('Jam selesai harus lebih besar dari jam mulai.');
  }
  if (type !== 'BATAL') { body.newMode = $('do-mode').value; body.newLocation = $('do-loc').value.trim(); }
  if (type === 'UBAH_MODE' && !body.newMode) return err('Pilih mode baru.');
  const btn = $('do-save'); setBusy(btn, true, 'Menyimpan...');
  try {
    const rec = await api('override.save', body);
    $('d-ov').close(); toast(syncToast('Perubahan pertemuan disimpan', rec)); refreshCurrent();
  } catch (e) { err(e.message); }
  finally { setBusy(btn, false); }
});

// ---------- halaman Kalender (bulanan) ----------
const KAL = { sel: null };
function calGridStart(ym) { return weekStartOf(ym + '-01'); }
function setMonth(ym) { DATA.calMonth = ym; KAL.sel = null; ensureKalender(false); }
function shiftMonth(ym, n) { const a = ym.split('-').map(Number); const d = new Date(Date.UTC(a[0], a[1] - 1 + n, 1)); return d.toISOString().slice(0, 7); }
$('cal-prev').addEventListener('click', () => setMonth(shiftMonth(DATA.calMonth || jktNow().ymd.slice(0, 7), -1)));
$('cal-next').addEventListener('click', () => setMonth(shiftMonth(DATA.calMonth || jktNow().ymd.slice(0, 7), 1)));
$('cal-now').addEventListener('click', () => { setMonth(jktNow().ymd.slice(0, 7)); });

async function ensureKalender(force) {
  if (!DATA.calMonth) DATA.calMonth = jktNow().ymd.slice(0, 7);
  const ym = DATA.calMonth, gs = calGridStart(ym);
  $('cal-label').textContent = fmtMonth(ym);
  const fresh = DATA.cal && DATA.cal.ym === ym && Date.now() - DATA.calAt < STALE_MS && DATA.sched && DATA.tasks;
  if (!force && fresh) { renderKalender(); return; }
  if (DATA.cal && DATA.cal.ym === ym && DATA.sched && DATA.tasks) renderKalender();
  try {
    const r = await Promise.all([api('schedule.effective', { from: gs, to: addDays(gs, 41) }), ensureMeta(force), DATA.tasks && !force ? null : api('task.list')]);
    if (DATA.calMonth !== ym) return;
    if (r[2]) { DATA.tasks = r[2].tasks; DATA.tasksAt = Date.now(); }
    DATA.cal = { ym: ym, occ: r[0].occurrences }; DATA.calAt = Date.now(); renderKalender();
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.cal || DATA.cal.ym !== ym) loadFailed($('cal-page'), 'Gagal memuat kalender: ' + e.message, () => ensureKalender(true));
    else toast('Gagal menyegarkan kalender: ' + e.message);
  }
}
function calEventsOn(ymd) {
  const occ = (DATA.cal.occ || []).filter((o) => o.date === ymd);
  const tasks = (DATA.tasks || []).filter((t) => t.deadline.slice(0, 10) === ymd);
  return { occ: occ, tasks: tasks };
}
function renderKalender() {
  const ym = DATA.calMonth, gs = calGridStart(ym), today = jktNow().ymd;
  buildSyncBar($('cal-sync'), unsyncedCount() + (DATA.tasks || []).filter((t) => t.syncStatus !== 'SYNCED').length, 'jadwal/perubahan/tugas', () => refreshCurrent());
  const C = CFG.EVENT_COLORS;
  const lg = $('cal-legend'); clear(lg);
  [['Jadwal kuliah', C.jadwal], ['Jadwal diubah', C.berubah], ['Deadline tugas', C.deadline]].forEach((x) => lg.appendChild(h('span', {}, [h('i', { class: 'dot', style: 'background:' + x[1] }), x[0]])));
  const box = $('cal-page'); clear(box);
  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'Kalender ' + fmtMonth(ym) });
  DAYS.forEach((d) => grid.appendChild(h('div', { class: 'cal-head', text: d.slice(0, 3) })));
  for (let i = 0; i < 42; i++) {
    const d = addDays(gs, i), ev = calEventsOn(d), inMonth = d.slice(0, 7) === ym;
    const dots = h('span', { class: 'cal-dots' });
    ev.occ.slice(0, 3).forEach((o) => dots.appendChild(h('i', { class: 'dot', style: 'background:' + (o.isChanged ? C.berubah : C.jadwal) })));
    ev.tasks.filter((t) => t.status === 'BELUM').slice(0, 3).forEach(() => dots.appendChild(h('i', { class: 'dot', style: 'background:' + C.deadline })));
    const n = ev.occ.length + ev.tasks.filter((t) => t.status === 'BELUM').length;
    grid.appendChild(h('button', { class: 'cal-cell' + (inMonth ? '' : ' out') + (d === today ? ' today' : ''), type: 'button', 'aria-pressed': String(KAL.sel === d),
      'aria-label': fmtDay(d) + (n ? ', ' + n + ' kegiatan' : ''), onclick: () => { KAL.sel = d; renderKalender(); } }, [h('span', { class: 'n', text: String(+d.slice(8)) }), dots]));
  }
  box.appendChild(grid);
  renderCalDetail(today);
}
function renderCalDetail(today) {
  const card = $('cal-detail-card');
  if (!KAL.sel) { card.hidden = true; return; }
  const d = KAL.sel, ev = calEventsOn(d), box = $('cal-detail'); clear(box);
  $('cal-detail-h').textContent = fmtDay(d);
  card.hidden = false;
  if (!ev.occ.length && !ev.tasks.length) { box.appendChild(h('p', { class: 'empty', text: 'Tidak ada kegiatan pada tanggal ini.' })); return; }
  const ul = h('ul', { class: 'list' });
  ev.occ.forEach((o) => ul.appendChild(occItem(o, {}, null, false)));
  ev.tasks.forEach((t) => ul.appendChild(h('li', { class: 'item' + (t.status === 'SELESAI' ? ' done' : '') }, [
    h('p', { class: 'item-title', text: t.title }),
    h('p', { class: 'item-meta', text: 'Deadline ' + t.deadline.slice(11, 16) + ' · ' + t.course }),
    h('div', { class: 'chips' }, [h('span', { class: 'chip', text: t.status === 'SELESAI' ? 'Selesai' : 'Belum selesai · ' + t.progress + '%' }), syncChip(t)])
  ])));
  box.appendChild(ul);
}

// ---------- halaman Kehadiran (rekap + riwayat) ----------
async function ensureAttAll(force) {
  if (!force && DATA.attAll && Date.now() - DATA.attAllAt < STALE_MS) { renderAttAll(); return; }
  if (DATA.attAll) renderAttAll();
  try {
    const r = await api('attendance.list', {});
    DATA.attAll = r.attendance; DATA.attAllAt = Date.now(); renderAttAll();
    if (r.skipped && r.skipped.length) toast(r.skipped.length + ' baris kehadiran tidak valid di Sheets dilewati.');
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') return;
    if (!DATA.attAll) loadFailed($('att-page'), 'Gagal memuat kehadiran: ' + e.message, () => ensureAttAll(true));
    else toast('Gagal menyegarkan kehadiran: ' + e.message);
  }
}
function renderAttAll() {
  const box = $('att-page'); clear(box);
  const list = DATA.attAll.slice().sort((a, b) => (a.occurrenceDate < b.occurrenceDate ? 1 : a.occurrenceDate > b.occurrenceDate ? -1 : a.courseName < b.courseName ? -1 : 1));
  if (!list.length) { box.appendChild(h('p', { class: 'empty', text: 'Belum ada kehadiran yang dicatat.' })); return; }
  const hadir = list.filter((a) => a.status === 'HADIR').length, absen = list.length - hadir;
  const grid = h('div', { class: 'stat-grid' });
  [[list.length, 'Tercatat'], [hadir, 'Hadir'], [absen, 'Tidak hadir'], [Math.round(hadir / list.length * 100) + '%', 'Persentase hadir']].forEach((x) => grid.appendChild(h('div', { class: 'stat' }, [h('b', { text: String(x[0]) }), h('span', { text: x[1] })])));
  box.appendChild(grid);
  box.appendChild(h('h2', { text: 'Per mata kuliah' }));
  const by = {};
  list.forEach((a) => { (by[a.courseName] = by[a.courseName] || []).push(a); });
  const m = h('div', { class: 'mini' });
  Object.keys(by).sort().forEach((c) => {
    const l = by[c], hd = l.filter((a) => a.status === 'HADIR').length;
    m.appendChild(h('div', {}, [h('div', { class: 'row' }, [h('span', { text: c }), h('span', { class: 'muted', text: hd + '/' + l.length + ' hadir' })]),
      h('div', { class: 'bar' + (hd === l.length ? ' full' : '') }, [h('i', { style: 'width:' + Math.round(hd / l.length * 100) + '%' })])]));
  });
  box.appendChild(m);
  box.appendChild(h('h2', { class: 'gap-top', text: 'Riwayat' }));
  const hist = h('div', {});
  list.forEach((a) => hist.appendChild(h('div', { class: 'rec-row' }, [
    h('span', {}, [h('strong', { text: a.courseName }), h('span', { class: 'item-meta', text: ' · ' + fmtShort(a.occurrenceDate) })]),
    h('span', { class: 'chips' }, [h('span', { class: 'chip ' + (a.status === 'HADIR' ? 'hadir' : 'absen'), text: a.status === 'HADIR' ? 'Hadir' : 'Tidak hadir' }), a.photoFileId ? h('span', { class: 'chip photo', text: 'Foto' }) : null])
  ])));
  box.appendChild(hist);
}

// ---------- pemuatan per halaman ----------
function loadForPage(p) {
  if (p === 'dashboard') { ensureTasks(false); ensureNotes(false); ensureToday(false); ensureNotif(false); }
  else if (p === 'tugas' || p === 'progress') ensureTasks(false);
  else if (p === 'catatan') ensureNotes(false);
  else if (p === 'jadwal') ensureJadwal(false);
  else if (p === 'kalender') ensureKalender(false);
  else if (p === 'kehadiran') ensureAttAll(false);
}

// fin
// Keuangan: Coming Soon. Hanya membuka CFG.FINANCE_URL, tanpa API dan tanpa data.
document.querySelectorAll('.js-fin').forEach((b) => b.addEventListener('click', () => {
  if (CFG.FINANCE_URL.indexOf('GANTI') !== -1) { toast('URL keuangan belum diisi di script.js (CFG.FINANCE_URL).'); return; }
  window.open(CFG.FINANCE_URL, '_blank', 'noopener');
}));

// gsr
$('g-back').addEventListener('click', () => show('select'));
