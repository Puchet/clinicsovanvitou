/* Patient features: registration, patient file (records), appointment calendar, printing, Excel export.
   Loaded after app.js and shares its globals ($, esc, D, api, toast, render, R, P, L ...). */
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const ageYears = (p) => { const a = +p.age || 0; return p.age_unit == 'M' ? a / 12 : p.age_unit == 'D' ? a / 365 : a; };
function fmtAge(p) {
  let a = +p.age || 0, u = p.age_unit || 'Y';
  if (p.dob) { const d = new Date(p.dob); if (!isNaN(d)) { const n = new Date(); let m = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth(); if (n.getDate() < d.getDate()) m--; if (m >= 0) { if (m < 12) { a = m; u = 'M'; } else { a = Math.floor(m / 12); u = 'Y'; } } } }
  const km = lang == 'km';
  if (u == 'M' && a >= 12) return Math.floor(a / 12) + (km ? ' ឆ្នាំ' : ' y') + (a % 12 ? ' ' + a % 12 + (km ? ' ខែ' : ' m') : '');
  return a + ' ' + (u == 'M' ? (km ? 'ខែ' : 'm') : u == 'D' ? (km ? 'ថ្ងៃ' : 'd') : (km ? 'ឆ្នាំ' : 'y'));
}
const fmtSex = (s) => (s == 'M' ? 'Male' : s == 'F' ? 'Female' : s || '');

