/* ===== Helpers ===== */
const $ = s => document.querySelector(s), pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D = new Date(), today = D.getFullYear() + '-' + pad(D.getMonth() + 1) + '-' + pad(D.getDate());
const mi = k => { const p = k.split('-'); return +p[0] * 12 + +p[1] - 1 }, fm = i => Math.floor(i / 12) + '-' + pad(i % 12 + 1);
const mlong = k => { const p = k.split('-'); return new Date(+p[0], p[1] - 1, 1).toLocaleDateString(undefined, {month: 'long', year: 'numeric'}) };
const ml = k => { const p = k.split('-'); return new Date(+p[0], p[1] - 1, 1).toLocaleDateString(undefined, {month: 'short', year: 'numeric'}) };
const r2 = x => Math.round(x * 100) / 100, money = x => (+x).toLocaleString(undefined, {maximumFractionDigits: 2});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clean = o => JSON.parse(JSON.stringify(o));
const why = e => (e && (e.message || e.code)) || 'no permission';

const DEF = {nf: 120, of: 100, lf: 15, ld: 10, d3: 20, d6: 50, d12: 120, start: today.slice(0, 7), tch: [{n: 'Teacher A', b: 0, p: 40}, {n: 'Teacher B', b: 0, p: 40}]};
let S = [], C = {...DEF}, db = null, ready = false, tab = 'pay', flt = 'act', curM = today.slice(0, 7), ps, es, armed = null, unsubs = [];

/* ===== Database (db is set in firebase.js after login) ===== */
function startApp() {
  ready = false; render();
  const bad = e => { ready = true; render(); toast('Cannot read data: ' + why(e), 7000) };
  unsubs = [
    db.collection('students').onSnapshot(sn => { S = sn.docs.map(d => ({...d.data(), id: d.id})); ready = true; render() }, bad),
    db.doc('meta/cfg').onSnapshot(sn => { if (sn.exists) C = {...DEF, ...sn.data()}; render() }, bad)
  ];
}
function stopApp() { unsubs.forEach(u => u()); unsubs = []; S = []; C = {...DEF}; ready = false }

// Saves to Firestore; if the network is slow we stop waiting after 5s (it still syncs later)
function dbSet(ref, data) {
  return Promise.race([
    Promise.resolve().then(() => ref().set(clean(data))).then(() => true),
    new Promise(r => setTimeout(() => r(true), 5000))
  ]).catch(e => { toast('Not saved: ' + why(e), 7000); return false });
}
function save(s) {
  const i = S.findIndex(x => x.id === s.id); if (i < 0) S.push(s); else S[i] = s; render();
  return dbSet(() => db.collection('students').doc(s.id), s);
}
function rm(s) {
  S = S.filter(x => x.id !== s.id); render();
  Promise.resolve().then(() => db.collection('students').doc(s.id).delete()).catch(e => toast('Not deleted: ' + why(e), 7000));
}
function saveC() { render(); dbSet(() => db.doc('meta/cfg'), C) }

/* ===== Fee logic ===== */
const fee = s => s.st === 'NEW' ? C.nf : C.of, disc = n => n === 1 ? 0 : (+C['d' + n] || 0);
function active(s, M) {
  const j = s.join ? s.join.slice(0, 7) : '0000-01';
  return mi(j) <= mi(M) && (s.st !== 'QUIT' || (!!s.quit && mi(s.quit.slice(0, 7)) >= mi(M)));
}
function mInfo(s, M) {
  let due = 0, paid = 0, cov = false, lump = false; const x = mi(M);
  for (const p of s.pays || []) {
    const a = mi(p.m);
    if (a <= x && x < a + p.n) { cov = true; due += p.due / p.n; paid += p.amt / p.n; if (p.n > 1) lump = true }
  }
  const act = active(s, M); if (!cov && act) due = fee(s);
  const bal = r2(due - paid); let t;
  if (!act && !cov) t = 'na'; else if (bal <= 0) t = 'paid'; else t = paid > 0 ? 'part' : 'unpaid';
  return {due, paid, bal, t, act, cov, lump};
}
function owed(s, M) {
  let a = Math.max(s.join ? mi(s.join.slice(0, 7)) : 0, mi(C.start)), b = mi(M);
  if (s.st === 'QUIT') b = Math.min(b, s.quit ? mi(s.quit.slice(0, 7)) : -1);
  let o = 0; for (let i = a; i <= b; i++) o += mInfo(s, fm(i)).bal; return r2(o);
}