// ---------- small form helpers ----------
const fIn = (l, k, v = '', ty = 'text', x = '') => `<label class="fl">${l}<input class="in" type="${ty}" name="${k}" value="${esc(v)}" ${x}></label>`;
const fTa = (l, k, v = '', r = 3) => `<label class="fl">${l}<textarea class="in" name="${k}" rows="${r}">${esc(v)}</textarea></label>`;
const fCb = (l, k, on, v = '1') => `<label class="cb"><input type="checkbox" name="${k}" value="${esc(v)}" ${on ? 'checked' : ''}> ${l}</label>`;
const fSel = (l, k, v, opts) => `<label class="fl">${l}<select class="in" name="${k}">${opts.map((o) => { const [val, tx] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val == v ? 'selected' : ''}>${tx}</option>`; }).join('')}</select></label>`;
const fld = (l, k, ty, v, o) => ty == 'sel' ? fSel(l, k, v, o) : ty == 'ta' ? fTa(l, k, v) : fIn(l, k, v ?? '', ty);
function openForm(title, body, save, o = {}) {
  const f = $('#mf'); f.className = o.cls || 'wide';
  f.innerHTML = `<h3 style="margin:0 0 8px">${title}</h3>${body}<div class="tools fb" style="justify-content:flex-end">${o.extra || ''}<button type="button" class="btn" data-a="close">Cancel</button><button class="btn p">${o.ok || 'Save'}</button></div>`;
  $('#md').classList.add('on');
  f.onsubmit = async (e) => { e.preventDefault(); try { await save(f); $('#md').classList.remove('on'); } catch (er) { toast(er.message); } };
}
async function upl(file, max = 480) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Use a JPG, PNG or WebP picture');
  const bmp = await createImageBitmap(file), sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', .85));
  const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + tok }, body: blob }), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Upload failed'); return j.photo;
}

// ---------- printing (uses the clinic header from Clinic Settings) ----------
function printDoc(title, html) {
  const c = D.clinic || {};
  const head = `<div class="ph-head">${c.banner ? `<img class="ph-banner" src="/uploads/${esc(c.banner)}" alt="">` : ''}${c.show_name && c.name ? `<h2>${esc(c.name)}</h2>` : ''}${c.show_address && c.address ? `<div>${esc(c.address)}</div>` : ''}${c.show_phone && c.phone ? `<div>Tel: ${esc(c.phone)}</div>` : ''}</div>`;
  let pa = $('#pa'); if (!pa) { pa = document.createElement('div'); pa.id = 'pa'; document.body.appendChild(pa); }
  pa.innerHTML = head + `<h3>${esc(title)}</h3>` + html; setTimeout(() => window.print(), 60);
}
const kv = (rows) => `<table class="pk">${rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
const ptBlock = (p) => kv([['Name', p.name], ['Latin name', p.latin_name], ['ID', p.id], ['Age', fmtAge(p)], ['Sex', fmtSex(p.sex)], ['Phone', p.phone], ['Address', p.addr], ['NSSF ID', p.nssf_id], ['National ID', p.national_id]]);

// ---------- patient registration ----------
function regForm(p) {
  const e = !!p; p = p || { khmer: 1, reg_date: nowLocal() };
  const mode = p.dob ? 'dob' : 'manual', sy = D.sy.map((s) => `<option>${esc(s.name)}</option>`).join(''), ad = D.ad.map((s) => `<option>${esc(s.name)}</option>`).join('');
  const VS = [['Temperature (°C)', 't'], ['Heart rate (bpm)', 'hr'], ['Respiratory rate (bpm)', 'rr'], ['Blood pressure (mmHg)', 'bp'], ['SpO2 (%)', 'spo2'], ['Pulse (P)', 'p'], ['Weight (kg)', 'w'], ['Height (cm)', 'h']];
  openForm(e ? 'Edit patient' : 'Register new patient', `
<div class="sec"><b class="sh">Basic information</b><div class="g2">${fIn('Patient name *', 'name', p.name, 'text', 'required')}${fIn('Phone', 'phone', p.phone)}</div>${fIn('Latin name (optional)', 'latin_name', p.latin_name)}</div>
<div class="sec"><div class="tools" style="justify-content:space-between"><b class="sh">Demographics</b><div class="tabs" id="agem">${[['manual', 'Manual'], ['ym', 'Y/M'], ['dob', 'DOB']].map(([m, t]) => `<button type="button" class="${m == mode ? 'on' : ''}" data-a="agem:${m}">${t}</button>`).join('')}</div></div>
<div id="agebox" data-mode="${mode}"><div class="g2"><div><b class="sh">Age</b>
<div class="pp m-manual"><input class="in" style="width:90px;min-width:0" type="number" min="0" name="age" value="${esc(p.age || '')}" placeholder="Age"><select class="in" name="age_unit" style="min-width:0"><option value="Y" ${p.age_unit != 'M' && p.age_unit != 'D' ? 'selected' : ''}>Year</option><option value="M" ${p.age_unit == 'M' ? 'selected' : ''}>Month</option><option value="D" ${p.age_unit == 'D' ? 'selected' : ''}>Day</option></select></div>
<div class="pp m-ym"><input class="in" style="width:90px;min-width:0" type="number" min="0" name="ym_y" placeholder="Years"><input class="in" style="width:90px;min-width:0" type="number" min="0" max="11" name="ym_m" placeholder="Months"></div>
<div class="m-dob"><input class="in" type="date" name="dob" value="${esc(p.dob || '')}" style="width:100%"></div></div>
${fSel('Sex', 'sex', p.sex || '', [['', 'Select sex'], ['M', 'Male'], ['F', 'Female']])}</div>
<div class="tools" style="margin-top:8px">${fCb('Khmer national', 'khmer', p.khmer)}${fCb('NSSF', 'nssf', p.nssf)}${fCb('Pet', 'pet', p.pet)}</div></div></div>
<div class="sec"><div class="g2">${fIn('NSSF ID', 'nssf_id', p.nssf_id)}${fIn('National ID', 'national_id', p.national_id)}</div></div>
<div class="sec"><b class="sh">Clinical details</b>
<label class="fl">Complaints / symptoms <select class="in pk2" data-fill="complaints"><option value="">+ Add symptom</option>${sy}</select><textarea class="in" name="complaints" rows="3" placeholder="Describe current symptoms…">${esc(p.complaints || '')}</textarea></label>
${fTa('Past medical history', 'history', p.history)}</div>
<div class="sec"><label class="fl">Address <select class="in pk2" data-fill="addr"><option value="">+ Pick address</option>${ad}</select><textarea class="in" name="addr" rows="2">${esc(p.addr || '')}</textarea></label>
${e ? '' : `<button type="button" class="btn dash" data-a="vsbtn">+ Record vital signs</button><div id="vsbox" hidden><div class="g2">${VS.map(([l, k]) => fIn(l, 'vs_' + k)).join('')}</div></div>`}</div>
<div class="sec">${fIn('Registration date', 'reg_date', p.reg_date, 'datetime-local')}</div>`,
    async (f) => {
      const m = new FormData(f), md = $('#agebox').dataset.mode; let age = 0, unit = 'Y', dob = '';
      if (md == 'manual') { age = +m.get('age') || 0; unit = m.get('age_unit') || 'Y'; }
      else if (md == 'ym') { const y = +m.get('ym_y') || 0, mo = +m.get('ym_m') || 0; if (mo) { age = y * 12 + mo; unit = 'M'; } else age = y; }
      else { dob = m.get('dob') || ''; const d = new Date(dob); if (dob && !isNaN(d)) { const n = new Date(); let mm = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth(); if (n.getDate() < d.getDate()) mm--; mm = Math.max(0, mm); if (mm < 12) { age = mm; unit = 'M'; } else age = Math.floor(mm / 12); } }
      const body = { name: m.get('name'), latin_name: m.get('latin_name'), phone: m.get('phone'), age, age_unit: unit, dob, sex: m.get('sex'), khmer: m.get('khmer') ? 1 : 0, nssf: m.get('nssf') ? 1 : 0, pet: m.get('pet') ? 1 : 0, nssf_id: m.get('nssf_id'), national_id: m.get('national_id'), complaints: m.get('complaints'), history: m.get('history'), addr: m.get('addr'), reg_date: m.get('reg_date') };
      const saved = e ? await api('PUT', 'patients/' + p.id, body) : await api('POST', 'patients', { ...body, type: 'OPD', unpaid: 0 });
      const vs = {}; VS.forEach(([l, k]) => { const v = m.get('vs_' + k); if (v) vs[k] = v; });
      if (!e && Object.keys(vs).length) await api('POST', 'records', { patient_id: saved.id, kind: 'vitals', date: body.reg_date || nowLocal(), data: vs });
      await load(); render(); toast(e ? 'Saved' : 'Patient registered');
    }, { cls: 'wide', ok: e ? 'Save' : 'Register Patient', extra: '<button type="button" class="btn" data-a="regprint">Print</button>' });
}
function regPrint() {
  const f = $('#mf'), m = new FormData(f);
  printDoc('Patient registration', kv([['Name', m.get('name')], ['Latin name', m.get('latin_name')], ['Phone', m.get('phone')], ['Sex', fmtSex(m.get('sex'))], ['NSSF ID', m.get('nssf_id')], ['National ID', m.get('national_id')], ['Complaints', m.get('complaints')], ['Past medical history', m.get('history')], ['Address', m.get('addr')], ['Registration date', (m.get('reg_date') || '').replace('T', ' ')]]));
}

// ---------- patient file ----------
const PT = [['vitals', 'Vital signs'], ['medical', 'Medical Record'], ['mdhistory', 'MD History'], ['beu', 'BEU'], ['schedule', 'Treatment Schedule'], ['consultation', 'Consultation'], ['operation', 'Operation'], ['investigation', 'Investigation request'], ['lab', 'Lab results'], ['echo', 'Echo results'], ['xray', 'X-Ray results'], ['homecare', 'Homecare'], ['prescription', 'Prescription'], ['medlist', 'Medication list'], ['documents', 'Documents'], ['billing', 'Billing history'], ['appts', 'Appointment history'], ['allergy', 'Allergy History'], ['vaccination', 'Vaccination'], ['referral', 'Referral'], ['diagnosis_history', 'Diagnosis History'], ['laborder', 'Lab Orders'], ['imagingorder', 'Imaging Orders']];
const CARE_MODULES = {
  allergy: { title: 'Allergy History', fields: [['allergen', 'Allergen'], ['reaction', 'Reaction'], ['severity', 'Severity', 'sel', ['Mild', 'Moderate', 'Severe']], ['status', 'Status', 'sel', ['Active', 'Resolved']] ] },
  vaccination: { title: 'Vaccination', fields: [['vaccine', 'Vaccine'], ['dose', 'Dose'], ['lot', 'Lot / Batch number'], ['next_due', 'Next due date', 'date']] },
  referral: { title: 'Referral', fields: [['referred_to', 'Referred to'], ['specialty', 'Department / Specialty'], ['reason', 'Reason for referral'], ['status', 'Status', 'sel', ['Pending', 'Accepted', 'Completed']] ] },
  diagnosis_history: { title: 'Diagnosis History', fields: [['diagnosis', 'Diagnosis'], ['code', 'ICD / Diagnosis code'], ['status', 'Status', 'sel', ['Active', 'Resolved', 'Chronic']] ] },
  laborder: { title: 'Lab Orders', fields: [['test', 'Test requested'], ['priority', 'Priority', 'sel', ['Routine', 'Urgent', 'STAT']], ['status', 'Status', 'sel', ['Requested', 'Collected', 'Completed', 'Cancelled']], ['result', 'Result', 'ta']] },
  imagingorder: { title: 'Imaging Orders', fields: [['modality', 'Modality', 'sel', ['X-Ray', 'Ultrasound', 'CT', 'MRI', 'Other']], ['body_part', 'Body part'], ['priority', 'Priority', 'sel', ['Routine', 'Urgent', 'STAT']], ['status', 'Status', 'sel', ['Requested', 'Scheduled', 'Completed', 'Cancelled']], ['indication', 'Clinical indication', 'ta']] }
};
const VSF = [['t', 'Temperature (°C)'], ['hr', 'Heart rate (bpm)'], ['rr', 'Respiratory rate (bpm)'], ['bp', 'Blood pressure (mmHg)'], ['spo2', 'SpO2 (%)'], ['p', 'Pulse (P)'], ['w', 'Weight (kg)'], ['h', 'Height (cm)']];
const COLORS = ['#e5e7eb', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
let pdId = null, ptab = 'vitals', recs = [], pdDate = '', investigationQuery = '', investigationSelection = new Set();
const curPt = () => D.pt.find((x) => x.id == pdId);
const jd = (r) => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } };
async function loadRecs() {
  recs = await api('GET', 'records?patient_id=' + pdId + '&limit=5000');
  D.billing = D.billing.filter((r) => String(r.patient_id) != String(pdId) || !['schedule', 'payment', 'investigation'].includes(r.kind))
    .concat(recs.filter((r) => ['schedule', 'payment', 'investigation'].includes(r.kind)));
}
async function openPatient(id) { pdId = id; ptab = 'vitals'; pdDate = ''; investigationQuery = ''; investigationSelection.clear(); rt = 'pd'; await loadRecs(); render(); }
const lbl = (k) => (PT.find((x) => x[0] == k) || [0, k])[1];
// ---- patient file layout & "hide" controls (saved in this browser) ----
const PTI = { vitals: '🩺', medical: '📝', mdhistory: '📋', beu: '🖼️', schedule: '📅', consultation: '💬', operation: '✂️', investigation: '🔬', lab: '🧪', echo: '💓', xray: '🩻', homecare: '🏠', prescription: '💊', medlist: '📑', documents: '📁', billing: '💰', appts: '🗓️', allergy: '♡', vaccination: '💉', referral: '↗', diagnosis_history: '📖', laborder: '🧫', imagingorder: '🩻' };
const PI = [['id', 'ID'], ['name', 'Name'], ['age', 'Age'], ['gender', 'Gender'], ['phone', 'Phone'], ['nssf', 'NSSF ID'], ['nat', 'National ID'], ['addr', 'Address'], ['date', 'Date Filter']];
let pdHideI = new Set(), pdHideC = new Set(), pdLay = 'list', pdCtl = false;
try { const h = JSON.parse(localStorage.getItem('pdHide') || '{}'); pdHideI = new Set(h.i || []); pdHideC = new Set(h.c || []); pdLay = localStorage.getItem('pdLay') === 'grid' ? 'grid' : 'list'; } catch (e) { /* defaults */ }
const savePd = () => { try { localStorage.setItem('pdHide', JSON.stringify({ i: [...pdHideI], c: [...pdHideC] })); localStorage.setItem('pdLay', pdLay); } catch (e) { /* ignore */ } };
R.pd = function () {
  const p = curPt(); if (!p) return hd('Patients', '') + '<p class="emp">Patient not found.</p>';
  const vt = PT.filter(([k]) => !pdHideC.has(k)); if (vt.length && !vt.some(([k]) => k == ptab)) ptab = vt[0][0];
  const h = (k) => !pdHideI.has(k), ed = (k, l) => `<span class="mu">${l}</span> <a href="#" data-a="pedit:${k}" title="Edit">✎</a><br><b>${esc(p[k] || 'N/A')}</b>`;
  const top = `<div class="tools" style="justify-content:space-between;margin-bottom:10px"><div class="mu"><a href="#" data-a="go:pt">Patient Management</a> / <b>${esc(p.name)}</b></div><div class="tools"><button class="btn p" data-a="pdprint">🖨 History</button><button class="btn ${pdCtl ? 'on2' : ''}" data-a="pdctl" title="Hide controls">🙈</button><button class="btn ${pdLay == 'grid' ? 'on2' : ''}" data-a="pdlay" title="Change layout">▦</button></div></div>`;
  const ctl = pdCtl ? `<div class="card pdc"><b>Hide Patient Info:</b><div class="pdcg">${PI.map(([k, l]) => `<label class="cb"><input type="checkbox" data-a="hidei:${k}" ${pdHideI.has(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div><b>Hide Content Sections:</b><div class="pdcg">${PT.map(([k, l]) => `<label class="cb"><input type="checkbox" data-a="hidec:${k}" ${pdHideC.has(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>` : '';
  const head = `<div class="card pdh"><div class="pda"><div class="av big">${p.photo ? `<img src="/uploads/${esc(p.photo)}" alt="">` : '👤'}</div><label class="btn s" style="margin-top:6px;cursor:pointer">Change photo<input type="file" id="pfp" accept="image/*" hidden></label></div>
<div class="pdi"><div class="tools" style="justify-content:space-between"><div>${h('name') ? `<span class="mu">Name</span> <b style="font-size:18px">${esc(p.name)}</b>${p.latin_name ? ` <span class="mu">(${esc(p.latin_name)})</span>` : ''}` : ''}${h('id') ? ` &nbsp; <span class="mu">ID:</span> ${p.id}` : ''}${h('age') ? ` &nbsp; <span class="mu">Age:</span> <b>${fmtAge(p)}</b>` : ''}</div><button class="btn" data-a="regedit:${D.pt.indexOf(p)}">Edit patient</button></div>
<div class="gr2 pdg">${h('gender') ? `<div><span class="mu">Gender</span><br><b>${esc(fmtSex(p.sex) || 'N/A')}</b></div>` : ''}${h('phone') ? `<div><span class="mu">Phone</span><br><b>${esc(p.phone || 'N/A')}</b></div>` : ''}${h('nssf') ? `<div>${ed('nssf_id', 'NSSF ID')}</div>` : ''}${h('nat') ? `<div>${ed('national_id', 'National ID')}</div>` : ''}${h('addr') ? `<div><span class="mu">Address</span><br><b>${esc(p.addr || 'N/A')}</b></div>` : ''}${h('date') ? `<div><span class="mu">Date</span><br><input type="date" id="pdd" class="in" value="${esc(pdDate)}"></div>` : ''}</div></div></div>`;
  const body = !vt.length ? '<div class="card pdr"><p class="emp">All sections are hidden. Use the eye button to show them.</p></div>'
    : pdLay == 'grid' ? `<div class="card pdt">${vt.map(([k, l]) => `<div class="tile ${k == ptab ? 'on' : ''}" data-a="rtab:${k}"><span>${PTI[k] || ''}</span>${l}</div>`).join('')}</div><div class="card pdr" id="rp">${recPanel()}</div>`
    : `<div class="pdw"><div class="card pdm">${vt.map(([k, l]) => `<div class="it ${k == ptab ? 'on' : ''}" data-a="rtab:${k}"><i>${PTI[k] || ''}</i>${l}</div>`).join('')}</div><div class="card pdr" id="rp">${recPanel()}</div></div>`;
  return top + ctl + head + body;
};
function recCard(r) {
  const d = jd(r), act = r.kind == 'investigation' ? `<div class="ra"><button class="btn s r" data-a="rdel:${r.id}" title="Delete request">✕</button></div>` : `<div class="ra"><button class="btn s" data-a="redit:${r.id}">Edit</button><button class="btn s r" data-a="rdel:${r.id}">✕</button></div>`, when = esc((r.date || '').replace('T', ' '));
  if (r.kind == 'vitals') return `<div class="rc">${act}<div class="mu">${when}</div><div class="vs">${VSF.filter(([k]) => d[k]).map(([k, l]) => `<span><b>${l.replace(/ \(.*/, '')}:</b> ${esc(d[k])} ${(l.match(/\((.*)\)/) || [])[1] || ''}</span>`).join('') || '—'}</div></div>`;
  if (r.kind == 'medical') return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d.dx || d.cc || 'Medical Record')}</b><div class="mu">${esc((d.cc || '').slice(0, 140))}</div><div class="ra2"><button class="btn s" data-a="rprint:${r.id}">Print</button></div></div>`;
  if (r.kind == 'investigation' && Array.isArray(d.items)) return `<div class="rc investigation-record">${act}<div class="mu">${when}</div><b>Requested services</b><div class="investigation-record-items">${d.items.map((item) => { const qty = Math.max(1, +item.quantity || 1), unit = +item.unit_price || +item.price || 0; return `<div><span>${esc(item.name)}${qty > 1 ? ` × ${qty}` : ''}</span><b>${K(unit * qty)}</b></div>`; }).join('')}</div><div class="investigation-record-total">Total: <b>${K(d.items.reduce((sum, item) => sum + (+item.unit_price || +item.price || 0) * Math.max(1, +item.quantity || 1), 0))}</b></div></div>`;
  if (r.kind == 'vaccination') {
    const doses = Array.isArray(d.doses) ? d.doses : d.vaccine ? [{ vaccine: d.vaccine, dose: d.dose, date: d.next_due, given: false, notes: d.lot ? `Lot / Batch: ${d.lot}` : '' }] : [];
    const categoryLabel = d.category == 'child' ? 'Child vaccination' : d.category == 'adult' ? 'Adult vaccination' : d.category == 'other' ? 'Other' : d.category;
    return `<div class="rc vaccination-record">${act}<div class="mu">${when}</div><b>${esc(d.vaccine_group || d.vaccine_type || T('Vaccination'))}</b>${categoryLabel ? `<span class="bd">${esc(T(categoryLabel))}</span>` : ''}<div class="vaccination-record-doses">${doses.filter((dose) => dose.vaccine || dose.date || dose.notes).map((dose) => `<div><span>${esc(dose.vaccine || '')}</span><span>${esc(dose.date || '')}</span><span>${dose.given ? T('Given') : T('Not given')}</span>${dose.notes ? `<span>${esc(dose.notes)}</span>` : ''}</div>`).join('')}</div>${d.notes || r.notes ? `<div class="mu">${esc(d.notes || r.notes)}</div>` : ''}${d.administered_by ? `<div class="mu">${T('Administered by')}: ${esc(d.administered_by)}</div>` : ''}</div>`;
  }
  const img = r.image ? `<a href="/uploads/${esc(r.image)}" target="_blank"><img class="rimg" src="/uploads/${esc(r.image)}" alt=""></a>` : '';
  if (CARE_MODULES[r.kind]) {
    const fields = CARE_MODULES[r.kind].fields.filter(([k]) => d[k]).map(([k, label]) => `<div><span class="mu">${esc(label)}:</span> ${esc(d[k])}</div>`).join('');
    return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d[CARE_MODULES[r.kind].fields[0][0]] || CARE_MODULES[r.kind].title)}</b><div class="care-record-fields">${fields}</div>${r.notes ? `<div style="white-space:pre-wrap">${esc(r.notes)}</div>` : ''}</div>`;
  }
  return `<div class="rc" ${r.kind == 'beu' && r.color ? `style="border-left:6px solid ${esc(r.color)}"` : ''}>${act}<b>${esc(r.title || lbl(r.kind))}</b> <span class="mu">${when}</span><div style="white-space:pre-wrap">${esc(r.notes || '')}</div>${img}</div>`;
}
function recPanel() {
  const p = curPt(); if (!p) return '';
  if (ptab == 'schedule') return schPanel();
  if (ptab == 'billing') return billPanel();
  if (ptab == 'appts') { const L = D.ap.filter((a) => (a.name || '').toLowerCase() == (p.name || '').toLowerCase()); return `<h2 class="rh">${lbl(ptab)}</h2>${L.map((a) => `<div class="rc"><b>${esc(a.date)} ${esc(a.time || '')}</b> ${esc(a.svc || '')} <span class="mu">${esc(a.doc || '')}</span> <span class="bd">${esc(a.st)}</span></div>`).join('') || '<p class="emp">Nothing here yet.</p>'}`; }
  const L = recs.filter((r) => r.kind == ptab && (!pdDate || (r.date || '').startsWith(pdDate)));
  if (ptab == 'investigation') return investigationPanel(L);
  return `<div class="hd"><h2 class="rh">${lbl(ptab)}</h2>${ptab == 'medical' ? '<div class="tools"><button class="btn" data-a="htc" title="HT Controls">⚙</button><button class="btn" data-a="mhist">History</button><button class="btn" data-a="mrd">MRD</button><button class="btn g" data-a="radd">+ Add</button></div>' : '<button class="btn g" data-a="radd">+ Add</button>'}</div>${ptab == 'beu' ? `<div class="gr">${L.map(recCard).join('')}</div>` : L.map(recCard).join('')}${L.length ? '' : '<p class="emp">Nothing here yet.</p>'}`;
}
function investigationServiceList() {
  const query = investigationQuery.trim().toLowerCase();
  const services = D.sv.filter((service) => !query || String(service.name || '').toLowerCase().includes(query));
  return services.map((service) => `<label class="investigation-service ${investigationSelection.has(String(service.id)) ? 'selected' : ''}"><input type="checkbox" data-investigation-service="${service.id}" ${investigationSelection.has(String(service.id)) ? 'checked' : ''}><span>${esc(service.name)} (${K(service.price)})</span></label>`).join('') || '<p class="emp investigation-empty">No matching services.</p>';
}
function investigationPanel(records) {
  return `<section class="investigation-request card"><div class="investigation-request-head"><h2 class="rh">${T('Request service')}</h2><div class="tools"><input id="investigation-service-search" class="in" type="search" placeholder="${esc(T('Search services…'))}" value="${esc(investigationQuery)}"><button class="btn p" data-a="investigation-request" ${investigationSelection.size ? '' : 'disabled'}>${T('Add selected')}${investigationSelection.size ? ` (${investigationSelection.size})` : ''}</button></div></div><div class="investigation-service-grid" id="investigation-service-list">${investigationServiceList()}</div></section><section class="investigation-history"><h3>${T('Service requests')}</h3>${records.map(recCard).join('') || `<p class="emp">${T('No services requested yet.')}</p>`}</section>`;
}
const VACCINE_DOSE_COUNT = 6;
const vaccineRows = (d) => Array.from({ length: VACCINE_DOSE_COUNT }, (_, i) => {
  const row = (Array.isArray(d.doses) && d.doses[i]) || {};
  const name = row.vaccine || (!d.doses && i == 0 ? d.vaccine : '') || '';
  const date = row.date || (!d.doses && i == 0 ? d.next_due : '') || '';
  const notes = row.notes || (!d.doses && i == 0 && d.lot ? `Lot / Batch: ${d.lot}` : '') || '';
  return `<tr><td><label class="vax-name"><span class="vax-dose-index">${i + 1}</span><input class="in" name="vax_name_${i}" value="${esc(name)}" placeholder="${esc(T('Vaccine name'))} ${i + 1}"></label></td><td><input class="in" name="vax_date_${i}" type="date" value="${esc(date)}"></td><td><label class="vax-check"><input type="checkbox" name="vax_given_${i}" value="1" ${row.given ? 'checked' : ''}><span class="sr-only">${esc(T('Given'))}</span></label></td><td><input class="in" name="vax_note_${i}" value="${esc(notes)}" placeholder="${esc(T('Notes'))}"></td></tr>`;
}).join('');
function vaccinationForm(r) {
  const editing = !!r, d = r ? jd(r) : {}, date = (r && r.date ? r.date : ymd(new Date())).slice(0, 10);
  const categories = [['Child vaccination', 'child'], ['Adult vaccination', 'adult'], ['Other', 'other']];
  const category = d.category || 'child';
  const body = `<div class="vaccination-form">
    <label class="fl">${T('Vaccine category')}<div class="vax-categories">${categories.map(([label, value]) => `<label class="cb"><input type="radio" name="category" value="${value}" ${category == value ? 'checked' : ''}> ${T(label)}</label>`).join('')}</div></label>
    ${fIn(T('Vaccine group'), 'vaccine_group', d.vaccine_group || (!d.doses ? d.vaccine : ''), 'text', `placeholder="${esc(T('Enter vaccine group'))}"`)}
    <div class="vax-table-wrap"><table class="vax-table"><thead><tr><th>${T('Vaccine name')}</th><th>${T('Dose date')}</th><th>${T('Given')}</th><th>${T('Notes')}</th></tr></thead><tbody>${vaccineRows(d)}</tbody></table></div>
    ${fTa(T('Notes'), 'notes', d.notes || r && r.notes || '', 2)}
    <div class="g2 vax-footer">${fIn(T('Date'), 'date', date, 'date')}${fIn(T('Administered by'), 'administered_by', d.administered_by || '')}</div>
  </div>`;
  openForm(T(editing ? 'Edit Vaccination' : 'Add Vaccination'), body, async (f) => {
    const m = new FormData(f), doses = Array.from({ length: VACCINE_DOSE_COUNT }, (_, i) => ({
      vaccine: String(m.get(`vax_name_${i}`) || '').trim(),
      date: m.get(`vax_date_${i}`) || '',
      given: m.get(`vax_given_${i}`) === '1',
      notes: String(m.get(`vax_note_${i}`) || '').trim()
    })).filter((dose) => dose.vaccine || dose.date || dose.given || dose.notes);
    const data = { category: m.get('category') || 'child', vaccine_group: String(m.get('vaccine_group') || '').trim(), doses, notes: m.get('notes') || '', administered_by: String(m.get('administered_by') || '').trim() };
    const body = { patient_id: pdId, kind: 'vaccination', title: data.vaccine_group || T('Vaccination'), date: m.get('date') || date, notes: data.notes, data };
    editing ? await api('PUT', 'records/' + r.id, body) : await api('POST', 'records', body);
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'vaccination-form-dialog' });
}
async function requestInvestigationServices() {
  const services = [...investigationSelection].map((id) => D.sv.find((service) => String(service.id) == id)).filter(Boolean);
  if (!services.length) return toast('Select at least one service');
  await api('POST', 'records', {
    patient_id: pdId,
    kind: 'investigation',
    title: 'Service request',
    date: nowLocal(),
    data: { items: services.map((service) => ({ service_id: service.id, name: service.name, unit_price: Number(service.price) || 0, price: Number(service.price) || 0, quantity: 1 })) }
  });
  investigationSelection.clear();
  await loadRecs();
  render();
  toast('Services requested');
}
function genForm(r) {
  const k = ptab, e = !!r; r = r || { date: ymd(new Date()) };
  if (k == 'vaccination') { vaccinationForm(e ? r : null); return; }
  const module = CARE_MODULES[k];
  if (module) {
    const d = r ? jd(r) : {}, fields = module.fields.map(([key, label, type, opts]) => type == 'sel'
      ? fSel(label, key, d[key] || opts[0], opts)
      : type == 'ta' ? fTa(label, key, d[key] || '', 3) : fIn(label, key, d[key] || '', type || 'text')).join('');
    openForm((e ? 'Edit ' : 'Add ') + module.title, `<div class="g2">${fIn('Date', 'date', (r.date || '').slice(0, 10), 'date')}</div>${fields}${fTa('Notes', 'notes', r.notes, 3)}`, async (f) => {
      const m = new FormData(f), data = {};
      module.fields.forEach(([key, , type]) => { const value = m.get(key); if (value) data[key] = value; });
      const firstKey = module.fields[0][0], body = { patient_id: pdId, kind: k, title: module.title, date: m.get('date'), notes: m.get('notes'), data };
      if (!data[firstKey]) throw new Error(`Enter ${module.fields[0][1].toLowerCase()}`);
      e ? await api('PUT', 'records/' + r.id, body) : await api('POST', 'records', body);
      await loadRecs(); render(); toast('Saved');
    });
    return;
  }
  const body = fIn('Title', 'title', r.title, 'text', k == 'beu' ? 'placeholder="e.g., Before treatment"' : '') + (k == 'beu' ? `<div class="fl">Label colour<div class="sws">${COLORS.map((c, i) => `<label class="sw"><input type="radio" name="color" value="${c}" ${(r.color || COLORS[0]) == c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>` : '') + fIn('Date', 'date', (r.date || '').slice(0, 10), 'date') + fTa('Notes', 'notes', r.notes, 4) + imgField(k == 'beu' ? 'Image' : 'Picture (optional)', 'image', r.image, 'Remove picture');
  openForm((e ? 'Edit ' : 'Add ') + lbl(k), body, async (f) => {
    const m = new FormData(f), b = { patient_id: pdId, kind: k, title: m.get('title'), date: m.get('date'), notes: m.get('notes'), image: m.get('image') || '', color: k == 'beu' ? (m.get('color') || '') : '' };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { ok: k == 'beu' ? 'Save Record' : 'Save' });
}
function vsForm(r) {
  const e = !!r, d = r ? jd(r) : {}; r = r || { date: nowLocal() };
  openForm((e ? 'Edit ' : 'Add ') + 'vital signs', `<div class="g2">${VSF.map(([k, l]) => fIn(l, 'v_' + k, d[k])).join('')}</div>${fIn('Date', 'date', r.date, 'datetime-local')}`, async (f) => {
    const m = new FormData(f), data = {}; VSF.forEach(([k]) => { const v = m.get('v_' + k); if (v) data[k] = v; });
    const b = { patient_id: pdId, kind: 'vitals', date: m.get('date'), data }; e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  });
}

// ---------- Medical Record (one schema drives the form and the printout) ----------
// types: h heading, s sub-heading, g grid of inputs, a textarea, i input, c checkbox group, p left/right pair, m monitoring checkboxes, t monitoring table
const G = (g, ...a) => a.map((it) => Object.assign(it, { g }));
const MR = [
  ...G('vs', ['h', '1. Vital signs'], ['g', [['bp', 'Blood pressure (BP)'], ['p', 'Pulse (P)'], ['rr', 'Respiratory rate (RR)'], ['t', 'Temperature (T°)'], ['o2', 'Oxygen saturation (O2sat)'], ['ht', 'Height (cm)'], ['wt', 'Weight (kg)']]]),
  ...G('ill', ['a', 'cc', '2. Chief complaint'], ['a', 'hpi', '3. History of present illness'], ['a', 'ros', '4. Review of systems'], ['a', 'cm', '5. Current medication']),
  ...G('pmh', ['h', '6. Past medical history'], ['s', '6.1 Personal history'],
    ['c', 'vacc', 'Child vaccination', ['BCG/HepB', 'OPV+DPT-HepB-Hib1', 'OPV+DPT-HepB-Hib2', 'OPV+DPT-HepB-Hib3', 'Measles+JE', 'Tetanus other']],
    ['c', 'tt', 'Women', ['TT1', 'TT2', 'TT4', 'TT5', 'Pregnant', 'Unknown']],
    ['a', 'pmh', 'Past medical history'], ['a', 'psh', 'Past surgery history'], ['a', 'obg', 'OB/GYN'],
    ['c', 'risk', 'Risk factors', ['Hypertension', 'Diabetes', 'Heart disease', 'Asthma', 'Smoking', 'Substance use']], ['i', 'risko', 'Other'], ['a', 'fh', '6.2 Family history']),
  ...G('ce', ['h', '7. Clinical examination'], ['s', '7.1 General appearance'],
    ['c', 'ga', 'General appearance', ['Good', 'Fair', 'Poor', 'Severe', 'Pale', 'Cyanosis', 'Jaundice']],
    ['c', 'neu', 'Neurological system', ['Conscious', 'Confused', 'Unconscious', 'Convulsion']],
    ['i', 'gcs', 'Glasgow coma score'], ['i', 'speech', 'Speech'], ['i', 'motor', 'Motor'], ['i', 'neuo', 'Other'],
    ['s', '7.2 Head, eyes, ears, nose, throat and neck'], ['i', 'head', 'Head'], ['p', 'eyes', 'Eyes', ['Left', 'Right']], ['i', 'fundus', 'Fundus'], ['p', 'ears', 'Ears', ['Left', 'Right']], ['i', 'nose', 'Nose'], ['i', 'pharynx', 'Pharynx / Larynx'], ['i', 'neck', 'Neck'],
    ['s', '7.3 Lymphadenopathy'], ['i', 'lymph', 'Lymph nodes'],
    ['s', '7.4 Respiratory system'], ['i', 'r_ins', 'Inspection'], ['c', 'r_cb', 'Findings', ['Thorax asymmetric', 'Dyspnea', 'Polypnea', 'Tirage', 'Stridor', 'Others']], ['i', 'r_pal', 'Palpation'], ['i', 'r_per', 'Percussion'], ['i', 'r_aus', 'Auscultation'],
    ['s', '7.5 Cardiovascular system'], ['i', 'c_ins', 'Inspection'], ['i', 'c_pal', 'Palpation'], ['i', 'c_per', 'Percussion'], ['i', 'c_aus', 'Auscultation'],
    ['s', '7.6 Abdomen'], ['i', 'a_ins', 'Inspection'], ['i', 'a_pal', 'Palpation'], ['i', 'a_per', 'Percussion'], ['i', 'a_aus', 'Auscultation']),
  ...G('os', ['i', 'gu', '7.7 Genito-urinary'], ['i', 'ext', '7.8 Extremities'], ['i', 'msk', '7.9 Musculoskeletal'], ['a', 'os', '7.10 Other systems']),
  ['a', 'dx', '8. Probable diagnosis'], ['a', 'ddx', '9. Differential diagnosis'], ['a', 'inv', '10. Investigation'], ['a', 'tx', '11. Initial treatment'],
  ...G('dm', ['c', 'diet', 'Diet', ['Normal', 'Salt restriction', 'Sweet restriction']], ['i', 'diet_o', 'Diet: other'], ['m']),
  ...G('mt', ['t']),
  ...G('add', ['a', 'exc', 'Complementary examinations'], ['a', 'bg', 'General assessment'], ['a', 'trt', 'Treatments'])];
const MRH = [['vs', 'Vital Signs'], ['ill', 'Illness History'], ['pmh', 'Past Medical History'], ['ce', 'Clinical Examination'], ['os', 'Other Systems'], ['dm', 'Diet & Monitor'], ['mt', 'Monitor Table'], ['add', 'Additional Sections']];
let mrHide = new Set(); try { mrHide = new Set(JSON.parse(localStorage.getItem('mrHide') || '[]')); } catch (e) { /* none */ }
const vis = (S, it) => S !== MR || !it.g || !mrHide.has(it.g);
const MON = [['vs', 'Vital signs'], ['ur', 'Urine'], ['cs', 'Consciousness']];
const mtRow = (r = []) => `<tr><td><input class="in" name="mt_d" value="${esc(r[0] || '')}"></td><td><input class="in" name="mt_e" value="${esc(r[1] || '')}"></td><td><input class="in" name="mt_t" value="${esc(r[2] || '')}"></td></tr>`;
function mrHtml(d) {
  return MR.filter((it) => vis(MR, it)).map((it) => { const [t, k, l, o] = it;
    if (t == 'h') return `<h4 class="mh">${k}</h4>`; if (t == 's') return `<h5 class="ms">${k}</h5>`;
    if (t == 'g') return `<div class="g3">${k.map(([kk, ll]) => fIn(ll, 'mr_' + kk, d[kk])).join('')}</div>`;
    if (t == 'a') return fTa(l, 'mr_' + k, d[k], 3); if (t == 'i') return fIn(l, 'mr_' + k, d[k]);
    if (t == 'c') return `<div class="cbg"><b>${l}</b><div class="g3">${o.map((x) => fCb(x, 'mrc_' + k, (d[k] || []).includes(x), x)).join('')}</div></div>`;
    if (t == 'p') return `<div class="g2">${o.map((x, i) => fIn(`${l}: ${x}`, 'mr_' + k + (i ? '_r' : '_l'), d[k + (i ? '_r' : '_l')])).join('')}</div>`;
    if (t == 'm') return `<div class="cbg"><b>Monitor</b>${MON.map(([x, n]) => `<div class="mon">${fCb(n + ' every', 'mon_' + x, d['mon_' + x])}<input class="in sm" name="mon_${x}_h" value="${esc(d['mon_' + x + '_h'] || '')}"> hours</div>`).join('')}<div class="mon">${fCb('Other', 'mon_o', d.mon_o)}<input class="in" name="mon_o_h" value="${esc(d.mon_o_h || '')}"></div></div>`;
    if (t == 't') return `<b>Monitoring</b><table class="mt"><thead><tr><th>Date / Vital signs</th><th>Evolution of patient</th><th>Treatment</th></tr></thead><tbody id="mtb">${(d.mt || []).map(mtRow).join('')}</tbody></table><button type="button" class="btn s" data-a="mtadd">+ Add row</button>`;
  }).join('');
}
// base = the record's existing data: sections hidden with HT Controls are not in the form, so their saved values are kept
function mrCollect(f, base = {}) {
  const m = new FormData(f), d = { ...base }, on = (g) => !g || !mrHide.has(g);
  MR.forEach((it) => { const [t, k] = it; if (!vis(MR, it)) return;
    if (t == 'g') k.forEach(([kk]) => { d[kk] = m.get('mr_' + kk) || ''; });
    else if (t == 'a' || t == 'i') d[k] = m.get('mr_' + k) || '';
    else if (t == 'c') d[k] = m.getAll('mrc_' + k);
    else if (t == 'p') { d[k + '_l'] = m.get('mr_' + k + '_l') || ''; d[k + '_r'] = m.get('mr_' + k + '_r') || ''; } });
  if (on('dm')) ['vs', 'ur', 'cs', 'o'].forEach((x) => { d['mon_' + x] = m.get('mon_' + x) ? 1 : 0; d['mon_' + x + '_h'] = m.get('mon_' + x + '_h') || ''; });
  if (on('mt')) { const a = m.getAll('mt_d'), b = m.getAll('mt_e'), c = m.getAll('mt_t'); d.mt = a.map((x, i) => [x, b[i], c[i]]).filter((r) => r.some(Boolean)); }
  return d;
}
function mrPrintHtml(d) {
  return MR.filter((it) => vis(MR, it)).map((it) => { const [t, k, l, o] = it;
    if (t == 'h') return `<h4>${esc(k)}</h4>`; if (t == 's') return `<h5>${esc(k)}</h5>`;
    if (t == 'g') return kv(k.map(([kk, ll]) => [ll, d[kk]]));
    if (t == 'a' || t == 'i') return d[k] ? `<p><b>${esc(l)}:</b> ${esc(d[k]).replace(/\n/g, '<br>')}</p>` : '';
    if (t == 'c') return (d[k] || []).length ? `<p><b>${esc(l)}:</b> ${d[k].map(esc).join(', ')}</p>` : '';
    if (t == 'p') return d[k + '_l'] || d[k + '_r'] ? `<p><b>${esc(l)}:</b> Left ${esc(d[k + '_l'] || '–')} / Right ${esc(d[k + '_r'] || '–')}</p>` : '';
    if (t == 'm') { const x = [...MON.filter(([q]) => d['mon_' + q]).map(([q, n]) => `${n} every ${esc(d['mon_' + q + '_h'] || '?')} h`), ...(d.mon_o ? [esc(d.mon_o_h || 'Other')] : [])]; return x.length ? `<p><b>Monitor:</b> ${x.join('; ')}</p>` : ''; }
    if (t == 't') return (d.mt || []).length ? `<table class="pk full"><tr><th>Date / Vital signs</th><th>Evolution of patient</th><th>Treatment</th></tr>${d.mt.map((r) => `<tr>${r.map((c) => `<td>${esc(c || '')}</td>`).join('')}</tr>`).join('')}</table>` : '';
    return ''; }).join('');
}
function mrForm(r) {
  const e = !!r, d = r ? jd(r) : {}; r = r || { date: nowLocal() };
  openForm('Medical Record', `<div class="mrd">${fIn('Date', 'date', r.date, 'datetime-local')}</div>${mrHtml(d)}`, async (f) => {
    const b = { patient_id: pdId, kind: 'medical', date: new FormData(f).get('date'), data: mrCollect(f, d) };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { cls: 'xl', extra: '<button type="button" class="btn" data-a="mrprint">Print</button>' });
}
// gear button: choose which Medical Record sections are shown (saved in this browser)
function htControls() {
  openForm('HT Controls', `<p class="mu" style="margin:0 0 8px">Hide content sections</p><div class="g2">${MRH.map(([k, l]) => fCb(l, 'ht', mrHide.has(k), k)).join('')}</div>`, async (f) => {
    mrHide = new Set(new FormData(f).getAll('ht')); try { localStorage.setItem('mrHide', JSON.stringify([...mrHide])); } catch (e) { /* ignore */ } toast('Saved');
  });
}
// History button: every Medical Record of this patient, newest first
function mrHistory() {
  const L = recs.filter((r) => r.kind == 'medical');
  openForm('History', L.map((r) => { const d = jd(r); return `<div class="rc" data-a="redit:${r.id}" style="cursor:pointer"><b>${esc(d.dx || d.cc || 'Medical Record')}</b> <span class="mu">${esc((r.date || '').replace('T', ' '))}</span><div class="mu">${esc((d.cc || '').slice(0, 120))}</div></div>`; }).join('') || '<p class="emp">Nothing here yet.</p>', async () => {});
}
// MRD button: short medical-record sheet (name, sex, age, date, diagnosis, request, result)
function mrdList() {
  const L = recs.filter((r) => r.kind == 'mrd');
  openForm('MRD records', (L.map((r) => `<div class="rc" data-a="mrdedit:${r.id}" style="cursor:pointer"><b>${esc(jd(r).dx || 'MRD')}</b> <span class="mu">${esc(r.date || '')}</span></div>`).join('') || '<p class="emp">No records yet.</p>') + '<button type="button" class="btn p" data-a="mrdnew">+ Create new record</button>', async () => {});
}
function mrdForm(r) {
  const e = !!r, d = r ? jd(r) : {}, p = curPt(); r = r || { date: ymd(new Date()) };
  openForm(e ? 'Edit MRD record' : 'Create MRD record', `<div class="g2">${fIn('Patient name', 'pn', p.name, 'text', 'readonly')}${fIn('Sex', 'ps', fmtSex(p.sex), 'text', 'readonly')}${fIn('Age', 'pa', fmtAge(p), 'text', 'readonly')}${fIn('Date', 'date', r.date, 'date')}</div>${fTa('Diagnosis', 'dx', d.dx)}${fTa('Request', 'req', d.req)}${fTa('Result', 'res', d.res)}`, async (f) => {
    const m = new FormData(f), b = { patient_id: pdId, kind: 'mrd', date: m.get('date'), data: { dx: m.get('dx'), req: m.get('req'), res: m.get('res') } };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { extra: '<button type="button" class="btn" data-a="mrdprint">Print</button>' });
}
function mrdPrint() {
  const m = new FormData($('#mf')), p = curPt(); printDoc('MRD', kv([['Patient name', p.name], ['Sex', fmtSex(p.sex)], ['Age', fmtAge(p)], ['Date', m.get('date')], ['Diagnosis', m.get('dx')], ['Request', m.get('req')], ['Result', m.get('res')]]));
}
function histPrint() {
  const p = curPt(); const body = [...recs].filter((r) => r.kind != 'schedulenote').sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((r) => {
    const d = jd(r), h = `<h4>${esc(lbl(r.kind))}${r.title ? ' – ' + esc(r.title) : ''} <small>${esc((r.date || '').replace('T', ' '))}</small></h4>`;
    return h + (r.kind == 'vitals' ? kv(VSF.map(([k, l]) => [l, d[k]])) : r.kind == 'medical' ? mrPrintHtml(d) : r.kind == 'payment' ? kv([['Amount', K(d.amount)], ['Method', d.method]]) : r.kind == 'treatment' ? kv([['Vital signs', d.vitals], ['Diagnosis / Evolution', d.diagnosis], ['Treatment / Notes', r.notes]]) : r.kind == 'mrd' ? kv([['Diagnosis', d.dx], ['Request', d.req], ['Result', d.res]]) : r.kind == 'cnf' ? cnPrintHtml(d) : `<p>${esc(r.notes || '').replace(/\n/g, '<br>')}</p>`); }).join('');
  printDoc('Patient history', ptBlock(p) + body);
}

// ---------- Treatment Schedule: named schedules (tabs), rows with amount and done tick, invoice, print ----------
let sch = 'Standard';
const sName = (r) => r.title || 'Standard';
const schNames = () => { const s = new Set(['Standard']); recs.filter((r) => r.kind == 'schedule' || r.kind == 'schedulenote').forEach((r) => s.add(sName(r))); return [...s]; };
const schRows = () => recs.filter((r) => r.kind == 'schedule' && sName(r) == sch).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const schNote = () => recs.find((r) => r.kind == 'schedulenote' && sName(r) == sch);
const schTotal = () => schRows().reduce((t, r) => t + (+jd(r).amount || 0), 0);
const schBillable = (r) => { const d = jd(r); return d.billable !== 0 && d.billable !== false; };
const schRate = () => +((D.clinic || {}).rate) || 4000;
function schCatalogItem(ref) {
  const [kind, id] = (ref || '').split(':');
  const items = kind == 'medicine' ? D.med : kind == 'service' ? D.sv : [];
  return items.find((item) => String(item.id) == id);
}
function schItemChanged(ref) {
  const item = schCatalogItem(ref);
  if (!item) return;
  const form = $('#mf'), type = form.elements.namedItem('treatment_type'), amount = form.elements.namedItem('amount');
  type.value = item.name;
  amount.value = ((+item.price || 0) / schRate()).toFixed(2);
}
function schPanel() {
  if (!schNames().includes(sch)) sch = 'Standard';
  const rows = schRows(), n = schNote();
  return `<div class="hd"><h2 class="rh">Treatment Schedule</h2><div class="tools"><div class="tabs">${schNames().map((x) => `<button class="${x == sch ? 'on' : ''}" data-a="schtab:${esc(x)}" translate="no">${esc(x)}</button>`).join('')}<button data-a="schaddtab" title="New schedule">+</button></div>
<span class="bd" style="font-size:14px">Total: ${K(schTotal())}</span><button class="btn" data-a="schinv">Invoice</button><button class="btn" style="background:#16a34a;color:#fff;border-color:#16a34a" data-a="radd">+ Add Schedule</button><button class="btn" data-a="cnf">CNF</button><button class="btn" data-a="schprint">Print Schedule</button></div></div>
<div class="sec"><label class="fl">Schedule header note for “<span translate="no">${esc(sch)}</span>” (for print)<div class="tools" style="align-items:flex-start"><textarea class="in" id="schnote" rows="3" style="flex:1" placeholder="Enter note specifically for this schedule…">${esc(n ? n.notes : '')}</textarea><button class="btn" data-a="schnotesave" title="Save note">💾</button></div></label></div>
<div class="card"><table><thead><tr><th>No.</th><th>Date</th><th>Diagnosis / type</th><th>Treatment / notes</th><th>Amount</th><th>Done</th><th>Actions</th></tr></thead><tbody>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc(d.dx || '')}</td><td style="white-space:pre-wrap">${esc(r.notes || '')}</td><td>${K(d.amount || 0)}</td><td><input type="checkbox" data-a="schdone:${r.id}" ${d.done ? 'checked' : ''} style="width:auto;min-width:0"></td><td><button class="btn s" data-a="redit:${r.id}">Edit</button> <button class="btn s r" data-a="rdel:${r.id}">✕</button></td></tr>`; }).join('') || `<tr><td colspan="7" class="emp">No schedules found.</td></tr>`}</tbody></table></div>`;
}
function schForm(r) {
  const e = !!r, d = r ? jd(r) : {};
  r = r || { date: ymd(new Date()) };
  const types = [...new Set([...schNames(), 'Treatment2'])], scheduleType = e ? sName(r) : sch;
  const selectedRef = d.selection_ref || '';
  const catalog = [
    ['Medicine', D.med.map((item) => [`medicine:${item.id}`, item.name])],
    ['Services', D.sv.map((item) => [`service:${item.id}`, item.name])]
  ];
  const options = catalog.map(([group, items]) => items.length ? `<optgroup label="${group}">${items.map(([value, name]) => `<option value="${esc(value)}" ${selectedRef == value ? 'selected' : ''}>${esc(name)}</option>`).join('')}</optgroup>` : '').join('');
  const oldOption = selectedRef && !schCatalogItem(selectedRef) ? `<option value="${esc(selectedRef)}" selected>${esc(d.selection || 'Previously selected item')}</option>` : '';
  const selection = `<select class="in sch-selection" name="selection_ref" id="sch-selection"><option value="">Select Medicine &amp; Services</option>${oldOption}${options}</select><span class="sch-link" aria-hidden="true">🔗</span>`;
  const input = (label, name, value, type = 'text', attrs = '', placeholder = '') => `<div class="sch-form-row"><label for="sch-${name}">${label}</label><input class="in" id="sch-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${attrs}></div>`;
  const textarea = (label, name, value, placeholder, rows = 3) => `<div class="sch-form-row"><label for="sch-${name}">${label}</label><textarea class="in" id="sch-${name}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea></div>`;
  const radios = types.map((name) => `<label class="sch-radio"><input type="radio" name="schedule_type" value="${esc(name)}" ${name == scheduleType ? 'checked' : ''}> ${esc(name)}</label>`).join('');
  const body = `<div class="sch-form">
    ${input('Date', 'date', (r.date || '').slice(0, 10), 'date', 'required')}
    <div class="sch-form-row"><label for="sch-selection">Selection</label><div class="sch-selection-wrap">${selection}</div></div>
    ${input('Treatment Type', 'treatment_type', d.treatment_type || '', 'text', '', 'e.g. Consultation, Laser...')}
    ${textarea('Diagnosis', 'diagnosis', d.diagnosis || d.dx || '', 'Diagnosis details...')}
    ${textarea('Treatment / Notes', 'notes', r.notes, 'Treatment details or notes...', 3)}
    <div class="sch-form-row"><span class="sch-form-label">Schedule Type</span><div class="sch-radios">${radios}</div></div>
    <div class="sch-form-row"><label for="sch-amount">Amount</label><div class="sch-amount"><span>$</span><input class="in" id="sch-amount" name="amount" type="number" min="0" step="0.01" value="${e ? ((+d.amount || 0) / schRate()).toFixed(2) : ''}" placeholder="e.g. 50"><span>USD</span></div></div>
    <div class="sch-form-row"><span class="sch-form-label">Billing</span><label class="sch-check"><input type="checkbox" name="billable" value="1" ${!e || schBillable(r) ? 'checked' : ''}> Add to Unpaid Billing <span class="sch-billing-icon" aria-hidden="true">◉</span></label></div>
    <div class="sch-form-row"><span class="sch-form-label">Status</span><label class="sch-check"><input type="checkbox" name="done" value="1" ${d.done ? 'checked' : ''}> Mark as Done</label></div>
  </div>`;
  openForm(e ? 'Edit schedule' : 'Add New Schedule', body, async (f) => {
    const m = new FormData(f), nextType = m.get('schedule_type') || sch;
    const amountUsd = Number(m.get('amount')) || 0;
    const item = schCatalogItem(m.get('selection_ref'));
    const b = {
      patient_id: pdId, kind: 'schedule', title: nextType, date: m.get('date'), notes: m.get('notes'),
      data: {
        selection_ref: m.get('selection_ref') || '',
        selection: item ? item.name : m.get('selection_ref') ? d.selection || '' : '',
        treatment_type: m.get('treatment_type') || '',
        diagnosis: m.get('diagnosis') || '',
        dx: m.get('diagnosis') || '',
        amount: Math.round(amountUsd * schRate()),
        billable: m.get('billable') ? 1 : 0,
        done: m.get('done') ? 1 : 0
      }
    };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b);
    sch = nextType;
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'schedule-form', ok: 'Save' });
}
function schTable(rows) { return `<table class="pk full"><tr><th>No.</th><th>Date</th><th>Treatment Type / Diagnosis</th><th>Treatment / notes</th><th>Amount</th><th>Done</th></tr>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc([d.treatment_type, d.diagnosis || d.dx].filter(Boolean).join(' / '))}</td><td>${esc(r.notes || '')}</td><td>${K(d.amount || 0)}</td><td>${d.done ? '✔' : ''}</td></tr>`; }).join('')}<tr><th colspan="4">Total</th><td colspan="2"><b>${K(schTotal())}</b></td></tr></table>`; }
function schPrint(inv) {
  const n = schNote(), rows = schRows();
  printDoc(inv ? 'Invoice' : 'Treatment Schedule – ' + sch, ptBlock(curPt()) + (!inv && n && n.notes ? `<p>${esc(n.notes).replace(/\n/g, '<br>')}</p>` : '') + (inv ? `<table class="pk full"><tr><th>No.</th><th>Date</th><th>Description</th><th>Amount</th></tr>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc([d.selection, d.treatment_type, d.diagnosis || d.dx, r.notes].filter(Boolean).join(' – '))}</td><td>${K(d.amount || 0)}</td></tr>`; }).join('')}<tr><th colspan="3">Total</th><td><b>${K(schTotal())}</b></td></tr></table>` : schTable(rows)));
}

// ---------- Consultation Form (CNF): questionnaire + agreement + assessment, with form history ----------
const CNF_AG = [['acc', 'Acceptance & Results'], ['care', 'Guarantee of Care'], ['priv', 'Privacy Notice'], ['photo', 'Photo Consent'], ['resp', 'Responsibility'], ['oth', 'Other Notices'], ['pay', 'Payment Policy']];
// generic placeholder wording: each clinic should replace it in Clinic Settings
const CNF_DEF = { acc: 'I understand and accept the treatment plan, the expected results and the possible risks that my doctor has explained to me.', care: 'I have been told how to look after myself after treatment and I will follow the doctor’s instructions.', priv: 'My personal and medical information is kept confidential and shared only with the people involved in my care, unless the law requires otherwise.', photo: 'I agree that photographs may be taken before and after treatment for my medical record.', resp: 'I understand that results differ between people and that I am responsible for following the treatment plan.', oth: 'Treatment documents are kept in the clinic’s records.', pay: 'Payment terms are explained and agreed before treatment starts.' };
const CNF_DEF_KM = {
  acc: 'ខ្ញុំយល់ព្រម និងទទួលយកផែនការព្យាបាល លទ្ធផលដែលរំពឹងទុក និងហានិភ័យដែលអាចកើតមាន ដែលគ្រូពេទ្យបានពន្យល់ដល់ខ្ញុំ។',
  care: 'ខ្ញុំបានទទួលការណែនាំអំពីការថែទាំខ្លួនបន្ទាប់ពីការព្យាបាល ហើយខ្ញុំនឹងអនុវត្តតាមការណែនាំរបស់គ្រូពេទ្យ។',
  priv: 'ព័ត៌មានផ្ទាល់ខ្លួន និងព័ត៌មានវេជ្ជសាស្ត្ររបស់ខ្ញុំត្រូវបានរក្សាជាសម្ងាត់ និងចែករំលែកតែជាមួយអ្នកដែលពាក់ព័ន្ធនឹងការថែទាំរបស់ខ្ញុំ លើកលែងតែច្បាប់តម្រូវ។',
  photo: 'ខ្ញុំយល់ព្រមឱ្យថតរូបមុន និងក្រោយការព្យាបាល ដើម្បីរក្សាទុកក្នុងកំណត់ត្រាវេជ្ជសាស្ត្ររបស់ខ្ញុំ។',
  resp: 'ខ្ញុំយល់ថាលទ្ធផលអាចខុសគ្នាពីមនុស្សម្នាក់ទៅមនុស្សម្នាក់ ហើយខ្ញុំមានទំនួលខុសត្រូវក្នុងការអនុវត្តតាមផែនការព្យាបាល។',
  oth: 'ឯកសារព្យាបាលត្រូវបានរក្សាទុកក្នុងកំណត់ត្រារបស់គ្លីនិក។',
  pay: 'លក្ខខណ្ឌនៃការទូទាត់ត្រូវបានពន្យល់ និងព្រមព្រៀងមុនពេលចាប់ផ្តើមការព្យាបាល។'
};
const CNF_KM = {
  'Consultation form agreement text': 'ខ្លឹមសារកិច្ចព្រមព្រៀងក្នុងទម្រង់ពិគ្រោះយោបល់',
  'Assessment & Plan': 'ការវាយតម្លៃ និងផែនការ',
  'Shown in every Consultation Form (CNF). Replace the placeholder wording with text specific to your clinic.': 'បង្ហាញក្នុងទម្រង់ពិគ្រោះយោបល់ (CNF) គ្រប់ទម្រង់។ សូមជំនួសខ្លឹមសារគំរូនេះដោយខ្លឹមសាររបស់គ្លីនិកអ្នក។',
  'Occupation': 'មុខរបរ',
  'Address override': 'អាសយដ្ឋានបច្ចុប្បន្ន',
  '1. Problems & Concerns': '១. បញ្ហា និងកង្វល់',
  '2. Skin type': '២. ប្រភេទស្បែក',
  '3. History of reactions': 'ប្រវត្តិប្រតិកម្ម',
  'Have you had a reaction to any of these before?': 'តើអ្នកធ្លាប់មានប្រតិកម្មចំពោះចំណុចណាមួយខាងក្រោមនេះដែរឬទេ?',
  'Have you had a reaction to any of these before?': 'តើអ្នកធ្លាប់មានប្រតិកម្មចំពោះចំណុចណាមួយខាងក្រោមនេះដែរឬទេ?',
  '4. Skin reaction level': '៤. កម្រិតប្រតិកម្មរបស់ស្បែក',
  '5. Healing': '៥. ការជាសះស្បើយ',
  '6. Sun Exposure': '៦. ការប៉ះពាល់នឹងពន្លឺព្រះអាទិត្យ',
  'Product usage history': 'ប្រវត្តិការប្រើប្រាស់ផលិតផល',
  '7. Current products': '៧. ផលិតផលដែលកំពុងប្រើ',
  '8. Retinol / peeling': '៨. ការប្រើ Retinol / ការរបកស្បែក',
  'Medicine usage': 'ការប្រើប្រាស់ថ្នាំ',
  '9. Birth control or other regular medicine': '៩. ការពន្យារកំណើត ឬការប្រើថ្នាំប្រចាំ',
  'Treatment history': 'ប្រវត្តិការព្យាបាល',
  '10. Previous treatment for this problem': '១០. ការព្យាបាលបញ្ហានេះពីមុន',
  '11. Result of that treatment': '១១. លទ្ធផលនៃការព្យាបាលនោះ',
  '12. Services received before': '១២. សេវាកម្មដែលធ្លាប់ទទួលពីមុន',
  '13. Treatment elsewhere now': '១៣. កំពុងទទួលការព្យាបាលនៅកន្លែងផ្សេងឬទេ',
  'Personal & family history': 'ប្រវត្តិផ្ទាល់ខ្លួន និងគ្រួសារ',
  '14. Personal or family history of skin disease': '១៤. ប្រវត្តិជំងឺស្បែករបស់ខ្លួន ឬគ្រួសារ',
  '15. General health': '១៥. សុខភាពទូទៅ',
  'Lifestyle': 'របៀបរស់នៅ',
  'Sun exposure': 'ការប៉ះពាល់នឹងពន្លឺព្រះអាទិត្យ',
  'Stress level': 'កម្រិតស្ត្រេស',
  'Sleep': 'ការគេង',
  'Do you exercise?': 'តើអ្នកហាត់ប្រាណដែរឬទេ?',
  'Following a special diet?': 'តើអ្នកកំពុងអនុវត្តរបបអាហារពិសេសដែរឬទេ?',
  'Glasses of water per day': 'ចំនួនកែវទឹកក្នុងមួយថ្ងៃ',
  'Coffee / tea / soft drinks per day': 'ចំនួនកាហ្វេ / តែ / ភេសជ្ជៈផ្អែមក្នុងមួយថ្ងៃ',
  'For women': 'សម្រាប់ស្ត្រី',
  'Pregnant or preparing for pregnancy?': 'តើអ្នកកំពុងមានផ្ទៃពោះ ឬគ្រោងមានផ្ទៃពោះដែរឬទេ?',
  'Using birth control?': 'តើអ្នកកំពុងប្រើវិធីពន្យារកំណើតដែរឬទេ?',
  'Irregular periods?': 'តើរដូវរបស់អ្នកមិនទៀងទាត់ដែរឬទេ?',
  'Using any cream on the skin?': 'តើអ្នកកំពុងប្រើក្រែមលាបស្បែកណាមួយដែរឬទេ?',
  'Our treatment needs some changes to your daily routine and diet. Can you accept this?': 'ការព្យាបាលរបស់យើងតម្រូវឱ្យមានការកែប្រែខ្លះៗលើទម្លាប់ប្រចាំថ្ងៃ និងរបបអាហាររបស់អ្នក។ តើអ្នកអាចទទួលយកបានដែរឬទេ?',
  'Treatment Agreement': 'កិច្ចព្រមព្រៀងព្យាបាល',
  'Have you received explanations about the treatment, and do you understand?': 'តើអ្នកបានទទួលការពន្យល់អំពីការព្យាបាល និងយល់ច្បាស់ហើយឬនៅ?',
  'Customer understanding': 'ការយល់ដឹងរបស់អតិថិជន',
  'Warnings & conditions': 'ការព្រមាន និងលក្ខខណ្ឌ',
  'Personal interview': 'ការសម្ភាសន៍ផ្ទាល់ខ្លួន',
  'Customer name:': 'ឈ្មោះអតិថិជន៖',
  'Date:': 'កាលបរិច្ឆេទ៖',
  'Signature:': 'ហត្ថលេខា៖',
  'Doctor signature and name:': 'ហត្ថលេខា និងឈ្មោះគ្រូពេទ្យ៖',
  'Customer name': 'ឈ្មោះអតិថិជន',
  'Date': 'កាលបរិច្ឆេទ',
  'Signature': 'ហត្ថលេខា',
  'Doctor': 'គ្រូពេទ្យ',
  'Special Notes - Image 5': 'កំណត់ចំណាំពិសេស',
  'Personal Interview': 'ការសម្ភាសន៍ផ្ទាល់ខ្លួន',
  'Doctor’s Assessment': 'ការវាយតម្លៃរបស់វេជ្ជបណ្ឌិត',
  'Doctor’s Treatment Plan': 'ផែនការព្យាបាលរបស់វេជ្ជបណ្ឌិត',
  'Have you visited our clinic before?': 'តើអ្នកធ្លាប់មកព្យាបាលនៅគ្លីនិកយើងខ្ញុំដែរឬទេ?',
  'How did you hear about us?': 'តើអ្នកស្គាល់គ្លីនិកយើងខ្ញុំតាមរយៈណា?',
  'Reason for visit': 'មូលហេតុនៃការមកពិគ្រោះ',
  'Current address': 'អាសយដ្ឋានបច្ចុប្បន្ន',
  'Additional notes': 'កំណត់ចំណាំផ្សេងៗ',
  'Acceptance & Results': 'ការយល់ព្រម និងលទ្ធផល',
  'Guarantee of Care': 'ការធានានៃការថែទាំ',
  'Privacy Notice': 'សេចក្តីជូនដំណឹងអំពីឯកជនភាព',
  'Photo Consent': 'ការយល់ព្រមថតរូប',
  'Responsibility': 'ទំនួលខុសត្រូវ',
  'Other Notices': 'សេចក្តីជូនដំណឹងផ្សេងៗ',
  'Payment Policy': 'គោលការណ៍ទូទាត់',
  'Acne': 'មុន',
  'Acne scars': 'ស្នាមមុន',
  'Veins': 'សរសៃឈាម',
  'Pigmentation': 'ស្នាមពណ៌ស្បែក',
  'Dark spots': 'ស្នាមអុចខ្មៅ',
  'Wrinkles': 'ស្នាមជ្រួញ',
  'Pores / holes': 'រន្ធញើស',
  'Large pores': 'រន្ធញើសធំ',
  'Tags': 'សាច់ដុះ',
  'Sensitive': 'ងាយប្រតិកម្ម',
  'Oily': 'ខ្លាញ់',
  'Scar': 'ស្នាម',
  'Normal': 'ធម្មតា',
  'Dry': 'ស្ងួត',
  'Combination': 'ចម្រុះ',
  'Cosmetics': 'គ្រឿងសម្អាង',
  'Metal': 'លោហៈ',
  'Medicine': 'ថ្នាំ',
  'Food': 'អាហារ',
  'Fragrance': 'ក្លិនក្រអូប',
  'Pollen': 'លំអងផ្កា',
  'None': 'គ្មាន',
  'If yes, describe': 'បើមាន សូមរៀបរាប់',
  'If yes, which?': 'បើមាន តើថ្នាំអ្វី?',
  'If yes, what?': 'បើមាន តើជាអ្វី?',
  'If yes, details': 'បើមាន សូមរៀបរាប់លម្អិត',
  'Easy': 'ងាយ',
  'Medium': 'មធ្យម',
  'High': 'ខ្ពស់',
  'Fast': 'លឿន',
  'Slow': 'យឺត',
  'Infection / keloid': 'ការឆ្លងមេរោគ / ស្នាមកន្ទួល',
  'Not easy': 'មិនងាយ',
  'Cleanser': 'ហ្វូមលាងមុខ',
  'Soap': 'សាប៊ូ',
  'Toner': 'ទឹកជូតមុខ',
  'Scrub / exfoliate': 'ស្ក្រាប់ / ជម្រុះកោសិកាស្បែក',
  'Moisturiser': 'ក្រែមផ្តល់សំណើម',
  'Sunscreen': 'ឡេការពារកម្តៅថ្ងៃ',
  'Used before': 'ធ្លាប់ប្រើពីមុន',
  'Never used': 'មិនធ្លាប់ប្រើ',
  'Currently using': 'កំពុងប្រើ',
  'Don’t know': 'មិនដឹង',
  'Regular medicine': 'ថ្នាំប្រចាំ',
  'Other medicine': 'ថ្នាំផ្សេងទៀត',
  'Had treatment': 'ធ្លាប់ទទួលការព្យាបាល',
  'Never had treatment': 'មិនធ្លាប់ទទួលការព្យាបាល',
  'No result': 'គ្មានលទ្ធផល',
  'Not satisfied': 'មិនពេញចិត្ត',
  'Some result': 'មានលទ្ធផលខ្លះ',
  'Facial': 'ថែរក្សាផ្ទៃមុខ',
  'Peeling': 'របកស្បែក',
  'Hair removal': 'ដករោម',
  'Botox': 'Botox',
  'Collagen': 'Collagen',
  'CO2 laser': 'ឡាស៊ែរ CO2',
  'Good': 'ល្អ',
  'Fair': 'មធ្យម',
  'Poor': 'ខ្សោយ',
  'Often': 'ញឹកញាប់',
  'Sometimes': 'ពេលខ្លះ',
  'Rarely': 'កម្រណាស់',
  'None': 'គ្មាន',
  'Hard to fall asleep': 'ពិបាកគេងលក់',
  'Yes': 'បាទ/ចាស',
  'No': 'ទេ',
  'Can accept': 'អាចទទួលយកបាន',
  'Cannot': 'មិនអាចទទួលយកបាន',
  'Other result': 'ចម្លើយផ្សេងទៀត',
  'Received and understood well': 'បានទទួល និងយល់ច្បាស់',
  'Not yet understood': 'មិនទាន់យល់ច្បាស់',
  'Need more explanation': 'ត្រូវការការពន្យល់បន្ថែម',
  'Other': 'ផ្សេងៗ',
  'Other:': 'ផ្សេងៗ៖',
  '3 or fewer': '៣ កែវ ឬតិចជាងនេះ',
  '4–5': '៤–៥ កែវ',
  '6 or more': '៦ កែវ ឬច្រើនជាងនេះ',
  '1–2': '១–២ កែវ',
  '2–3': '២–៣ កែវ',
  'More than 3': 'លើសពី ៣ កែវ'
};
const CNF_KM_BILINGUAL = new Set([
  'Occupation', 'Address override', '1. Problems & Concerns', '2. Skin type',
  '4. Skin reaction level',
  '5. Healing', '6. Sun Exposure', 'Product usage history', '7. Current products',
  '8. Retinol / peeling', 'Medicine usage',
  '9. Birth control or other regular medicine', 'Treatment history',
  '10. Previous treatment for this problem', '11. Result of that treatment',
  '12. Services received before', '13. Treatment elsewhere now',
  'Personal & family history', '14. Personal or family history of skin disease',
  '15. General health', 'Lifestyle', 'For women', 'Treatment Agreement',
  'Assessment & Plan', 'Acceptance & Results', 'Guarantee of Care', 'Privacy Notice', 'Photo Consent',
  'Responsibility', 'Other Notices', 'Payment Policy'
]);
const CNF_KM_BILINGUAL_OPTIONS = new Set(['prob', 'skin', 'react', 'level', 'heal']);
const cnText = (s) => lang == 'km' && CNF_KM[s]
  ? CNF_KM[s] + (CNF_KM_BILINGUAL.has(s) ? ` (${s})` : '')
  : s;