/* ===== UI helpers ===== */
const CH = {paid: ['Paid', 'ok'], part: ['Partial', 'pa'], unpaid: ['Unpaid', 'no'], na: ['-', 'na']};
const chip = (t, l) => `<b class="${CH[t][1]}">${CH[t][0]}${l ? ' (lump)' : ''}</b>`;
function monOpts(sel) {
  const lo = Math.min(mi(C.start), mi(today) - 6, mi(sel)), hi = Math.max(mi(today) + 12, mi(sel)); let h = '';
  for (let i = lo; i <= hi; i++) h += `<option value="${fm(i)}"${fm(i) === sel ? ' selected' : ''}>${ml(fm(i))}</option>`;
  return h;
}
function toast(m, ms) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms || 2200) }
function sheet(h) { $('#shin').innerHTML = h; $('#sh').hidden = false }
function closeSh() { $('#sh').hidden = true; armed = null }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sh').hidden) closeSh() });
function arm(k, fn) { if (armed === k) { armed = null; fn() } else { armed = k; toast('Tap again to confirm') } }
function go(t) { tab = t; if (t === 'stu' && flt === 'unpaid') flt = 'act'; render() }
function setF(f) { flt = f; render() }

function render() {
  if (!ready) { $('#main').innerHTML = '<p>Loading...</p>'; return }
  $('#mon').innerHTML = monOpts(curM);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('#q').style.display = tab === 'sum' ? 'none' : '';
  const ch = tab === 'pay' ? [['act', 'Active'], ['unpaid', 'Unpaid'], ['all', 'All']] : tab === 'stu' ? [['act', 'Active'], ['all', 'All incl. quit']] : [];
  $('#chips').innerHTML = ch.map(c => `<button class="${flt === c[0] ? 'on' : ''}" onclick="setF('${c[0]}')">${c[1]}</button>`).join('');
  $('#main').innerHTML = tab === 'pay' ? vPay() : tab === 'sum' ? vSum() : vStu();
}
const sample = () => { const t = C.tch.map(x => x.n); [['Alice Tan', 'OLD'], ['Ben Lim', 'NEW'], ['Chloe Wong', 'OLD']].forEach((a, i) => save({id: uid(), name: a[0], par: '', tch: t[i % t.length] || '', st: a[1], join: today, quit: '', pays: []})) };
const emptyMsg = `<div class="empty"><p><b>No students yet.</b></p><button class="btn" onclick="openStu()">+ Add first student</button> <button class="btn" onclick="sample()">Load 3 sample students</button></div>`;
const qv = () => $('#q').value.trim().toLowerCase();