const cnOptionText = (k, s) => lang == 'km' && CNF_KM_BILINGUAL_OPTIONS.has(k) && CNF_KM[s]
  ? `${CNF_KM[s]} (${s})`
  : cnText(s);
const cnQuestionText = (k, l) => k == 'react' && lang == 'km'
  ? `៣. ${cnText(l)} (History of Reactions)`
  : cnText(l);
const cnfTexts = () => {
  let t = {}; try { t = JSON.parse((D.clinic || {}).cnf_text || '{}'); } catch (e) { /* defaults */ }
  return Object.fromEntries(CNF_AG.map(([k]) => [k, lang == 'km'
    ? t[k + '_km'] ?? (t[k] != null && t[k] != CNF_DEF[k] ? t[k] : CNF_DEF_KM[k])
    : t[k] ?? CNF_DEF[k]]));
};
const cnfSettingsHtml = (c) => {
  let t = {}; try { t = JSON.parse(c.cnf_text || '{}'); } catch (e) { /* defaults */ }
  return `<hr><b>${cnText('Consultation form agreement text')}</b><p class="mu" style="font-size:12px;margin:2px 0 8px">${cnText('Shown in every Consultation Form (CNF). Replace the placeholder wording with text specific to your clinic.')}</p>${CNF_AG.map(([k, l]) => fTa(`${cnText(l)} - English`, 'cnf_' + k, t[k] ?? CNF_DEF[k], 3) + fTa(`${cnText(l)} - Khmer`, 'cnf_' + k + '_km', t[k + '_km'] ?? CNF_DEF_KM[k], 3)).join('')}`;
};
const YES = ['Yes', 'No'];
const CN = [
  ['g2', [['occ', 'Occupation'], ['addr', 'Address override']]],
  ['h', '1. Problems & Concerns'], ['q', 'prob', '', ['Acne', 'Acne scars', 'Veins', 'Pigmentation', 'Dark spots', 'Wrinkles', 'Pores / holes', 'Large pores', 'Tags', 'Sensitive', 'Oily', 'Scar'], 'Other'],
  ['h', '2. Skin type'], ['q', 'skin', '', ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'], 'Other'],
  ['h', '3. History of reactions'], ['q', 'react', 'Have you had a reaction to any of these before?', ['Cosmetics', 'Metal', 'Medicine', 'Food', 'Fragrance', 'Pollen', 'Other', 'None'], 'If yes, describe'],
  ['h', '4. Skin reaction level'], ['q', 'level', '', ['Easy', 'Medium', 'High', 'Normal']],
  ['h', '5. Healing'], ['q', 'heal', '', ['Normal', 'Fast', 'Slow', 'Infection / keloid']],
  ['h', '6. Sun Exposure'], ['q', 'scar', '', ['Easy', 'Not easy', 'Normal']],
  ['H', 'Product usage history'], ['h', '7. Current products'], ['q', 'prod', '', ['Cleanser', 'Soap', 'Toner', 'Scrub / exfoliate', 'Moisturiser', 'Sunscreen', 'Other'], 'Other'],
  ['h', '8. Retinol / peeling'], ['q', 'ret', '', ['Used before', 'Never used', 'Currently using', 'Don’t know']],
  ['H', 'Medicine usage'], ['h', '9. Birth control or other regular medicine'], ['q', 'meds', '', ['Regular medicine', 'None', 'Other medicine'], 'If yes, which?'],
  ['H', 'Treatment history'], ['h', '10. Previous treatment for this problem'], ['q', 'prev', '', ['Had treatment', 'Never had treatment']],
  ['h', '11. Result of that treatment'], ['q', 'prevres', '', ['No result', 'Not satisfied', 'Some result']],
  ['h', '12. Services received before'], ['q', 'svc', '', ['Facial', 'Peeling', 'Hair removal', 'Botox', 'Collagen', 'CO2 laser', 'Other'], 'When?'],
  ['h', '13. Treatment elsewhere now'], ['q', 'else', '', YES, 'If yes, what?'],
  ['H', 'Personal & family history'], ['h', '14. Personal or family history of skin disease'], ['q', 'fam', '', YES, 'If yes, details'],
  ['h', '15. General health'], ['q', 'health', '', ['Good', 'Fair', 'Poor']],
  ['H', 'Lifestyle'], ['q', 'sun', 'Sun exposure', ['Often', 'Sometimes', 'Rarely']], ['q', 'stress', 'Stress level', ['High', 'Medium', 'Low', 'None']], ['q', 'sleep', 'Sleep', ['Hard to fall asleep', 'Normal']], ['q', 'exer', 'Do you exercise?', YES],
  ['q', 'diet', 'Following a special diet?', ['Yes', 'No', 'Sometimes']], ['q', 'water', 'Glasses of water per day', ['3 or fewer', '4–5', '6 or more']], ['q', 'caf', 'Coffee / tea / soft drinks per day', ['1–2', '2–3', 'More than 3']],
  ['H', 'For women'], ['q', 'w1', 'Pregnant or preparing for pregnancy?', YES], ['q', 'w2', 'Using birth control?', YES], ['q', 'w3', 'Irregular periods?', YES], ['q', 'w4', 'Using any cream on the skin?', YES],
  ['box', 'q', 'accept', 'Our treatment needs some changes to your daily routine and diet. Can you accept this?', ['Can accept', 'Cannot', 'Other result']],
  ['T', 'Treatment Agreement'], ['ag'],
  ['box', 'q', 'und', 'Have you received explanations about the treatment, and do you understand?', ['Received and understood well', 'Not yet understood', 'Need more explanation']],
  ['a', 'und_t', 'Customer understanding'], ['a', 'warn', 'Warnings & conditions'], ['a', 'pint', 'Personal interview'], ['sig']];
const CNP = [
  ['a', 'as_interview', 'ការសម្ភាសន៍ផ្ទាល់ខ្លួន (Personal Interview)', 2],
  ['a', 'as_ass', 'ការវាយតម្លៃរបស់វេជ្ជបណ្ឌិត (Doctor’s Assessment)', 2],
  ['a', 'as_plan', 'ផែនការព្យាបាលរបស់វេជ្ជបណ្ឌិត (Doctor’s Treatment Plan)', 2],
  ['H', 'Special Notes - Image 5'],
  ['q', 'as_previous', 'តើលោកអ្នកធ្លាប់មកព្យាបាលនៅគ្លីនិកយើងខ្ញុំដែរឬទេ? (Have you visited our clinic before?)', ['បាទ/ចាស', 'ទេ']],
  ['q', 'as_source', 'តើលោកអ្នកស្គាល់គ្លីនិកយើងខ្ញុំតាមរយៈណា? (How did you hear about us?)', ['TikTok', 'Telegram', 'Facebook']],
  ['a', 'as_reason', 'មូលហេតុនៃការមកពិគ្រោះ (Reason for visit)', 2],
  ['a', 'as_address', 'អាសយដ្ឋានបច្ចុប្បន្ន (Current address)', 2],
  ['a', 'as_note', 'កំណត់ចំណាំផ្សេងៗ (Additional notes)', 2]
];
function cnHtml(S, d) {
  return S.map((it) => { let [t, k, l, o, x] = it;
    if (t == 'box') { [t, k, l, o, x] = it.slice(1); o = o; return `<div class="sec cnb">${cnQ(k, l, o, x, d)}</div>`; }
    if (t == 'g2') return `<div class="sec"><div class="g2">${k.map(([kk, ll]) => fIn(cnText(ll), 'cn_' + kk, d[kk])).join('')}</div></div>`;
    if (t == 'H') return `<h4 class="${S == CNP ? 'cn-plan-heading' : 'cnH'}">${cnText(k)}</h4>`; if (t == 'T') return `<h3 class="cnT">${cnText(k)}</h3>`; if (t == 'h') {
      if (S == CN && lang == 'km' && k == '3. History of reactions') return '';
      return `<h5 class="cnh">${cnText(k)}</h5>`;
    }
    if (t == 'q') return S == CNP ? `<div class="cn-plan-question"><b>${esc(l)}</b><div class="cn-plan-options">${o.map((v) => fCb(v, 'cnc_' + k, (d[k] || []).includes(v), v)).join('')}</div></div>` : cnQ(k, l, o, x, d);
    if (t == 'a') return S == CNP ? `<label class="fl cn-plan-field">${l}<textarea class="in" name="cn_${k}" rows="${Number.isInteger(o) ? o : 2}">${esc(d[k] || '')}</textarea></label>` : fTa(cnText(l), 'cn_' + k, d[k], 3);
    if (t == 'i') return fIn(l, 'cn_' + k, d[k], o || 'text');
    if (t == 'ag') { const tx = cnfTexts(); return CNF_AG.map(([kk, ll]) => fTa(cnText(ll), 'cn_ag_' + kk, d['ag_' + kk] ?? tx[kk], 3)).join(''); }
    if (t == 'sig') return `<div class="sec g2 sig"><div><b>${cnText('Customer name:')}</b><div class="sl">${esc((curPt() || {}).name || '')}</div></div><div><b>${cnText('Date:')}</b><div class="sl">&nbsp;</div></div><div><b>${cnText('Signature:')}</b><div class="sl">&nbsp;</div></div><div><b>${cnText('Doctor signature and name:')}</b><div class="sl">&nbsp;</div></div></div>`;
    return ''; }).join('');
}
function cnQ(k, l, o, x, d) {
  return `<div class="cbg">${l ? `<b>${cnQuestionText(k, l)}</b>` : ''}<div class="g4">${o.map((v) => fCb(cnOptionText(k, v), 'cnc_' + k, (d[k] || []).includes(v), v)).join('')}</div>${x ? `<label class="fl cno">${cnOptionText(k, x)}: <input class="in" name="cn_${k}_o" value="${esc(d[k + '_o'] || '')}"></label>` : ''}</div>`;
}
function cnCollect(f, S) {
  const m = new FormData(f), d = {};
  S.forEach((it) => { let [t, k, l, o, x] = it; if (t == 'box') { [t, k] = it.slice(1); }
    if (t == 'g2') k.forEach(([kk]) => { d[kk] = m.get('cn_' + kk) || ''; });
    else if (t == 'q') { d[k] = m.getAll('cnc_' + k); const v = m.get('cn_' + k + '_o'); if (v) d[k + '_o'] = v; }
    else if (t == 'a' || t == 'i') d[k] = m.get('cn_' + k) || '';
    else if (t == 'ag') CNF_AG.forEach(([kk]) => { d['ag_' + kk] = m.get('cn_ag_' + kk) || ''; }); });
  return d;
}
function cnPrintHtml(d) {
  const sec = (S) => S.map((it) => { let [t, k, l, o, x] = it; if (t == 'box') { [t, k, l, o, x] = it.slice(1); }
    if (t == 'g2') return kv(k.map(([kk, ll]) => [cnText(ll), d[kk]]));
    if (t == 'H') return `<h4>${cnText(k)}</h4>`; if (t == 'T') return `<h3>${cnText(k)}</h3>`; if (t == 'h') { if (S == CN && lang == 'km' && k == '3. History of reactions') return ''; return `<h5>${cnText(k)}</h5>`; }
    if (t == 'q') { const v = [...(d[k] || []).map((value) => cnOptionText(k, value)), ...(d[k + '_o'] ? [cnText(x || 'Other') + ': ' + d[k + '_o']] : [])]; return v.length ? `<p><b>${cnQuestionText(k, l)}:</b> ${v.map(esc).join(', ')}</p>` : ''; }
    if (t == 'a' || t == 'i') return d[k] ? `<p><b>${cnText(l)}:</b> ${esc(d[k]).replace(/\n/g, '<br>')}</p>` : '';
    if (t == 'ag') return CNF_AG.map(([kk, ll]) => `<p><b>${cnText(ll)}:</b> ${esc(d['ag_' + kk] ?? cnfTexts()[kk]).replace(/\n/g, '<br>')}</p>`).join('');
    if (t == 'sig') return `<table class="pk full"><tr><th>${cnText('Customer name')}</th><td>${esc((curPt() || {}).name || '')}</td><th>${cnText('Date')}</th><td>&nbsp;</td></tr><tr><th>${cnText('Signature')}</th><td>&nbsp;<br>&nbsp;</td><th>${cnText('Doctor')}</th><td>&nbsp;</td></tr></table>`;
    return ''; }).join('');
  return sec(CN) + `<h3>${cnText('Assessment & Plan')}</h3>` + sec(CNP);
}
function cnfForm(r) {
  const e = !!r, d = r ? jd(r) : {}, hist = recs.filter((x) => x.kind == 'cnf');
  openForm('Consultation Form (CNF)', `<div class="cnfw"><div class="cnfl"><div class="tabs cnft"><button type="button" class="on" data-a="cnftab:gen">General Form</button><button type="button" data-a="cnftab:plan">Assessment & Plan</button></div>
<div id="cn-gen">${cnHtml(CN, d)}</div><div id="cn-plan" hidden>${cnHtml(CNP, d)}</div></div>
<div class="cnfh"><div class="tools" style="justify-content:space-between"><b>Form History</b><button type="button" class="btn s" data-a="cnfnew" title="New form">+</button></div>${hist.map((x) => `<div class="rc ${e && x.id == r.id ? 'sel' : ''}" data-a="cnfload:${x.id}" style="cursor:pointer"><b>${esc((x.date || '').replace('T', ' '))}</b><div class="mu">${esc(jd(x).as_ass || jd(x).as_dx || (jd(x).prob || []).slice(0, 3).join(', '))}</div></div>`).join('') || '<p class="mu" style="font-size:12px">No history records yet.</p>'}</div></div>`, async (f) => {
    const b = { patient_id: pdId, kind: 'cnf', date: e ? r.date : nowLocal(), data: { ...d, ...cnCollect(f, CN), ...cnCollect(f, CNP) } };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { cls: 'xl cnf', ok: 'Save Only', extra: '<button type="button" class="btn" data-a="cnfprint">Print Current</button>' });
}

// ---------- appointments: calendar (month / week / day) with list toggle ----------
let cal = { mode: 'month', d: new Date(), list: false };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const apRows = () => D.ap.filter((a) => !q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase()));
function calHtml() {
  const d = cal.d, loc = lang == 'km' ? 'km-KH' : 'en-US', by = {}, today = ymd(new Date());
  apRows().forEach((a) => { (by[a.date] = by[a.date] || []).push(a); }); Object.values(by).forEach((l) => l.sort((x, y) => (x.time || '').localeCompare(y.time || '')));
  const chip = (a) => `<div class="ev ${a.st == 'Cancelled' ? 'x' : a.st == 'Waiting' ? 'w' : ''}" data-a="apedit:${a.id}" title="${esc(a.svc || '')}">${a.time ? esc(a.time) + ' ' : ''}${esc(a.name)}</div>`;
  const fmt = (o, dt = d) => new Intl.DateTimeFormat(loc, o).format(dt);
  let title, body;
  if (cal.mode == 'month') {
    const y = d.getFullYear(), m = d.getMonth(), start = new Date(y, m, 1 - new Date(y, m, 1).getDay()); title = fmt({ month: 'long', year: 'numeric' });
    body = `<div class="cal">${DOW.map((x) => `<div class="dh">${x}</div>`).join('')}${Array.from({ length: 42 }, (_, i) => { const c = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = ymd(c), l = by[k] || [];
      return `<div class="dc2 ${c.getMonth() != m ? 'o' : ''} ${k == today ? 't' : ''}" data-a="apadd:${k}"><span class="dn">${c.getDate()}</span>${l.slice(0, 3).map(chip).join('')}${l.length > 3 ? `<div class="mu" style="font-size:11px">+${l.length - 3}</div>` : ''}</div>`; }).join('')}</div>`;
  } else if (cal.mode == 'week') {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); title = fmt({ day: 'numeric', month: 'short' }, s) + ' – ' + fmt({ day: 'numeric', month: 'short', year: 'numeric' }, e);
    body = `<div class="cal wk">${Array.from({ length: 7 }, (_, i) => { const c = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i), k = ymd(c);
      return `<div class="dh">${DOW[i]} ${c.getDate()}</div>`; }).join('')}${Array.from({ length: 7 }, (_, i) => { const c = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i), k = ymd(c); return `<div class="dc2 ${k == today ? 't' : ''}" data-a="apadd:${k}">${(by[k] || []).map(chip).join('')}</div>`; }).join('')}</div>`;
  } else {
    const k = ymd(d), l = by[k] || []; title = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    body = `<div class="daylist">${l.map((a) => `<div class="rc" data-a="apedit:${a.id}" style="cursor:pointer"><b>${esc(a.time || '—')}</b> &nbsp; ${esc(a.name)} <span class="mu">${esc(a.svc || '')} · ${esc(a.doc || '')} · ${esc(a.phone || '')}</span> <span class="bd">${esc(a.st)}</span></div>`).join('') || '<p class="emp">Nothing here yet.</p>'}</div>`;
  }
  return `<div class="card" style="padding:14px"><div class="tools" style="justify-content:space-between;margin-bottom:12px"><div class="tools"><button class="btn dk" data-a="calprev">‹</button><button class="btn dk" data-a="calnext">›</button><button class="btn" data-a="caltoday">today</button></div><b style="font-size:18px">${title}</b><div class="tabs dkt">${['month', 'week', 'day'].map((m) => `<button class="${cal.mode == m ? 'on' : ''}" data-a="calmode:${m}">${m}</button>`).join('')}</div></div>${body}</div>`;
}
R.ap = function () {
  if (cal.list) return tp('ap').replace('<div class="tools">', '<div class="tools"><button class="btn" data-a="callist">Calendar view</button>');
  return hd('Appointment list', 'Manage all patient appointments.', '<button class="btn" data-a="callist">List view</button>' + sr('Search patient name…') + '<button class="btn" data-a="csv">Export Excel</button>' + `<button class="btn g" data-a="apadd:${ymd(new Date())}">+ Add</button>`) + calHtml();
};
const apOpen = (a) => modal(a ? 'Edit' : 'Add appointment', P.ap.f, a || { ...P.ap.d, date: apOpen.date, time: '' }, (o) => a ? api('PUT', 'appointments/' + a.id, o) : api('POST', 'appointments', { ...P.ap.d, ...o }));

// ---------- Excel export ----------
async function exportExcel() {
  const key = (P[rt] && P[rt].k) || rt, rows = rt == 'pt' ? ptRows().map(([r]) => r) : D[key]; if (!Array.isArray(rows) || !rows.length) return toast('Nothing here yet.');
  const medicineExport = key == 'med';
  const cols = medicineExport
    ? ['id', 'name', 'type', 'price', 'stock', 'sold', 'damaged', 'last_stock_date', 'last_stock', 'expiry_date', 'reminder_date', 'units', 'image_url', 'composition']
    : Object.keys(rows[0]).filter((c) => !['created_at', 'updated_at', 'user_id', 'photo', 'data'].includes(c));
  const exportRows = medicineExport ? rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type || '',
    price: row.price ?? '',
    stock: row.stock ?? '',
    sold: row.sold ?? '',
    damaged: row.damaged ?? '',
    last_stock_date: row.last_stock_date ?? '',
    last_stock: row.last_stock ?? '',
    expiry_date: row.expiry_date || row.expiration_date || '',
    reminder_date: row.reminder_date || row.notification_date || '',
    units: row.units || '',
    image_url: row.photo ? `${API_BASE}/uploads/${row.photo}` : '',
    composition: row.composition || '',
  })) : rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col] ?? ''])));
  try {
    const response = await fetch(API_BASE + '/api/export/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ rows: exportRows }),
    });
    if (response.status == 401 && tok) logout();
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      if (response.status == 404) throw new Error('Excel export API not found. Restart the backend server to load the latest changes.');
      throw new Error(error && error.error || 'Request failed');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = key + '-' + ymd(new Date()) + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (error) { toast(error.message); }
}

// ---------- click dispatcher (called from app.js for actions it does not know) ----------
function pAct(a, x, y, el) {
  const rec = () => recs.find((r) => r.id == x);
  if (a == 'reg') regForm(); else if (a == 'regedit') regForm(D.pt[+x]); else if (a == 'open') openPatient(+x).catch((e) => toast(e.message));
  else if (a == 'agem') { $('#agebox').dataset.mode = x; document.querySelectorAll('#agem button').forEach((b) => b.classList.toggle('on', b.dataset.a == 'agem:' + x)); }
  else if (a == 'vsbtn') { $('#vsbox').hidden = !$('#vsbox').hidden; } else if (a == 'regprint') regPrint();
  else if (a == 'rtab') { ptab = x; render(); } else if (a == 'radd') { ptab == 'vitals' ? vsForm() : ptab == 'medical' ? mrForm() : ptab == 'schedule' ? schForm() : genForm(); }
  else if (a == 'investigation-request') requestInvestigationServices().catch((e) => toast(e.message));
  else if (a == 'svcplus' || a == 'svcminus') changeInvestigationQuantity(x, Number(y), a == 'svcplus' ? 1 : -1).catch((e) => toast(e.message));
  else if (a == 'redit') { const r = rec(); r.kind == 'vitals' ? vsForm(r) : r.kind == 'medical' ? mrForm(r) : r.kind == 'schedule' ? schForm(r) : r.kind == 'mrd' ? mrdForm(r) : r.kind == 'cnf' ? cnfForm(r) : genForm(r); }
  else if (a == 'rdel') { if (confirm(T('Delete this record?'))) api('DELETE', 'records/' + x).then(loadRecs).then(render).catch((e) => toast(e.message)); }
  else if (a == 'rprint') { const r = rec(); printDoc('Medical Record', ptBlock(curPt()) + `<p>${esc((r.date || '').replace('T', ' '))}</p>` + mrPrintHtml(jd(r))); }
  else if (a == 'mrprint') { const f = $('#mf'); printDoc('Medical Record', ptBlock(curPt()) + `<p>${esc((new FormData(f).get('date') || '').replace('T', ' '))}</p>` + mrPrintHtml(mrCollect(f))); }
  else if (a == 'htc') htControls(); else if (a == 'mhist') mrHistory(); else if (a == 'mrd') mrdList(); else if (a == 'mrdnew') mrdForm(); else if (a == 'mrdedit') mrdForm(rec()); else if (a == 'mrdprint') mrdPrint();
  else if (a == 'schtab') { sch = x; render(); } else if (a == 'schinv') schPrint(true); else if (a == 'schprint') schPrint(false);
  else if (a == 'schaddtab') modal('New schedule', [['Name', 'name']], {}, async (o) => { const nm = (o.name || '').trim(); if (!nm) return; await api('POST', 'records', { patient_id: pdId, kind: 'schedulenote', title: nm }); sch = nm; await loadRecs(); })
  else if (a == 'schnotesave') { const n = schNote(), v = $('#schnote').value; (n ? api('PUT', 'records/' + n.id, { notes: v }) : api('POST', 'records', { patient_id: pdId, kind: 'schedulenote', title: sch, notes: v })).then(loadRecs).then(() => { render(); toast('Saved'); }).catch((e) => toast(e.message)); }
  else if (a == 'schdone') { const r = rec(), d = jd(r); d.done = d.done ? 0 : 1; api('PUT', 'records/' + x, { data: d }).then(loadRecs).then(render).catch((e) => toast(e.message)); }
  else if (a == 'cnf') cnfForm(); else if (a == 'cnfnew') cnfForm(); else if (a == 'cnfload') cnfForm(rec()); else if (a == 'cnftab') { $('#cn-gen').hidden = x != 'gen'; $('#cn-plan').hidden = x != 'plan'; document.querySelectorAll('.cnft button').forEach((b) => b.classList.toggle('on', b.dataset.a == 'cnftab:' + x)); }
  else if (a == 'cnfprint') { const f = $('#mf'); printDoc('Consultation Form (CNF)', ptBlock(curPt()) + cnPrintHtml({ ...cnCollect(f, CN), ...cnCollect(f, CNP) })); }
  else if (a == 'mtadd') $('#mtb').insertAdjacentHTML('beforeend', mtRow()); else if (a == 'pdprint') histPrint();
  else if (a == 'pedit') { const p = curPt(), l = x == 'nssf_id' ? 'NSSF ID' : 'National ID'; modal('Edit ' + l, [[l, x]], p, (o) => api('PUT', 'patients/' + p.id, o)); }
  else if (a == 'apadd') { apOpen.date = x; apOpen(); } else if (a == 'apedit') apOpen(D.ap.find((r) => r.id == x));
  else if (a == 'callist') { cal.list = !cal.list; render(); } else if (a == 'caltoday') { cal.d = new Date(); render(); } else if (a == 'calmode') { cal.mode = x; render(); }
  else if (a == 'calprev' || a == 'calnext') { const s = a == 'calnext' ? 1 : -1, d = cal.d; cal.d = cal.mode == 'month' ? new Date(d.getFullYear(), d.getMonth() + s, 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + s * (cal.mode == 'week' ? 7 : 1)); render(); }
  else if (a == 'csv') exportExcel(); else if (a == 'pfclear') { Object.keys(pf).forEach((k) => delete pf[k]); render(); }
  else if (a == 'ptcols') { ptColsOpen = !ptColsOpen; render(); } else if (a == 'ptfilt') { ptFilt = !ptFilt; savePt(); render(); }
  else if (a == 'ptcolsall') { ptHide[ptMode()].clear(); savePt(); render(); }
  else if (a == 'ptcol') { const S = ptHide[ptMode()]; if (S.has(x)) S.delete(x); else if (ptShown().length > 1) S.add(x); else toast('At least one column must stay visible'); savePt(); render(); }
  else if (a == 'ptmr') openPatient(+x).then(() => { ptab = 'medical'; render(); mrForm(); }).catch((e) => toast(e.message));
  else if (a == 'ipdout') ipdOut(+x); else if (a == 'ipdbed') ipdBed(+x); else if (a == 'ipdtreat') ipdTreat(+x); else if (a == 'ipdedit') ipdEdit(+x); else if (a == 'ipdprint') ipdPrint(+x); else if (a == 'ipdshare') ipdShare(+x); else if (a == 'ipdadd') ipdAdd();
  else if (a == 'ptbed') bedForm(+x); else if (a == 'ptadmit') ptAdmit(+x); else if (a == 'ptprint') ptCard(+x);
  else if (a == 'pttreat') treatmentFollowup(+x).catch((e) => toast(e.message));
  else if (a == 'ptdx') { const q0 = ptById(+x), opts = ['', ...new Set([q0.diagnosis, ...D.dx.map((d) => d.name)].filter(Boolean))]; modal('Diagnosis', [['Diagnosis', 'diagnosis', 'sel', opts]], q0, (o) => api('PUT', 'patients/' + q0.id, o)); }
  else if (a == 'ptpay') payForm(+x); else if (a == 'ptinv') invoicePrint(+x).catch((e) => toast(e.message));
  else if (a == 'payall') return payForm(pdId, true);
  else if (a == 'payreceipt') paymentReceipt(+x);
  else if (a == 'recpay') payForm(pdId);
  else if (a == 'ipdbill') openIpdBilling(+x).catch((e) => toast(e.message));
  else if (a == 'tfadd') { tfRows = tfDraftRows(); tfRows.push({ date: nowLocal(), vitals: '', diagnosis: '', notes: '' }); tfRender(); }
  else if (a == 'tfremove') { tfRows = tfDraftRows(); tfRows.splice(+x, 1); tfRender(); }
  else if (a == 'tfhistory') { tfRows = tfDraftRows(); tfShowHistory = !tfShowHistory; tfRender(); }
  else if (a == 'tfedit') { const r = tfHistory.find((q) => q.id == x); if (r) { tfRows = [tfRowFromRecord(r)]; tfShowHistory = false; tfRender(); } }
  else if (a == 'tfprint') tfPrintAll();
  else if (a == 'pdctl') { pdCtl = !pdCtl; render(); } else if (a == 'pdlay') { pdLay = pdLay == 'grid' ? 'list' : 'grid'; savePd(); render(); }
  else if (a == 'hidei' || a == 'hidec') { const S = a == 'hidei' ? pdHideI : pdHideC; S.has(x) ? S.delete(x) : S.add(x); savePd(); render(); }
  else if (a == 'dashap') { cal.mode = 'day'; cal.d = new Date(); cal.list = false; rt = 'ap'; q = ''; render(); }
  else if (a == 'dfilter') { dFrom = $('#dfrom').value; dTo = $('#dto').value; render(); } else if (a == 'dclear') { dFrom = ''; dTo = ''; render(); }
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id == 'pfp') { try { toast('Uploading…'); const ph = await upl(t.files[0]); await api('PUT', 'patients/' + pdId, { photo: ph }); await load(); render(); } catch (er) { toast(er.message); } }
  else if (t.id == 'sch-selection') schItemChanged(t.value);
  else if (t.dataset && t.dataset.investigationService) {
    const id = String(t.dataset.investigationService);
    if (t.checked) investigationSelection.add(id); else investigationSelection.delete(id);
    const card = t.closest('.investigation-service');
    if (card) card.classList.toggle('selected', t.checked);
    const button = document.querySelector('[data-a="investigation-request"]');
    if (button) { button.disabled = !investigationSelection.size; button.textContent = T('Add selected') + (investigationSelection.size ? ` (${investigationSelection.size})` : ''); }
  }
  else if (t.dataset && t.dataset.fill && t.value) { const ta = t.parentElement.querySelector('textarea'); ta.value = (ta.value ? ta.value.replace(/[,\s]+$/, '') + ', ' : '') + t.value; t.value = ''; }
});
document.addEventListener('input', (e) => {
  if (e.target.id == 'pdd') { pdDate = e.target.value; $('#rp').innerHTML = recPanel(); }
  else if (e.target.id == 'investigation-service-search') {
    investigationQuery = e.target.value;
    const list = $('#investigation-service-list');
    if (list) list.innerHTML = investigationServiceList();
  }
});