/* ===== Pay tab ===== */
function vPay() {
  if (!S.length) return emptyMsg;
  let L = S.filter(s => s.name.toLowerCase().includes(qv())).map(s => ({s, i: mInfo(s, curM), o: owed(s, curM)}));
  if (flt === 'act') L = L.filter(x => x.i.act || x.i.cov);
  if (flt === 'unpaid') L = L.filter(x => x.i.t === 'unpaid' || x.i.t === 'part' || x.o > 0);
  L.sort((a, b) => a.s.name.localeCompare(b.s.name));
  if (!L.length) return '<div class="empty">No students found</div>';
  return L.map(x => `<button class="row" onclick="openPay('${x.s.id}')"><span><b>${esc(x.s.name)}</b><small>${esc(x.s.tch || 'No teacher')} - ${x.s.st}</small></span><span class="r">${chip(x.i.t, x.i.lump && x.i.t === 'paid')}${x.o > 0 ? `<br><small class="no">owes ${money(x.o)}</small>` : ''}</span></button>`).join('');
}
function payAuto() {
  const t = ps.t;
  if (!t.disc) ps.disc = disc(ps.n);
  if (!t.fine) ps.fine = ps.d > ps.m + '-' + pad(C.ld) ? C.lf : 0;
  ps.total = Math.max(0, r2(ps.fee * ps.n - ps.disc + ps.fine));
  if (!t.paid) ps.paid = ps.total;
}
const ins = p => p.ins || [{d: p.d, a: p.amt}];
const openRecs = s => (s.pays || []).filter(p => r2(p.due - p.amt) > 0).sort((a, b) => mi(a.m) - mi(b.m));
const rng = p => ml(p.m) + (p.n > 1 ? ' to ' + ml(fm(mi(p.m) + p.n - 1)) : '');
function openPay(id) {
  const s = S.find(x => x.id === id), R = openRecs(s), x = mi(curM), c = R.find(p => mi(p.m) <= x && x < mi(p.m) + p.n) || R[0];
  ps = {s, m: curM, n: 1, d: today, t: {}, fee: fee(s), mode: R.length ? 'bal' : 'new', rec: c && c.id, ba: null}; payAuto(); showPay();
}
function pm(k, v) { ps[k] = k === 'n' ? +v : v; payAuto(); showPay() }
function pset(k, v) { ps[k] = +v || 0; ps.t[k] = true; payAuto(); updPay() }
function paidSet(half) { if (half) { ps.paid = r2(ps.total / 2); ps.t.paid = true } else { ps.t.paid = false; payAuto() } updPay() }
const recOf = () => { const R = openRecs(ps.s); return R.find(x => x.id === ps.rec) || R[0] };
function updPay() {
  for (const k of ['fee', 'disc', 'fine', 'paid']) { const e = $('#pf_' + k); if (e && document.activeElement !== e) e.value = ps[k] }
  $('#pf_total').textContent = money(ps.total);
  const b = r2(ps.total - ps.paid);
  $('#pf_note').innerHTML = `Covers ${rng({m: ps.m, n: ps.n})} - ` + (b > 0 ? `<b class="no">Balance still owed ${money(b)}</b>` : b < 0 ? `<b class="ok">Overpaid ${money(-b)}</b>` : '<b class="ok">Fully paid</b>');
}
function updBa() {
  const p = recOf(), b = r2(p.due - p.amt), r = r2(b - (ps.ba == null ? b : ps.ba));
  $('#pf_note').innerHTML = r > 0 ? `After this: <b class="no">still owes ${money(r)}</b>` : r < 0 ? `<b class="ok">Overpaid ${money(-r)}</b>` : '<b class="ok">Fully paid after this</b>';
}
function baSet(v) { ps.ba = v; showPay() }
const AL = {fee: 'Fee per month', disc: 'Lump discount', fine: 'Late fine', paid: 'Amount paid'};
const num = (id, k) => `<input id="pf_${k}" aria-label="${AL[k]}" type="number" inputmode="decimal" step="any" value="${ps[k]}" oninput="pset('${k}',this.value)">`;
function newForm() {
  return `<label>Pay for month</label><select onchange="pm('m',this.value)">${monOpts(ps.m)}</select>
  <label>Months paid (lump)</label><div class="seg">${[1, 3, 6, 12].map(n => `<button class="${ps.n === n ? 'on' : ''}" onclick="pm('n',${n})">${n === 1 ? '1 mo' : n + ' mo'}</button>`).join('')}</div>
  <div class="g2"><div><label>Fee / month</label>${num('fee', 'fee')}</div><div><label>Lump discount</label>${num('disc', 'disc')}</div></div>
  <div class="g2"><div><label>Late fine</label>${num('fine', 'fine')}</div><div><label>Date paid</label><input type="date" value="${ps.d}" onchange="pm('d',this.value||today)"></div></div>
  <div class="tot"><span>Total due</span><span id="pf_total"></span></div>
  <label>Amount paid now (pay less if only part)</label>
  <div class="qa"><button onclick="paidSet(0)">Full</button><button onclick="paidSet(1)">Half</button></div>${num('paid', 'paid')}
  <p id="pf_note"></p><div class="act"><button class="big" onclick="paySave()">Save payment</button></div>`;
}
function balForm() {
  const R = openRecs(ps.s), p = recOf(), b = r2(p.due - p.amt); ps.rec = p.id;
  return `<label>Which payment is being topped up</label><select onchange="ps.rec=this.value;ps.ba=null;showPay()">${R.map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${rng(x)} - owes ${money(r2(x.due - x.amt))} of ${money(x.due)}</option>`).join('')}</select>
  <label>Paying now</label><div class="qa"><button onclick="baSet(${b})">Full ${money(b)}</button><button onclick="baSet(${r2(b / 2)})">Half ${money(r2(b / 2))}</button></div>
  <input id="pf_ba" aria-label="Amount paying now" type="number" inputmode="decimal" step="any" value="${ps.ba == null ? b : ps.ba}" oninput="ps.ba=+this.value||0;updBa()">
  <label>Date paid</label><input type="date" value="${ps.d}" onchange="ps.d=this.value||today">
  <p id="pf_note"></p><div class="act"><button class="big" onclick="balSave()">Add this payment</button></div>`;
}
function showPay() {
  const s = ps.s, i = mInfo(s, curM), o = owed(s, curM), R = openRecs(s); if (!R.length) ps.mode = 'new';
  const hist = (s.pays || []).slice().sort((a, b) => mi(b.m) - mi(a.m)).map(p => `<div class="hr"><span>${rng(p)}<br><small>paid ${money(p.amt)} of ${money(p.due)}${ins(p).length > 1 ? ' (' + ins(p).length + ' payments)' : ''}${p.fine ? ' - fine ' + money(p.fine) : ''}${p.disc ? ' - lump discount ' + money(p.disc) : ''}</small></span><button class="x" onclick="arm('p${p.id}',()=>payDel('${p.id}'))">Remove</button></div>`).join('') || '<small>No payments yet</small>';
  sheet(`<div class="hd"><span>${esc(s.name)}</span><button class="x" onclick="closeSh()">Close</button></div>
  <small>${esc(s.tch || 'No teacher')} - ${s.st} - ${ml(curM)}: ${chip(i.t)}${o > 0 ? ` - owes <b class="no">${money(o)}</b> in total` : ''}</small>
  ${R.length ? `<div class="seg"><button class="${ps.mode === 'bal' ? 'on' : ''}" onclick="pm('mode','bal')">Pay balance</button><button class="${ps.mode === 'new' ? 'on' : ''}" onclick="pm('mode','new')">New payment</button></div>` : ''}
  ${ps.mode === 'bal' ? balForm() : newForm()}
  <h4>Payment history</h4>${hist}`);
  ps.mode === 'bal' ? updBa() : updPay();
}
function paySave() {
  if (!(ps.paid > 0)) { toast('Enter the amount paid'); return } const s = ps.s;
  const rec = {id: uid(), m: ps.m, n: ps.n, d: ps.d, fee: ps.fee, disc: ps.disc, fine: ps.fine, due: ps.total, amt: ps.paid, ins: [{d: ps.d, a: ps.paid}]};
  (s.pays = s.pays || []).push(rec);
  save(s).then(ok => { if (ok) { closeSh(); toast('Saved: ' + s.name) } else { s.pays = s.pays.filter(p => p !== rec); render() } });
}
function balSave() {
  const p = recOf(), b = r2(p.due - p.amt), a = ps.ba == null ? b : ps.ba; if (!(a > 0)) { toast('Enter the amount paid'); return }
  const o = {ins: p.ins, amt: p.amt}; p.ins = ins(p).concat({d: ps.d, a}); p.amt = r2(p.amt + a);
  save(ps.s).then(ok => { if (ok) { closeSh(); toast('Saved: ' + ps.s.name) } else { p.ins = o.ins; p.amt = o.amt; render() } });
}
function payDel(id) { const s = ps.s; s.pays = s.pays.filter(p => p.id !== id); save(s).then(() => showPay()) }

/* ===== Summary tab ===== */
function vSum() {
  if (!S.length) return emptyMsg;
  const A = S.map(s => ({s, i: mInfo(s, curM), o: owed(s, curM)})), sm = (L, f) => r2(L.reduce((a, x) => a + f(x), 0));
  const names = C.tch.map(t => t.n); if (A.some(x => x.i.act && !names.includes(x.s.tch || ''))) names.push('');
  let tot = 0;
  const T = names.map(n => {
    const tc = C.tch.find(t => t.n === n) || {b: 0, p: 0}, all = A.filter(x => (x.s.tch || '') === n), L = all.filter(x => x.i.act), sal = (+tc.b || 0) + (+tc.p || 0) * L.length; tot += sal;
    const jn = all.filter(x => x.s.join && x.s.join.slice(0, 7) === curM).length, qt = all.filter(x => x.s.st === 'QUIT' && x.s.quit && x.s.quit.slice(0, 7) === curM).length, up = L.filter(x => x.i.t === 'unpaid' || x.i.t === 'part').length;
    const note = [L.filter(x => x.s.st === 'NEW').length + ' new', L.filter(x => x.s.st === 'OLD').length + ' old', up + ' unpaid'].concat(jn ? [jn + ' joined'] : [], qt ? [qt + ' quit'] : []).join(', ');
    return `<tr><td><b>${esc(n || 'No teacher')}</b><small>${note}</small></td><td>${L.length}</td><td>${money(sm(all, x => x.i.paid))}<small>of ${money(sm(all, x => x.i.due))}</small></td><td>${money(sal)}</td></tr>`;
  }).join('');
  const O = A.filter(x => x.o > 0).sort((a, b) => (a.s.tch || '').localeCompare(b.s.tch || '') || a.s.name.localeCompare(b.s.name));
  return `<div class="big-num">${money(sm(A, x => x.i.paid))}</div><div>collected of ${money(sm(A, x => x.i.due))} due in ${mlong(curM)}</div>
  <p><b class="no">${money(sm(A, x => Math.max(0, x.i.bal)))}</b> still unpaid this month.<br><b class="no">${money(sm(O, x => x.o))}</b> owed across all months.</p>
  <button class="btn" onclick="exportXlsx()">Export ${ml(curM)} to Excel</button>
  <small style="display:block;margin-top:6px">Sheet 1 lists everyone. Each teacher then gets a sheet with an archive of earlier months.</small>
  <h2>Teachers</h2><table class="tbl"><thead><tr><th>Teacher</th><th>Students</th><th>Collected</th><th>Salary</th></tr></thead><tbody>${T}</tbody><tfoot><tr><td colspan="3"><b>Total salaries</b></td><td><b>${money(tot)}</b></td></tr></tfoot></table>
  <h2>Parents who owe (${O.length})</h2>${O.map(x => `<button class="row" onclick="openPay('${x.s.id}')"><span><b>${esc(x.s.name)}</b><small>${esc(x.s.tch || 'No teacher')}</small></span><b class="no">${money(x.o)}</b></button>`).join('') || '<div class="empty">Nobody owes anything.</div>'}`;
}

/* ===== Students tab ===== */
function vStu() {
  const L = S.filter(s => s.name.toLowerCase().includes(qv()) && (flt === 'all' || s.st !== 'QUIT')).sort((a, b) => a.name.localeCompare(b.name));
  const cls = {NEW: 'pa', OLD: 'na', QUIT: 'no'};
  return `<p><button class="btn primary" onclick="openStu()">+ Add student</button></p>` +
    (L.map(s => `<button class="row" onclick="openStu('${s.id}')"><span><b>${esc(s.name)}</b><small>${esc(s.tch || 'No teacher')}${s.par ? ' - ' + esc(s.par) : ''}</small></span><b class="${cls[s.st]}">${s.st}</b></button>`).join('') || (S.length ? '<div class="empty">No students found</div>' : emptyMsg)) +
    `<details><summary>Fees, teachers and salary</summary>
  <div class="g2"><div><label>NEW fee / month</label><input id="c_nf" type="number" inputmode="decimal" value="${C.nf}"></div><div><label>OLD fee / month</label><input id="c_of" type="number" inputmode="decimal" value="${C.of}"></div>
  <div><label>Late fine</label><input id="c_lf" type="number" inputmode="decimal" value="${C.lf}"></div><div><label>Late after day of month</label><input id="c_ld" type="number" inputmode="numeric" value="${C.ld}"></div>
  <div><label>Discount 3 months</label><input id="c_d3" type="number" inputmode="decimal" value="${C.d3}"></div><div><label>Discount 6 months</label><input id="c_d6" type="number" inputmode="decimal" value="${C.d6}"></div>
  <div><label>Discount 12 months</label><input id="c_d12" type="number" inputmode="decimal" value="${C.d12}"></div><div><label>Track arrears from</label><input id="c_start" type="month" value="${C.start}"></div></div>
  <label>Teachers - one per line: name, base salary, pay per student (don't rename a teacher already in use)</label>
  <textarea id="c_tch" rows="5">${esc(C.tch.map(t => [t.n, t.b, t.p].join(', ')).join('\n'))}</textarea>
  <p><button class="btn primary" onclick="cfgSave()">Save settings</button></p></details>`;
}
function cfgSave() {
  const g = i => +$('#c_' + i).value || 0;
  C = {...C, nf: g('nf'), of: g('of'), lf: g('lf'), ld: g('ld') || 10, d3: g('d3'), d6: g('d6'), d12: g('d12'), start: $('#c_start').value || C.start,
    tch: $('#c_tch').value.split('\n').map(l => l.split(',').map(x => x.trim())).filter(a => a[0]).map(a => ({n: a[0], b: +a[1] || 0, p: +a[2] || 0}))};
  saveC(); toast('Settings saved');
}
function openStu(id) {
  es = id ? clean(S.find(x => x.id === id)) : {id: uid(), name: '', par: '', tch: (C.tch[0] || {}).n || '', st: 'NEW', join: today, quit: '', pays: [], nw: 1}; showStu();
}
function showStu() {
  sheet(`<div class="hd"><span>${es.nw ? 'Add student' : 'Update student'}</span><button class="x" onclick="closeSh()">Close</button></div>
  <label>Student name</label><input value="${esc(es.name)}" oninput="es.name=this.value" autocomplete="off">
  <label>Parent / contact</label><input value="${esc(es.par)}" oninput="es.par=this.value">
  <label>Teacher</label><select onchange="es.tch=this.value">${[''].concat(C.tch.map(t => t.n)).map(n => `<option value="${esc(n)}"${n === es.tch ? ' selected' : ''}>${esc(n || '- none -')}</option>`).join('')}</select>
  <label>Status</label><div class="seg">${['NEW', 'OLD', 'QUIT'].map(x => `<button class="${es.st === x ? 'on' : ''}" onclick="stSet('${x}')">${x}</button>`).join('')}</div>
  <div class="g2"><div><label>Join date</label><input type="date" value="${es.join || ''}" onchange="es.join=this.value"></div>
  ${es.st === 'QUIT' ? `<div><label>Quit date</label><input type="date" value="${es.quit || ''}" onchange="es.quit=this.value"></div>` : ''}</div>
  <div class="act"><button class="big" onclick="stuSave()">Save</button></div>
  ${es.nw ? '' : `<button class="lnk no" onclick="arm('del',stuDel)">Delete student and payments</button>`}`);
}
function stSet(x) { es.st = x; if (x === 'QUIT' && !es.quit) es.quit = today; showStu() }
function stuSave() {
  if (!es.name.trim()) { toast('Enter a name'); return }
  es.name = es.name.trim(); const was = es.nw; delete es.nw; save(es).then(ok => { if (ok) { closeSh(); toast('Saved') } else if (was) es.nw = 1 });
}
function stuDel() { rm(es); closeSh(); toast('Deleted') }

/* ===== Excel export ===== */
const XH = {font: {bold: true, color: {rgb: 'FFFFFF'}, name: 'Arial', sz: 10}, fill: {fgColor: {rgb: '1F3864'}}, alignment: {horizontal: 'center', vertical: 'center', wrapText: true}};
const XF = {paid: 'C6EFCE', part: 'FFEB9C', unpaid: 'FFC7CE'}, XL = {paid: 'PAID', part: 'PARTIAL', unpaid: 'UNPAID', na: ''};
const xb = {font: {bold: true, name: 'Arial', sz: 10}}, xt = {font: {bold: true, sz: 13, name: 'Arial', color: {rgb: '1F3864'}}};
const xc = (v, o, z) => ({v: v, t: typeof v === 'number' ? 'n' : 's', s: Object.assign({font: {name: 'Arial', sz: 10}}, o || {}), z: z || (typeof v === 'number' ? '#,##0.00' : undefined)});
function buildWb() {
  const M = curM, sk = (a, b) => (a.s.tch || '').localeCompare(b.s.tch || '') || a.s.name.localeCompare(b.s.name);
  const A = S.map(s => ({s, i: mInfo(s, M), o: owed(s, M)})).filter(x => x.i.act || x.i.cov || x.o > 0).sort(sk);
  const lab = x => x.i.t === 'paid' && x.i.lump ? 'PAID (lump)' : XL[x.i.t];
  const fill = t => ({alignment: {horizontal: 'center'}, fill: XF[t] ? {fgColor: {rgb: XF[t]}} : undefined});
  const H = a => a.map(t => xc(t, XH)), HD = ['Teacher', 'Student', 'Parent / contact', 'Status', 'Fee due', 'Paid', 'Balance', 'Payment', 'Total owed to date'];
  const body = (L, wt) => L.map(x => [...(wt ? [xc(x.s.tch || '(none)')] : []), xc(x.s.name), xc(x.s.par || ''), xc(x.s.st), xc(r2(x.i.due)), xc(r2(x.i.paid)), xc(r2(x.i.bal)), xc(lab(x), fill(x.i.t)), xc(x.o, x.o > 0 ? {fill: {fgColor: {rgb: XF.unpaid}}} : {})]);
  const tot = (L, k) => { const sm = f => xc(r2(L.reduce((a, x) => a + f(x), 0)), xb); return [...Array(k).keys()].map(j => xc(j === k - 1 ? 'TOTAL' : '', xb)).concat([sm(x => x.i.due), sm(x => x.i.paid), sm(x => x.i.bal), xc('', xb), sm(x => x.o)]) };
  const mk = (rows, w) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = w.map(n => ({wch: n})); return ws };
  const used = {}, nm = n => { const b = (n || 'No teacher').replace(/[\\\/?*\[\]:]/g, '').slice(0, 28) || 'Sheet'; let r = b, k = 2; while (used[r.toLowerCase()]) r = b + ' ' + k++; used[r.toLowerCase()] = 1; return r };
  const wbk = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbk, mk([[xc('Tuition summary - ' + ml(M), xt)], [], H(HD), ...body(A, 1), tot(A, 4)], [16, 24, 20, 9, 12, 12, 12, 14, 16]), nm('All students'));
  const names = C.tch.map(t => t.n); if (A.some(x => !names.includes(x.s.tch || ''))) names.push('');
  const months = []; for (let i = mi(C.start); i < mi(M); i++) months.push(fm(i));
  names.forEach(n => {
    const L = A.filter(x => (x.s.tch || '') === n), tc = C.tch.find(t => t.n === n) || {b: 0, p: 0}, act = L.filter(x => x.i.act).length, sal = (+tc.b || 0) + (+tc.p || 0) * act;
    const rows = [[xc((n || 'No teacher') + ' - ' + ml(M), xt)], [], H(HD.slice(1)), ...body(L, 0), tot(L, 3), [],
      [xc('Active students', xb), xc(act, null, '0')], [xc('Base salary', xb), xc(+tc.b || 0)], [xc('Pay per student', xb), xc(+tc.p || 0)], [xc('SALARY', xb), xc(sal, xb)], [],
      [xc('ARCHIVE - earlier months (paid / due)', xt)]];
    if (!months.length) rows.push([xc('No earlier months yet (tracking starts ' + ml(C.start) + ')')]);
    else {
      rows.push(H(['Student', ...months.map(ml), 'Owed to date']));
      S.filter(s => (s.tch || '') === n).map(s => ({s, m: months.map(k => mInfo(s, k))})).filter(r => r.m.some(i => i.t !== 'na')).sort((a, b) => a.s.name.localeCompare(b.s.name))
        .forEach(r => { const o = owed(r.s, M); rows.push([xc(r.s.name), ...r.m.map(i => i.t === 'na' ? xc('') : xc(money(i.paid) + ' / ' + money(i.due), fill(i.t))), xc(o, o > 0 ? {fill: {fgColor: {rgb: XF.unpaid}}} : {})]) });
    }
    XLSX.utils.book_append_sheet(wbk, mk(rows, [24, 18, 12, 12, 12, 12, 14, 16].concat(months.map(() => 14))), nm(n));
  });
  return wbk;
}
function exportXlsx() {
  if (typeof XLSX === 'undefined') { toast('Excel library did not load'); return }
  if (!S.length) { toast('No students yet'); return }
  try {
    const out = XLSX.write(buildWb(), {bookType: 'xlsx', type: 'array'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out])); a.download = 'Tuition_' + curM + '.xlsx'; a.click();
    toast('Exported');
  } catch (e) { toast('Export failed') }
}