// ---------- Khmer ----------
Object.assign(L, { 'Register new patient': 'ចុះឈ្មោះអ្នកជំងឺថ្មី', 'Register Patient': 'ចុះឈ្មោះអ្នកជំងឺ', 'Edit patient': 'កែប្រែអ្នកជំងឺ', 'Patient registered': 'បានចុះឈ្មោះអ្នកជំងឺ', 'Basic information': 'ព័ត៌មានមូលដ្ឋាន', 'Patient name *': 'ឈ្មោះអ្នកជំងឺ *', 'Latin name (optional)': 'ឈ្មោះឡាតាំង (ស្រេចចិត្ត)', 'Latin name': 'ឈ្មោះឡាតាំង', 'Demographics': 'ប្រជាសាស្ត្រ', 'Sex': 'ភេទ', 'Select sex': 'ជ្រើសរើសភេទ', 'Male': 'ប្រុស', 'Female': 'ស្រី', 'Year': 'ឆ្នាំ', 'Month': 'ខែ', 'Day': 'ថ្ងៃ', 'Khmer national': 'ជនជាតិខ្មែរ', 'Clinical details': 'ព័ត៌មានគ្លីនិក', 'Complaints / symptoms': 'ពាក្យបណ្តឹង / រោគសញ្ញា', '+ Add symptom': '+ បន្ថែមរោគសញ្ញា', '+ Pick address': '+ ជ្រើសអាសយដ្ឋាន', 'Past medical history': 'ប្រវត្តិជំងឺកន្លងមក', '+ Record vital signs': '+ កត់ត្រាសញ្ញាជីវិត', 'Registration date': 'កាលបរិច្ឆេទចុះឈ្មោះ', 'Print': 'បោះពុម្ព', 'History': 'ប្រវត្តិ', 'Change photo': 'ប្តូររូបភាព', 'Patient Management': 'ការគ្រប់គ្រងអ្នកជំងឺ', 'Gender': 'ភេទ', 'Date': 'កាលបរិច្ឆេទ', 'Time': 'ម៉ោង',
  'Vital signs': 'សញ្ញាជីវិត', 'Lab results': 'លទ្ធផល Lab', 'Echo results': 'លទ្ធផលអេកូ', 'X-Ray results': 'លទ្ធផល X-Ray', 'Appointment history': 'ប្រវត្តិណាត់ជួប', 'Temperature (°C)': 'សីតុណ្ហភាព (°C)', 'Heart rate (bpm)': 'ចង្វាក់បេះដូង (bpm)', 'Respiratory rate (bpm)': 'ចង្វាក់ដកដង្ហើម (bpm)', 'Blood pressure (mmHg)': 'សម្ពាធឈាម (mmHg)', 'Pulse (P)': 'ជីពចរ (P)', 'Weight (kg)': 'ទម្ងន់ (kg)', 'Height (cm)': 'កំពស់ (cm)', 'Add vital signs': 'បន្ថែមសញ្ញាជីវិត', 'Edit vital signs': 'កែប្រែសញ្ញាជីវិត', 'Title': 'ចំណងជើង', 'Notes': 'កំណត់ចំណាំ', 'Label colour': 'ពណ៌ស្លាក', 'Image': 'រូបភាព', 'Save Record': 'រក្សាទុកកំណត់ត្រា',
  'List view': 'មើលជាបញ្ជី', 'Calendar view': 'មើលជាប្រតិទិន', 'Search patient name…': 'ស្វែងរកតាមឈ្មោះអ្នកជំងឺ…', 'Add appointment': 'បន្ថែមការណាត់ជួប', 'today': 'ថ្ងៃនេះ', 'month': 'ខែ', 'week': 'សប្តាហ៍', 'day': 'ថ្ងៃ', 'Sun': 'អាទិត្យ', 'Mon': 'ច័ន្ទ', 'Tue': 'អង្គារ', 'Wed': 'ពុធ', 'Thu': 'ព្រហស្បតិ៍', 'Fri': 'សុក្រ', 'Sat': 'សៅរ៍', 'Done': 'រួចរាល់', 'Cancelled': 'បានលុបចោល', 'Nothing here yet.': 'មិនទាន់មានទិន្នន័យទេ។', 'Patient not found.': 'រកមិនឃើញអ្នកជំងឺ។', 'Only the author or an admin can delete this record': 'មានតែអ្នកបង្កើត ឬអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចលុបបាន' });
Object.assign(L, { 'Invoice': 'វិក្កយបត្រ', 'Print Schedule': 'បោះពុម្ពកាលវិភាគ', 'Add Schedule': 'បន្ថែមកាលវិភាគ', 'Standard': 'ស្តង់ដារ', 'General Form': 'ទម្រង់ទូទៅ', 'Assessment & Plan': 'ការវាយតម្លៃ និងផែនការ', 'Form History': 'ប្រវត្តិទម្រង់', 'Print Current': 'បោះពុម្ពទម្រង់បច្ចុប្បន្ន', 'Save Only': 'រក្សាទុកតែប៉ុណ្ណោះ', 'HT Controls': 'ការគ្រប់គ្រងការបង្ហាញ', 'Hide content sections': 'លាក់ផ្នែកខ្លឹមសារ', 'Create MRD record': 'បង្កើតកំណត់ត្រា MRD', '+ Create new record': '+ បង្កើតកំណត់ត្រាថ្មី', 'No records yet.': 'មិនទាន់មានកំណត់ត្រានៅឡើយទេ។', 'Diagnosis': 'រោគវិនិច្ឆ័យ', 'Request': 'សំណូមពរ', 'Result': 'លទ្ធផល' });
document.addEventListener('keydown', (e) => { if (e.key == 'Enter' && e.target.matches && e.target.matches('.st[data-a]')) e.target.click(); });
Object.assign(L, { 'View data': 'មើលទិន្នន័យ', 'Patient statistics': 'ស្ថិតិប្រជាសាស្ត្រអ្នកជំងឺ', 'From date': 'ថ្ងៃចាប់ផ្តើម', 'To date': 'ថ្ងៃបញ្ចប់', 'Apply': 'អនុវត្ត', 'Clear': 'សម្អាត', 'Unknown': 'មិនស្គាល់' });
Object.assign(L, { 'Hide Patient Info:': 'លាក់ព័ត៌មានអ្នកជំងឺ:', 'Hide Content Sections:': 'លាក់ផ្នែកខ្លឹមសារ:', 'Date Filter': 'តម្រងកាលបរិច្ឆេទ', 'All sections are hidden. Use the eye button to show them.': 'ផ្នែកទាំងអស់ត្រូវបានលាក់។ ប្រើប៊ូតុងភ្នែកដើម្បីបង្ហាញវា។' });

// ---------- Patients list: the full table (diagnosis, balance, quick actions) ----------
const ptById = (id) => D.pt.find((x) => x.id == id);
const fmtD = (s) => { const d = String(s || '').slice(0, 10).split('-'); return d.length == 3 ? `${d[2]}/${d[1]}/${d[0]}` : ''; };
const usd = (n) => '$' + (n / ((D.clinic && D.clinic.rate) || 4000)).toFixed(2);
const trunc = (s, n = 28) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const pgNums = (c, n) => { const a = [...new Set([1, 2, 3, 4, n, c - 1, c, c + 1].filter((x) => x >= 1 && x <= n))].sort((x, y) => x - y), o = []; a.forEach((x, i) => { if (i && x - a[i - 1] > 1) o.push('…'); o.push(x); }); return o; };
const PTAB = [['OPD', 'OPD'], ['IPD', 'IPD'], ['Unpaid', 'Unpaid'], ['NSSF', 'NSSF'], ['Details', 'Details']];
// ---- per-column filters (filter row under the header) ----
const pf = {};
const lc = (v) => String(v ?? '').toLowerCase();
const has = (a, v) => lc(a).includes(lc(v.trim()));
function ageOk(r, v) {
  v = v.trim(); const y = Math.floor(ageYears(r)); let m;
  if ((m = v.match(/^(\d+)\s*[-–]\s*(\d+)$/))) return y >= +m[1] && y <= +m[2];
  if ((m = v.match(/^>=\s*(\d+)$/))) return y >= +m[1]; if ((m = v.match(/^>\s*(\d+)$/))) return y > +m[1];
  if ((m = v.match(/^<=\s*(\d+)$/))) return y <= +m[1]; if ((m = v.match(/^<\s*(\d+)$/))) return y < +m[1];
  if ((m = v.match(/^(\d+)$/))) return y == +m[1];
  return true; // not a valid age filter yet (still typing)
}
const PFN = {
  id: (r, v) => String(r.id).includes(v.trim()), date: (r, v) => fmtD(r.reg_date || r.created_at).includes(v.trim()) || String(r.reg_date || r.created_at || '').includes(v.trim()),
  name: (r, v) => has(r.name, v), latin: (r, v) => has(r.latin_name, v), nssf: (r, v) => has(r.nssf_id, v), nat: (r, v) => has(r.national_id, v),
  type: (r, v) => v == 'IPD' ? r.type == 'IPD' : r.type != 'IPD', treat: (r, v) => has(r.treatment, v), dx: (r, v) => has(r.diagnosis || r.last_dx, v),
  mr: (r, v) => v == 'yes' ? r.mr_count > 0 : !(r.mr_count > 0),   age: ageOk, sex: (r, v) => r.sex == v, pay: (r, v) => v == 'unpaid' ? patientDue(r.id) > 0 : !(patientDue(r.id) > 0),
  phone: (r, v) => lc(r.phone).replace(/\s/g, '').includes(lc(v).replace(/\s/g, '')), addr: (r, v) => has(r.addr, v),
  comp: (r, v) => has(r.complaints, v), hist: (r, v) => has(r.history, v), regd: (r, v) => has(r.reg_date, v) };
const SEL = { type: [['', 'All'], ['OPD', 'OPD'], ['IPD', 'IPD']], mr: [['', 'All'], ['yes', 'With record'], ['no', 'No record']], sex: [['', 'All'], ['M', 'Male'], ['F', 'Female']], pay: [['', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']] };
const pfActive = () => Object.entries(pf).filter(([, v]) => v !== '' && v != null);
const tabOk = (r) => tab == 'IPD' ? r.type == 'IPD' : tab == 'Unpaid' ? patientDue(r.id) > 0 : tab == 'NSSF' ? r.nssf : tab == 'Details' ? true : r.type != 'IPD';
const colOk = (r) => pfActive().every(([k, v]) => PFN[k] ? PFN[k](r, String(v)) : true);
const ptRows = () => ft('pt').filter(([r]) => tabOk(r) && colOk(r));
const fCell = (k) => !k ? '<th class="fr"><button class="btn s" data-a="pfclear" title="Clear filters">✕</button></th>'
  : SEL[k] ? `<th class="fr ${k == 'latin' ? 'c-latin' : ''}"><select class="in" data-pf="${k}">${SEL[k].map(([v, l]) => `<option value="${v}" ${(pf[k] || '') == v ? 'selected' : ''}>${l}</option>`).join('')}</select></th>`
  : `<th class="fr ${k == 'latin' ? 'c-latin' : ''}"><input class="in" data-pf="${k}" value="${esc(pf[k] || '')}" placeholder="${k == 'age' ? '20-40' : '🔍'}"></th>`;
// ---- rows ----
// ---- columns: each one can be shown or hidden (saved in this browser) ----
const COLF = [['id', 'ID'], ['date', 'Date'], ['name', 'Name'], ['latin', 'Latin name'], ['nssf', 'NSSF ID'], ['nat', 'National ID'], ['type', 'IPD/OPD'], ['treat', 'Treatment'], ['dx', 'Diagnosis'], ['mr', 'Medical Record'], ['age', 'Age'], ['sex', 'Gender'], ['pay', 'Unpaid'], ['phone', 'Phone'], ['addr', 'Address'], ['act', 'Actions']];
const COLD = [['id', 'ID'], ['name', 'Name'], ['latin', 'Latin name'], ['phone', 'Phone'], ['addr', 'Address'], ['comp', 'Complaints'], ['hist', 'Past medical history'], ['regd', 'Registration date'], ['nssf', 'NSSF ID'], ['nat', 'National ID'], ['act', 'Actions']];
let ptHide = { full: new Set(), det: new Set() }, ptColsOpen = false, ptFilt = false;
try { const h = JSON.parse(localStorage.getItem('ptHide') || '{}'); ptHide = { full: new Set(h.full || []), det: new Set(h.det || []) }; ptFilt = localStorage.getItem('ptFilt') == '1'; } catch (e) { /* defaults */ }
const savePt = () => { try { localStorage.setItem('ptHide', JSON.stringify({ full: [...ptHide.full], det: [...ptHide.det] })); localStorage.setItem('ptFilt', ptFilt ? '1' : '0'); } catch (e) { /* ignore */ } };
const ptMode = () => (tab == 'Details' ? 'det' : 'full');
const ptDefs = () => (tab == 'Details' ? COLD : COLF);
const ptShown = () => ptDefs().filter(([k]) => !ptHide[ptMode()].has(k));
const act = (r, i) => `<button class="sq b" data-a="regedit:${i}" title="Edit">✎</button> <button class="sq r" data-a="del:pt:${i}" title="Delete">🗑</button>`;
const ptNm = (r, sm = true) => `<div class="pn"><div><a href="#" data-a="open:${r.id}">${esc(r.name)}</a>${sm && r.latin_name ? `<small class="pl">${esc(r.latin_name)}</small>` : ''}</div><span class="ic"><a href="#" data-a="open:${r.id}" title="Open patient file">👁</a><a href="#" data-a="ptadmit:${r.id}" title="${r.type == 'IPD' ? 'Discharge' : 'Admit to IPD'}">${r.type == 'IPD' ? '🚪' : '🛏'}</a><a href="#" data-a="ptprint:${r.id}" title="Print patient card">🖨</a></span></div>`;
const cellsFull = (r, i, sm) => ({
  id: `<td>${r.id}</td>`, date: `<td>${fmtD(r.reg_date || r.created_at)}</td>`, name: `<td>${ptNm(r, sm)}</td>`, latin: `<td class="c-latin">${esc(r.latin_name || '')}</td>`,
  nssf: `<td>${esc(r.nssf_id || 'N/A')}</td>`, nat: `<td>${esc(r.national_id || 'N/A')}</td>`, type: `<td><span class="pill ${r.type == 'IPD' ? 'ipd' : 'opd'} clk" data-a="ptbed:${r.id}" title="Update bed information">${r.type == 'IPD' ? 'IPD' : 'OPD'}</span></td>`,
  treat: `<td title="${esc(r.treatment || '')}">${esc(trunc(r.treatment, 14))} <a href="#" class="ed" data-a="pttreat:${r.id}" title="Edit treatment">✎</a></td>`,
  dx: `<td title="${esc(r.diagnosis || r.last_dx || '')}">${esc(trunc(r.diagnosis || r.last_dx || 'N/A', 14))} <a href="#" class="ed" data-a="ptdx:${r.id}" title="Edit diagnosis">✎</a></td>`,
  mr: `<td><button class="mrb" data-a="ptmr:${r.id}" title="New medical record">✎</button></td>`, age: `<td>${fmtAge(r)}</td>`,
  sex: `<td>${r.sex ? `<span class="pill ${r.sex == 'F' ? 'f' : 'm'}">${fmtSex(r.sex)}</span>` : ''}</td>`,
  pay: `<td>${patientDue(r.id) > 0 ? `<div class="due" data-a="ptpay:${r.id}" title="Record payment"><b>KHR ${patientDue(r.id).toLocaleString('en-US')}</b><br>${usd(patientDue(r.id))}</div>` : `<span class="paid">✔ Paid</span> <a href="#" data-a="ptinv:${r.id}" title="Invoice">🧾</a>`}</td>`,
  phone: `<td>${r.phone ? '📞 ' + esc(r.phone) : '<span class="mu">📞</span>'}</td>`, addr: `<td title="${esc(r.addr || '')}">${esc(trunc(r.addr || 'N/A', 14))}</td>`, act: `<td style="white-space:nowrap">${act(r, i)}</td>` });
const cellsDet = (r, i) => ({
  id: `<td>${r.id}</td>`, name: `<td>${ptNm(r, false)}</td>`, latin: `<td>${esc(r.latin_name || '')}</td>`, phone: `<td>${esc(r.phone || '')}</td>`, addr: `<td>${esc(r.addr || '')}</td>`,
  comp: `<td style="white-space:pre-wrap;min-width:180px">${esc(r.complaints || '')}</td>`, hist: `<td style="white-space:pre-wrap;min-width:180px">${esc(r.history || '')}</td>`,
  regd: `<td>${esc((r.reg_date || '').replace('T', ' '))}</td>`, nssf: `<td>${esc(r.nssf_id || '')}</td>`, nat: `<td>${esc(r.national_id || '')}</td>`, act: `<td style="white-space:nowrap">${act(r, i)}</td>` });
function ptView() {
  const L = ptRows(), n = Math.max(1, Math.ceil(L.length / 10)); pg = Math.min(pg, n); const S = (pg - 1) * 10, page = L.slice(S, S + 10), det = tab == 'Details', cols = ptShown();
  const sm = !det && !ptHide.full.has('latin');
  return { count: L.length,
    body: page.map(([r, i]) => { const c = det ? cellsDet(r, i) : cellsFull(r, i, sm); return `<tr>${cols.map(([k]) => c[k]).join('')}</tr>`; }).join('') || `<tr><td colspan="${cols.length}" class="emp">No patients.</td></tr>`,
    pager: `<span>Showing ${L.length ? S + 1 : 0} to ${Math.min(L.length, S + 10)} of ${L.length} records</span><div><button class="btn s" data-a="pg:${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>‹ Previous</button>${pgNums(pg, n).map((x) => x == '…' ? '<span class="mu">…</span>' : `<button class="btn s ${x == pg ? 'p' : ''}" data-a="pg:${x}">${x}</button>`).join('')}<button class="btn s" data-a="pg:${pg + 1}" ${pg >= n ? 'disabled' : ''}>Next ›</button></div>` };
}
// typing in a filter only refreshes the rows, so the cursor stays in the box
function ptRefresh() { const v = ptView(), b = $('#ptbody'), p = $('#ptpg'), c = $('#pfclr'); if (b) b.innerHTML = v.body; if (p) p.innerHTML = v.pager; if (c) c.hidden = !pfActive().length; }
R.pt = function () {
  const det = tab == 'Details', v = ptView(), cols = ptShown(), defs = ptDefs();
  const panel = ptColsOpen ? `<div class="card pdc"><div class="tools" style="justify-content:space-between"><b>Show or hide columns</b><button class="btn s" data-a="ptcolsall">Show all</button></div><div class="pdcg" style="border:0;margin:8px 0 0;padding:0">${defs.map(([k, l]) => `<label class="cb"><input type="checkbox" data-a="ptcol:${k}" ${ptHide[ptMode()].has(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div></div>` : '';
  return `<div class="tools" style="margin-bottom:12px">${sr('Search Name, Phone, NSSF, National ID…')}<button class="btn p" data-a="reg">+ Add Patient</button><div class="tabs">${PTAB.map(([k, l]) => `<button class="${tab == k ? 'on' : ''}" data-a="tab:${k}">${l}</button>`).join('')}</div><button class="btn ${ptColsOpen ? 'on2' : ''}" data-a="ptcols">☰ Columns</button><button class="btn ${ptFilt ? 'on2' : ''}" data-a="ptfilt">Filters</button><button class="btn" id="pfclr" data-a="pfclear" ${pfActive().length ? '' : 'hidden'}>✕ Clear filters</button><button class="btn" data-a="csv">Export Excel</button></div>${panel}
<div class="card"><table class="ptb"><thead><tr>${cols.map(([k, l]) => `<th class="${k == 'latin' && !det ? 'c-latin' : ''}">${l}</th>`).join('')}</tr>${ptFilt ? `<tr class="frow">${cols.map(([k]) => fCell(k == 'act' ? null : k)).join('')}</tr>` : ''}</thead><tbody id="ptbody">${v.body}</tbody></table></div>
<div class="pg" id="ptpg">${v.pager}</div>`;
};
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.pf; if (!k) return; pf[k] = e.target.value; pg = 1; ptRefresh(); });
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.pf; if (!k) return; pf[k] = e.target.value; pg = 1; ptRefresh(); });
async function ptAdmit(id) {
  try {
    const p = ptById(id);
    if (p.type == 'IPD') { for (const r of D.ipd.filter((x) => x.code == String(id) && !x.out)) await api('PUT', 'ipd/' + r.id, { out: 1, dis: ymd(new Date()) }); await api('PUT', 'patients/' + id, { type: 'OPD' }); toast('Discharged'); }
    else return bedForm(id);
    await load(); render();
  } catch (e) { toast(e.message); }
}
function ptCard(id) {
  const p = ptById(id); printDoc('Patient card', ptBlock(p) + kv([['Treatment', p.treatment], ['Diagnosis', p.diagnosis || p.last_dx], ['Complaints', p.complaints], ['Past medical history', p.history], ['Registered', fmtD(p.reg_date || p.created_at)]]));
}
let tfPatientId = null, tfRows = [], tfHistory = [], tfShowHistory = false;
const tfRowFromRecord = (r) => {
  const d = jd(r);
  return { id: r.id, date: r.date || nowLocal(), vitals: d.vitals || '', diagnosis: d.diagnosis || '', notes: r.notes || '' };
};
function tfDraftRows() {
  const f = $('#mf');
  return tfRows.map((r, i) => ({
    ...r,
    date: f.elements[`tf-date-${i}`].value,
    vitals: f.elements[`tf-vitals-${i}`].value,
    diagnosis: f.elements[`tf-diagnosis-${i}`].value,
    notes: f.elements[`tf-notes-${i}`].value
  }));
}
function tfRender() {
  const p = ptById(tfPatientId), f = $('#mf');
  if (!p) return toast('Patient not found.');
  const rows = tfRows.map((r, i) => `<div class="tf-row"><div><input class="in" type="datetime-local" name="tf-date-${i}" value="${esc(r.date || nowLocal())}"><textarea class="in" name="tf-vitals-${i}" placeholder="${T('Enter vital signs')}">${esc(r.vitals || '')}</textarea></div>
<textarea class="in" name="tf-diagnosis-${i}" placeholder="${T("Describe patient's condition, symptoms, or diagnosis")}">${esc(r.diagnosis || '')}</textarea>
<textarea class="in" name="tf-notes-${i}" placeholder="${T('Prescribed medication, treatment plan, or notes...')}">${esc(r.notes || '')}</textarea>
<div class="tf-actions"><button type="button" class="btn s r" data-a="tfremove:${i}" title="${T('Remove row')}">✕</button></div></div>`).join('');
  const history = tfShowHistory ? `<div class="tf-history"><h4>${T('Treatment History')}</h4>${tfHistory.map((r) => {
    const d = jd(r);
    return `<div class="tf-history-row"><div><b>${esc((r.date || '').replace('T', ' '))}</b><div>${esc(d.diagnosis || '')}</div><div class="mu">${esc(r.notes || '')}</div></div><button type="button" class="btn s" data-a="tfedit:${r.id}">${T('Edit')}</button></div>`;
  }).join('') || `<p class="emp">${T('No history records yet.')}</p>`}</div>` : '';
  openForm(`${T('Treatment Follow-up')} — ${esc(p.name)}`, `<div class="tf-patient">${T('Patient')}: ${esc(p.name)} &nbsp;|&nbsp; ${T('Age')}: ${esc(fmtAge(p))} &nbsp;|&nbsp; ${T('Sex')}: ${esc(fmtSex(p.sex) || 'N/A')}</div>
<div class="tf-toolbar"><button type="button" class="btn" data-a="tfhistory">${tfShowHistory ? T('Hide History') : T('View History')}</button><button type="button" class="btn g" data-a="tfadd">+ ${T('Add New Treatment Row')}</button></div>
<div class="tf-grid"><div class="tf-columns"><b>${T('Date / Vital Signs')}</b><b>${T('Diagnosis / Evolution')}</b><b>${T('Treatment / Notes')}</b><b>${T('Actions')}</b></div>${rows || `<p class="emp">${T('Add a treatment row to begin.')}</p>`}</div>${history}`,
  async () => {
    const savedRows = tfDraftRows().filter((r) => r.date && (r.vitals.trim() || r.diagnosis.trim() || r.notes.trim()));
    if (!savedRows.length) throw new Error(T('Enter treatment details before saving'));
    for (const r of savedRows) {
      const body = { patient_id: tfPatientId, kind: 'treatment', title: 'Treatment Follow-up', date: r.date, notes: r.notes, data: { vitals: r.vitals, diagnosis: r.diagnosis } };
      if (r.id) await api('PUT', 'records/' + r.id, body);
      else await api('POST', 'records', body);
    }
    await load();
    if (pdId == tfPatientId) await loadRecs();
    render();
    toast('Saved');
  }, { cls: 'xl treatment-followup', ok: 'Save Record', extra: '<button type="button" class="btn" data-a="tfprint">Print All Records</button>' });
  const ftop = $('#mf h3');
  if (ftop) ftop.innerHTML = `<span>${T('Treatment Follow-up')} — ${esc(p.name)}</span><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button>`;
}
async function treatmentFollowup(pid) {
  const p = ptById(pid); if (!p) return toast('Patient not found.');
  tfPatientId = pid;
  tfHistory = (await api('GET', 'records?patient_id=' + pid + '&kind=treatment&limit=5000')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  tfRows = [ { date: nowLocal(), vitals: '', diagnosis: '', notes: '' } ];
  tfShowHistory = false;
  tfRender();
}
function tfPrintAll() {
  const p = ptById(tfPatientId);
  const body = tfHistory.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((r) => {
    const d = jd(r);
    return `<div class="rc"><b>${esc((r.date || '').replace('T', ' '))}</b>${kv([['Vital signs', d.vitals], ['Diagnosis / Evolution', d.diagnosis], ['Treatment / Notes', r.notes]])}</div>`;
  }).join('');
  printDoc('Treatment Follow-up', ptBlock(p) + (body || `<p>${T('No history records yet.')}</p>`));
}
// ---------- billing ----------
async function payForm(pid, payAll = false) {
  const p = ptById(pid); if (!p) return;
  const list = await api('GET', 'records?patient_id=' + pid + '&limit=5000'), due = billTotals(list).bal;
  if (!(due > 0)) return toast('Paid');
  openForm('Record payment', `<p>${esc(p.name)} — Amount due: <b>${K(due)}</b> <span class="mu">(${usd(due)})</span></p>${fIn('Amount paid (KHR)', 'amount', due, 'number', `min="1" max="${due}" ${payAll ? 'readonly' : ''} required`)}${fSel('Method', 'method', 'Cash', ['Cash', 'Bank'])}`, async (f) => {
    const m = new FormData(f), amt = Math.round(+m.get('amount') || 0); if (amt < 1) throw new Error('Enter an amount'); if (amt > due) throw new Error('Amount is more than the balance'); if (payAll && amt !== due) throw new Error('Payment must match the full balance');
    const outstandingItems = billingOutstandingItems(list);
    await api('POST', 'records', { patient_id: pid, kind: 'payment', date: ymd(new Date()), data: { amount: amt, method: m.get('method'), item_count: outstandingItems.length } });
    await load(); if (rt == 'pd' && pdId == pid) await loadRecs(); render(); toast('Saved');
  }, { cls: 'wide', ok: 'Save' });
}
function billingLineItems(list) {
  return list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (+a.id || 0) - (+b.id || 0)).flatMap((r) => {
    const d = jd(r);
    if (r.kind == 'schedule' && schBillable(r)) return [{ category: 'Treatment Charges', name: [d.selection, d.treatment_type, d.diagnosis || d.dx, r.notes].filter(Boolean).join(' — ') || r.title || 'Treatment charge', price: +d.amount || 0 }];
    if (r.kind == 'investigation' && Array.isArray(d.items)) return d.items.map((item, itemIndex) => {
      const quantity = Math.max(1, +item.quantity || 1), unitPrice = +item.unit_price || +item.price || 0;
      return { category: 'Service Charges', name: item.name || 'Service', price: unitPrice * quantity, quantity, unitPrice, recordId: r.id, itemIndex };
    });
    return [];
  });
}
function billingOutstandingItems(list) {
  let paid = list.filter((r) => r.kind == 'payment').reduce((sum, r) => sum + (+jd(r).amount || 0), 0);
  return billingLineItems(list).map((item) => {
    const applied = Math.min(paid, item.price);
    paid -= applied;
    return { ...item, price: item.price - applied };
  }).filter((item) => item.price > 0);
}
const billTotals = (list) => { const ch = billingLineItems(list).reduce((t, item) => t + item.price, 0), pd = list.filter((r) => r.kind == 'payment').reduce((t, r) => t + (+jd(r).amount || 0), 0); return { ch, pd, bal: Math.max(0, ch - pd) }; };
function billPanel() {
  const t = billTotals(recs), items = billingOutstandingItems(recs), pays = recs.filter((r) => r.kind == 'payment').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const categories = [...new Set(items.map((item) => item.category))];
  const unpaidItems = categories.map((category) => {
    const group = items.filter((item) => item.category == category), total = group.reduce((sum, item) => sum + item.price, 0);
    return `<div class="bill-charge-group"><div class="bill-charge-heading"><b>◇ ${T(category)}</b><b>${K(total)}</b></div>${group.map((item) => `<div class="bill-charge-item"><div>${esc(item.name)}<small>${K(item.unitPrice ?? item.price)}${item.quantity > 1 ? ` × ${item.quantity}` : ''}</small></div><div class="bill-charge-right"><b>${K(item.price)}</b>${item.category == 'Service Charges' ? `<div class="bill-quantity"><button type="button" class="btn s" data-a="svcminus:${item.recordId}:${item.itemIndex}" title="${T('Remove one')}">−</button><span>${item.quantity}</span><button type="button" class="btn s" data-a="svcplus:${item.recordId}:${item.itemIndex}" title="${T('Add one')}">+</button></div>` : ''}</div></div>`).join('')}</div>`;
  }).join('');
  const paidRows = pays.map((r) => {
    const d = jd(r), count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(recs).length;
    return `<div class="bill-payment"><div class="bill-payment-head"><div><b>${esc(r.date || '')}</b><div class="mu">Ref: PAY-${esc(r.id)}</div></div><span class="bd">${T('Paid')}</span><button class="btn s" data-a="payreceipt:${r.id}">▣ ${T('Receipt')}</button></div><div class="bill-payment-meta"><span>${T('Items')}:</span><span>${count}</span></div><div class="bill-payment-total"><span>${T('Total Paid')}:</span><b>${K(d.amount || 0)}</b></div></div>`;
  }).join('');
  return `<div class="billing-page"><div class="billing-toolbar"><h2 class="rh">▱ ${T('Billing history')}</h2><div class="tools"><button class="btn" data-a="schinv">${T('Invoice')}</button><button class="btn" data-a="recpay" ${t.bal ? '' : 'disabled'}>+ ${T('Record payment')}</button><button class="btn g billing-payall" data-a="payall" ${t.bal ? '' : 'disabled'}>$ ${T('Pay All')}: ${K(t.bal)}</button></div></div>
<div class="billing-columns"><section class="billing-panel"><h4><span>◇ ${T('Unpaid')}</span><span class="billing-total-badge">${T('Total')}: ${K(t.bal)}</span></h4>${t.bal ? unpaidItems : `<p class="emp">${T('No unpaid bills found.')}</p>`}<div class="bill-total"><b>${T('Total Unpaid Amount')}:</b><b>${K(t.bal)}</b></div></section>
<section class="billing-panel"><h4>◇ ${T('Paid History')}</h4>${paidRows || `<p class="emp">${T('No paid bills found.')}</p>`}</section></div></div>`;
}
async function changeInvestigationQuantity(recordId, itemIndex, delta) {
  const r = recs.find((record) => String(record.id) == String(recordId) && record.kind == 'investigation');
  if (!r) throw new Error('Investigation request not found');
  const d = jd(r);
  if (!Array.isArray(d.items) || !d.items[itemIndex]) throw new Error('Service charge item not found');
  const item = d.items[itemIndex], quantity = Math.max(0, Math.max(1, +item.quantity || 1) + delta);
  if (quantity == 0) d.items.splice(itemIndex, 1);
  else {
    const unitPrice = +item.unit_price || +item.price || 0;
    d.items[itemIndex] = { ...item, unit_price: unitPrice, price: unitPrice, quantity };
  }
  if (!d.items.length) await api('DELETE', 'records/' + r.id);
  else await api('PUT', 'records/' + r.id, { data: d });
  await loadRecs();
  await load();
  render();
}
function paymentReceipt(id) {
  const r = recs.find((x) => x.id == id && x.kind == 'payment');
  if (!r) return toast('Payment not found');
  const d = jd(r), p = curPt();
  printDoc('Payment Receipt', ptBlock(p) + kv([['Receipt No.', `PAY-${r.id}`], ['Date', r.date || ''], ['Method', d.method || ''], ['Amount Paid', K(d.amount || 0)]]));
}
async function openIpdBilling(pid) {
  const p = ptById(pid); if (!p) return toast('Patient not found.');
  pdId = pid;
  await loadRecs();
  const charges = recs.filter((r) => (r.kind == 'schedule' && schBillable(r)) || (r.kind == 'investigation' && Array.isArray(jd(r).items) && jd(r).items.length)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const pays = recs.filter((r) => r.kind == 'payment').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const t = billTotals(recs), unpaid = t.bal > 0;
  const chargeRows = charges.map((r) => {
    const d = jd(r);
    if (r.kind == 'investigation') return `<div class="bill-item"><div><b>${T('Service Charges')}</b><div class="mu">${esc(r.date || '')}</div>${d.items.map((item) => { const qty = Math.max(1, +item.quantity || 1), unit = +item.unit_price || +item.price || 0; return `<div class="bill-charge-item"><span>${esc(item.name)}${qty > 1 ? ` × ${qty}` : ''}</span><b>${K(unit * qty)}</b></div>`; }).join('')}</div><b>${K(d.items.reduce((sum, item) => sum + (+item.unit_price || +item.price || 0) * Math.max(1, +item.quantity || 1), 0))}</b></div>`;
    return `<div class="bill-item"><div><b>${esc([d.selection, d.treatment_type, d.diagnosis || d.dx, r.notes].filter(Boolean).join(' — ') || r.title || 'Charge')}</b><div class="mu">${esc(r.date || '')}</div></div><b>${K(d.amount || 0)}</b></div>`;
  }).join('');
  const paidRows = pays.map((r) => {
    const d = jd(r);
    const count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(recs).length;
    return `<div class="bill-payment"><div class="bill-payment-head"><div><b>${esc(r.date || '')}</b><div class="mu">Ref: PAY-${esc(r.id)}</div></div><span class="bd">${T('Paid')}</span><button type="button" class="btn s" data-a="payreceipt:${r.id}">Receipt</button></div><div class="bill-payment-meta"><span>${T('Items')}:</span><span>${count}</span></div><div class="mu">${esc(T('Method'))}: ${esc(d.method || '—')}</div><div class="bill-payment-total"><span>${T('Total Paid')}:</span><b>${K(d.amount || 0)}</b></div></div>`;
  }).join('');
  const f = $('#mf');
  f.className = 'xl billing-dialog';
  f.innerHTML = `<div class="billing-title"><b>${esc(p.name)}</b><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div>
<div class="billing-toolbar"><h3>${T('Billing history')}</h3><button type="button" class="btn g" data-a="payall" ${unpaid ? '' : 'disabled'}>${T('Pay All')}: ${K(t.bal)}</button></div>
<div class="billing-columns"><section class="billing-panel"><h4>${T('Unpaid')}</h4>${unpaid ? `${chargeRows || `<div class="bill-item"><b>${T('Outstanding balance')}</b><b>${K(t.bal)}</b></div>`}<div class="bill-total"><span>${T('Total')}:</span><b>${K(t.bal)}</b></div>` : '<p class="emp">No unpaid bills found.</p>'}</section>
<section class="billing-panel"><h4>${T('Paid History')}</h4>${paidRows || '<p class="emp">No paid bills found.</p>'}</section></div>`;
  $('#md').classList.add('on');
}
async function invoicePrint(pid) {
  const p = ptById(pid), list = await api('GET', 'records?patient_id=' + pid + '&limit=5000'), rows = list.filter((r) => r.kind == 'schedule' || (r.kind == 'investigation' && Array.isArray(jd(r).items) && jd(r).items.length)).sort((a, b) => (a.date || '').localeCompare(b.date || '')), t = billTotals(list);
  const invoiceRows = rows.flatMap((r) => {
    const d = jd(r);
    if (r.kind == 'investigation') return d.items.map((item) => [r.date, `${item.name}${(+item.quantity || 1) > 1 ? ` × ${+item.quantity}` : ''}`, (+item.unit_price || +item.price || 0) * Math.max(1, +item.quantity || 1)]);
    return [[r.date, [r.title, d.selection, d.dx || d.diagnosis, r.notes].filter(Boolean).join(' – '), +d.amount || 0]];
  });
  printDoc('Invoice', ptBlock(p) + `<table class="pk full"><tr><th>No.</th><th>Date</th><th>Description</th><th>Amount</th></tr>${invoiceRows.map(([date, description, amount], i) => `<tr><td>${i + 1}</td><td>${esc((date || '').slice(0, 10))}</td><td>${esc(description)}</td><td>${K(amount)}</td></tr>`).join('')}<tr><th colspan="3">Total</th><td><b>${K(t.ch)}</b></td></tr><tr><th colspan="3">Paid</th><td>${K(t.pd)}</td></tr><tr><th colspan="3">Balance</th><td><b>${K(t.bal)}</b></td></tr></table>`);
}
RX.push([/^Showing (\d+) to (\d+) of (\d+) records$/, 'បង្ហាញ $1 ដល់ $2 នៃ $3 កំណត់ត្រា']);
Object.assign(L, { 'IPD/OPD': 'IPD/OPD', 'Treatment': 'ការព្យាបាល', 'Medical Record': 'Medical Record', 'Complaints': 'ពាក្យបណ្តឹង', 'Registration date': 'កាលបរិច្ឆេទចុះឈ្មោះ', 'Details': 'ព័ត៌មានលម្អិត', 'Search Name, Phone, NSSF, National ID…': 'ស្វែងរកឈ្មោះ លេខទូរស័ព្ទ NSSF អត្តសញ្ញាណប័ណ្ណ…', 'Billing history': 'ប្រវត្តិគិតលុយ', 'Record payment': 'កត់ត្រាការបង់ប្រាក់', '+ Record payment': '+ កត់ត្រាការបង់ប្រាក់', 'Pay All': 'បង់ប្រាក់ទាំងអស់', 'Paid History': 'ប្រវត្តិបង់ប្រាក់', 'No unpaid bills found.': 'មិនមានវិក្កយបត្រមិនទាន់បង់ទេ។', 'No paid bills found.': 'មិនមានប្រវត្តិបង់ប្រាក់ទេ។', 'Total Paid': 'សរុបបានបង់', 'Outstanding balance': 'សមតុល្យមិនទាន់បង់', 'Total': 'សរុប', 'Close': 'បិទ', 'Receipt': 'បង្កាន់ដៃ', 'Payment Receipt': 'បង្កាន់ដៃបង់ប្រាក់', 'Charges': 'ការគិតថ្លៃ', 'Balance': 'សមតុល្យ', 'Method': 'វិធីសាស្ត្រ', 'Amount paid (KHR)': 'ទឹកប្រាក់បានបង់ (KHR)', 'No patients.': 'គ្មានអ្នកជំងឺទេ។', 'Patient card': 'កាតអ្នកជំងឺ', 'Amount is more than the balance': 'ចំនួនទឹកប្រាក់លើសសមតុល្យ', 'Enter an amount': 'សូមបញ្ចូលចំនួនទឹកប្រាក់' });
Object.assign(L, { 'Treatment Follow-up': 'ការតាមដានការព្យាបាល', 'Date / Vital Signs': 'កាលបរិច្ឆេទ / សញ្ញាជីវិត', 'Diagnosis / Evolution': 'រោគវិនិច្ឆ័យ / ការវិវត្ត', 'Treatment / Notes': 'ការព្យាបាល / កំណត់ចំណាំ', 'Actions': 'សកម្មភាព', 'Patient': 'អ្នកជំងឺ', 'Enter vital signs': 'បញ្ចូលសញ្ញាជីវិត', "Describe patient's condition, symptoms, or diagnosis": 'ពិពណ៌នាអំពីស្ថានភាព រោគសញ្ញា ឬរោគវិនិច្ឆ័យ', 'Prescribed medication, treatment plan, or notes...': 'ថ្នាំ ផែនការព្យាបាល ឬកំណត់ចំណាំ...', 'Remove row': 'លុបជួរដេក', 'Treatment History': 'ប្រវត្តិការព្យាបាល', 'Hide History': 'លាក់ប្រវត្តិ', 'Add New Treatment Row': 'បន្ថែមជួរដេកការព្យាបាលថ្មី', 'Add a treatment row to begin.': 'បន្ថែមជួរដេកការព្យាបាលដើម្បីចាប់ផ្តើម។', 'Print All Records': 'បោះពុម្ពកំណត់ត្រាទាំងអស់', 'Save Record': 'រក្សាទុកកំណត់ត្រា', 'Enter treatment details before saving': 'សូមបញ្ចូលព័ត៌មានការព្យាបាលមុនពេលរក្សាទុក' });
try { if (localStorage.getItem('sbc') == '1' && document.body.classList) document.body.classList.add('sbc'); } catch (e) { /* ignore */ }
Object.assign(L, { 'Menu': 'ម៉ឺនុយ' });
Object.assign(L, { 'All': 'ទាំងអស់', 'With record': 'មានកំណត់ត្រា', 'No record': 'គ្មានកំណត់ត្រា', '✕ Clear filters': '✕ សម្អាតតម្រង', 'Export Excel': 'នាំចេញ Excel' });
Object.assign(L, { 'Columns': 'ជួរឈរ', '☰ Columns': '☰ ជួរឈរ', 'Filters': 'តម្រង', 'Show all': 'បង្ហាញទាំងអស់', 'Show or hide columns': 'បង្ហាញ ឬលាក់ជួរឈរ', 'At least one column must stay visible': 'ត្រូវទុកយ៉ាងហោចណាស់ជួរឈរមួយ' });
Object.assign(L, { 'Request service': 'ស្នើសុំសេវាកម្ម', 'Search services…': 'ស្វែងរកសេវាកម្ម…', 'Add selected': 'បន្ថែមសេវាកម្មដែលបានជ្រើស', 'Service requests': 'សំណើសេវាកម្ម', 'No services requested yet.': 'មិនទាន់មានសំណើសេវាកម្មទេ។', 'No matching services.': 'រកមិនឃើញសេវាកម្មដែលត្រូវគ្នាទេ។', 'Requested services': 'សេវាកម្មដែលបានស្នើ', 'Select at least one service': 'សូមជ្រើសរើសសេវាកម្មយ៉ាងតិចមួយ', 'Services requested': 'បានស្នើសេវាកម្ម' });
Object.assign(L, { 'Service Charges': 'ថ្លៃសេវាកម្ម', 'Treatment Charges': 'ថ្លៃព្យាបាល', 'Total Unpaid Amount': 'ចំនួនទឹកប្រាក់មិនទាន់បង់សរុប', 'Items': 'មុខទំនិញ' });
Object.assign(L, { 'Add Vaccination': 'បញ្ចូលបញ្ជីចាក់វ៉ាក់សាំង', 'Edit Vaccination': 'កែប្រែបញ្ជីចាក់វ៉ាក់សាំង', 'Vaccine category': 'ប្រភេទវ៉ាក់សាំង', 'Child vaccination': 'វ៉ាក់សាំងកុមារ', 'Adult vaccination': 'វ៉ាក់សាំងមនុស្សពេញវ័យ', 'Other': 'ផ្សេងៗ', 'Vaccine group': 'ឈ្មោះក្រុមវ៉ាក់សាំង', 'Enter vaccine group': 'បញ្ចូលប្រភេទវ៉ាក់សាំង', 'Vaccine name': 'ឈ្មោះវ៉ាក់សាំង', 'Dose date': 'ថ្ងៃ ខែ ឆ្នាំ', 'Given': 'ចាក់រួច', 'Not given': 'មិនទាន់ចាក់', 'Administered by': 'បុគ្គលិកចាក់វ៉ាក់សាំង' });

// ---------- OPD -> IPD: click the OPD badge (or the bed icon) to enter Room and Bed ----------
function bedForm(pid) {
  const p = ptById(pid); if (!p) return;
  const cur = D.ipd.find((x) => String(x.code) == String(pid) && !x.out);
  openForm('Update Bed Information', fIn('Room Number', 'room', cur ? cur.room : '') + fIn('Bed Number', 'bed', cur ? cur.bed : ''), async (f) => {
    const m = new FormData(f), room = (m.get('room') || '').trim(), bed = (m.get('bed') || '').trim();
    if (cur) await api('PUT', 'ipd/' + cur.id, { room, bed });
    else { await api('POST', 'ipd', { name: p.name, code: String(pid), room, bed, adm: ymd(new Date()), paid: 0, out: 0 }); await api('PUT', 'patients/' + pid, { type: 'IPD' }); }
    await load(); render(); toast(cur ? 'Saved' : 'Admitted to IPD');
  }, { cls: '', ok: 'Save' });
  const first = $('#mf input'); if (first && first.focus) first.focus();
}
Object.assign(L, { 'Update Bed Information': 'ធ្វើបច្ចុប្បន្នភាពព័ត៌មានគ្រែ', 'Room Number': 'លេខបន្ទប់', 'Bed Number': 'លេខគ្រែ', 'Room / Bed': 'បន្ទប់ / គ្រែ', 'Bed': 'គ្រែ', 'Admitted to IPD': 'បានទទួលជាអ្នកជំងឺក្នុង' });

// ---------- Inpatients (IPD) and Current IPD: full table ----------
const ipdById = (id) => D.ipd.find((x) => x.id == id);
const ipdPt = (r) => D.pt.find((q) => String(q.id) == String(r.code));
const ipdStart = (r) => r.adm || String(r.created_at || '').slice(0, 10);
function ipdDays(r) {
  const s = ipdStart(r); if (!s) return null;
  const e = r.out ? (r.dis || String(r.updated_at || '').slice(0, 10)) : ymd(new Date());
  const n = Math.round((Date.parse(e) - Date.parse(s)) / 864e5); return isNaN(n) ? null : Math.max(0, n);
}
const ipdHead = ['Name', 'Latin name', 'Room / Bed', 'Treatment', 'Billing history', 'Admission date', 'Discharge date', 'Days', 'Actions'];
function ipdRow(r) {
  const p = ipdPt(r), i = D.ipd.indexOf(r), d = ipdDays(r), st = ipdStart(r), due = p ? patientDue(p.id) : 0;
  return `<tr><td><div class="pn"><div><a href="#" data-a="${p ? 'open:' + p.id : 'ipdedit:' + r.id}">${esc(r.name)}</a> <span class="mu">(${esc(r.code)})</span></div></div></td>
<td>${esc((p && p.latin_name) || 'N/A')}</td>
<td><a href="#" class="ed" data-a="ipdbed:${r.id}" title="Edit room and bed">✎</a> ${r.room ? `<span title="Room">🚪 ${esc(r.room)}</span>` : ''} ${r.bed ? `<span title="Bed">🛏 ${esc(r.bed)}</span>` : ''}</td>
<td title="${esc(r.treatment || (p && p.treatment) || '')}">${esc(trunc(r.treatment || (p && p.treatment), 16) || '')} <a href="#" class="ed" data-a="ipdtreat:${r.id}" title="Edit treatment">✎</a></td>
<td>${due > 0 ? `<div class="due" data-a="ptpay:${p.id}" title="Record payment"><b>KHR ${due.toLocaleString('en-US')}</b></div>` : p ? `<a href="#" class="paidb" data-a="ipdbill:${p.id}" title="Open billing history">✔ Paid</a>` : `<span class="paidb">✔ Paid</span>`}</td>
<td>${st ? fmtD(st) : 'N/A'}</td>
<td>${r.out ? (r.dis ? fmtD(r.dis) : 'N/A') : `<button class="dcb" data-a="ipdout:${r.id}">Discharge</button>`}</td>
<td>${d == null ? 'N/A' : d + (d == 1 ? ' day' : ' days')}</td>
<td style="white-space:nowrap" class="iac">${p ? `<a href="#" data-a="open:${p.id}" title="Open patient file">👁</a>` : ''}<a href="#" data-a="ipdprint:${r.id}" title="Print">🖨</a><a href="#" data-a="ipdshare:${r.id}" title="Share summary">✈</a><a href="#" data-a="ipdedit:${r.id}" title="Edit">✎</a><a href="#" class="rd" data-a="del:ipd:${i}" title="Delete">🗑</a></td></tr>`;
}
function ipdPage(current) {
  const rows = D.ipd.filter((r) => (!current || !r.out) && (!q || lc([r.name, r.code, r.room, r.bed, (ipdPt(r) || {}).latin_name].join(' ')).includes(lc(q.trim()))));
  return `<div class="hd"><div class="tools" style="align-items:center"><div class="ibox">🛏</div><div><h1>${current ? 'Current IPD patients' : 'Inpatients (IPD)'}</h1><p class="mu">${current ? 'Patients not yet discharged' : 'Manage all admitted patients.'}</p></div></div><div class="tools">${sr('Search patient by name or ID…')}<button class="btn g" data-a="ipdadd">+ Add</button><button class="btn" data-a="csv">Export Excel</button></div></div>
<div class="card"><table class="ipdt"><thead><tr>${ipdHead.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(ipdRow).join('') || `<tr><td colspan="9" class="emp">Nothing here yet.</td></tr>`}</tbody></table></div>`;
}
R.ipd = () => ipdPage(false); R.cur = () => ipdPage(true);
async function ipdOut(id) {
  try { const r = ipdById(id); await api('PUT', 'ipd/' + id, { out: 1, dis: ymd(new Date()) }); await syncOpd(r); await load(); render(); toast('Discharged'); } catch (e) { toast(e.message); }
}
function ipdBed(id) {
  const r = ipdById(id); if (!r) return;
  openForm('Update Bed Information', fIn('Room Number', 'room', r.room) + fIn('Bed Number', 'bed', r.bed), async (f) => {
    const m = new FormData(f); await api('PUT', 'ipd/' + id, { room: (m.get('room') || '').trim(), bed: (m.get('bed') || '').trim() }); await load(); render(); toast('Saved');
  }, { cls: '', ok: 'Save' });
}
function ipdTreat(id) {
  const r = ipdById(id), p = ipdPt(r); if (!r) return;
  if (p) return treatmentFollowup(p.id);
  openForm('Treatment', fTa('Treatment', 'treatment', r.treatment || (p && p.treatment) || '', 4), async (f) => {
    await api('PUT', 'ipd/' + id, { treatment: new FormData(f).get('treatment') || '' }); await load(); render(); toast('Saved');
  }, { cls: '', ok: 'Save' });
}
function ipdEdit(id) {
  const r = ipdById(id); if (!r) return;
  openForm('Edit inpatient', `${fIn('Patient name', 'name', r.name, 'text', 'required')}<div class="g2">${fIn('Room Number', 'room', r.room)}${fIn('Bed Number', 'bed', r.bed)}${fIn('Admission date', 'adm', ipdStart(r), 'date')}${fIn('Discharge date', 'dis', r.dis, 'date')}</div>${fTa('Treatment', 'treatment', r.treatment, 3)}`, async (f) => {
    const m = new FormData(f); await api('PUT', 'ipd/' + id, { name: m.get('name'), room: (m.get('room') || '').trim(), bed: (m.get('bed') || '').trim(), adm: m.get('adm') || '', dis: m.get('dis') || '', treatment: m.get('treatment') || '' }); await load(); render(); toast('Saved');
  }, { cls: 'wide', ok: 'Save' });
}
function ipdAdd() {
  const opd = D.pt.filter((p) => p.type != 'IPD'); if (!opd.length) return toast('Nothing here yet.');
  openForm('Admit to IPD', `${fSel('Patient', 'pid', opd[0].id, opd.map((p) => [p.id, `${p.name} (${p.id})`]))}<div class="g2">${fIn('Room Number', 'room', '')}${fIn('Bed Number', 'bed', '')}</div>${fIn('Admission date', 'adm', ymd(new Date()), 'date')}`, async (f) => {
    const m = new FormData(f), p = ptById(+m.get('pid')); if (!p) throw new Error('Choose a patient');
    await api('POST', 'ipd', { name: p.name, code: String(p.id), room: (m.get('room') || '').trim(), bed: (m.get('bed') || '').trim(), adm: m.get('adm') || ymd(new Date()), paid: 0, out: 0 });
    await api('PUT', 'patients/' + p.id, { type: 'IPD' }); await load(); render(); toast('Admitted to IPD');
  }, { cls: 'wide', ok: 'Save' });
}
function ipdSummary(r) {
  const p = ipdPt(r), d = ipdDays(r);
  return [['Name', r.name], ['ID', r.code], ['Latin name', p && p.latin_name], ['Room', r.room], ['Bed', r.bed], ['Admission date', ipdStart(r) ? fmtD(ipdStart(r)) : ''], ['Discharge date', r.out && r.dis ? fmtD(r.dis) : ''], ['Days', d == null ? '' : d], ['Treatment', r.treatment || (p && p.treatment)]];
}
function ipdPrint(id) { const r = ipdById(id); printDoc('Inpatient record', kv(ipdSummary(r))); }
function ipdShare(id) {
  const r = ipdById(id), text = ipdSummary(r).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (typeof navigator != 'undefined' && navigator.share) navigator.share({ title: r.name, text }).catch(() => {});
  else if (typeof navigator != 'undefined' && navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast(text)); else toast(text);
}
RX.push([/^(\d+) days?$/, '$1 ថ្ងៃ']);
Object.assign(L, { 'Admission date': 'ថ្ងៃចូលសម្រាក', 'Discharge date': 'ថ្ងៃចេញពីពេទ្យ', 'Days': 'ចំនួនថ្ងៃ', 'Search patient by name or ID…': 'ស្វែងរកអ្នកជំងឺតាមឈ្មោះ ឬ ID…', 'Edit inpatient': 'កែប្រែអ្នកជំងឺក្នុង', 'Admit to IPD': 'ទទួលជាអ្នកជំងឺក្នុង', 'Patient': 'អ្នកជំងឺ', 'Patient name': 'ឈ្មោះអ្នកជំងឺ', 'Inpatient record': 'កំណត់ត្រាអ្នកជំងឺក្នុង', 'Copied': 'បានចម្លង' });
