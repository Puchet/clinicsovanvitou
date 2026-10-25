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
  const heading = o.close ? `<div class="operation-form-heading"><h3>${title}</h3><button type="button" class="btn s" data-a="close" aria-label="${esc(o.closeLabel || 'Close')}">×</button></div>` : `<h3 style="margin:0 0 8px">${title}</h3>`;
  f.innerHTML = `${heading}${body}<div class="tools fb" style="justify-content:flex-end">${o.extra || ''}${o.hideCancel ? '' : '<button type="button" class="btn" data-a="close">Cancel</button>'}<button class="btn p">${o.ok || 'Save'}</button></div>`;
  $('#md').classList.add('on');
  f.onsubmit = async (e) => { e.preventDefault(); try { await save(f); if (!o.keepOpen) $('#md').classList.remove('on'); } catch (er) { toast(er.message); } };
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
function printDoc(title, html, options = {}) {
  const c = D.clinic || {};
  const omitClinicBranding = options.omitClinicBranding === true;
  const hasCustomHeader = Object.prototype.hasOwnProperty.call(options, 'headerHtml');
  const bannerOnly = omitClinicBranding && options.includeClinicBanner === true && c.banner
    ? `<div class="ph-head"><img class="ph-banner" src="${API_BASE}/uploads/${esc(c.banner)}" alt=""></div>`
    : '';
  const head = omitClinicBranding ? bannerOnly : hasCustomHeader ? options.headerHtml : `<div class="ph-head">${c.banner ? `<img class="ph-banner" src="${API_BASE}/uploads/${esc(c.banner)}" alt="">` : c.logo ? `<img class="ph-logo" src="${API_BASE}/uploads/${esc(c.logo)}" alt="">` : ''}${c.show_name && c.name ? `<h2>${esc(c.name)}</h2>` : ''}${c.specialty ? `<div>${esc(c.specialty)}</div>` : ''}${c.show_address && c.address ? `<div>${esc(c.address)}</div>` : ''}${c.show_phone && c.phone ? `<div>${esc(c.phone)}</div>` : ''}</div>`;
  const customHeader = !omitClinicBranding && c.print_header ? `<div class="print-config-header">${esc(c.print_header)}</div>` : '';
  const footer = !omitClinicBranding && c.print_footer ? `<footer class="print-config-footer">${esc(c.print_footer)}</footer>` : '';
  let pa = $('#pa'); if (!pa) { pa = document.createElement('div'); pa.id = 'pa'; document.body.appendChild(pa); }
  pa.innerHTML = `<div class="print-document">${head || ''}${customHeader}${title ? `<h3>${esc(title)}</h3>` : ''}<main class="print-document-content">${html}</main>${footer}</div>`;
  if (options.printImmediately) window.print();
  else setTimeout(() => window.print(), 60);
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
const PT = [['vitals', 'Vital signs'], ['medical', 'Medical Record'], ['mdhistory', 'MD History'], ['beu', 'BEU'], ['schedule', 'Treatment Schedule'], ['consultation', 'Consultation'], ['operation', 'Operation'], ['investigation', 'ស្នើសុំពិនិត្យ'], ['lab', 'Lab results'], ['echo', 'Echo results'], ['xray', 'X-Ray results'], ['homecare', 'Homecare'], ['prescription', 'Prescription'], ['medlist', 'Medication list'], ['documents', 'Documents'], ['billing', 'Billing history'], ['appts', 'Appointment history'], ['allergy', 'Allergy History'], ['vaccination', 'Vaccination'], ['referral', 'Referral'], ['diagnosis_history', 'Diagnosis History'], ['laborder', 'Lab Orders'], ['imagingorder', 'Imaging Orders']];
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
let pdId = null, ptab = 'vitals', recs = [], pdDate = '', investigationQuery = '', investigationSelection = new Set(), paidHistoryView = 'table', labPickerQuery = '', labPickerSelection = new Set(), labSubtab = 'results', echoSubtab = 'reports', echoPageSize = 'A4', echoTemplateId = '', echoPreviewZoom = 81;
try {
  const savedPatientId = Number(sessionStorage.getItem('currentPatientId'));
  if (Number.isInteger(savedPatientId) && savedPatientId > 0) pdId = savedPatientId;
  ptab = sessionStorage.getItem('currentPatientTab') || ptab;
} catch (e) { /* use defaults */ }
const curPt = () => D.pt.find((x) => x.id == pdId);
const jd = (r) => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } };
async function loadRecs() {
  recs = await api('GET', 'records?patient_id=' + pdId + '&limit=5000');
  D.billing = D.billing.filter((r) => String(r.patient_id) != String(pdId) || !['schedule', 'payment', 'investigation'].includes(r.kind))
    .concat(recs.filter((r) => ['schedule', 'payment', 'investigation'].includes(r.kind)));
}
async function openPatient(id) { pdId = id; ptab = 'vitals'; pdDate = ''; investigationQuery = ''; investigationSelection.clear(); rt = 'pd'; try { sessionStorage.setItem('currentPatientId', String(id)); sessionStorage.setItem('currentPatientTab', ptab); } catch (e) { /* retain the current view */ } await loadRecs(); render(); }
async function restorePatientPage() {
  if (!pdId || !curPt()) {
    pdId = null; ptab = 'vitals';
    try { sessionStorage.removeItem('currentPatientId'); sessionStorage.removeItem('currentPatientTab'); } catch (e) { /* ignore unavailable storage */ }
    setPage('pt'); render(); return;
  }
  if (!PT.some(([key]) => key == ptab)) ptab = 'vitals';
  await loadRecs();
  render();
}
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
  const top = `<div class="tools" style="justify-content:space-between;margin-bottom:10px"><div class="mu"><a href="#" data-a="go:pt">Patient Management</a> / <b>${esc(p.name)}</b></div><div class="tools"><button class="btn" data-a="pdschedule-followup">＋ ${T('Schedule Follow Up')}</button><button class="btn p" data-a="pdprint">🖨 History</button><button class="btn ${pdCtl ? 'on2' : ''}" data-a="pdctl" title="Hide controls">🙈</button><button class="btn ${pdLay == 'grid' ? 'on2' : ''}" data-a="pdlay" title="Change layout">▦</button></div></div>`;
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
  const d = jd(r), act = r.kind == 'investigation' ? `<div class="ra"><button class="btn s r" data-a="rdel:${r.id}" title="Delete request">✕</button></div>` : `<div class="ra">${r.kind == 'vaccination' ? `<button class="btn s" data-a="vaxprint:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">🖨</button>` : ''}${r.kind == 'consultation' && d.consultation_mode == 'center' ? `<button class="btn s" data-a="centerprint-record:${r.id}" title="បោះពុម្ព" aria-label="បោះពុម្ព">🖨</button>` : ''}<button class="btn s" data-a="redit:${r.id}">Edit</button><button class="btn s r" data-a="rdel:${r.id}">✕</button></div>`, when = esc((r.date || '').replace('T', ' '));
  if (r.kind == 'vitals') return `<div class="rc">${act}<div class="mu">${when}</div><div class="vs">${VSF.filter(([k]) => d[k]).map(([k, l]) => `<span><b>${l.replace(/ \(.*/, '')}:</b> ${esc(d[k])} ${(l.match(/\((.*)\)/) || [])[1] || ''}</span>`).join('') || '—'}</div></div>`;
  if (r.kind == 'medical') return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d.dx || d.cc || 'Medical Record')}</b><div class="mu">${esc((d.cc || '').slice(0, 140))}</div><div class="ra2"><button class="btn s" data-a="rprint:${r.id}">Print</button></div></div>`;
  if (r.kind == 'investigation' && Array.isArray(d.items)) return `<div class="rc investigation-record">${act}<div class="mu">${when}</div><b>Requested services</b><div class="investigation-record-items">${d.items.map((item) => { const qty = Math.max(1, +item.quantity || 1), unit = +item.unit_price || +item.price || 0; return `<div><span>${esc(item.name)}${qty > 1 ? ` × ${qty}` : ''}</span><b>${K(unit * qty)}</b></div>`; }).join('')}</div><div class="investigation-record-total">Total: <b>${K(d.items.reduce((sum, item) => sum + (+item.unit_price || +item.price || 0) * Math.max(1, +item.quantity || 1), 0))}</b></div></div>`;
  if (r.kind == 'lab' && Array.isArray(d.fields)) return `<article class="rc lab-result-record lab-result-summary"><div class="lab-result-summary-copy"><b class="lab-result-summary-title">${esc(d.test_name || r.title || 'Lab result')}</b><span class="mu">${esc(T('Date'))}: ${when}</span><span class="lab-result-status"><span aria-hidden="true">✓</span>${T('Completed')}</span></div><div class="ra lab-result-actions"><button type="button" class="btn p" data-a="redit:${r.id}" title="${esc(T('Edit'))}" aria-label="${esc(T('Edit'))}"><span aria-hidden="true">✎</span>${T('Edit')}</button><button type="button" class="btn p" data-a="labrecordprint:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}"><span aria-hidden="true">▣</span>${T('Print')}</button><button type="button" class="btn lab-result-format" data-a="labrecordprint:${r.id}:sl" title="Print S+L report" aria-label="Print S+L report"><span aria-hidden="true">⌁</span>S+L</button><button type="button" class="btn lab-result-format" data-a="labrecordprint:${r.id}:cl" title="Print CL report" aria-label="Print CL report"><span aria-hidden="true">▣</span>CL</button><button type="button" class="btn r" data-a="rdel:${r.id}" title="${esc(T('Delete'))}" aria-label="${esc(T('Delete'))}"><span aria-hidden="true">▤</span></button></div></article>`;
  if (r.kind == 'vaccination') {
    const doses = vaccinationDoses(d);
    const categoryLabel = d.category == 'child' ? 'Child vaccination' : d.category == 'adult' ? 'Adult vaccination' : d.category == 'other' ? 'Other' : d.category;
    return `<div class="rc vaccination-record">${act}<div class="mu">${when}</div><b>${esc(d.vaccine_group || d.vaccine_type || T('Vaccination'))}</b>${categoryLabel ? `<span class="bd">${esc(T(categoryLabel))}</span>` : ''}<div class="vaccination-record-doses">${doses.filter((dose) => dose.vaccine || dose.date || dose.notes).map((dose) => `<div><span>${esc(dose.vaccine || '')}</span><span>${esc(dose.date || '')}</span><span>${dose.given ? T('Given') : T('Not given')}</span>${dose.notes ? `<span>${esc(dose.notes)}</span>` : ''}</div>`).join('')}</div>${d.notes || r.notes ? `<div class="mu">${esc(d.notes || r.notes)}</div>` : ''}${d.administered_by ? `<div class="mu">${T('Administered by')}: ${esc(d.administered_by)}</div>` : ''}</div>`;
  }
  if (r.kind == 'cnf') {
    const concerns = Array.isArray(d.prob) ? d.prob.filter(Boolean).join(', ') : '';
    const details = [
      concerns && `<div><span class="mu">បញ្ហា / កង្វល់៖</span> ${esc(concerns)}</div>`,
      d.as_ass && `<div><span class="mu">ការវាយតម្លៃរបស់វេជ្ជបណ្ឌិត៖</span> ${esc(d.as_ass)}</div>`,
      d.as_plan && `<div><span class="mu">ផែនការព្យាបាល៖</span> ${esc(d.as_plan)}</div>`,
      d.as_reason && `<div><span class="mu">មូលហេតុនៃការមកពិគ្រោះ៖</span> ${esc(d.as_reason)}</div>`
    ].filter(Boolean).join('');
    return `<div class="rc consultation-record">${act}<div class="mu">${when}</div><b>ទម្រង់ពិគ្រោះគ្លីនិក</b>${details ? `<div class="consultation-record-details">${details}</div>` : '<div class="mu">មិនទាន់មានព័ត៌មានវាយតម្លៃទេ។</div>'}</div>`;
  }
  if (r.kind == 'consultation' && d.consultation_mode) {
    if (d.consultation_mode == 'center') return `<div class="rc consultation-record">${act}<div class="mu">${when}</div><b>ទម្រង់មណ្ឌល</b><div class="consultation-record-details">${(d.rows || []).length} ជួរ</div></div>`;
    const md = d.consultation_mode == 'md';
    const summary = [d.chief_complaint, d.diagnosis, d.assessment, d.treatment_plan].filter(Boolean);
    return `<div class="rc consultation-record">${act}<div class="mu">${when}</div><b>${md ? 'ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)' : 'ទម្រង់ពិគ្រោះជំងឺ'}</b>${summary.length ? `<div class="consultation-record-details">${summary.map((item) => `<div>${esc(item)}</div>`).join('')}</div>` : '<div class="mu">មិនទាន់មានព័ត៌មានលម្អិត។</div>'}</div>`;
  }
  const img = r.image ? `<a href="/uploads/${esc(r.image)}" target="_blank"><img class="rimg" src="/uploads/${esc(r.image)}" alt=""></a>` : '';
  if (CARE_MODULES[r.kind]) {
    const fields = CARE_MODULES[r.kind].fields.filter(([k]) => d[k]).map(([k, label]) => `<div><span class="mu">${esc(label)}:</span> ${esc(d[k])}</div>`).join('');
    return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d[CARE_MODULES[r.kind].fields[0][0]] || CARE_MODULES[r.kind].title)}</b><div class="care-record-fields">${fields}</div>${r.notes ? `<div style="white-space:pre-wrap">${esc(r.notes)}</div>` : ''}</div>`;
  }
  return `<div class="rc" ${r.kind == 'beu' && r.color ? `style="border-left:6px solid ${esc(r.color)}"` : ''}>${act}<b>${esc(r.title || lbl(r.kind))}</b> <span class="mu">${when}</span><div style="white-space:pre-wrap">${esc(r.notes || '')}</div>${img}</div>`;
}
function vaccinationDoses(data) {
  return Array.isArray(data.doses) ? data.doses : data.vaccine ? [{ vaccine: data.vaccine, dose: data.dose, date: data.next_due, given: false, notes: data.lot ? `Lot / Batch: ${data.lot}` : '' }] : [];
}
function vaccinationPrint(r) {
  const d = jd(r), doses = vaccinationDoses(d).filter((dose) => dose.vaccine || dose.date || dose.notes || dose.given);
  const categoryLabel = d.category == 'child' ? 'Child vaccination' : d.category == 'adult' ? 'Adult vaccination' : d.category == 'other' ? 'Other' : d.category;
  const rows = doses.map((dose) => `<tr><td>${esc(dose.vaccine || '')}</td><td>${esc(dose.date || '')}</td><td>${esc(T(dose.given ? 'Given' : 'Not given'))}</td><td>${esc(dose.notes || '')}</td></tr>`).join('');
  const details = kv([['Date', (r.date || '').replace('T', ' ')], ['Vaccine group', d.vaccine_group || d.vaccine_type || ''], ['Vaccine category', categoryLabel ? T(categoryLabel) : ''], ['Administered by', d.administered_by || '']]);
  const table = `<table class="pk full"><thead><tr>${['Vaccine name', 'Dose date', 'Status', 'Notes'].map((label) => `<th>${esc(T(label))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="4">${esc(T('No vaccination doses recorded'))}</td></tr>`}</tbody></table>`;
  printDoc(T('Vaccination'), ptBlock(curPt()) + details + table + (d.notes || r.notes ? `<p>${esc(d.notes || r.notes)}</p>` : ''));
}
function recPanel() {
  const p = curPt(); if (!p) return '';
  if (ptab == 'schedule') return schPanel();
  if (ptab == 'billing') return billPanel();
  if (ptab == 'appts') { const L = D.ap.filter((a) => (a.name || '').toLowerCase() == (p.name || '').toLowerCase()); return `<h2 class="rh">${lbl(ptab)}</h2>${L.map((a) => `<div class="rc"><b>${esc(a.date)} ${esc(a.time || '')}</b> ${esc(a.svc || '')} <span class="mu">${esc(a.doc || '')}</span> <span class="bd">${esc(a.st)}</span></div>`).join('') || '<p class="emp">Nothing here yet.</p>'}`; }
  if (ptab == 'consultation') {
    const L = recs.filter((r) => ['cnf', 'consultation'].includes(r.kind) && (!pdDate || (r.date || '').startsWith(pdDate)));
    const forms = L.filter((r) => r.kind == 'cnf' || jd(r).consultation_mode), notes = L.filter((r) => r.kind == 'consultation' && !jd(r).consultation_mode);
    return `<div class="consultation-toolbar" role="toolbar" aria-label="${esc(T('Consultation actions'))}">
      <button class="btn" data-a="consult-medical" title="ពិគ្រោះជំងឺ"><span aria-hidden="true">🩺</span><span>ពិគ្រោះជំងឺ</span></button>
      <button class="btn consultation-icon-button" data-a="consult-documents" title="ឯកសារ" aria-label="ឯកសារ"><span aria-hidden="true">🔗</span></button>
      <button class="btn" data-a="consult-cnf" title="ពិគ្រោះ MD"><span aria-hidden="true">🩺</span><span>ពិគ្រោះ MD</span></button>
      <button class="btn consultation-icon-button" data-a="consult-history" title="ប្រវត្តិ" aria-label="ប្រវត្តិ"><span aria-hidden="true">◷</span></button>
      <button class="btn" data-a="center-form" title="មណ្ឌល"><span aria-hidden="true">▦</span><span>មណ្ឌល</span></button>
      <button class="btn p consultation-add-button" data-a="radd"><span aria-hidden="true">＋</span><span>បន្ថែម</span></button>
    </div><section class="consultation-history"><h3>ប្រវត្តិពិគ្រោះ</h3>${forms.map(recCard).join('') || '<p class="emp">មិនទាន់មានទម្រង់ពិគ្រោះទេ។</p>'}</section>${notes.length ? `<section class="consultation-notes"><h3>កំណត់ចំណាំពិគ្រោះ</h3>${notes.map(recCard).join('')}</section>` : ''}`;
  }
  const L = recs.filter((r) => r.kind == ptab && (!pdDate || (r.date || '').startsWith(pdDate)));
  if (ptab == 'investigation') return investigationPanel(L);
  if (ptab == 'lab') return labPanel(L);
  if (ptab == 'echo') return echoPanel();
  return `<div class="hd"><h2 class="rh">${lbl(ptab)}</h2>${ptab == 'medical' ? '<div class="tools"><button class="btn" data-a="htc" title="HT Controls">⚙</button><button class="btn" data-a="mhist">History</button><button class="btn" data-a="mrd">MRD</button><button class="btn g" data-a="radd">+ Add</button></div>' : '<button class="btn g" data-a="radd">+ Add</button>'}</div>${ptab == 'beu' ? `<div class="gr">${L.map(recCard).join('')}</div>` : L.map(recCard).join('')}${L.length ? '' : '<p class="emp">Nothing here yet.</p>'}`;
}
const consultationSymptoms = [
  ['fever', 'គ្រុនក្តៅ'], ['cough', 'ក្អក'], ['headache', 'ឈឺក្បាល'], ['abdominal_pain', 'ឈឺពោះ'],
  ['vomiting', 'ក្អួត'], ['diarrhea', 'រាគ'], ['dizziness', 'វិលមុខ'], ['other_symptom', 'ផ្សេងៗ']
];
const consultationExams = [
  ['general_exam', 'ពិនិត្យទូទៅ'], ['respiratory_exam', 'ប្រព័ន្ធដង្ហើម'], ['cardiac_exam', 'បេះដូង'],
  ['abdominal_exam', 'ពោះ'], ['neurological_exam', 'ប្រព័ន្ធប្រសាទ'], ['other_exam', 'ផ្សេងៗ']
];
function consultationForm(mode = 'standard', record) {
  const editing = !!record, d = record ? jd(record) : {}, patient = curPt();
  const title = mode == 'md' ? 'ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)' : 'ទម្រង់ពិគ្រោះជំងឺ';
  const checkGroup = (label, key, options) => `<fieldset class="consultation-fieldset"><legend>${label}</legend><div class="consultation-checkbox-grid">${options.map(([value, text]) => fCb(text, key, (d[key] || []).includes(value), value)).join('')}</div></fieldset>`;
  const patientSex = patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : 'មិនមាន';
  const profile = `<div class="consultation-patient-summary"><b>ឈ្មោះ៖ ${esc(patient.name)}</b><span>អាយុ៖ ${esc(fmtAge(patient))}</span><span>ភេទ៖ ${patientSex}</span><span>លេខសម្គាល់៖ ${esc(patient.id)}</span></div>`;
  const intake = `<section class="consultation-form-section consultation-intake"><div class="consultation-intake-left">${profile}<b class="consultation-section-label">កំណត់ត្រាអ្នកជំងឺ</b><div class="consultation-intake-grid">${fIn('លេខសម្គាល់ / លេខកំណត់ត្រា', 'reference_note', d.reference_note || '')}${fIn('អាយុ', 'patient_age', d.patient_age || fmtAge(patient))}${fIn('ភេទ', 'patient_sex', d.patient_sex || patientSex)}${fIn('មុខរបរ', 'occupation', d.occupation || '')}${fIn('ទូរស័ព្ទ', 'patient_phone', d.patient_phone || patient.phone || '')}${fIn('អាសយដ្ឋាន', 'patient_address', d.patient_address || patient.addr || '')}${fIn('អ្នកពិនិត្យ', 'examined_by', d.examined_by || '')}</div></div><div class="consultation-intake-right">${checkGroup('ស្ថានភាពអ្នកជំងឺ', 'conditions', [['child', 'កុមារ'], ['adult', 'មនុស្សពេញវ័យ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']])}<div class="consultation-time-grid">${fIn('ម៉ោងចូល', 'start_time', d.start_time || '', 'time')}${fIn('ម៉ោងចេញ', 'end_time', d.end_time || '', 'time')}</div></div></section>`;
  const complaint = `<section class="consultation-form-section"><label class="consultation-section-label" for="consultation-summary">ការពិគ្រោះ និងរោគសញ្ញា</label><textarea class="in" id="consultation-summary" name="chief_complaint" rows="3">${esc(d.chief_complaint || '')}</textarea><div class="consultation-symptom-row">${consultationSymptoms.slice(0, 5).map(([value, text]) => fCb(text, 'symptoms', (d.symptoms || []).includes(value), value)).join('')}</div></section>`;
  const examInputs = `<div class="consultation-exam-fields">${fIn('ក្បាល', 'exam_head', d.exam_head || '')}${fIn('ទ្រូង', 'exam_chest', d.exam_chest || '')}${fIn('បេះដូង', 'exam_heart', d.exam_heart || '')}${fIn('ពោះ', 'exam_abdomen', d.exam_abdomen || '')}${fIn('ដង្ហើម', 'exam_breathing', d.exam_breathing || '')}${fIn('ស្បែក', 'exam_skin', d.exam_skin || '')}${fIn('ផ្សេងៗ', 'exam_other', d.exam_other || '')}</div>`;
  const examination = `<section class="consultation-form-section"><div class="consultation-assessment-columns"><div><label class="consultation-section-label" for="consultation-medical-history">ការកត់ត្រា</label><textarea class="in" id="consultation-medical-history" name="medical_history" rows="4">${esc(d.medical_history || '')}</textarea></div><div><b class="consultation-side-heading">ការពិនិត្យរាងកាយ</b>${examInputs}</div></div></section>`;
  const classification = `<section class="consultation-form-section consultation-classification"><div class="consultation-classification-left">${checkGroup('លទ្ធផល IMCI', 'imci_status', [['yes', 'បាន'], ['no', 'មិនបាន']])}${checkGroup('កម្រិតស្ថានភាព', 'risk_flags', [['normal', 'ធម្មតា'], ['mild', 'ស្រាល'], ['moderate', 'មធ្យម']])}</div><div class="consultation-classification-right">${checkGroup('ការវាយតម្លៃហានិភ័យ', 'screening_flags', [['danger', 'សញ្ញាគ្រោះថ្នាក់'], ['refer', 'ត្រូវបញ្ជូន'], ['followup', 'ត្រូវតាមដាន'], ['none', 'គ្មាន']])}</div></section>`;
  const status = `<section class="consultation-form-section consultation-status-section"><b class="consultation-section-label">ប្រវត្តិសុខភាព</b>${checkGroup('', 'history_flags', [['fever', 'គ្រុនក្តៅ'], ['cough', 'ក្អក'], ['diarrhea', 'រាគ'], ['vomiting', 'ក្អួត'], ['pain', 'ឈឺចាប់'], ['weakness', 'អស់កម្លាំង'], ['chronic', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']])}${fIn('បញ្ហាផ្សេងៗ សូមបញ្ជាក់', 'history_other', d.history_other || '')}</section>`;
  const questions = `<section class="consultation-form-section consultation-questions"><div class="consultation-question-column"><b>តើអ្នកធ្លាប់មានជំងឺនេះពីមុនដែរឬទេ?</b>${checkGroup('', 'previous_condition', [['yes', 'បាទ/ចាស'], ['no', 'ទេ']])}<div class="consultation-question-inputs">${fIn('ជំងឺពីមុន', 'previous_condition_detail', d.previous_condition_detail || '')}${fIn('រយៈពេល', 'previous_condition_duration', d.previous_condition_duration || '')}</div></div><div class="consultation-question-column"><b>តើមានប្រវត្តិជំងឺក្នុងគ្រួសារដែរឬទេ?</b>${checkGroup('', 'family_condition', [['yes', 'បាទ/ចាស'], ['no', 'ទេ']])}<div class="consultation-question-inputs">${fIn('ប្រភេទឈាម RH វិជ្ជមាន', 'rh_positive', d.rh_positive || '')}${fIn('ប្រភេទឈាម RH អវិជ្ជមាន', 'rh_negative', d.rh_negative || '')}</div></div></section>`;
  const standard = `<section class="consultation-form-section consultation-final-note"><label class="consultation-section-label" for="consultation-plan">ការសន្និដ្ឋាន និងការណែនាំ</label><textarea class="in" id="consultation-plan" name="treatment_plan" rows="3">${esc(d.treatment_plan || '')}</textarea><div class="consultation-final-dates">${fIn('ថ្ងៃណាត់ពិនិត្យបន្ទាប់', 'followup_date', d.followup_date || '', 'date')}${fIn('ការវាយតម្លៃ / រោគវិនិច្ឆ័យ', 'assessment', d.assessment || '')}</div></section>`;
  const mdCheckGroup = (key, options, selected = d[key] || [], className = '') => `<div class="md-consultation-checks ${className}">${options.map(([value, text]) => fCb(text, key, selected.includes(value), value)).join('')}</div>`;
  const mdField = (label, key, value, type = 'text', unit = '') => `<label class="md-inline-field">${label}<input class="in" name="${key}" type="${type}" value="${esc(value || '')}">${unit ? `<span>${unit}</span>` : ''}</label>`;
  const mdVisitTypes = [['new', 'ពិនិត្យថ្មី'], ['followup', 'ពិនិត្យតាមដាន']];
  const mdPhysicalExam = [
    ['general_exam', 'ការពិនិត្យទូទៅ'], ['respiratory_exam', 'ប្រព័ន្ធដង្ហើម'], ['cardiac_exam', 'បេះដូង'],
    ['abdominal_exam', 'ពោះ'], ['neurological_exam', 'ប្រព័ន្ធប្រសាទ'], ['skin_exam', 'ស្បែក'],
    ['eye_exam', 'ភ្នែក'], ['ear_exam', 'ត្រចៀក'], ['throat_exam', 'បំពង់ក'],
    ['nutrition_exam', 'អាហារូបត្ថម្ភ'], ['pregnancy_exam', 'ការពិនិត្យផ្ទៃពោះ']
  ];
  const [startHour = '', startMinute = ''] = String(d.start_time || '').split(':');
  const [endHour = '', endMinute = ''] = String(d.end_time || '').split(':');
  const mdForm = `<div class="md-consultation-scroll"><input type="hidden" name="date" value="${esc(record && record.date || nowLocal())}"><input type="hidden" name="consultation_mode" value="md">
    <section class="md-consultation-intake">
      <div class="md-consultation-patient">${mdField('ឈ្មោះ៖', 'patient_name', d.patient_name || patient.name)}${mdField('អាយុ៖', 'patient_age', d.patient_age || fmtAge(patient))}${mdField('ភេទ៖', 'patient_sex', d.patient_sex || patientSex)}</div>
      <div class="md-consultation-conditions">${mdCheckGroup('conditions', [['child', 'កុមារតូច'], ['adult', 'កុមារធំ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']])}</div>
      <label class="md-consultation-complaint">អាការៈជំងឺ៖<textarea class="in" name="chief_complaint" rows="1">${esc(d.chief_complaint || '')}</textarea></label>
      <div class="md-consultation-vitals">${mdField('សម្ពាធឈាម៖', 'blood_pressure', d.blood_pressure, 'text', 'mmHg')}${mdField('កម្ពស់៖', 'height', d.height, 'number', 'សម.')}${mdField('ទម្ងន់៖', 'weight', d.weight, 'number', 'គក.')}${mdField('ជីពចរ៖', 'pulse', d.pulse, 'number', 'ដង/នាទី')}${mdField('ដង្ហើម៖', 'respiratory_rate', d.respiratory_rate, 'number', 'ដង/នាទី')}${mdField('សីតុណ្ហភាព៖', 'temperature', d.temperature, 'number', '°C')}${mdField('អុកស៊ីសែនក្នុងឈាម៖', 'oxygen_saturation', d.oxygen_saturation, 'number', '%')}${mdField('លេខសម្គាល់៖', 'reference_note', d.reference_note)}</div>
      <div class="md-consultation-times"><div>${mdField('ម៉ោងចូល៖', 'start_hour', startHour)}<span>:</span>${mdField('', 'start_minute', startMinute)}</div><div>${mdField('ម៉ោងចេញ៖', 'end_hour', endHour)}<span>:</span>${mdField('', 'end_minute', endMinute)}</div></div>
    </section>
    <table class="md-consultation-table"><tbody>
      <tr><th><label class="cb"><input type="checkbox" name="md_sections" value="consultation" ${(d.md_sections || []).includes('consultation') ? 'checked' : ''}> ពិគ្រោះព្យាបាល</label></th><td><div class="md-consultation-detail"><span>លើកទី៖</span>${mdField('', 'visit_number', d.visit_number)}${mdCheckGroup('visit_type', mdVisitTypes)}${mdCheckGroup('consult_type', [['mother', 'សេវាមាតា'], ['child', 'សេវាទារក']])}</div></td></tr>
      <tr><th><label class="cb"><input type="checkbox" name="md_sections" value="survey" ${(d.md_sections || []).includes('survey') ? 'checked' : ''}> សាកសួរ</label></th><td><div class="md-consultation-survey"><div><span>ភេទ៖</span>${mdCheckGroup('survey_sex', [['male', 'ប្រុស'], ['female', 'ស្រី']])}</div><div><span>ស្ថានភាព៖</span>${mdCheckGroup('conditions', [['child', 'កុមារតូច'], ['adult', 'កុមារធំ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']])}</div><div><span>រោគសញ្ញា៖</span>${mdCheckGroup('symptoms', consultationSymptoms)}</div><div><span>ប្រវត្តិជំងឺ៖</span>${mdCheckGroup('history_flags', [['fever', 'ក្តៅខ្លួន'], ['cough', 'ក្អក'], ['vomiting', 'ក្អួត'], ['diarrhea', 'រាគ'], ['pain', 'ឈឺចាប់'], ['weakness', 'អស់កម្លាំង'], ['chronic', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']])}</div><div class="md-consultation-detail"><span>ជំងឺពីមុន៖</span>${mdCheckGroup('previous_condition', [['yes', 'មាន'], ['no', 'គ្មាន']])}${mdField('បញ្ជាក់៖', 'previous_condition_detail', d.previous_condition_detail)}${mdField('រយៈពេល៖', 'previous_condition_duration', d.previous_condition_duration)}</div><div><span>ប្រវត្តិគ្រួសារ៖</span>${mdCheckGroup('family_condition', [['yes', 'មាន'], ['no', 'គ្មាន']])}${mdField('RH+៖', 'rh_positive', d.rh_positive)}${mdField('RH-៖', 'rh_negative', d.rh_negative)}</div></div></td></tr>
      <tr class="md-consultation-full-row"><th colspan="2"><label class="cb"><input type="checkbox" name="md_sections" value="history" ${(d.md_sections || []).includes('history') ? 'checked' : ''}> ប្រវត្តិសុខភាពមុន</label><textarea class="in" name="medical_history" rows="1">${esc(d.medical_history || '')}</textarea></th></tr>
      <tr><th><label class="cb"><input type="checkbox" name="md_sections" value="mother_visit" ${(d.md_sections || []).includes('mother_visit') ? 'checked' : ''}> ការពិនិត្យសុខភាពមាតា-មុន</label></th><td><div class="md-consultation-detail"><span>លើកទី៖</span>${mdField('', 'mother_visit_number', d.mother_visit_number)}<span>រយៈពេល៖</span>${mdField('', 'mother_visit_months', d.mother_visit_months)}<span>ខែ</span>${mdField('', 'mother_visit_days', d.mother_visit_days)}<span>ថ្ងៃ</span>${mdField('សម្គាល់៖', 'mother_visit_note', d.mother_visit_note)}</div></td></tr>
      <tr><th><label class="cb"><input type="checkbox" name="md_sections" value="child_visit" ${(d.md_sections || []).includes('child_visit') ? 'checked' : ''}> ការពិនិត្យសុខភាពមាតា-ក្រោយ</label></th><td><div class="md-consultation-detail"><span>លើកទី៖</span>${mdField('', 'child_visit_number', d.child_visit_number)}<span>រយៈពេល៖</span>${mdField('', 'child_visit_months', d.child_visit_months)}<span>ខែ</span>${mdField('', 'child_visit_days', d.child_visit_days)}<span>ថ្ងៃ</span>${mdField('សម្គាល់៖', 'child_visit_note', d.child_visit_note)}</div></td></tr>
      <tr><th><label class="cb"><input type="checkbox" name="md_sections" value="exam" ${(d.md_sections || []).includes('exam') ? 'checked' : ''}> ការពិនិត្យរាងកាយ</label></th><td>${mdCheckGroup('examinations', mdPhysicalExam, d.examinations || [], 'md-consultation-exam-grid')}</td></tr>
    </tbody></table>
  </div>`;
  const formBody = mode == 'md' ? mdForm : `<div class="consultation-form-scroll"><div class="consultation-form">${intake}${complaint}${examination}${classification}${status}${questions}${standard}</div></div>`;
  openForm(title, formBody, async (form) => {
    const values = new FormData(form), data = { ...(mode == 'md' ? d : {}), consultation_mode: mode };
    ['chief_complaint', 'medical_history', 'past_history', 'medication_allergy', 'assessment', 'treatment_plan', 'followup_date', 'notes', 'blood_pressure', 'pulse', 'respiratory_rate', 'temperature', 'height', 'weight', 'oxygen_saturation', 'investigations', 'patient_name', 'patient_phone', 'patient_age', 'patient_sex', 'occupation', 'patient_address', 'examined_by', 'reference_note', 'start_time', 'end_time', 'exam_head', 'exam_chest', 'exam_heart', 'exam_abdomen', 'exam_breathing', 'exam_skin', 'exam_other', 'history_other', 'previous_condition_detail', 'previous_condition_duration', 'rh_positive', 'rh_negative', 'visit_number', 'mother_visit_number', 'mother_visit_months', 'mother_visit_days', 'mother_visit_note', 'child_visit_number', 'child_visit_months', 'child_visit_days', 'child_visit_note'].forEach((key) => {
      const value = values.get(key);
      if (value != null) data[key] = String(value);
    });
    data.symptoms = values.getAll('symptoms');
    data.conditions = values.getAll('conditions');
    data.examinations = values.getAll('examinations');
    data.visit_type = values.getAll('visit_type');
    data.consult_type = values.getAll('consult_type');
    data.survey_sex = values.getAll('survey_sex');
    if (mode == 'md') {
      const timeValue = (hour, minute) => {
        const h = String(hour || '').trim(), m = String(minute || '').trim();
        return h || m ? `${h.padStart(2, '0')}:${m.padStart(2, '0')}` : '';
      };
      data.start_time = timeValue(values.get('start_hour'), values.get('start_minute'));
      data.end_time = timeValue(values.get('end_hour'), values.get('end_minute'));
    }
    data.imci_status = values.getAll('imci_status');
    data.history_flags = values.getAll('history_flags');
    data.risk_flags = values.getAll('risk_flags');
    data.screening_flags = values.getAll('screening_flags');
    data.previous_condition = values.getAll('previous_condition');
    data.family_condition = values.getAll('family_condition');
    data.md_sections = values.getAll('md_sections');
    const body = { patient_id: pdId, kind: 'consultation', title, date: values.get('date') || nowLocal(), notes: data.notes, data };
    editing ? await api('PUT', 'records/' + record.id, body) : await api('POST', 'records', body);
    await loadRecs(); render(); toast('Saved');
  }, { cls: mode == 'md' ? 'md-consultation-dialog' : 'xl consultation-form-dialog', close: true, hideCancel: true, ok: editing ? 'រក្សាទុកការកែប្រែ' : 'រក្សាទុក', extra: '<button type="button" class="btn" data-a="consultation-print">▧ បោះពុម្ព</button>' });
}
function consultationFormPicker() {
  const options = [
    ['consult-select:standard', 'ទម្រង់ពិគ្រោះជំងឺ', 'បើកទម្រង់ពិគ្រោះទូទៅ'],
    ['consult-select:md', 'ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)', 'បំពេញព័ត៌មានសុខភាពមាតា និងទារក'],
    ['consult-select:clinic', 'ទម្រង់ពិគ្រោះគ្លីនិក', 'បើកទម្រង់គ្លីនិក និងប្រវត្តិអ្នកជំងឺ']
  ];
  openForm('ជ្រើសរើសទម្រង់ពិគ្រោះ', `<div class="consultation-form-picker">${options.map(([action, label, help]) => `<button type="button" class="consultation-form-option" data-a="${action}"><b>${label}</b><span>${help}</span></button>`).join('')}</div>`, async () => {}, { ok: 'បិទ' });
}
function consultationPrint() {
  const form = $('#mf'), values = new FormData(form), rows = [];
  if (values.get('consultation_mode') == 'md') {
    const choices = {
      conditions: [['child', 'កុមារតូច'], ['adult', 'កុមារធំ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
      symptoms: consultationSymptoms,
      history_flags: [['fever', 'ក្តៅខ្លួន'], ['cough', 'ក្អក'], ['vomiting', 'ក្អួត'], ['diarrhea', 'រាគ'], ['pain', 'ឈឺចាប់'], ['weakness', 'អស់កម្លាំង'], ['chronic', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
      previous_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
      family_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
      survey_sex: [['male', 'ប្រុស'], ['female', 'ស្រី']],
      visit_type: [['new', 'ពិនិត្យថ្មី'], ['followup', 'ពិនិត្យតាមដាន']],
      consult_type: [['mother', 'សេវាមាតា'], ['child', 'សេវាទារក']],
      examinations: [
        ['general_exam', 'ការពិនិត្យទូទៅ'], ['respiratory_exam', 'ប្រព័ន្ធដង្ហើម'], ['cardiac_exam', 'បេះដូង'],
        ['abdominal_exam', 'ពោះ'], ['neurological_exam', 'ប្រព័ន្ធប្រសាទ'], ['skin_exam', 'ស្បែក'],
        ['eye_exam', 'ភ្នែក'], ['ear_exam', 'ត្រចៀក'], ['throat_exam', 'បំពង់ក'],
        ['nutrition_exam', 'អាហារូបត្ថម្ភ'], ['pregnancy_exam', 'ការពិនិត្យផ្ទៃពោះ']
      ]
    };
    const checkedOptions = (key) => {
      const selected = new Set(values.getAll(key));
      return (choices[key] || []).map(([value, label]) => `<span class="md-print-choice"><i class="md-print-box">${selected.has(value) ? '✓' : ''}</i>${esc(label)}</span>`).join('');
    };
    const field = (label, key, unit = '') => {
      const value = values.get(key);
      return `<span class="md-print-field"><span>${esc(label)}</span><b>${value ? esc(value) : '&nbsp;'}</b>${unit ? `<span>${esc(unit)}</span>` : ''}</span>`;
    };
    const timeField = (label, hourKey, minuteKey) => {
      const hour = String(values.get(hourKey) || '').trim(), minute = String(values.get(minuteKey) || '').trim();
      const time = hour || minute ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : '';
      return `<span class="md-print-field"><span>${esc(label)}</span><b>${time ? esc(time) : '&nbsp;'}</b></span>`;
    };
    const text = (key) => esc(values.get(key) || '');
    const header = `<div class="md-print-header"><h1>ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)</h1></div>`;
    const top = `<section class="md-print-top"><div class="md-print-top-left">
      <div>${field('ឈ្មោះ៖', 'patient_name')}${field('អាយុ៖', 'patient_age')}${field('ភេទ៖', 'patient_sex')}</div>
      <div>${field('អាការៈជំងឺ៖', 'chief_complaint')}</div>
      <div>${field('សម្ពាធឈាម៖', 'blood_pressure', 'mmHg')}${field('កម្ពស់៖', 'height', 'សម.')}${field('ទម្ងន់៖', 'weight', 'គក.')}</div>
      <div>${field('ជីពចរ៖', 'pulse', 'ដង/នាទី')}${field('ដង្ហើម៖', 'respiratory_rate', 'ដង/នាទី')}</div>
      <div>${field('កម្ដៅ៖', 'temperature', '°C')}${field('អុកស៊ីសែនក្នុងឈាម៖', 'oxygen_saturation', '%')}${field('លេខសម្គាល់៖', 'reference_note')}</div>
    </div><div class="md-print-top-right">
      <div class="md-print-choices">${checkedOptions('conditions')}</div>
      <div>${timeField('ម៉ោងចូល៖', 'start_hour', 'start_minute')}${timeField('ម៉ោងចេញ៖', 'end_hour', 'end_minute')}</div>
    </div></section>`;
    const rows = [
      `<tr><th><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('consultation') ? '✓' : ''}</i>ពិគ្រោះព្យាបាល</span></th><td>${field('លើកទី៖', 'visit_number')}${checkedOptions('visit_type')}${checkedOptions('consult_type')}</td></tr>`,
      `<tr><th><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('survey') ? '✓' : ''}</i>សាកសួរ</span></th><td><div>ភេទ៖ ${checkedOptions('survey_sex')}</div><div>ស្ថានភាព៖ ${checkedOptions('conditions')}</div><div>រោគសញ្ញា៖ ${checkedOptions('symptoms')}</div><div>ប្រវត្តិជំងឺ៖ ${checkedOptions('history_flags')}</div><div>ជំងឺពីមុន៖ ${checkedOptions('previous_condition')}${field('បញ្ជាក់៖', 'previous_condition_detail')}${field('រយៈពេល៖', 'previous_condition_duration')}</div><div>ប្រវត្តិគ្រួសារ៖ ${checkedOptions('family_condition')}${field('RH+៖', 'rh_positive')}${field('RH-៖', 'rh_negative')}</div></td></tr>`,
      `<tr><th colspan="2"><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('history') ? '✓' : ''}</i>ប្រវត្តិសុខភាពមុន</span><span class="md-print-inline-value">${text('medical_history') || '&nbsp;'}</span></th></tr>`,
      `<tr><th><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('mother_visit') ? '✓' : ''}</i>ការពិនិត្យសុខភាពមាតា-មុន</span></th><td>${field('លើកទី៖', 'mother_visit_number')}${field('រយៈពេល៖', 'mother_visit_months', 'ខែ')}${field('', 'mother_visit_days', 'ថ្ងៃ')}${field('សម្គាល់៖', 'mother_visit_note')}</td></tr>`,
      `<tr><th><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('child_visit') ? '✓' : ''}</i>ការពិនិត្យសុខភាពមាតា-ក្រោយ</span></th><td>${field('លើកទី៖', 'child_visit_number')}${field('រយៈពេល៖', 'child_visit_months', 'ខែ')}${field('', 'child_visit_days', 'ថ្ងៃ')}${field('សម្គាល់៖', 'child_visit_note')}</td></tr>`,
      `<tr><th><span class="md-print-choice"><i class="md-print-box">${values.getAll('md_sections').includes('exam') ? '✓' : ''}</i>ការពិនិត្យរាងកាយ</span></th><td class="md-print-exams">${checkedOptions('examinations')}</td></tr>`
    ].join('');
    const html = `<style>@page{size:A4 portrait;margin:12mm}@media print{#pa{padding:0!important;font-family:"Noto Sans Khmer",Inter,system-ui,sans-serif;font-size:10pt;color:#111}}</style><div class="md-consultation-print">${header}${top}<table><colgroup><col style="width:28%"><col style="width:72%"></colgroup><tbody>${rows}</tbody></table></div>`;
    printDoc('', html, { headerHtml: '<div class="md-print-no-clinic-header"></div>' });
    return;
  }
  if (values.get('consultation_mode') != 'clinic') {
    const clinic = D.clinic || {};
    const choiceOptions = {
      conditions: [['child', 'កុមារតូច'], ['adult', 'កុមារធំ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
      symptoms: consultationSymptoms,
      history_flags: [['fever', 'គ្រុនក្តៅ'], ['cough', 'ក្អក'], ['diarrhea', 'រាគ'], ['vomiting', 'ក្អួត'], ['pain', 'ឈឺចាប់'], ['weakness', 'អស់កម្លាំង'], ['chronic', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
      imci_status: [['yes', 'បាន'], ['no', 'មិនបាន']],
      risk_flags: [['normal', 'ធម្មតា'], ['mild', 'ស្រាល'], ['moderate', 'មធ្យម']],
      screening_flags: [['danger', 'សញ្ញាគ្រោះថ្នាក់'], ['refer', 'ត្រូវបញ្ជូន'], ['followup', 'ត្រូវតាមដាន'], ['none', 'គ្មាន']],
      previous_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
      family_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
      survey_sex: [['male', 'ប្រុស'], ['female', 'ស្រី']],
      visit_type: [['new', 'ពិនិត្យថ្មី'], ['followup', 'ពិនិត្យតាមដាន']],
      consult_type: [['mother', 'សេវាមាតា'], ['child', 'សេវាទារក']],
      examinations: consultationExams
    };
    const checks = (key) => {
      const selected = new Set(values.getAll(key));
      return (choiceOptions[key] || []).map(([value, label]) => `<span class="consultation-print-choice"><i>${selected.has(value) ? '✓' : ''}</i>${esc(label)}</span>`).join('');
    };
    const printField = (label, key, unit = '') => {
      const value = values.get(key);
      return `<span class="consultation-print-field"><span>${esc(label)}</span><b>${value ? esc(value) : '&nbsp;'}</b>${unit ? `<span>${esc(unit)}</span>` : ''}</span>`;
    };
    const optionalFields = (fields) => fields.filter(([, key]) => values.get(key)).map(([label, key, unit]) => printField(label, key, unit || '')).join('');
    const printText = (key) => esc(values.get(key) || '');
    const logo = clinic.logo ? `<img src="${API_BASE}/uploads/${esc(clinic.logo)}" alt="">` : '';
    const header = `<header class="consultation-print-header"><div class="consultation-print-clinic">${esc(clinic.name || '')}${clinic.specialty ? `<small>${esc(clinic.specialty)}</small>` : ''}</div><div class="consultation-print-logo">${logo}</div><h1>ទម្រង់ពិគ្រោះជំងឺ</h1><div class="consultation-print-date">${esc((values.get('date') || '').replace('T', ' '))}</div></header>`;
    const patient = `<section class="consultation-print-patient">
      <div class="consultation-print-patient-main">${printField('ឈ្មោះ៖', 'patient_name')}${printField('អាយុ៖', 'patient_age')}${printField('ភេទ៖', 'patient_sex')}</div>
      <div class="consultation-print-demographics">${printField('លេខសម្គាល់៖', 'reference_note')}${printField('ទូរស័ព្ទ៖', 'patient_phone')}${printField('អាសយដ្ឋាន៖', 'patient_address')}${printField('មុខរបរ៖', 'occupation')}${printField('អ្នកពិនិត្យ៖', 'examined_by')}</div>
      <div class="consultation-print-vitals">${printField('សម្ពាធឈាម៖', 'blood_pressure', 'mmHg')}${printField('កម្ពស់៖', 'height', 'សម.')}${printField('ទម្ងន់៖', 'weight', 'គក.')}${printField('ជីពចរ៖', 'pulse', 'ដង/នាទី')}${printField('ដង្ហើម៖', 'respiratory_rate', 'ដង/នាទី')}${printField('កម្ដៅ៖', 'temperature', '°C')}${printField('អុកស៊ីសែន៖', 'oxygen_saturation', '%')}</div>
      <div class="consultation-print-visit">${printField('ម៉ោងចូល៖', 'start_time')}${printField('ម៉ោងចេញ៖', 'end_time')}${printField('លើកទី៖', 'visit_number')}${checks('visit_type')}${checks('consult_type')}${checks('conditions')}${optionalFields([['ពិនិត្យមាតា លើកទី៖', 'mother_visit_number'], ['រយៈពេល៖', 'mother_visit_months'], ['ថ្ងៃ៖', 'mother_visit_days'], ['ពិនិត្យទារក លើកទី៖', 'child_visit_number'], ['រយៈពេល៖', 'child_visit_months'], ['ថ្ងៃ៖', 'child_visit_days']])}</div>
    </section>`;
    const examFields = [['ក្បាល', 'exam_head'], ['ទ្រូង', 'exam_chest'], ['បេះដូង', 'exam_heart'], ['ពោះ', 'exam_abdomen'], ['ដង្ហើម', 'exam_breathing'], ['ស្បែក', 'exam_skin'], ['ផ្សេងៗ', 'exam_other']]
      .map(([label, key]) => printField(`${label}៖`, key)).join('');
    const table = `<table class="consultation-print-table"><colgroup><col class="consultation-print-label-col"><col class="consultation-print-content-col"><col class="consultation-print-content-col"></colgroup><tbody>
      <tr class="consultation-print-main-row"><th>ពិគ្រោះព្យាបាល</th><td><b>អាការៈជំងឺ៖</b><div class="consultation-print-writing">${printText('chief_complaint') || '&nbsp;'}</div><b>ប្រវត្តិជំងឺបច្ចុប្បន្ន៖</b><div class="consultation-print-writing">${printText('medical_history') || '&nbsp;'}</div>${optionalFields([['ប្រវត្តិជំងឺពីមុន៖', 'past_history']])}</td><td><b>ការពិនិត្យរាងកាយ៖</b><div class="consultation-print-exam-fields">${examFields}</div><div class="consultation-print-checks">${checks('examinations')}</div></td></tr>
      <tr class="consultation-print-classification-row"><th>ការវាយតម្លៃស្ថានភាព</th><td><b>លទ្ធផល IMCI៖</b><div class="consultation-print-checks">${checks('imci_status')}</div><b>កម្រិតស្ថានភាព៖</b><div class="consultation-print-checks">${checks('risk_flags')}</div><b>ភេទ៖</b><div class="consultation-print-checks">${checks('survey_sex')}</div><b>រោគសញ្ញា៖</b><div class="consultation-print-checks">${checks('symptoms')}</div></td><td><b>ប្រវត្តិ និងការវាយតម្លៃហានិភ័យ៖</b><div class="consultation-print-checks">${checks('history_flags')}${checks('screening_flags')}</div><div class="consultation-print-writing">${printText('history_other') || '&nbsp;'}</div></td></tr>
      <tr class="consultation-print-history-row"><th>ប្រវត្តិជំងឺមុន និងគ្រួសារ</th><td><b>ធ្លាប់មានជំងឺនេះពីមុន៖</b><div class="consultation-print-checks">${checks('previous_condition')}</div>${printField('ជំងឺពីមុន៖', 'previous_condition_detail')}${printField('រយៈពេល៖', 'previous_condition_duration')}</td><td><b>ប្រវត្តិជំងឺក្នុងគ្រួសារ៖</b><div class="consultation-print-checks">${checks('family_condition')}</div>${printField('RH វិជ្ជមាន៖', 'rh_positive')}${printField('RH អវិជ្ជមាន៖', 'rh_negative')}</td></tr>
      <tr class="consultation-print-plan-row"><th>ការព្យាបាល</th><td colspan="2"><div class="consultation-print-writing">${printText('treatment_plan') || '&nbsp;'}</div>${printField('ការពិនិត្យបន្ថែម៖', 'investigations')}${printField('វាយតម្លៃ / រោគវិនិច្ឆ័យ៖', 'assessment')}${printField('ថ្ងៃណាត់ពិនិត្យបន្ទាប់៖', 'followup_date')}${printField('កំណត់ចំណាំ៖', 'notes')}</td></tr>
    </tbody></table><footer class="consultation-print-signatures"><span>ថ្ងៃខែឆ្នាំ៖ …… / …… / ……</span><span>ហត្ថលេខា និងឈ្មោះអ្នកពិនិត្យ</span></footer>`;
    const html = `<style>@page{size:A4 portrait;margin:10mm}@media print{#pa{padding:0!important;font-family:"Noto Sans Khmer",Inter,system-ui,sans-serif;font-size:9pt;color:#111}}</style><div class="consultation-template-print">${header}${patient}${table}</div>`;
    printDoc('', html, { headerHtml: '<div class="consultation-template-no-clinic-header"></div>' });
    return;
  }
  for (const [label, key] of [['កាលបរិច្ឆេទ', 'date'], ['ឈ្មោះអ្នកជំងឺ', 'patient_name'], ['អាយុ', 'patient_age'], ['ភេទ', 'patient_sex'], ['លេខសម្គាល់', 'reference_note'], ['លើកទី', 'visit_number'], ['ការពិនិត្យមាតា-លើកទី', 'mother_visit_number'], ['រយៈពេលពិនិត្យមាតា-ខែ', 'mother_visit_months'], ['រយៈពេលពិនិត្យមាតា-ថ្ងៃ', 'mother_visit_days'], ['ការពិនិត្យទារក-លើកទី', 'child_visit_number'], ['រយៈពេលពិនិត្យទារក-ខែ', 'child_visit_months'], ['រយៈពេលពិនិត្យទារក-ថ្ងៃ', 'child_visit_days'], ['ម៉ោងចូល', 'start_time'], ['ម៉ោងចេញ', 'end_time'], ['អាការៈជំងឺ', 'chief_complaint'], ['ប្រវត្តិជំងឺបច្ចុប្បន្ន', 'medical_history'], ['ប្រវត្តិជំងឺពីមុន', 'past_history'], ['ជំងឺពីមុន', 'previous_condition_detail'], ['រយៈពេល', 'previous_condition_duration'], ['ប្រវត្តិជំងឺក្នុងគ្រួសារ RH វិជ្ជមាន', 'rh_positive'], ['ប្រវត្តិជំងឺក្នុងគ្រួសារ RH អវិជ្ជមាន', 'rh_negative'], ['ប្រវត្តិផ្សេងៗ', 'history_other'], ['សម្ពាធឈាម (mmHg)', 'blood_pressure'], ['ជីពចរ', 'pulse'], ['អត្រាដង្ហើម', 'respiratory_rate'], ['សីតុណ្ហភាព (°C)', 'temperature'], ['កម្ពស់', 'height'], ['ទម្ងន់', 'weight'], ['អុកស៊ីសែនក្នុងឈាម (%)', 'oxygen_saturation'], ['ការវាយតម្លៃ / រោគវិនិច្ឆ័យ', 'assessment'], ['ការពិនិត្យបន្ថែម', 'investigations'], ['ការព្យាបាល និងការណែនាំ', 'treatment_plan'], ['ថ្ងៃណាត់ពិនិត្យបន្ទាប់', 'followup_date'], ['កំណត់ចំណាំ', 'notes']]) {
    const value = values.get(key);
    if (value) rows.push([label, value]);
  }
  const choiceLabels = {
    conditions: [['child', 'កុមារតូច'], ['adult', 'កុមារធំ'], ['pregnant', 'មានផ្ទៃពោះ'], ['breastfeeding', 'បំបៅដោះកូន'], ['chronic_disease', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
    symptoms: consultationSymptoms,
    history_flags: [['fever', 'ក្តៅខ្លួន'], ['cough', 'ក្អក'], ['vomiting', 'ក្អួត'], ['diarrhea', 'រាគ'], ['pain', 'ឈឺចាប់'], ['weakness', 'អស់កម្លាំង'], ['chronic', 'ជំងឺរ៉ាំរ៉ៃ'], ['other', 'ផ្សេងៗ']],
    previous_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
    family_condition: [['yes', 'មាន'], ['no', 'គ្មាន']],
    survey_sex: [['male', 'ប្រុស'], ['female', 'ស្រី']],
    visit_type: [['new', 'ពិនិត្យថ្មី'], ['followup', 'ពិនិត្យតាមដាន']],
    consult_type: [['mother', 'សេវាមាតា'], ['child', 'សេវាទារក']],
    examinations: consultationExams
  };
  for (const [key, label] of [['conditions', 'ស្ថានភាពអ្នកជំងឺ'], ['symptoms', 'រោគសញ្ញា'], ['history_flags', 'ប្រវត្តិជំងឺ'], ['previous_condition', 'ជំងឺពីមុន'], ['family_condition', 'ប្រវត្តិជំងឺក្នុងគ្រួសារ'], ['survey_sex', 'ភេទ'], ['visit_type', 'ប្រភេទការពិនិត្យ'], ['consult_type', 'ប្រភេទសេវា'], ['examinations', 'ការពិនិត្យរាងកាយ']]) {
    const selected = values.getAll(key);
    if (selected.length) rows.push([label, selected.map((value) => (choiceLabels[key].find(([option]) => option == value) || [value, value])[1]).join(', ')]);
  }
  printDoc(values.get('consultation_mode') == 'md' ? 'ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)' : 'ទម្រង់ពិគ្រោះជំងឺ', ptBlock(curPt()) + kv(rows));
}
function patientSexLabel(patient) {
  return patient && patient.sex == 'M' ? 'ប្រុស' : patient && patient.sex == 'F' ? 'ស្រី' : 'មិនមាន';
}
function consultationHistoryPrint() {
  const patient = curPt(), history = recs.filter((r) => ['cnf', 'consultation', 'medical'].includes(r.kind)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows = history.map((r, i) => {
    const data = jd(r);
    return `<tr><td>${i + 1}</td><td>${esc((r.date || '').replace('T', ' '))}</td><td>${esc(patient && patient.name || '')}</td><td>${esc(data.chief_complaint || (data.prob || []).join(', ') || data.cc || r.notes || '')}</td><td>${esc(data.blood_pressure || '')}</td><td>${esc(data.assessment || data.as_ass || data.dx || '')}</td><td>${esc(data.treatment_plan || data.as_plan || '')}</td></tr>`;
  }).join('');
  printDoc('ប្រវត្តិពិគ្រោះជំងឺ', ptBlock(patient) + `<table class="pk full"><thead><tr><th>ល.រ</th><th>កាលបរិច្ឆេទ</th><th>ឈ្មោះអ្នកជំងឺ</th><th>រោគសញ្ញា</th><th>សម្ពាធឈាម</th><th>រោគវិនិច្ឆ័យ</th><th>ការព្យាបាល</th></tr></thead><tbody>${rows}</tbody></table>`);
}
const CENTER_COLUMNS = [
  ['date', 'ថ្ងៃខែ', 'date', 150],
  ['register_no', 'លេខបញ្ជី', 'text', 130],
  ['name', 'ឈ្មោះអ្នកជំងឺ', 'text', 150],
  ['identity', 'លេខអត្តសញ្ញាណ', 'text', 170],
  ['age', 'អាយុ', 'age', 150],
  ['sex', 'ភេទ', 'sex', 110],
  ['group', 'ក្រុម', 'group', 110],
  ['district', 'ទីកន្លែង (ស្រុក)', 'text', 130],
  ['address', 'អាសយដ្ឋាន/ភូមិ', 'text', 160],
  ['symptoms', 'បញ្ហា/រោគសញ្ញា', 'text', 150],
  ['examination', 'ការពិនិត្យ', 'text', 150],
  ['vaccine', 'ការចាក់វ៉ាក់សាំង', 'text', 150],
  ['contraception', 'ការពន្យារកំណើត', 'contraception', 130],
  ['imci', 'IMCI', 'check', 90],
  ['weight_height', 'ទម្ងន់/កម្ពស់', 'text', 140],
  ['weight_head', 'ទម្ងន់/ក្បាល', 'text', 140],
  ['other_problem', 'បញ្ហាផ្សេងៗ', 'text', 150],
  ['referral', 'បញ្ជូនទៅ', 'text', 150],
  ['notes', 'សម្គាល់', 'text', 150]
];
const CENTER_AGE_OPTIONS = ['០ - ២៨ថ្ងៃ', '២៩ថ្ងៃ - ១១ខែ', '១ - ៤ឆ្នាំ', '៥ - ១៤ឆ្នាំ', '១៥ - ២៤ឆ្នាំ', '២៥ - ៤៩ឆ្នាំ', '៥០ - ៦៤ឆ្នាំ', '≥៦៥ឆ្នាំ'];
let centerFormRows = [];
function centerCell(column, row, index) {
  const [key, , type] = column, name = `center_${key}_${index}`, value = row[key];
  if (type == 'age' || type == 'sex' || type == 'group' || type == 'contraception') {
    const options = type == 'age' ? CENTER_AGE_OPTIONS : type == 'sex' ? ['ប្រុស', 'ស្រី'] : type == 'contraception' ? ['បាទ/ចាស', 'ទេ'] : ['ក', 'ខ', 'គ'];
    return `<div class="center-checks">${options.map((option) => `<label class="cb"><input type="checkbox" name="${name}" value="${esc(option)}" ${(value || []).includes(option) ? 'checked' : ''}><span>${esc(option)}</span></label>`).join('')}</div>`;
  }
  if (type == 'check') return `<label class="center-single-check"><input type="checkbox" name="${name}" value="1" ${value ? 'checked' : ''} aria-label="IMCI"></label>`;
  return `<input class="in" name="${name}" type="${type}" value="${esc(value || '')}" aria-label="${esc(column[1])}">`;
}
function centerRowsHtml(rows, offset = 0) {
  return rows.map((row, index) => { const rowIndex = offset + index; return `<tr><td class="center-row-number">${rowIndex + 1}</td>${CENTER_COLUMNS.map((column) => `<td>${centerCell(column, row, rowIndex)}</td>`).join('')}<td><button type="button" class="btn s r" data-a="centerremoverow:${rowIndex}" aria-label="លុប">🗑</button></td></tr>`; }).join('');
}
function centerCollect(form, rows) {
  const values = new FormData(form);
  return rows.map((_, index) => Object.fromEntries(CENTER_COLUMNS.map(([key, , type]) => {
    const value = values.getAll(`center_${key}_${index}`);
    return [key, type == 'age' || type == 'sex' || type == 'group' || type == 'contraception' ? value : type == 'check' ? value.includes('1') : values.get(`center_${key}_${index}`) || ''];
  })));
}
function centerPrint(rows) {
  const optionsByType = {
    age: CENTER_AGE_OPTIONS,
    sex: ['ប្រុស', 'ស្រី'],
    group: ['ក', 'ខ', 'គ'],
    contraception: ['បាទ/ចាស', 'ទេ']
  };
  const columns = CENTER_COLUMNS.map(([key, label, type]) => ({
    key,
    label,
    options: optionsByType[type] || null,
    width: type == 'age' ? 5 : type == 'sex' || type == 'group' ? 6 : type == 'contraception' ? 8
      : ({ date: 16, register_no: 13, name: 21, identity: 16, district: 10, address: 10, symptoms: 14, examination: 14, vaccine: 14, imci: 7, weight_height: 12, weight_head: 12, other_problem: 12, referral: 12, notes: 10 }[key] || 12)
  }));
  const groupHeadings = columns.map(({ label, options }) => options
    ? `<th colspan="${options.length}">${esc(label)}</th>`
    : `<th rowspan="2">${esc(label)}</th>`).join('');
  const subHeadings = columns.flatMap(({ options }) => options || []).map((label) => `<th class="center-print-option"><span>${esc(label)}</span></th>`).join('');
  const printColumns = columns.flatMap(({ key, options }) => options
    ? options.map((option) => ({ key, option }))
    : [{ key }]);
  const widths = columns.flatMap(({ width, options }) => options ? options.map(() => width) : [width]);
  const body = rows.map((row, index) => `<tr><td>${index + 1}</td>${printColumns.map(({ key, option }) => {
    const value = row[key];
    if (option) return `<td>${(Array.isArray(value) ? value : value ? [value] : []).includes(option) ? '✓' : ''}</td>`;
    return `<td>${esc(key == 'imci' ? value ? '✓' : '' : value || '')}</td>`;
  }).join('')}</tr>`).join('');
  const clinic = D.clinic || {};
  const headerHtml = `<div class="center-print-header"><div class="center-print-meta"><span>${esc(new Date().toLocaleString())}</span><span>${esc(clinic.name || '')}</span></div><div class="center-print-brand"><span class="center-print-cross" aria-hidden="true">✚</span><div class="center-print-clinic">${clinic.banner ? `<img src="/uploads/${esc(clinic.banner)}" alt="">` : ''}${clinic.name ? `<h1>${esc(clinic.name)}</h1>` : ''}${clinic.address ? `<div>${esc(clinic.address)}</div>` : ''}${clinic.phone ? `<div>Tel: ${esc(clinic.phone)}</div>` : ''}</div><span class="center-print-cross" aria-hidden="true">✚</span></div><h2>ទម្រង់មណ្ឌល</h2></div>`;
  const table = `<table class="center-print-table"><colgroup><col style="width:8mm">${widths.map((width) => `<col style="width:${width}mm">`).join('')}</colgroup><thead><tr><th rowspan="2">ល.រ</th>${groupHeadings}</tr><tr>${subHeadings}</tr></thead><tbody>${body}</tbody></table>`;
  printDoc('', `<style>@page{size:A4 landscape;margin:5mm}@media print{#pa{padding:0}}</style>${table}`, { headerHtml });
}
function centerForm(record) {
  const editing = !!record, data = record ? jd(record) : {}, patient = curPt();
  centerFormRows = (Array.isArray(data.rows) && data.rows.length ? data.rows : [{ date: ymd(new Date()), name: patient && patient.name || '' }]).map((row) => ({ ...row }));
  const table = `<div class="center-form-scroll"><table class="center-form-table"><colgroup><col style="width:48px">${CENTER_COLUMNS.map(([, , , width]) => `<col style="width:${width}px">`).join('')}<col style="width:54px"></colgroup><thead><tr><th>ល.រ</th>${CENTER_COLUMNS.map(([, label]) => `<th>${esc(label)}</th>`).join('')}<th></th></tr></thead><tbody id="center-rows">${centerRowsHtml(centerFormRows)}</tbody></table></div><button type="button" class="btn p center-add-row" data-a="centeraddrow">＋ បន្ថែមជួរ</button>`;
  openForm('ទម្រង់មណ្ឌល', table, async (form) => {
    const values = centerCollect(form, centerFormRows);
    const date = values.find((row) => row.date) && values.find((row) => row.date).date || ymd(new Date());
    const body = { patient_id: pdId, kind: 'consultation', title: 'ទម្រង់មណ្ឌល', date, data: { consultation_mode: 'center', rows: values } };
    editing ? await api('PUT', 'records/' + record.id, body) : await api('POST', 'records', body);
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'center-form-dialog', close: true, hideCancel: true, ok: 'រក្សាទុក', extra: '<button type="button" class="btn" data-a="centerprint">▣ បោះពុម្ព</button>' });
  const form = $('#mf');
  form.dataset.centerRowCount = String(centerFormRows.length);
}
function investigationServiceList() {
  const query = investigationQuery.trim().toLowerCase();
  const services = D.sv.filter((service) => !query || String(service.name || '').toLowerCase().includes(query));
  return services.map((service) => `<label class="investigation-service ${investigationSelection.has(String(service.id)) ? 'selected' : ''}"><input type="checkbox" data-investigation-service="${service.id}" ${investigationSelection.has(String(service.id)) ? 'checked' : ''}><span>${esc(service.name)} (${K(service.price)})</span></label>`).join('') || '<p class="emp investigation-empty">No matching services.</p>';
}
function investigationPanel(records) {
  return `<section class="investigation-request card"><div class="investigation-request-head"><h2 class="rh">${T('Request service')}</h2><div class="tools"><input id="investigation-service-search" class="in" type="search" placeholder="${esc(T('Search services…'))}" value="${esc(investigationQuery)}"><button class="btn p" data-a="investigation-request" ${investigationSelection.size ? '' : 'disabled'}>${T('Add selected')}${investigationSelection.size ? ` (${investigationSelection.size})` : ''}</button></div></div><div class="investigation-service-grid" id="investigation-service-list">${investigationServiceList()}</div></section><section class="investigation-history"><h3>${T('Service requests')}</h3>${records.map(recCard).join('') || `<p class="emp">${T('No services requested yet.')}</p>`}</section>`;
}
function labUploadForm() {
  openForm(T('Upload Document'), `<div class="g2">${fIn(T('Document name'), 'title', '', 'text', 'required')}${fIn(T('Date'), 'date', ymd(new Date()), 'date')}</div>${fTa(T('Notes'), 'notes', '', 3)}${imgField(T('Document image'), 'image', '', T('Remove picture'))}`, async (form) => {
    const data = new FormData(form), image = data.get('image');
    if (!image) throw new Error(T('Select a document image'));
    await api('POST', 'records', { patient_id: pdId, kind: 'documents', title: data.get('title'), date: data.get('date'), notes: data.get('notes'), image });
    await loadRecs(); labSubtab = 'documents'; render(); toast('Saved');
  }, { cls: 'wide lab-upload-form', ok: T('Save') });
  $('#mf [name="title"]').required = true;
}
function labHistoryPrint(records) {
  const rows = records.map((record) => {
    const data = jd(record);
    const result = Array.isArray(data.fields)
      ? data.fields.map((field) => `${esc(field.name)}: ${esc(field.result || '—')}${field.unit ? ` ${esc(field.unit)}` : ''}${field.normal_range ? ` (${esc(T('Normal Range'))}: ${esc(field.normal_range)})` : ''}`).join('<br>')
      : data.lab_attachment && record.image ? `<img class="lab-print-image" src="/uploads/${esc(record.image)}" alt="">` : '';
    return `<tr><td>${esc((record.date || '').replace('T', ' '))}</td><td>${esc(data.test_name || record.title || T('Lab result'))}</td><td>${result}</td><td>${esc(record.notes || '')}</td></tr>`;
  }).join('');
  printDoc(T('Lab results'), ptBlock(curPt()) + `<table class="pk full"><thead><tr>${['Date', 'Test', 'Result', 'Notes'].map((label) => `<th>${esc(T(label))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="4">${esc(T('Nothing here yet.'))}</td></tr>`}</tbody></table>`);
}
function labHistory(records) {
  const rows = records.map((record, index) => {
    const data = jd(record);
    const summary = Array.isArray(data.fields)
      ? data.fields.map((field) => `${field.name}: ${field.result || '—'}${field.unit ? ` ${field.unit}` : ''}`).join('; ')
      : T('Uploaded result image');
    return `<tr><td>${index + 1}</td><td>${esc((record.date || '').replace('T', ' '))}</td><td>${esc(data.test_name || record.title || T('Lab result'))}</td><td>${esc(summary)}</td><td>${esc(record.notes || '')}</td><td><button type="button" class="btn s" data-a="redit:${record.id}">${T('Edit')}</button> <button type="button" class="btn s r" data-a="rdel:${record.id}">✕</button></td></tr>`;
  }).join('');
  openForm(T('Lab Result History'), `<div class="lab-history-table-wrap"><table class="lab-history-table"><thead><tr>${['No.', 'Date', 'Test', 'Result', 'Notes', 'Actions'].map((label) => `<th>${esc(T(label))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="6">${esc(T('Nothing here yet.'))}</td></tr>`}</tbody></table></div>`, async () => {}, {
    cls: 'xl lab-history-dialog',
    ok: T('Close'),
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="labhistoryprint">${T('Print')}</button>`
  });
}
function labPanel(records) {
  const allLabRecords = recs.filter((record) => record.kind == 'lab' && (!pdDate || (record.date || '').startsWith(pdDate)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const documents = recs.filter((record) => record.kind == 'documents' && (!pdDate || (record.date || '').startsWith(pdDate)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const resultsActive = labSubtab == 'results';
  return `<section class="lab-workspace"><header class="lab-workspace-header"><h2 class="rh">${T('Lab results')}</h2><div class="lab-workspace-actions"><button type="button" class="btn lab-upload-button" data-a="labupload"><span aria-hidden="true">↥</span>${T('Upload Document')}</button><button type="button" class="btn" data-a="labhistory"><span aria-hidden="true">◴</span>${T('History')}</button><button type="button" class="btn" data-a="labprint"><span aria-hidden="true">▧</span>${T('Print')}</button><button type="button" class="btn p" data-a="radd"><span aria-hidden="true">＋</span>${T('Add Lab Result')}</button></div></header><div class="lab-workspace-tabs" role="tablist"><button type="button" class="lab-workspace-tab ${resultsActive ? 'on' : ''}" role="tab" aria-selected="${resultsActive}" data-a="labtab:results"><span aria-hidden="true">⚗</span>${T('Results')} (${allLabRecords.length})</button><button type="button" class="lab-workspace-tab ${!resultsActive ? 'on' : ''}" role="tab" aria-selected="${!resultsActive}" data-a="labtab:documents"><span aria-hidden="true">▤</span>${T('Documents')} (${documents.length})</button></div>${resultsActive
    ? `<section class="lab-results-panel">${allLabRecords.map(recCard).join('') || `<p class="emp">${T('Nothing here yet.')}</p>`}</section>`
    : `<section class="lab-results-panel">${documents.map(recCard).join('') || `<p class="emp">${T('Nothing here yet.')}</p>`}</section>`}</section>`;
}
function echoTemplate() {
  return D.echo.find((template) => String(template.id) == String(echoTemplateId)) || D.echo[0] || null;
}
function echoTemplatePicker(onSelect = null) {
  if (!D.echo.length) return toast(T('Create an Echo Template first'));
  const selected = echoTemplate();
  openForm(T('Select Echo Template'), `<label class="echo-template-search"><span aria-hidden="true">⌕</span><input class="in" id="echo-template-search" type="search" placeholder="${esc(T('Search echo templates…'))}" autocomplete="off" aria-label="${esc(T('Search echo templates…'))}"></label><div class="echo-template-options" role="radiogroup" aria-label="${esc(T('Select Echo Template'))}">${D.echo.map((template) => `<label class="echo-template-option"><input type="radio" name="echo_template_id" value="${esc(template.id)}" ${selected && String(selected.id) == String(template.id) ? 'checked' : ''}><span>${esc(template.name)}</span></label>`).join('')}<p class="echo-template-empty" hidden>${T('No Echo templates found')}</p></div>`, async (form) => {
    const id = new FormData(form).get('echo_template_id');
    const template = D.echo.find((item) => String(item.id) == String(id));
    if (!template) throw new Error(T('Echo template not found'));
    if (onSelect) return onSelect(template);
    echoTemplateId = String(id);
    render();
  }, { ok: T('Select'), cls: 'echo-template-picker-form', close: true, keepOpen: !!onSelect });
}
function echoReportDraftSnapshot() {
  const form = $('#mf');
  const values = new FormData(form);
  const editors = Array.from(form.querySelectorAll('[data-echo-editor]'));
  const notes = editors.length
    ? editors.map((editor, index) => ({ title: `កំណត់ហេតុ (${index + 1})`, content: String(editor.innerHTML || '').trim() }))
    : [{ title: 'កំណត់ហេតុ (1)', content: String(values.get('echo_report_content') || '').trim() }];
  return {
    date: String(values.get('echo_report_date') || ''),
    draft: {
      doctor: String(values.get('echo_report_doctor_new') || values.get('echo_report_doctor') || '').trim(),
      service_id: String(values.get('echo_report_service_id') || ''),
      service_name: String(values.get('echo_report_service_name') || ''),
      report_notes: notes,
      report_content: notes.map((note) => note.content).join(''),
      sections: Array.from(form.querySelectorAll('[data-echo-report-field]')).reduce((sections, label) => {
        sections.push({ values: [{ name: label.dataset.echoReportField, value: label.querySelector('textarea')?.value || '' }] });
        return sections;
      }, []),
      images: echoReportImages()
    }
  };
}
function echoReportChooseTemplate(record, template, snapshot) {
  const currentFields = new Map(snapshot.draft.sections.flatMap((section) => section.values || []).map((field) => [field.name, field.value]));
  let templateSections;
  try {
    templateSections = Array.isArray(template.sections) ? template.sections : JSON.parse(template.sections || '[]');
  } catch {
    throw new Error(T('Echo template could not be read'));
  }
  const sections = (templateSections.length ? templateSections : [{ title: T('Findings'), content: '', fields: [] }]).map((section) => {
    const fields = Array.isArray(section.fields) && section.fields.length ? section.fields : [T('Findings')];
    return {
      ...section,
      fields,
      values: fields.map((name) => ({ name, value: currentFields.get(name) || '' }))
    };
  });
  const templateContent = sections.map((section) => `${section.title ? `<h3>${esc(section.title)}</h3>` : ''}${section.content || ''}`).join('');
  const notes = snapshot.draft.report_notes.map((note, index) => index == 0 ? { ...note, content: templateContent } : note);
  const draft = { ...snapshot.draft, report_notes: notes, report_content: notes.map((note) => note.content).join(''), sections };
  echoTemplateId = String(template.id);
  echoReportForm(record, { template, draft, date: snapshot.date });
}
function echoReportForm(record = null, options = {}) {
  const existing = { ...(record ? jd(record) : {}), ...(options.draft || {}) };
  const template = options.template || (record
    ? D.echo.find((item) => String(item.id) == String(existing.template_id)) || { id: existing.template_id, name: existing.template_name || T('Echo Report'), sections: '[]' }
    : echoTemplate());
  if (!template) return toast(T('Create an Echo Template first'));
  const templateSections = Array.isArray(existing.sections)
    ? existing.sections
    : (() => { try { return JSON.parse(template.sections || '[]'); } catch { return []; } })();
  const sections = templateSections.length ? templateSections : [{ title: T('Findings'), content: '', fields: [] }];
  const date = (record?.date || options.date || ymd(new Date())).slice(0, 10);
  const [dateYear, dateMonth, dateDay] = date.split('-').map(Number);
  const doctors = [...D.dr.map((doctor) => String(doctor.name || '').trim()).filter(Boolean)];
  if (existing.doctor && !doctors.includes(existing.doctor)) doctors.unshift(existing.doctor);
  const currentDoctor = existing.doctor || D.user?.name || '';
  if (currentDoctor && !doctors.includes(currentDoctor)) doctors.unshift(currentDoctor);
  const currentServiceId = String(existing.service_id || '');
  const currentServiceName = existing.service_name || '';
  const reportImages = Array.isArray(existing.images) ? existing.images.filter((image) => image && image.photo) : record?.image ? [{ photo: record.image, name: record.image }] : [];
  const initialContent = existing.report_content || sections.map((section) => {
    const title = section.title ? `<h3>${esc(section.title)}</h3>` : '';
    return `${title}${section.content || ''}`;
  }).join('');
  const reportNotes = Array.isArray(existing.report_notes) && existing.report_notes.length
    ? existing.report_notes
    : [{ title: 'កំណត់ហេតុ (1)', content: initialContent }];
  const initialFieldPreview = sections.flatMap((section) => Array.isArray(section.values) ? section.values : []).filter((field) => field.value).map((field) => `<p><b>${esc(field.name)}:</b> ${esc(field.value)}</p>`).join('');
  const serviceMatches = currentServiceName ? D.sv.filter((service) => String(service.name || '').toLocaleLowerCase().includes(String(currentServiceName).toLocaleLowerCase())) : [];
  const editorToolbar = `<div class="echo-rich-toolbar" role="toolbar" aria-label="${T('Report formatting')}">
    <select class="in echo-font-select" data-echo-command="fontName" data-echo-section="patient-report" aria-label="${T('Font')}"><option>Arial</option><option>Times New Roman</option><option>Khmer OS</option><option>Moul</option><option>Koulen</option></select>
    <select class="in echo-size-select" data-echo-command="fontSize" data-echo-section="patient-report" aria-label="${T('Text size')}"><option value="2">${T('Normal')}</option><option value="3">${T('Medium')}</option><option value="5">${T('Large')}</option></select>
    ${[['bold','B'],['italic','I'],['underline','U'],['justifyLeft','≡'],['justifyCenter','☰'],['justifyRight','≡'],['insertUnorderedList','☷'],['insertOrderedList','1.'],['createLink','↗'],['insertTable','▦'],['undo','↶'],['redo','↷'],['removeFormat','Tx']].map(([command,label]) => `<button type="button" class="btn s echo-tool echo-tool-${command}" data-a="echoformat:patient-report:${command}" aria-label="${esc(command)}" title="${esc(command)}">${label}</button>`).join('')}
    ${[['foreColor','#000000'],['hiliteColor','#ffff00']].map(([command,color]) => `<label class="echo-color-tool" title="${command == 'foreColor' ? T('Text Color') : T('Highlight Color')}"><span class="echo-tool echo-tool-${command}">${command == 'foreColor' ? 'A' : '▨'}</span><input type="color" data-echo-color="${command}" data-echo-section="patient-report" value="${color}" aria-label="${esc(command)}"></label>`).join('')}
  </div>`;
  const noteEditorHtml = (index, content) => {
    const sectionId = index ? `patient-report-${index + 1}` : 'patient-report';
    const toolbar = editorToolbar.replaceAll('patient-report', sectionId);
    const actions = `<div class="echo-report-quick-actions">${index == 0 ? `<button type="button" class="btn" data-a="patient-echo-twin" aria-label="បន្ថែមកំណត់ហេតុទី 2" title="បន្ថែមកំណត់ហេតុទី 2"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="4" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 9h2m-2 4h2m8-4h2m-2 4h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>ភ្លោះ</span></button>` : ''}<button type="button" class="btn" data-a="echoformat:${sectionId}:insertTable"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M9 9v11m6-11v11" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>បញ្ចូលតារាង</span></button>${index == 0 ? `<button type="button" class="btn" data-a="patient-echo-report-template">▤ ប្លង់គំរូ</button>` : ''}</div>`;
    return `<section class="echo-report-note-panel" data-echo-note="${index + 1}"><div class="echo-report-pane-heading"><h4>កំណត់ហេតុ (${index + 1})</h4><div class="echo-report-heading-tools">${actions}</div></div>${toolbar}<input id="echo-image-file-${sectionId}" type="file" accept="image/jpeg,image/png,image/webp" hidden><section class="echo-report-editor-section" data-echo-section="${sectionId}"><div id="echo-report-editor${index ? `-${index + 1}` : ''}" class="echo-rich-editor echo-report-editor" contenteditable="true" role="textbox" aria-label="${T('Echo report content')} ${index + 1}" aria-multiline="true" data-echo-editor="${sectionId}">${content || ''}</div><input type="hidden" name="echo_report_content${index ? `_${index + 1}` : ''}" data-echo-content value="${esc(content || '')}"></section></section>`;
  };
  const body = `<div class="echo-report-composer-meta">
    <div class="echo-report-date-group"><label class="echo-report-label" for="echo-report-date">កាលបរិច្ឆេទ</label><input id="echo-report-date" class="in" type="date" name="echo_report_date" value="${esc(date)}">
      <div class="echo-date-parts"><label>ថ្ងៃ<select class="in" id="echo-report-day" name="echo_report_day">${Array.from({length:31},(_,i)=>i+1).map((day)=>`<option value="${day}" ${day == dateDay ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label>ខែ<select class="in" id="echo-report-month" name="echo_report_month">${Array.from({length:12},(_,i)=>i+1).map((month)=>`<option value="${month}" ${month == dateMonth ? 'selected' : ''}>${String(month).padStart(2,'0')}</option>`).join('')}</select></label><label>ឆ្នាំ<select class="in" id="echo-report-year" name="echo_report_year">${Array.from({length:9},(_,i)=>dateYear-5+i).map((year)=>`<option value="${year}" ${year == dateYear ? 'selected' : ''}>${year}</option>`).join('')}</select></label></div>
    </div>
    <div class="echo-report-service-group"><label class="echo-report-label" for="echo-service-search">សេវាកម្ម (Services)</label><div class="echo-service-search-row"><input class="in" id="echo-service-search" type="search" placeholder="${esc(T('Search services…'))}" value="${esc(currentServiceName)}" autocomplete="off"><button type="button" class="btn p" data-a="patient-echo-service-search" aria-label="${T('Search')}">⌕</button></div><div id="echo-service-results" class="echo-service-results" ${currentServiceName ? '' : 'hidden'}>${serviceMatches.map((service)=>`<button type="button" class="echo-service-result" data-a="patient-echo-service:${esc(service.id)}">${esc(service.name)}</button>`).join('')}</div><input type="hidden" id="echo-report-service-id" name="echo_report_service_id" value="${esc(currentServiceId)}"><input type="hidden" id="echo-report-service-name" name="echo_report_service_name" value="${esc(currentServiceName)}"><div id="echo-selected-service" class="echo-selected-service">${currentServiceName ? esc(currentServiceName) : ''}</div></div>
    <div class="echo-report-person-group"><label class="echo-report-label" for="echo-report-doctor">គ្រូពេទ្យ</label><div class="echo-report-doctor-row"><select class="in" id="echo-report-doctor" name="echo_report_doctor"><option value="">${T('Select a doctor')}</option>${doctors.map((doctor)=>`<option value="${esc(doctor)}" ${doctor == currentDoctor ? 'selected' : ''}>${esc(doctor)}</option>`).join('')}</select><button type="button" class="btn echo-add-person" data-a="patient-echo-doctor-add" aria-label="${T('Add doctor')}">＋</button></div><input class="in echo-report-doctor-new" id="echo-report-doctor-new" name="echo_report_doctor_new" placeholder="${esc(T('Enter doctor name'))}" hidden></div>
    <div class="echo-report-patient"><span class="echo-report-label">អ្នកជំងឺ</span><strong>${esc(curPt()?.name || '')}</strong><span>${esc(curPt()?.phone || '')}</span></div>
  </div>
  <div class="echo-report-workspace">
    <section class="echo-report-editor-pane"><div id="echo-report-notes" class="echo-report-notes-grid">${reportNotes.map((note, index) => noteEditorHtml(index, note.content || '')).join('')}</div>
      <details class="echo-report-template-fields"><summary>${T('Template fields')}</summary>${sections.map((section, sectionIndex) => {
        const names = Array.isArray(section.fields) && section.fields.length ? section.fields : [T('Findings')];
        const savedFields = Array.isArray(section.values) ? section.values : [];
        return `<div class="echo-report-template-field-group">${section.title ? `<h5>${esc(section.title)}</h5>` : ''}${names.map((name, fieldIndex) => {
          const saved = savedFields.find((field) => field.name == name);
          return `<label data-echo-report-field="${esc(name)}">${esc(name)}<textarea class="in" name="echo_value_${sectionIndex}_${fieldIndex}" rows="2">${esc(saved?.value || '')}</textarea></label>`;
        }).join('')}</div>`;
      }).join('')}</details>
    </section>
    <aside class="echo-report-preview-pane"><div class="echo-report-pane-heading"><h4>របាយការណ៍</h4><span>${esc(echoPageSize)}</span></div><div id="echo-report-preview" class="echo-report-preview">${echoReportDocumentHtml(curPt(), date, initialContent + initialFieldPreview, reportImages, true, currentDoctor)}</div>
      <section class="echo-report-attachments" aria-label="បញ្ចូលរូបភាព"><label class="echo-report-label">រូបភាព</label><div id="echo-report-image-list" class="echo-report-image-list">${echoReportImageRows(reportImages)}</div><label class="echo-report-upload" for="echo-report-upload"><span aria-hidden="true">⇧</span><span>បញ្ចូលរូបភាព</span><input id="echo-report-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><small class="echo-report-attachment-hint">${T('JPG, PNG or WebP')}</small></section>
    </aside>
  </div>
  <input type="hidden" id="echo-report-images" name="echo_report_images" value="${esc(JSON.stringify(reportImages))}">`;
  const form = $('#mf');
  form.className = 'echo-report-form echo-report-composer-form';
  form.innerHTML = `<div class="echo-report-composer-heading"><div><span class="echo-report-heading-mark">◈</span><h3>បញ្ចូលរបាយការណ៍អេកូ</h3></div><div class="echo-report-composer-heading-actions"><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div></div>${body}<footer class="echo-report-composer-footer"><button class="echo-report-save">${T('Save')}　✓</button></footer>`;
  form.dataset.echoReportImages = JSON.stringify(reportImages);
  form.dataset.echoReportRecordId = record ? String(record.id) : '';
  form.dataset.echoReportTemplateId = String(template.id);
  $('#md').classList.add('on');
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const values = new FormData(form);
      const noteEditors = Array.from(form.querySelectorAll('[data-echo-editor]'));
      const notes = noteEditors.length
        ? noteEditors.map((editor, index) => ({ title: `កំណត់ហេតុ (${index + 1})`, content: String(editor.innerHTML || '').trim() }))
        : [{ title: 'កំណត់ហេតុ (1)', content: String(values.get('echo_report_content') || $('#echo-report-editor')?.innerHTML || '').trim() }];
      const reportContent = notes.length > 1
        ? notes.map((note) => `<h3>${esc(note.title)}</h3>${note.content}`).join('')
        : String(values.get('echo_report_content') || notes[0]?.content || '').trim();
      const dataSections = sections.map((section, sectionIndex) => {
      const fields = Array.isArray(section.fields) && section.fields.length ? section.fields : [T('Findings')];
      return {
        title: section.title || '',
        content: section.content || '',
        fields,
        values: fields.map((name, fieldIndex) => ({
          name,
          value: String(values.get(`echo_value_${sectionIndex}_${fieldIndex}`) || '').trim()
        }))
      };
      });
      if (!notes.some((note) => note.content.replace(/<[^>]*>/g, '').trim()) && !dataSections.some((section) => section.values.some((field) => field.value))) throw new Error(T('Enter at least one Echo finding'));
      const serviceId = String(values.get('echo_report_service_id') || '').trim(), serviceName = String(values.get('echo_report_service_name') || '').trim();
      const doctor = String(values.get('echo_report_doctor_new') || values.get('echo_report_doctor') || '').trim();
      const images = JSON.parse(form.dataset.echoReportImages || '[]');
      const data = { template_id: template.id, template_name: template.name, doctor, service_id: serviceId, service_name: serviceName, report_content: reportContent, report_notes: notes, sections: dataSections, images, page_size: echoPageSize };
      const payload = { patient_id: pdId, kind: 'echo', title: 'Echo Report', date: values.get('echo_report_date'), image: images[0]?.photo || '', data };
      if (record) await api('PUT', 'records/' + record.id, payload);
      else await api('POST', 'records', payload);
      await loadRecs();
      echoSubtab = 'reports';
      $('#md').classList.remove('on');
      render();
      toast(T('Saved'));
    } catch (error) { toast(error.message); }
  };
}
function echoReportServiceResults(query = '') {
  const results = $('#echo-service-results');
  if (!results) return;
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const services = D.sv.filter((service) => !normalized || String(service.name || '').toLocaleLowerCase().includes(normalized)).slice(0, 12);
  results.innerHTML = services.map((service) => `<button type="button" class="echo-service-result" data-a="patient-echo-service:${esc(service.id)}">${esc(service.name)}</button>`).join('') || `<span class="echo-service-empty">${T('No services found')}</span>`;
  results.hidden = false;
}
function echoReportPreviewUpdate() {
  const preview = $('#echo-report-preview'), form = $('#mf');
  if (!preview || !form) return;
  const editors = Array.from(form.querySelectorAll('[data-echo-editor]'));
  const notes = (editors.length ? editors : [$('#echo-report-editor')]).filter(Boolean);
  const fields = Array.from(form.querySelectorAll('[data-echo-report-field]')).map((label) => {
    const value = label.querySelector('textarea')?.value.trim();
    return value ? `<p><b>${esc(label.dataset.echoReportField)}:</b> ${esc(value)}</p>` : '';
  }).join('');
  const doctor = $('#echo-report-doctor-new')?.value || $('#echo-report-doctor')?.value || '';
  const content = notes.length > 1
    ? notes.map((editor, index) => `<h3>កំណត់ហេតុ (${index + 1})</h3>${editor.innerHTML}`).join('')
    : notes[0]?.innerHTML || '';
  preview.innerHTML = echoReportDocumentHtml(curPt(), $('#echo-report-date')?.value || '', content + fields, echoReportImages(), true, doctor);
}
function echoReportAddTwin() {
  const notes = $('#echo-report-notes'), first = notes?.querySelector('.echo-report-note-panel');
  if (!notes || !first) throw new Error(T('Echo report editor is unavailable'));
  const existingTwin = notes.querySelector('[data-echo-note="2"]');
  const toggle = first.querySelector('[data-a="patient-echo-twin"]');
  if (existingTwin) {
    existingTwin.remove();
    if (toggle) {
      toggle.querySelector('span').textContent = 'ភ្លោះ';
      toggle.setAttribute('aria-label', 'បន្ថែមកំណត់ហេតុទី 2');
      toggle.setAttribute('title', 'បន្ថែមកំណត់ហេតុទី 2');
    }
    echoReportPreviewUpdate();
    return;
  }
  const twin = first.cloneNode(true);
  twin.dataset.echoNote = '2';
  twin.querySelector('h4').textContent = 'កំណត់ហេតុ (2)';
  const secondId = 'patient-report-2';
  for (const element of [twin, ...twin.querySelectorAll('*')]) {
    for (const attribute of ['id', 'name', 'data-a', 'data-echo-section', 'data-echo-editor', 'data-echo-color', 'data-echo-command']) {
      const value = element.getAttribute && element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, value.replaceAll('patient-report', secondId).replace('patient-echo-insert-image:1', 'patient-echo-insert-image:2'));
    }
  }
  twin.querySelector('[data-a="patient-echo-twin"]')?.remove();
  twin.querySelector('[data-a="patient-echo-report-template"]')?.remove();
  const editor = twin.querySelector('[data-echo-editor]');
  const hidden = twin.querySelector('[data-echo-content]');
  if (!editor || !hidden) throw new Error(T('Second Echo report editor could not be created'));
  editor.id = 'echo-report-editor-2';
  hidden.name = 'echo_report_content_2';
  editor.innerHTML = '';
  hidden.value = '';
  notes.append(twin);
  if (toggle) {
    toggle.querySelector('span').textContent = 'តែមួយ';
    toggle.setAttribute('aria-label', 'ត្រឡប់ទៅកំណត់ហេតុមួយ');
    toggle.setAttribute('title', 'ត្រឡប់ទៅកំណត់ហេតុមួយ');
  }
  echoReportPreviewUpdate();
}
function echoReportImageRows(images) {
  if (!images.length) return '';
  return images.map((image, index) => `<div class="echo-report-image-row"><span class="echo-report-image-name" title="${esc(image.name || image.photo)}">${esc(image.name || image.photo)}</span><button type="button" class="echo-report-image-remove" data-a="patient-echo-image-remove:${index}" aria-label="${T('Remove image')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`).join('');
}
function echoReportImages() {
  try {
    const images = JSON.parse($('#mf').dataset.echoReportImages || '[]');
    return Array.isArray(images) ? images.filter((image) => image && image.photo) : [];
  } catch (error) {
    throw new Error(T('Echo report attachments could not be read'));
  }
}
function echoReportRemoveImage(index) {
  const images = echoReportImages();
  if (!Number.isInteger(index) || index < 0 || index >= images.length) return toast(T('Image not found'));
  images.splice(index, 1);
  const form = $('#mf'), hidden = $('#echo-report-images'), list = $('#echo-report-image-list');
  form.dataset.echoReportImages = JSON.stringify(images);
  hidden.value = JSON.stringify(images);
  list.innerHTML = echoReportImageRows(images);
  echoReportPreviewUpdate();
}
async function echoReportUpload(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  try {
    const form = $('#mf'), hidden = $('#echo-report-images'), list = $('#echo-report-image-list');
    if (!form || !hidden || !list) throw new Error(T('Echo report form is unavailable'));
    const images = echoReportImages();
    for (const file of selected) {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error(T('Use a JPG, PNG or WebP picture'));
      if (file.size > 2e6) throw new Error(T('Picture is too large (max 2 MB)'));
      const response = await fetch(API_BASE + '/api/uploads', { method: 'POST', headers: { 'Content-Type': file.type, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: file });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || !result.photo) throw new Error(result && result.error || T('Image upload failed'));
      images.push({ photo: result.photo, name: file.name || result.photo });
      form.dataset.echoReportImages = JSON.stringify(images);
      hidden.value = JSON.stringify(images);
      list.innerHTML = echoReportImageRows(images);
      echoReportPreviewUpdate();
    }
  } catch (error) {
    toast(error.message);
  }
}
function echoReportClinicHeaderHtml() {
  const clinic = D.clinic || {};
  return `<div class="echo-report-clinic-header">${clinic.banner
    ? `<img class="echo-report-clinic-banner" src="${API_BASE}/uploads/${esc(clinic.banner)}" alt="">`
    : `${clinic.logo ? `<img class="echo-report-clinic-logo" src="${API_BASE}/uploads/${esc(clinic.logo)}" alt="">` : ''}${clinic.show_name && clinic.name ? `<strong>${esc(clinic.name)}</strong>` : ''}${clinic.specialty ? `<span>${esc(clinic.specialty)}</span>` : ''}${clinic.show_address && clinic.address ? `<span>${esc(clinic.address)}</span>` : ''}${clinic.show_phone && clinic.phone ? `<span>${esc(clinic.phone)}</span>` : ''}`}</div>`;
}
function echoReportDocumentHtml(patient, date, content, images = [], preview = false, doctor = '') {
  const sex = patient?.sex == 'M' ? 'ប្រុស' : patient?.sex == 'F' ? 'ស្រី' : fmtSex(patient?.sex);
  const dateText = String(date || '').slice(0, 10).split('-').reverse().join('/');
  const attachments = images.filter((image) => image && image.photo).map((image) => `<figure class="echo-report-document-image"><img src="${esc(API_BASE + '/uploads/' + encodeURIComponent(image.photo))}" alt=""></figure>`).join('');
  return `<article class="echo-report-document${preview ? ' echo-report-document-preview' : ''}">${preview ? echoReportClinicHeaderHtml() : ''}<div class="echo-report-patient-meta"><div><b>Name:</b><span>${esc(patient?.name || '')}</span></div><div><b>ID:</b><span>${esc(patient?.id || '')}</span></div><div><b>Age/Sex:</b><span>${esc(fmtAge(patient || {}))} / ${esc(sex || 'N/A')}</span></div><div><b>Date:</b><span>${esc(dateText)}</span></div></div><h2 class="echo-report-document-title">របាយការណ៍អេកូ (ECHO REPORT)</h2><div class="echo-report-document-columns${attachments ? ' has-images' : ''}"><section class="echo-report-document-result"><h3>Result :</h3><div class="echo-report-document-content">${content || ''}</div></section>${attachments ? `<section class="echo-report-document-images">${attachments}</section>` : ''}</div>${doctor ? `<footer class="echo-report-document-signature"><span>វេជ្ជបណ្ឌិត / Doctor</span><b>${esc(doctor)}</b></footer>` : ''}</article>`;
}
function echoReportContent(record, preview = false) {
  const data = jd(record);
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const fields = sections.flatMap((section) => section.values || []).filter((field) => field.value).map((field) => `<p><b>${esc(field.name)}:</b> ${esc(field.value)}</p>`).join('');
  const report = Array.isArray(data.report_notes) && data.report_notes.length
    ? `${data.report_notes.map((note, index) => `${data.report_notes.length > 1 ? `<h3>${esc(note.title || `កំណត់ហេតុ (${index + 1})`)}</h3>` : ''}${note.content || ''}`).join('')}${fields}`
    : data.report_content
      ? `${data.report_content}${fields}`
      : sections.map((section) => `${section.title ? `<h3>${esc(section.title)}</h3>` : ''}${section.content || ''}${(section.values || []).map((field) => `<p><b>${esc(field.name)}:</b> ${esc(field.value || '')}</p>`).join('')}`).join('');
  const images = Array.isArray(data.images) && data.images.length ? data.images : record.image ? [{ photo: record.image }] : [];
  return echoReportDocumentHtml(curPt(), record.date, report, images, preview, data.doctor || '');
}
function echoReportView(record) {
  echoPreviewZoom = 81;
  const form = $('#mf');
  form.className = 'echo-report-preview-dialog';
  form.innerHTML = `<header class="echo-preview-toolbar"><div class="echo-preview-title"><span aria-hidden="true">▣</span><b>${T('Print Preview')}</b></div><div class="echo-preview-controls"><div class="echo-preview-zoom-controls"><button type="button" data-a="patient-echo-preview-zoom:out" aria-label="${T('Zoom out')}">−</button><output id="echo-preview-zoom-label">${echoPreviewZoom}%</output><button type="button" data-a="patient-echo-preview-zoom:in" aria-label="${T('Zoom in')}">＋</button><button type="button" data-a="patient-echo-preview-zoom:reset" aria-label="${T('Reset zoom')}">⟳</button></div><label class="echo-preview-text-controls"><span aria-hidden="true">T</span><small>A</small><input id="echo-preview-text-size" type="range" min="80" max="140" value="100" aria-label="${T('Preview text size')}"><b>A</b></label></div><div class="echo-preview-actions"><button type="button" class="btn p" data-a="patient-echo-preview-print:${record.id}">▣ ${T('Print')}</button><button type="button" class="echo-preview-close" data-a="close" aria-label="${T('Close')}">×</button></div></header><main class="echo-preview-stage"><div class="echo-preview-paper" style="--echo-preview-zoom:${echoPreviewZoom / 100}">${echoReportContent(record, true)}</div></main>`;
  form.onsubmit = (event) => event.preventDefault();
  $('#md').classList.add('on');
}
function echoReportPreviewZoom(action) {
  echoPreviewZoom = action == 'reset' ? 81 : Math.max(40, Math.min(140, echoPreviewZoom + (action == 'in' ? 10 : -10)));
  const paper = $('#mf .echo-preview-paper'), label = $('#echo-preview-zoom-label');
  if (paper) paper.style.setProperty('--echo-preview-zoom', String(echoPreviewZoom / 100));
  if (label) label.textContent = `${echoPreviewZoom}%`;
}
function echoReportPreviewTextSize(size) {
  const textScale = Math.max(80, Math.min(140, Number(size) || 100)) / 100;
  const paper = $('#mf .echo-preview-paper');
  if (!paper) return;
  paper.style.setProperty('--echo-preview-text-size', `${10 * textScale}pt`);
  paper.style.setProperty('--echo-preview-title-size', `${13 * textScale}pt`);
  paper.style.setProperty('--echo-preview-section-title-size', `${10 * textScale}pt`);
}
function echoReportPreviewPrint(id) {
  const record = recs.find((item) => item.id == id && item.kind == 'echo');
  if (!record) return toast(T('Echo report not found'));
  echoReportPrint(record);
}
function echoReportInsertDate() {
  const editor = $('#echo-report-editor');
  if (!editor) return toast(T('Echo editor not found'));
  editor.focus();
  echoRestoreSelection(editor);
  const date = ymd(new Date()).split('-').reverse().join('/');
  if (typeof document.execCommand == 'function') document.execCommand('insertText', false, date);
  else editor.insertAdjacentHTML('beforeend', `<span>${esc(date)}</span>`);
  const content = editor.closest('[data-echo-section]')?.querySelector('[data-echo-content]');
  if (content) content.value = editor.innerHTML;
  echoReportPreviewUpdate();
}
function echoReportPrint(record, format = 'Default') {
  const savedSize = jd(record).page_size;
  const size = ['A4', 'A5', 'Letter'].includes(savedSize) ? savedSize : ['A4', 'A5', 'Letter'].includes(echoPageSize) ? echoPageSize : 'A4';
  const signatureSpace = size == 'A5' ? '150mm' : size == 'Letter' ? '216mm' : '235mm';
  const html = `<style>@page{size:${size};margin:8mm}#pa .echo-report-document{min-height:${signatureSpace}}</style><div class="echo-report-print echo-report-print-${esc(format.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${echoReportContent(record)}</div>`;
  printDoc('', html, { omitClinicBranding: true, includeClinicBanner: true });
}
function echoUploadForm() {
  openForm(T('Upload Document'), `<div class="g2">${fIn(T('Document name'), 'title', '', 'text', 'required')}${fIn(T('Date'), 'date', ymd(new Date()), 'date')}</div>${fTa(T('Notes'), 'notes', '', 3)}${imgField(T('Document image'), 'image', '', T('Remove picture'))}`, async (form) => {
    const data = new FormData(form), image = data.get('image');
    if (!image) throw new Error(T('Select a document image'));
    await api('POST', 'records', { patient_id: pdId, kind: 'documents', title: data.get('title'), date: data.get('date'), notes: data.get('notes'), image });
    await loadRecs(); echoSubtab = 'documents'; render(); toast(T('Saved'));
  }, { cls: 'wide lab-upload-form', ok: T('Save') });
  $('#mf [name="title"]').required = true;
}
function echoPanel() {
  const reports = recs.filter((record) => record.kind == 'echo' && (!pdDate || (record.date || '').startsWith(pdDate)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const documents = recs.filter((record) => record.kind == 'documents' && (!pdDate || (record.date || '').startsWith(pdDate)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const selected = echoTemplate();
  const isReports = echoSubtab == 'reports';
  return `<section class="echo-workspace"><header class="echo-workspace-header"><h2>${T('Echo results')}</h2><div class="echo-workspace-actions"><button type="button" class="btn echo-size-button" data-a="patient-echo-size">${esc(echoPageSize)}⌄</button><button type="button" class="btn" data-a="patient-echo-template" title="${esc(T('Select Echo Template'))}">▤ ${T('Template layout')}<span class="echo-template-current">${esc(selected?.name || 'Template A')}</span></button><button type="button" class="btn" data-a="patient-echo-upload">↥ ${T('Upload')}</button><button type="button" class="btn p" data-a="patient-echo-add">＋ ${T('Add Report')}</button></div></header><div class="echo-workspace-tabs" role="tablist"><button type="button" class="echo-workspace-tab ${isReports ? 'on' : ''}" role="tab" aria-selected="${isReports}" data-a="patient-echo-tab:reports">♧ ${T('Reports')}</button><button type="button" class="echo-workspace-tab ${!isReports ? 'on' : ''}" role="tab" aria-selected="${!isReports}" data-a="patient-echo-tab:documents">▤ ${T('Documents')} (${documents.length})</button></div><section class="echo-report-list">${isReports ? reports.map((record) => {
    const data = jd(record), date = (record.date || '').slice(0, 10).split('-').reverse().join('/');
    return `<article class="rc echo-report-card"><div class="echo-report-card-copy"><b>${esc(record.title || 'Echo Report')}</b><div class="echo-report-card-meta"><span>▧ ${esc(date)}</span>${data.doctor ? `<span class="echo-doctor-chip">♙ ${esc(data.doctor)}</span>` : ''}</div></div><div class="echo-report-card-actions"><button type="button" class="btn echo-view-action" data-a="patient-echo-view:${record.id}">◉ ${T('View')}</button><button type="button" class="btn" data-a="patient-echo-edit:${record.id}">▧ ${T('Edit')}</button><span class="echo-print-options"><button type="button" class="btn" data-a="patient-echo-print:${record.id}:Default">▣ ${T('Default')}</button>${['RI', 'LF', 'PT'].map((format) => `<button type="button" class="btn" data-a="patient-echo-print:${record.id}:${format}">${format}</button>`).join('')}</span><button type="button" class="btn p" data-a="patient-echo-print:${record.id}:P-I">◫ P-I</button><button type="button" class="btn r" data-a="rdel:${record.id}" aria-label="${T('Delete')}" title="${T('Delete')}">▤</button></div></article>`;
  }).join('') || `<p class="emp">${T('Nothing here yet.')}</p>` : documents.map(recCard).join('') || `<p class="emp">${T('Nothing here yet.')}</p>`}</section></section>`;
}
function labPickerCards() {
  const query = labPickerQuery.trim().toLocaleLowerCase();
  const labs = D.lab.filter((lab) => !query || `${lab.name} ${lab.cat || ''}`.toLocaleLowerCase().includes(query));
  const groups = new Map();
  labs.forEach((lab) => {
    const category = lab.cat || T('Other');
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(lab);
  });
  return [...groups].map(([category, items]) => `<section class="lab-picker-group"><h4>${esc(category)}</h4><div class="lab-picker-grid">${items.map((lab) => `<button type="button" class="lab-picker-card ${labPickerSelection.has(String(lab.id)) ? 'selected' : ''}" data-a="labpick:${lab.id}" aria-pressed="${labPickerSelection.has(String(lab.id))}"><span>${esc(lab.name)}</span><small>${K(lab.price)}</small></button>`).join('')}</div></section>`).join('') || `<p class="emp">${T('No matching lab tests.')}</p>`;
}
function labResultPicker(preserveSelection = false) {
  labPickerQuery = '';
  if (!preserveSelection) labPickerSelection = new Set();
  const form = $('#mf');
  form.className = 'xl lab-result-picker';
  form.innerHTML = `<div class="operation-form-heading"><h3>${T('Add Lab Result')}</h3><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div><label class="lab-picker-search"><span aria-hidden="true">⌕</span><input class="in" id="lab-result-search" type="search" placeholder="${esc(T('Search lab tests…'))}"></label><div class="lab-picker-list" id="lab-result-list">${labPickerCards()}</div><div class="tools fb lab-picker-footer"><span>${labPickerSelection.size} ${T('selected')}</span><button type="button" class="btn" data-a="close">${T('Cancel')}</button><button type="button" class="btn p" data-a="labcontinue" ${labPickerSelection.size ? '' : 'disabled'}>${T('Next')} →</button></div>`;
  $('#md').classList.add('on');
}
function labResultRangeStatus(result, range) {
  const valueText = String(result ?? '').trim();
  const rangeText = String(range ?? '').trim();
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!numeric.test(valueText)) return '';
  const value = Number(valueText);
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const interval = new RegExp(`^\\s*(${number})\\s*(?:-|–|—|to)\\s*(${number})\\s*$`, 'i').exec(rangeText);
  if (interval) return value >= Number(interval[1]) && value <= Number(interval[2]) ? 'in-range' : 'out-of-range';
  const bound = new RegExp(`^\\s*(<=|>=|<|>|≤|≥)\\s*(${number})\\s*$`).exec(rangeText);
  if (!bound) return '';
  const limit = Number(bound[2]);
  return bound[1] == '<' ? value < limit ? 'in-range' : 'out-of-range'
    : bound[1] == '<=' || bound[1] == '≤' ? value <= limit ? 'in-range' : 'out-of-range'
    : bound[1] == '>' ? value > limit ? 'in-range' : 'out-of-range'
    : value >= limit ? 'in-range' : 'out-of-range';
}
function labVitalSignsPrint() {
  const latest = recs.filter((record) => record.kind == 'vitals' && String(record.patient_id) == String(pdId))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id)[0];
  const data = latest ? jd(latest) : {};
  const items = [
    ['សីតុណ្ហភាព', 't', '°C'],
    ['ចង្វាក់បេះដូង', 'hr', 'bpm'],
    ['អត្រាដកដង្ហើម', 'rr', 'bpm'],
    ['សម្ពាធឈាម', 'bp', ''],
    ['ទម្ងន់', 'w', 'kg'],
    ['កម្ពស់', 'h', 'cm'],
    ['SpO2', 'spo2', '%'],
    ['ជីពចរ', 'p', 'bpm']
  ];
  return `<section class="lab-report-vitals"><h3>សញ្ញាជីវិត</h3><div class="lab-report-vitals-grid">${items.map(([label, key, unit]) => `<div><b>${label}:</b> ${esc(data[key] || 'N/A')}${unit ? ` ${unit}` : ''}</div>`).join('')}</div></section>`;
}
function labResultPrint(date, tests, technician, requestedBy, fields, format = '') {
  const groups = new Map();
  tests.forEach((test) => {
    const category = test.category || test.cat || test.name;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(test);
  });
  const sections = [...groups].map(([category, items]) => `<section><h3>${esc(category)}</h3>${items.map((test) => {
    const rows = fields.filter((field) => String(field.template_id) == String(test.id)).map((field) => `<tr><td>${esc(field.name)}</td><td class="lab-report-result ${labResultRangeStatus(field.result, field.normal_range)}">${esc(field.result || '')}</td><td>${esc(field.unit || '')}</td><td>${esc(field.normal_range || '')}</td></tr>`).join('');
    return `${items.length > 1 ? `<h4>${esc(test.name)}</h4>` : ''}<table class="lab-report-table"><colgroup><col class="lab-report-test-col"><col class="lab-report-result-col"><col class="lab-report-unit-col"><col class="lab-report-range-col"></colgroup><tbody>${rows}</tbody></table>`;
  }).join('')}</section>`).join('');
  const patient = curPt() || {};
  const printDate = date ? date.split('-').reverse().join('/') : '';
  const header = `<div class="lab-report-patient"><div><p><b>${T('Patient name')}:</b> ${esc(patient.name || '')}</p><p><b>${T('Patient ID')}:</b> ${esc(patient.id || '')}</p><p><b>${T('Sex')}:</b> ${esc(T(fmtSex(patient.sex) || 'N/A'))}</p></div><div><p><b>${T('Age')}:</b> ${esc(fmtAge(patient))}</p><p><b>${T('Requested by')}:</b> ${esc(requestedBy || '')}</p><p><b>${T('Date')}:</b> ${esc(printDate)}</p></div></div><div class="lab-report-divider"></div>`;
  const formatClass = format == 'CL' ? ' lab-report-cl' : '';
  const vitals = format == 'S+L' ? labVitalSignsPrint() : '';
  printDoc('', `<section class="lab-report${formatClass}">${header}${format ? `<div class="lab-report-format">${esc(format)}</div>` : ''}${vitals}<div class="lab-report-sections">${sections}</div><footer class="lab-report-signature"><div>Technical Laboratory</div><span aria-hidden="true"></span><small>${esc(technician || '....................')}</small></footer></section>`, { omitClinicBranding: true, includeClinicBanner: true });
}
function labSavedResultPrint(id, format = '') {
  const record = recs.find((item) => item.id == id);
  if (!record) return toast(T('Lab result not found'));
  const data = jd(record), tests = Array.isArray(data.tests) && data.tests.length
    ? data.tests.map((test) => ({ id: test.template_id, name: test.name, category: test.category }))
    : [{ id: data.template_id, name: data.test_name || record.title || T('Lab result'), category: data.category }];
  labResultPrint((record.date || '').slice(0, 10), tests, data.lab_technician || '', data.requested_by || '', Array.isArray(data.fields) ? data.fields : [], format);
}
function labResultForm(templates, record = null) {
  const existing = record ? jd(record) : {};
  const selectedTemplates = Array.isArray(templates) ? templates : [templates];
  if (!selectedTemplates.length || selectedTemplates.some((template) => !template)) return toast(T('Lab template not found'));
  const savedTests = Array.isArray(existing.tests) ? existing.tests : null;
  const tests = savedTests
    ? savedTests.map((test) => {
      const template = selectedTemplates.find((item) => String(item.id) == String(test.template_id));
      return { ...(template || {}), id: test.template_id, name: test.name || template?.name, cat: test.category || template?.cat, price: test.price ?? template?.price };
    })
    : selectedTemplates;
  const fields = savedTests
    ? savedTests.flatMap((test) => (test.fields || []).map((field) => ({ ...field, template_id: test.template_id, category: test.category, test_name: test.name })))
    : selectedTemplates.flatMap((template) => {
      const templateFields = labFieldValues(template);
      return (templateFields.length ? templateFields : [{ name: template.name }]).map((field) => ({ ...field, template_id: template.id, category: template.cat || '', test_name: template.name }));
    });
  if (!fields.length) fields.push({ name: T('Result'), template_id: tests[0].id, category: tests[0].cat || '', test_name: tests[0].name });
  const values = new Map((existing.fields || []).map((field, index) => [`${field.template_id ?? ''}:${field.name}:${index}`, field.result || '']));
  const existingValues = (existing.fields || []).map((field) => field.result || '');
  const total = tests.reduce((sum, test) => sum + (Number(test.price) || 0), 0);
  const title = tests.map((test) => test.name).join(', ');
  const renderFieldRow = (field, index) => {
    const value = existingValues[index] || values.get(`${field.template_id}:${field.name}:${index}`) || '';
    return `<div class="lab-entry-row"><span class="lab-entry-name">${esc(field.name)}</span><input class="in" name="lab_result_${index}" value="${esc(value)}" aria-label="${esc(field.name)} ${esc(T('Result'))}"><span class="lab-entry-range">${esc(field.normal_range || '')}</span><span class="lab-entry-unit">${esc(field.unit || '')}</span></div>`;
  };
  const categories = [...new Set(tests.map((test) => test.cat || test.name))];
  const sections = categories.map((category) => `<section class="lab-entry-section"><h4>${esc(category)}</h4>${tests.filter((test) => (test.cat || test.name) == category).map((test) => {
    const rows = fields.map((field, index) => String(field.template_id) == String(test.id) ? renderFieldRow(field, index) : '').join('');
    return `${tests.length > 1 ? `<h5>${esc(test.name)}</h5>` : ''}<div class="lab-entry-columns"><span>${T('Test')}</span><span>${T('Result')}</span><span>${T('Normal Range')}</span><span>${T('Unit')}</span></div><div class="lab-entry-grid">${rows}</div>`;
  }).join('')}</section>`).join('');
  const body = `<div class="lab-result-header-fields"><label class="fl">${T('Date')}<input class="in" name="date" type="date" value="${esc((record?.date || ymd(new Date())).slice(0, 10))}"></label>${fIn(T('Requested by'), 'requested_by', existing.requested_by || '')}${fIn(T('Lab technician'), 'lab_technician', existing.lab_technician || '')}<div class="lab-entry-total"><span>${T('Total')}</span><b>${K(total)}</b></div></div><div class="lab-entry-sections">${sections}</div>${fTa('Notes', 'notes', record?.notes || '', 2)}`;
  openForm(`${record ? T('Edit Lab Result') : T('Add Lab Result')} — ${esc(title)}`, body, async (form) => {
    const data = new FormData(form);
    const resultFields = fields.map((field, index) => ({ ...field, result: String(data.get(`lab_result_${index}`) || '').trim() }));
    if (!resultFields.some((field) => field.result)) throw new Error(T('Enter at least one lab result'));
    const testsData = tests.map((test) => ({
      template_id: test.id,
      name: test.name,
      category: test.cat || '',
      price: Number(test.price) || 0,
      fields: resultFields.filter((field) => String(field.template_id) == String(test.id)).map(({ template_id, category, test_name, ...field }) => field)
    }));
    const body = { patient_id: pdId, kind: 'lab', title, date: data.get('date'), notes: data.get('notes'), data: { template_id: tests.length == 1 ? tests[0].id : null, test_name: title, category: tests.length == 1 ? tests[0].cat || '' : '', price: total, requested_by: data.get('requested_by'), lab_technician: data.get('lab_technician'), tests: testsData, fields: resultFields } };
    if (record) await api('PUT', 'records/' + record.id, body);
    else await api('POST', 'records', body);
    labSubtab = 'results'; await loadRecs(); render(); toast('Saved');
  }, { cls: 'xl lab-result-form', ok: T('Save'), hideCancel: true, extra: `<button type="button" class="btn" data-a="labresultprint">${T('Print')}</button><button type="button" class="btn" data-a="labresultback">${T('Back')}</button>` });
  $('#mf').dataset.labPrintTests = JSON.stringify(tests);
  $('#mf').dataset.labPrintFields = JSON.stringify(fields);
}
function labResultSelectionNext() {
  const templates = [...labPickerSelection].map((id) => D.lab.find((lab) => String(lab.id) == String(id))).filter(Boolean);
  if (!templates.length) return toast(T('Select a lab test'));
  labResultForm(templates);
}
function labResultPrintFromForm() {
  const form = $('#mf'), tests = JSON.parse(form.dataset.labPrintTests || '[]'), fields = JSON.parse(form.dataset.labPrintFields || '[]');
  const data = new FormData(form);
  const results = fields.map((field, index) => ({ ...field, result: String(data.get(`lab_result_${index}`) || '').trim() }));
  labResultPrint(data.get('date') || '', tests, data.get('lab_technician') || '', data.get('requested_by') || '', results);
}
Object.assign(L, {
  'Add Lab Result': 'បញ្ចូលលទ្ធផល Lab',
  'Edit Lab Result': 'កែប្រែលទ្ធផល Lab',
  'Upload Document': 'បញ្ចូលឯកសារ',
  'Document name': 'ឈ្មោះឯកសារ',
  'Document image': 'រូបភាពឯកសារ',
  'Select a document image': 'សូមជ្រើសរើសរូបភាពឯកសារ',
  'Lab Result History': 'ប្រវត្តិលទ្ធផល Lab',
  'Echo Report': 'របាយការណ៍ Echo',
  'Add Echo Report': 'បន្ថែមរបាយការណ៍ Echo',
  'Edit Echo Report': 'កែប្រែរបាយការណ៍ Echo',
  'Select Echo Template': 'ជ្រើសរើសប្លង់គំរូ',
  'Template layout': 'ប្លង់គំរូ',
  'No Echo templates found': 'រកមិនឃើញប្លង់គំរូ Echo ទេ',
  'Echo template could not be read': 'មិនអាចអានប្លង់គំរូ Echo បានទេ',
  'Create an Echo Template first': 'សូមបង្កើតទម្រង់ Echo ជាមុន',
  'Enter at least one Echo finding': 'សូមបញ្ចូលលទ្ធផល Echo យ៉ាងតិចមួយ',
  'Echo template not found': 'រកមិនឃើញទម្រង់ Echo ទេ',
  'Findings': 'លទ្ធផលពិនិត្យ',
  'Doctor': 'វេជ្ជបណ្ឌិត',
  'View': 'មើល',
  'Default': 'លំនាំដើម',
  'Reports': 'របាយការណ៍',
  'Add Report': 'បន្ថែមរបាយការណ៍',
  'Completed': 'បានបញ្ចប់',
  'Edit': 'កែប្រែ',
  'Print': 'បោះពុម្ព',
  'Delete': 'លុប',
  'Date': 'កាលបរិច្ឆេទ',
  'Requested by': 'អ្នកស្នើសុំ',
  'Lab technician': 'អ្នកបច្ចេកទេស Lab',
  'Total': 'សរុប',
  'Test': 'តេស្ត',
  'Patient name': 'ឈ្មោះអ្នកជំងឺ',
  'Patient ID': 'លេខសម្គាល់អ្នកជំងឺ',
  'selected': 'បានជ្រើសរើស',
  'Back': 'ត្រឡប់ក្រោយ',
  'Documents': 'ឯកសារ',
  'Results': 'លទ្ធផល',
  'Uploaded result image': 'បានបញ្ចូលរូបភាពលទ្ធផល',
  'Search lab tests…': 'ស្វែងរក Lab...',
  'Search lab tests…': 'ស្វែងរក Lab...',
  'No matching lab tests.': 'រកមិនឃើញតេស្ត Lab ទេ។',
  'Other': 'ផ្សេងៗ',
  'Next': 'បន្ទាប់',
  'Select a lab test': 'សូមជ្រើសរើសតេស្ត Lab',
  'Result': 'លទ្ធផល',
  'Enter at least one lab result': 'សូមបញ្ចូលលទ្ធផល Lab យ៉ាងតិចមួយ'
});
function operationParticipantRow(selected = '') {
  const doctors = D.dr.map((doctor) => `<option value="${esc(doctor.id)}" ${String(doctor.id) == String(selected) ? 'selected' : ''}>${esc(doctor.name)}${doctor.specialist ? ` · ${esc(doctor.specialist)}` : ''}</option>`).join('');
  return `<div class="operation-participant-row"><select class="in" name="participants" aria-label="Physician"><option value="">Select physician</option>${doctors || '<option value="" disabled>No physicians available</option>'}</select><button type="button" class="btn s" data-a="opremovephysician" title="Remove physician">×</button></div>`;
}
function operationForm(r) {
  const editing = !!r, d = r ? jd(r) : {}, date = nowLocal();
  const participants = Array.isArray(d.participants) ? d.participants : [];
  const requestedDate = (d.requested_date || r && r.date || date).slice(0, 16), operationDate = (d.operation_date || r && r.date || date).slice(0, 16);
  const serviceOptions = D.sv.map((service) => `<option value="${esc(service.id)}" ${String(service.id) == String(d.service_id || '') ? 'selected' : ''}>${esc(service.name)}</option>`).join('');
  const area = (label, key, rows = 3, full = false) => `<textarea class="in${full ? ' operation-full' : ''}" name="${key}" rows="${rows}" placeholder="${esc(label)}" aria-label="${esc(label)}">${esc(d[key] || '')}</textarea>`;
  const group = (fields) => `<div class="operation-grid">${fields.map(([label, key]) => area(label, key, 3, label == 'Description')).join('')}</div>`;
  const fields = [
    ['Preoperative Medications', 'preoperative_medications'], ['Preparation of the Patient', 'preparation_of_patient'],
    ['Position of the Patient', 'position_of_patient'], ['Incision Site', 'incision_site']
  ];
  const closingFields = [
    ['Assessment before Closure', 'assessment_before_closure'], ['Instruments & Sponges Count', 'instruments_sponges_count'],
    ['Materials Input', 'materials_input'], ['Closure Description', 'closure_description'],
    ['Estimation blood loss', 'estimation_blood_loss'], ['Blood Transfusion', 'blood_transfusion'],
    ['Further Investigation', 'further_investigation'], ['Complications prediction', 'complications_prediction'],
    ['Post-OP Plan', 'post_op_plan']
  ];
  const body = `<div class="operation-form">
    <div class="operation-request-grid">
      ${fIn('Requested by *', 'requested_by', d.requested_by || '', 'text', 'required')}
      ${fIn('Requested date *', 'requested_date', requestedDate, 'datetime-local', 'required')}
      <label class="fl">Service *<select class="in" name="service_id" required><option value="">Select Service</option>${serviceOptions}</select></label>
      ${fIn('Operation date *', 'operation_date', operationDate, 'datetime-local', 'required')}
    </div>
    <div class="operation-participants"><span>List Participants</span><div id="operation-participants">${participants.map((id) => operationParticipantRow(id)).join('')}</div><button type="button" class="btn" data-a="opaddphysician">＋ Add physician</button></div>
    <label class="fl operation-type">Form Type<select class="in" name="form_type"><option value="English" ${d.form_type != 'Khmer' ? 'selected' : ''}>English</option><option value="Khmer" ${d.form_type == 'Khmer' ? 'selected' : ''}>Khmer</option></select></label>
    <hr><h4>Surgical Procedure</h4>
    <div class="operation-grid">
      ${area('Patient Profile/Condition', 'patient_profile_condition')}
      ${area('Pre-OP Diagnosis', 'pre_op_diagnosis')}
      ${area('Procedure/Indication', 'procedure_indication')}
      ${area('Post-OP Diagnosis', 'post_op_diagnosis')}
      <fieldset class="operation-anesthesia"><legend>Anesthesia Type</legend><div>${['General', 'Epidural', 'Regional Block', 'Sedation', 'General Endotracheal', 'Spinal', 'Local'].map((type) => fCb(type, 'anesthesia_types', (d.anesthesia_types || []).includes(type), type)).join('')}</div></fieldset>
      ${area('Anesthesia Desc', 'anesthesia_description')}
    </div>
    <hr><h4>Description of Procedure</h4>${group(fields)}
    <hr><h4>Technique / Procedure</h4><div class="operation-grid">${area('Description', 'description', 4, true)}</div>
    <hr>${group(closingFields)}
  </div>`;
  openForm(editing ? 'Edit Operation Request Form' : 'New Operation Request Form', body, async (f) => {
    const m = new FormData(f), requestedBy = String(m.get('requested_by') || '').trim(), service = D.sv.find((item) => String(item.id) == String(m.get('service_id') || ''));
    if (!requestedBy) throw new Error('Enter who requested the operation');
    if (!service) throw new Error('Select an operation service');
    if (!m.get('requested_date') || !m.get('operation_date')) throw new Error('Enter both operation dates');
    const data = {
      requested_by: requestedBy, requested_date: m.get('requested_date') || '', service_id: service.id, service_name: service.name,
      operation_date: m.get('operation_date') || '', participants: m.getAll('participants').filter(Boolean), form_type: m.get('form_type') || 'English',
      patient_profile_condition: m.get('patient_profile_condition') || '', pre_op_diagnosis: m.get('pre_op_diagnosis') || '',
      procedure_indication: m.get('procedure_indication') || '', post_op_diagnosis: m.get('post_op_diagnosis') || '',
      anesthesia_types: m.getAll('anesthesia_types'), anesthesia_description: m.get('anesthesia_description') || ''
    };
    [...fields, ['Description', 'description'], ...closingFields].forEach(([, key]) => { data[key] = m.get(key) || ''; });
    const record = { patient_id: pdId, kind: 'operation', title: service.name, date: data.operation_date, notes: data.description, data };
    editing ? await api('PUT', 'records/' + r.id, record) : await api('POST', 'records', record);
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'operation-form-dialog', close: true });
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
  const k = r ? r.kind : ptab, e = !!r; r = r || { date: ymd(new Date()) };
  if (k == 'vaccination') { vaccinationForm(e ? r : null); return; }
  if (k == 'operation') { operationForm(e ? r : null); return; }
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
let mrFormBase = {};
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
  const printRow = (label, value) => `<tr><th>${esc(label)}</th><td>${value ? esc(value).replace(/\n/g, '<br>') : '—'}</td></tr>`;
  return MR.map((it) => { const [t, k, l, o] = it;
    if (t == 'h') return `<h4>${esc(k)}</h4>`; if (t == 's') return `<h5>${esc(k)}</h5>`;
    if (t == 'g') return `<table class="pk full">${k.map(([kk, ll]) => printRow(ll, d[kk])).join('')}</table>`;
    if (t == 'a' || t == 'i') return `<p><b>${esc(l)}:</b> ${d[k] ? esc(d[k]).replace(/\n/g, '<br>') : '—'}</p>`;
    if (t == 'c') return `<p><b>${esc(l)}:</b> ${(d[k] || []).length ? d[k].map(esc).join(', ') : '—'}</p>`;
    if (t == 'p') return `<p><b>${esc(l)}:</b> Left ${esc(d[k + '_l'] || '—')} / Right ${esc(d[k + '_r'] || '—')}</p>`;
    if (t == 'm') { const x = [...MON.filter(([q]) => d['mon_' + q]).map(([q, n]) => `${n} every ${esc(d['mon_' + q + '_h'] || '?')} h`), ...(d.mon_o ? [esc(d.mon_o_h || 'Other')] : [])]; return `<p><b>Monitor:</b> ${x.length ? x.join('; ') : '—'}</p>`; }
    if (t == 't') return `<table class="pk full"><tr><th>Date / Vital signs</th><th>Evolution of patient</th><th>Treatment</th></tr>${(d.mt || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c || '')}</td>`).join('')}</tr>`).join('')}</table>`;
    return ''; }).join('');
}
function mrForm(r) {
  const e = !!r, d = r ? jd(r) : {}; r = r || { date: nowLocal() };
  mrFormBase = d;
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
  const khmer = lang == 'km';
  openForm(khmer ? 'ទម្រង់ពិគ្រោះគ្លីនិក (Clinic Form - CNF)' : 'Consultation Form (CNF)', `<div class="consultation-form-scroll"><div class="cnfw"><div class="cnfl"><div class="tabs cnft"><button type="button" class="on" data-a="cnftab:gen">${khmer ? 'ទម្រង់ទូទៅ (General Form)' : 'General Form'}</button><button type="button" data-a="cnftab:plan">${khmer ? 'ការវាយតម្លៃ និងផែនការ (Assessment & Plan)' : 'Assessment & Plan'}</button></div>
<div id="cn-gen">${cnHtml(CN, d)}</div><div id="cn-plan" hidden>${cnHtml(CNP, d)}</div></div>
<div class="cnfh"><div class="tools" style="justify-content:space-between"><b>${khmer ? 'ប្រវត្តិទម្រង់ (Form History)' : 'Form History'}</b><button type="button" class="btn s" data-a="cnfnew" title="${khmer ? 'ទម្រង់ថ្មី' : 'New form'}">+</button></div>${hist.map((x) => `<div class="rc ${e && x.id == r.id ? 'sel' : ''}" data-a="cnfload:${x.id}" style="cursor:pointer"><b>${esc((x.date || '').replace('T', ' '))}</b><div class="mu">${esc(jd(x).as_ass || jd(x).as_dx || (jd(x).prob || []).slice(0, 3).join(', '))}</div></div>`).join('') || `<p class="mu" style="font-size:12px">${khmer ? 'មិនទាន់មានប្រវត្តិទម្រង់ទេ។' : 'No history records yet.'}</p>`}</div></div></div>`, async (f) => {
    const b = { patient_id: pdId, kind: 'cnf', date: e ? r.date : nowLocal(), data: { ...d, ...cnCollect(f, CN), ...cnCollect(f, CNP) } };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { cls: 'xl cnf', close: true, hideCancel: true, ok: khmer ? 'រក្សាទុក' : 'Save Only', extra: `<button type="button" class="btn" data-a="cnfprint">${khmer ? 'បោះពុម្ពទម្រង់' : 'Print Current'}</button>` });
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

const followUpRows = () => D.ap.filter((appointment) => appointment.type === 'Follow Up');
R.fu = function () {
  const today = ymd(new Date()), rows = followUpRows()
    .filter((appointment) => !q || JSON.stringify({ ...appointment, patient_name: ptById(appointment.patient_id)?.name || appointment.name }).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  const dueCount = rows.filter((appointment) => appointment.reminder_date && appointment.reminder_date <= today && appointment.reminder_status !== 'Sent' && !['Done', 'Cancelled'].includes(appointment.st)).length;
  return hd(T('Follow Up'), T('Schedule and track follow-up appointments and reminders.'), sr(T('Search patient name…')) + `<button class="btn g" data-a="fuadd">＋ ${T('Schedule Follow Up')}</button>`) +
    `<div class="follow-up-summary"><div class="card"><span>${T('Follow-up appointments')}</span><b>${rows.length}</b></div><div class="card"><span>${T('Reminders due')}</span><b>${dueCount}</b></div></div>` +
    `<div class="card follow-up-table-wrap"><table class="follow-up-table"><thead><tr>${['Patient', 'Reason / service', 'Date', 'Time', 'Doctor', 'Reminder', 'Status', 'Actions'].map((label) => `<th>${T(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((appointment) => {
      const patient = ptById(appointment.patient_id), reminder = appointment.reminder_date
        ? appointment.reminder_status === 'Sent' ? T('Sent') : appointment.reminder_date <= today ? T('Due') : T('Scheduled')
        : '—';
      return `<tr><td><button type="button" class="follow-up-patient" data-a="fuopen:${appointment.patient_id}">${esc(patient?.name || appointment.name)}</button></td><td>${esc(appointment.svc || '—')}</td><td>${esc(appointment.date || '')}</td><td>${esc(appointment.time || '—')}</td><td>${esc(appointment.doc || '—')}</td><td>${appointment.reminder_date ? `${esc(appointment.reminder_date)} <span class="bd ${appointment.reminder_status === 'Sent' ? '' : appointment.reminder_date <= today ? 'b' : ''}">${reminder}</span>` : reminder}</td><td><span class="bd ${appointment.st === 'Cancelled' ? 'x' : appointment.st === 'Waiting' ? 'b' : ''}">${esc(appointment.st || 'Waiting')}</span></td><td class="follow-up-actions"><button type="button" class="btn s" data-a="fuedit:${appointment.id}">${T('Edit')}</button>${appointment.reminder_date && appointment.reminder_status !== 'Sent' ? ` <button type="button" class="btn s" data-a="furemind:${appointment.id}">${T('Mark reminder sent')}</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="emp">${T('No follow-up appointments yet.')}</td></tr>`}</tbody></table></div>`;
};

function followUpForm(id = null, patientId = null) {
  const appointment = id == null ? null : D.ap.find((item) => item.id == id && item.type === 'Follow Up');
  if (id != null && !appointment) return toast(T('Follow-up appointment not found.'));
  const selectedPatientId = patientId || appointment?.patient_id || '';
  const statusOptions = ['Waiting', 'Confirmed', 'Done', 'Cancelled'];
  const patientField = `<label class="fl">${T('Patient')}<select class="in" name="patient_id" required><option value="">${T('Select patient')}</option>${D.pt.map((patient) => `<option value="${esc(patient.id)}" ${patient.id == selectedPatientId ? 'selected' : ''}>${esc(patient.name)}</option>`).join('')}</select></label>`;
  const doctorField = `<label class="fl">${T('Doctor')}<select class="in" name="doc"><option value="">${T('Select doctor')}</option>${D.dr.map((doctor) => `<option value="${esc(doctor.name)}" ${doctor.name == appointment?.doc ? 'selected' : ''}>${esc(doctor.name)}</option>`).join('')}</select></label>`;
  const body = `<div class="follow-up-form-grid">${patientField}${fIn(T('Reason / service'), 'svc', appointment?.svc || '')}${fIn(T('Appointment date'), 'date', appointment?.date || '', 'date', 'required')}${fIn(T('Time'), 'time', appointment?.time || '', 'time')}${doctorField}${fSel(T('Status'), 'st', appointment?.st || 'Waiting', statusOptions)}${fIn(T('Reminder date'), 'reminder_date', appointment?.reminder_date || '', 'date')}${fSel(T('Reminder status'), 'reminder_status', appointment?.reminder_status || 'Pending', ['Pending', 'Sent'])}<label class="follow-up-notes">${T('Notes')}<textarea class="in" name="notes" rows="3">${esc(appointment?.notes || '')}</textarea></label></div>`;
  openForm(T(appointment ? 'Edit Follow Up' : 'Schedule Follow Up'), body, async (form) => {
    const values = Object.fromEntries(new FormData(form)), patient = ptById(Number(values.patient_id));
    if (!patient) throw new Error(T('Select a patient'));
    if (!values.date) throw new Error(T('Appointment date is required'));
    if (values.reminder_date && values.reminder_date > values.date) throw new Error(T('Reminder date must be on or before the appointment date'));
    if (appointment && values.reminder_date !== appointment.reminder_date && values.reminder_status === 'Sent') values.reminder_status = 'Pending';
    const payload = {
      name: patient.name,
      patient_id: patient.id,
      phone: patient.phone || '',
      type: 'Follow Up',
      svc: String(values.svc || ''),
      date: values.date,
      time: String(values.time || ''),
      doc: String(values.doc || ''),
      st: String(values.st || 'Waiting'),
      reminder_date: String(values.reminder_date || ''),
      reminder_status: String(values.reminder_status || 'Pending'),
      notes: String(values.notes || '')
    };
    await api(appointment ? 'PUT' : 'POST', appointment ? `appointments/${appointment.id}` : 'appointments', payload);
    await load();
    render();
    toast(T('Saved'));
  }, { cls: 'follow-up-form' });
}

async function markFollowUpReminderSent(id) {
  const appointment = D.ap.find((item) => item.id == id && item.type === 'Follow Up');
  if (!appointment) return toast(T('Follow-up appointment not found.'));
  try {
    await api('PUT', `appointments/${appointment.id}`, { reminder_status: 'Sent' });
    await load();
    render();
    toast(T('Reminder marked as sent'));
  } catch (error) { toast(error.message); }
}

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
  else if (a == 'fuadd') followUpForm();
  else if (a == 'fuedit') followUpForm(Number(x));
  else if (a == 'fudone') return completePatientFollowUp(Number(x));
  else if (a == 'furemind') markFollowUpReminderSent(Number(x));
  else if (a == 'fuopen') openPatient(Number(x)).catch((e) => toast(e.message));
  else if (a == 'pdschedule-followup') followUpForm(null, x ? Number(x) : pdId);
  else if (a == 'agem') { $('#agebox').dataset.mode = x; document.querySelectorAll('#agem button').forEach((b) => b.classList.toggle('on', b.dataset.a == 'agem:' + x)); }
  else if (a == 'vsbtn') { $('#vsbox').hidden = !$('#vsbox').hidden; } else if (a == 'regprint') regPrint();
  else if (a == 'opaddphysician') $('#operation-participants').insertAdjacentHTML('beforeend', operationParticipantRow());
  else if (a == 'opremovephysician') el.closest('.operation-participant-row').remove();
  else if (a == 'rtab') { ptab = x; try { sessionStorage.setItem('currentPatientTab', ptab); } catch (e) { /* retain the current view */ } render(); } else if (a == 'radd') { ptab == 'vitals' ? vsForm() : ptab == 'medical' ? mrForm() : ptab == 'schedule' ? schForm() : ptab == 'consultation' ? consultationFormPicker() : ptab == 'lab' ? labResultPicker() : ptab == 'echo' ? echoReportForm() : genForm(); }
  else if (a == 'patient-echo-add') echoReportForm();
  else if (a == 'patient-echo-edit') { const record = recs.find((item) => item.id == x); if (record) echoReportForm(record); }
  else if (a == 'patient-echo-view') { const record = recs.find((item) => item.id == x); if (record) echoReportView(record); }
  else if (a == 'patient-echo-print') { const record = recs.find((item) => item.id == x); if (record) echoReportPrint(record, y || 'Default'); }
  else if (a == 'patient-echo-preview-zoom') echoReportPreviewZoom(x);
  else if (a == 'patient-echo-preview-print') echoReportPreviewPrint(x);
  else if (a == 'patient-echo-twin') echoReportAddTwin();
  else if (a == 'patient-echo-report-template') {
    const recordId = $('#mf').dataset.echoReportRecordId;
    const snapshot = echoReportDraftSnapshot();
    echoTemplatePicker((template) => echoReportChooseTemplate(recordId ? recs.find((item) => String(item.id) == recordId) || null : null, template, snapshot));
  }
  else if (a == 'patient-echo-service-search') echoReportServiceResults($('#echo-service-search')?.value || '');
  else if (a == 'patient-echo-image-remove') echoReportRemoveImage(Number(x));
  else if (a == 'patient-echo-service') {
    const service = D.sv.find((item) => String(item.id) == String(x));
    if (!service) return toast(T('Service not found'));
    $('#echo-report-service-id').value = service.id;
    $('#echo-report-service-name').value = service.name;
    $('#echo-selected-service').textContent = service.name;
    $('#echo-service-search').value = service.name;
    $('#echo-service-results').hidden = true;
  }
  else if (a == 'patient-echo-doctor-add') {
    const input = $('#echo-report-doctor-new');
    input.hidden = false;
    input.focus();
  }
  else if (a == 'patient-echo-template') echoTemplatePicker();
  else if (a == 'patient-echo-size') { echoPageSize = echoPageSize == 'A4' ? 'Letter' : echoPageSize == 'Letter' ? 'A5' : 'A4'; render(); }
  else if (a == 'patient-echo-upload') echoUploadForm();
  else if (a == 'patient-echo-tab') { echoSubtab = x; render(); }
  else if (a == 'labtab') { labSubtab = x; render(); }
  else if (a == 'labupload') labUploadForm();
  else if (a == 'labhistory') labHistory(recs.filter((record) => record.kind == 'lab').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id));
  else if (a == 'labhistoryprint') labHistoryPrint(recs.filter((record) => record.kind == 'lab').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id));
  else if (a == 'labprint') labHistoryPrint(recs.filter((record) => record.kind == 'lab' && (!pdDate || (record.date || '').startsWith(pdDate))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id));
  else if (a == 'labresultprint') labResultPrintFromForm();
  else if (a == 'labrecordprint') labSavedResultPrint(x, y == 'sl' ? 'S+L' : y == 'cl' ? 'CL' : '');
  else if (a == 'labresultback') labResultPicker(true);
  else if (a == 'consult-medical') consultationForm('standard');
  else if (a == 'consult-documents') { ptab = 'documents'; render(); }
  else if (a == 'consult-cnf') consultationForm('md');
  else if (a == 'consult-select') { $('#md').classList.remove('on'); x == 'clinic' ? cnfForm() : consultationForm(x); }
  else if (a == 'consultation-print') consultationPrint();
  else if (a == 'consult-history') {
    const history = recs.filter((r) => ['cnf', 'consultation', 'medical'].includes(r.kind)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const table = `<div class="consultation-history-table-wrap"><table class="consultation-history-table"><thead><tr>${['ល.រ', 'កាលបរិច្ឆេទ', 'ប្រភេទទម្រង់', 'ឈ្មោះអ្នកជំងឺ', 'អាយុ', 'ភេទ', 'រោគសញ្ញា / មូលហេតុ', 'សម្ពាធឈាម', 'ជីពចរ', 'សីតុណ្ហភាព', 'រោគវិនិច្ឆ័យ', 'ការព្យាបាល', 'ថ្ងៃណាត់', 'សកម្មភាព'].map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${history.map((r, i) => {
      const data = jd(r), complaint = data.chief_complaint || (data.prob || []).join(', ') || data.cc || r.notes || '';
      const kind = r.kind == 'cnf' ? 'ទម្រង់គ្លីនិក' : r.kind == 'medical' ? 'Medical Record' : data.consultation_mode == 'md' ? 'ទម្រង់ពិគ្រោះព្យាបាលជំងឺ(សេវាគាំពារមាតានិងទារក)' : data.consultation_mode ? 'ពិគ្រោះជំងឺ' : 'កំណត់ចំណាំ';
      return `<tr><td>${i + 1}</td><td>${esc((r.date || '').replace('T', ' '))}</td><td>${kind}</td><td>${esc((curPt() || {}).name || '')}</td><td>${esc(fmtAge(curPt()))}</td><td>${patientSexLabel(curPt())}</td><td>${esc(complaint)}</td><td>${esc(data.blood_pressure || '')}</td><td>${esc(data.pulse || '')}</td><td>${esc(data.temperature || '')}</td><td>${esc(data.assessment || data.as_ass || data.dx || '')}</td><td>${esc(data.treatment_plan || data.as_plan || '')}</td><td>${esc(data.followup_date || '')}</td><td><button type="button" class="btn s" data-a="redit:${r.id}">កែប្រែ</button> <button type="button" class="btn s r" data-a="rdel:${r.id}" aria-label="លុប">✕</button></td></tr>`;
    }).join('') || '<tr><td class="emp" colspan="14">មិនទាន់មានប្រវត្តិពិគ្រោះទេ។</td></tr>'}</tbody></table></div><button type="button" class="btn p consultation-history-add" data-a="consult-history-add">＋ បន្ថែមទម្រង់ពិគ្រោះ</button>`;
    openForm('ប្រវត្តិពិគ្រោះជំងឺ', table, async () => {}, { cls: 'xl consultation-history-dialog', ok: 'បិទ', extra: '<button type="button" class="btn" data-a="consult-history-print">បោះពុម្ព</button>' });
  }
  else if (a == 'consult-history-add') consultationFormPicker();
  else if (a == 'consult-history-print') consultationHistoryPrint();
  else if (a == 'center-form') centerForm();
  else if (a == 'centeraddrow') { centerFormRows = centerCollect($('#mf'), centerFormRows); centerFormRows.push({}); $('#center-rows').innerHTML = centerRowsHtml(centerFormRows); $('#mf').dataset.centerRowCount = String(centerFormRows.length); }
  else if (a == 'centerremoverow') { centerFormRows = centerCollect($('#mf'), centerFormRows); centerFormRows.splice(Number(x), 1); $('#center-rows').innerHTML = centerRowsHtml(centerFormRows); $('#mf').dataset.centerRowCount = String(centerFormRows.length); }
  else if (a == 'centerprint') centerPrint(centerCollect($('#mf'), centerFormRows));
  else if (a == 'centerprint-record') { const r = rec(); if (r) centerPrint(jd(r).rows || []); }
  else if (a == 'investigation-request') requestInvestigationServices().catch((e) => toast(e.message));
  else if (a == 'svcplus' || a == 'svcminus') changeInvestigationQuantity(x, Number(y), a == 'svcplus' ? 1 : -1).catch((e) => toast(e.message));
  else if (a == 'redit') { const r = rec(); r.kind == 'vitals' ? vsForm(r) : r.kind == 'medical' ? mrForm(r) : r.kind == 'schedule' ? schForm(r) : r.kind == 'mrd' ? mrdForm(r) : r.kind == 'lab' && jd(r).lab_attachment ? genForm(r) : r.kind == 'lab' ? labResultForm(D.lab.find((lab) => String(lab.id) == String(jd(r).template_id)) || { id: jd(r).template_id, name: jd(r).test_name || r.title, cat: jd(r).category, price: jd(r).price, fields: JSON.stringify(jd(r).fields || []) }, r) : r.kind == 'cnf' ? cnfForm(r) : r.kind == 'consultation' && jd(r).consultation_mode == 'center' ? centerForm(r) : r.kind == 'consultation' && jd(r).consultation_mode ? consultationForm(jd(r).consultation_mode, r) : genForm(r); }
  else if (a == 'rdel') { if (confirm(T('Delete this record?'))) api('DELETE', 'records/' + x).then(loadRecs).then(render).catch((e) => toast(e.message)); }
  else if (a == 'rprint') { const r = rec(); printDoc('Medical Record', ptBlock(curPt()) + `<p>${esc((r.date || '').replace('T', ' '))}</p>` + mrPrintHtml(jd(r))); }
  else if (a == 'vaxprint') { const r = rec(); if (r) vaccinationPrint(r); }
  else if (a == 'mrprint') { const f = $('#mf'); printDoc('Medical Record', ptBlock(curPt()) + `<p>${esc((new FormData(f).get('date') || '').replace('T', ' '))}</p>` + mrPrintHtml(mrCollect(f, mrFormBase))); }
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
  else if (a == 'ipdout') ipdOut(+x); else if (a == 'ipdreturn') returnIpdPatientToOpd(+x).catch((e) => toast(e.message)); else if (a == 'ipdbed') ipdBed(+x); else if (a == 'ipdtreat') ipdTreat(+x); else if (a == 'ipdedit') ipdEdit(+x); else if (a == 'ipdprint') ipdPrint(+x); else if (a == 'ipdshare') ipdShare(+x); else if (a == 'ipdadd') ipdAdd();
  else if (a == 'ptbed') bedForm(+x); else if (a == 'bedfollowup') return movePatientToFollowUp(+x); else if (a == 'ptadmit') ptAdmit(+x); else if (a == 'ptprint') ptCard(+x);
  else if (a == 'pttreat') treatmentFollowup(+x).catch((e) => toast(e.message));
  else if (a == 'ptdx') patientDiagnosisForm(+x);
  else if (a == 'ptdxnewdx') newDiagnosisForm(+x);
  else if (a == 'ptpay') payForm(+x, true); else if (a == 'ptinv') invoicePrint(+x).catch((e) => toast(e.message));
  else if (a == 'payall') return payForm(pdId, true);
  else if (a == 'payreceipt') paymentReceipt(+x);
  else if (a == 'recpay') payForm(pdId);
  else if (a == 'payall-shortcut') payAllShortcut(x);
  else if (a == 'payall-print') payAllPrint(x == 'compact');
  else if (a == 'payall-qr') payAllQr();
  else if (a == 'payall-discount-open') payAllDiscountOpen();
  else if (a == 'payall-discount-close') { const overlay = document.querySelector('#payall-discount-overlay'); if (overlay) overlay.remove(); }
  else if (a == 'payall-discount-apply') payAllDiscountApply();
  else if (a == 'paidview') {
    paidHistoryView = paidHistoryView == 'table' ? 'cards' : 'table';
    const panel = el && el.closest('.paid-history-panel');
    if (panel) panel.innerHTML = paidHistoryPanelInner(recs.filter((r) => r.kind == 'payment').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id), recs);
  }
  else if (a == 'ipdbill') openIpdBilling(+x).catch((e) => toast(e.message));
  else if (a == 'ipdinvoice') invoicePrint(+x).catch((e) => toast(e.message));
  else if (a == 'tfadd') { tfRows = tfDraftRows(); tfRows.push(tfNewRow()); tfRender(); }
  else if (a == 'tfremove') { tfRows = tfDraftRows(); tfRows.splice(+x, 1); tfRender(); }
  else if (a == 'tfhistory') { tfRows = tfDraftRows(); tfShowHistory = !tfShowHistory; tfRender(); }
  else if (a == 'tfedit') { const r = tfHistory.find((q) => q.id == x); if (r) { tfRows = [tfRowFromRecord(r)]; tfShowHistory = false; tfRender(); } }
  else if (a == 'tfdelete') tfDeleteRecord(+x).catch((e) => toast(e.message));
  else if (a == 'tfprint') tfPrintAll();
  else if (a == 'labpick') { const id = String(x); labPickerSelection.has(id) ? labPickerSelection.delete(id) : labPickerSelection.add(id); const list = $('#lab-result-list'); if (list) list.innerHTML = labPickerCards(); const next = document.querySelector('[data-a="labcontinue"]'); if (next) next.disabled = !labPickerSelection.size; const count = document.querySelector('.lab-picker-footer span'); if (count) count.textContent = `${labPickerSelection.size} ${T('selected')}`; }
  else if (a == 'labcontinue') labResultSelectionNext();
  else if (a == 'pdctl') { pdCtl = !pdCtl; render(); } else if (a == 'pdlay') { pdLay = pdLay == 'grid' ? 'list' : 'grid'; savePd(); render(); }
  else if (a == 'hidei' || a == 'hidec') { const S = a == 'hidei' ? pdHideI : pdHideC; S.has(x) ? S.delete(x) : S.add(x); savePd(); render(); }
  else if (a == 'dashap') { cal.mode = 'day'; cal.d = new Date(); cal.list = false; rt = 'ap'; q = ''; render(); }
  else if (a == 'dfilter') { dFrom = $('#dfrom').value; dTo = $('#dto').value; render(); } else if (a == 'dclear') { dFrom = ''; dTo = ''; render(); }
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.payallDiscountItem != null) payAllDiscountRefresh();
  else if (t.name == 'payall_discount_currency') payAllDiscountRefresh();
  else if (t.name == 'all_discount_currency' && $('#mf').classList.contains('payall-dialog')) payAllRefresh();
  else if (t.id == 'pfp') { try { toast('Uploading…'); const ph = await upl(t.files[0]); await api('PUT', 'patients/' + pdId, { photo: ph }); await load(); render(); } catch (er) { toast(er.message); } }
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
  if (['payall_discount_input', 'payall_discount_currency'].includes(e.target.name)) payAllDiscountRefresh();
  else if (['received', 'all_discount'].includes(e.target.name) && $('#mf').classList.contains('payall-dialog')) payAllRefresh();
  else if (e.target.id == 'lab-result-search') {
    labPickerQuery = e.target.value;
    const list = $('#lab-result-list');
    if (list) list.innerHTML = labPickerCards();
  }
  else if (e.target.id == 'pdd') { pdDate = e.target.value; $('#rp').innerHTML = recPanel(); }
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
const PTAB = [['OPD', 'OPD'], ['IPD', 'IPD'], ['Unpaid', 'Unpaid'], ['NSSF', 'NSSF'], ['Follow Up', 'Follow Up'], ['Details', 'Details']];
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
  followup: (r, v) => { const appointment = followUpFor(r.id); return has(appointment ? [appointment.date, appointment.st, appointment.svc, appointment.reminder_date].join(' ') : r.follow_up ? 'Follow Up' : 'No follow-up', v); },
  type: (r, v) => v == 'IPD' ? r.type == 'IPD' : r.type != 'IPD', treat: (r, v) => has(r.treatment, v), dx: (r, v) => has(r.diagnosis || r.last_dx, v),
  mr: (r, v) => v == 'yes' ? r.mr_count > 0 : !(r.mr_count > 0),   age: ageOk, sex: (r, v) => r.sex == v, pay: (r, v) => v == 'unpaid' ? patientDue(r.id) > 0 : !(patientDue(r.id) > 0),
  phone: (r, v) => lc(r.phone).replace(/\s/g, '').includes(lc(v).replace(/\s/g, '')), addr: (r, v) => has(r.addr, v),
  comp: (r, v) => has(r.complaints, v), hist: (r, v) => has(r.history, v), regd: (r, v) => has(r.reg_date, v) };
const SEL = { type: [['', 'All'], ['OPD', 'OPD'], ['IPD', 'IPD']], mr: [['', 'All'], ['yes', 'With record'], ['no', 'No record']], sex: [['', 'All'], ['M', 'Male'], ['F', 'Female']], pay: [['', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']] };
const pfActive = () => Object.entries(pf).filter(([, v]) => v !== '' && v != null);
const tabOk = (r) => tab == 'IPD' ? r.type == 'IPD' : tab == 'Unpaid' ? patientDue(r.id) > 0 : tab == 'NSSF' ? r.nssf : tab == 'Follow Up' ? !!r.follow_up || !!followUpFor(r.id) : tab == 'Details' ? true : r.type != 'IPD';
const colOk = (r) => pfActive().every(([k, v]) => PFN[k] ? PFN[k](r, String(v)) : true);
const ptRows = () => ft('pt').filter(([r]) => tabOk(r) && colOk(r));
const fCell = (k) => !k ? '<th class="fr"><button class="btn s" data-a="pfclear" title="Clear filters">✕</button></th>'
  : SEL[k] ? `<th class="fr ${k == 'latin' ? 'c-latin' : ''}"><select class="in" data-pf="${k}">${SEL[k].map(([v, l]) => `<option value="${v}" ${(pf[k] || '') == v ? 'selected' : ''}>${l}</option>`).join('')}</select></th>`
  : `<th class="fr ${k == 'latin' ? 'c-latin' : ''}"><input class="in" data-pf="${k}" value="${esc(pf[k] || '')}" placeholder="${k == 'age' ? '20-40' : '🔍'}"></th>`;
// ---- rows ----
// ---- columns: each one can be shown or hidden (saved in this browser) ----
const COLF = [['id', 'ID'], ['date', 'Date'], ['name', 'Name'], ['latin', 'Latin name'], ['nssf', 'NSSF ID'], ['nat', 'National ID'], ['type', 'IPD/OPD'], ['treat', 'Treatment'], ['dx', 'Diagnosis'], ['followup', 'Follow Up'], ['mr', 'Medical Record'], ['age', 'Age'], ['sex', 'Gender'], ['pay', 'Unpaid'], ['phone', 'Phone'], ['addr', 'Address'], ['act', 'Actions']];
const COLD = [['id', 'ID'], ['name', 'Name'], ['latin', 'Latin name'], ['phone', 'Phone'], ['addr', 'Address'], ['followup', 'Follow Up'], ['comp', 'Complaints'], ['hist', 'Past medical history'], ['regd', 'Registration date'], ['nssf', 'NSSF ID'], ['nat', 'National ID'], ['act', 'Actions']];
let ptHide = { full: new Set(), det: new Set() }, ptColsOpen = false, ptFilt = false;
try { const h = JSON.parse(localStorage.getItem('ptHide') || '{}'); ptHide = { full: new Set(h.full || []), det: new Set(h.det || []) }; ptFilt = localStorage.getItem('ptFilt') == '1'; } catch (e) { /* defaults */ }
const savePt = () => { try { localStorage.setItem('ptHide', JSON.stringify({ full: [...ptHide.full], det: [...ptHide.det] })); localStorage.setItem('ptFilt', ptFilt ? '1' : '0'); } catch (e) { /* ignore */ } };
const ptMode = () => (tab == 'Details' ? 'det' : 'full');
const ptDefs = () => (tab == 'Details' ? COLD : COLF);
const ptShown = () => ptDefs().filter(([k]) => !ptHide[ptMode()].has(k));
const followUpFor = (patientId) => {
  const today = ymd(new Date());
  return followUpRows().filter((appointment) => appointment.patient_id == patientId && !['Done', 'Cancelled'].includes(appointment.st))
    .sort((a, b) => {
      const aFuture = a.date >= today, bFuture = b.date >= today;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const dateOrder = (a.date || '').localeCompare(b.date || '');
      return (aFuture ? dateOrder : -dateOrder) || (a.time || '').localeCompare(b.time || '');
    })[0];
};
const followUpCell = (patient) => {
  const appointment = followUpFor(patient.id);
  if (!appointment) return `<td>${patient.follow_up ? `<span class="bd">${T('Follow Up')}</span>` : `<button type="button" class="btn s" data-a="pdschedule-followup:${patient.id}">＋ ${T('Schedule Follow Up')}</button>`}</td>`;
  const overdue = appointment.date < ymd(new Date());
  return `<td><div class="patient-follow-up"><span>${esc(fmtD(appointment.date))}</span><span class="bd ${overdue ? 'x' : appointment.st == 'Waiting' ? 'b' : ''}">${esc(overdue ? T('Overdue') : T(appointment.st || 'Waiting'))}</span><button type="button" class="btn s" data-a="fuedit:${appointment.id}">${T('Edit')}</button></div></td>`;
};
const act = (r, i) => `<button class="sq b" data-a="regedit:${i}" title="Edit">✎</button> <button class="sq r" data-a="del:pt:${i}" title="Delete">🗑</button>`;
const ptNm = (r, sm = true) => `<div class="pn"><div><a href="#" data-a="open:${r.id}">${esc(r.name)}</a>${sm && r.latin_name ? `<small class="pl">${esc(r.latin_name)}</small>` : ''}</div><span class="ic"><a href="#" data-a="open:${r.id}" title="Open patient file">👁</a><a href="#" data-a="ptadmit:${r.id}" title="${r.type == 'IPD' ? 'Discharge' : 'Admit to IPD'}">${r.type == 'IPD' ? '🚪' : '🛏'}</a><a href="#" data-a="ptprint:${r.id}" title="Print patient card">🖨</a></span></div>`;
const patientFollowUpAction = (patient) => tab == 'Follow Up'
  ? `<a href="#" class="pill opd clk" data-a="fudone:${patient.id}" title="${T('Done - return to OPD')}">${T('Done')}</a>`
  : patient.type != 'IPD' && !patient.follow_up
    ? `<a href="#" class="pill opd clk" data-a="bedfollowup:${patient.id}" title="${T('Follow Up')}">${T('FUP')}</a>`
    : '';
const cellsFull = (r, i, sm) => ({
  id: `<td>${r.id}</td>`, date: `<td>${fmtD(r.reg_date || r.created_at)}</td>`, name: `<td>${ptNm(r, sm)}</td>`, latin: `<td class="c-latin">${esc(r.latin_name || '')}</td>`,
  nssf: `<td>${esc(r.nssf_id || 'N/A')}</td>`, nat: `<td>${esc(r.national_id || 'N/A')}</td>`, type: `<td><span class="pill ${r.type == 'IPD' ? 'ipd' : 'opd'} clk" data-a="ptadmit:${r.id}" title="${r.type == 'IPD' ? 'Discharge to OPD' : 'Admit to IPD'}">${r.type == 'IPD' ? 'IPD' : 'OPD'}</span> ${patientFollowUpAction(r)}</td>`,
  treat: `<td title="${esc(r.treatment || '')}">${esc(trunc(r.treatment, 14))} <a href="#" class="ed" data-a="pttreat:${r.id}" title="Edit treatment">✎</a></td>`,
  dx: `<td title="${esc(r.diagnosis || r.last_dx || '')}">${esc(trunc(r.diagnosis || r.last_dx || 'N/A', 14))} <a href="#" class="ed" data-a="ptdx:${r.id}" title="Edit diagnosis">✎</a></td>`,
  followup: followUpCell(r),
  mr: `<td><button class="mrb" data-a="ptmr:${r.id}" title="New medical record">✎</button></td>`, age: `<td>${fmtAge(r)}</td>`,
  sex: `<td>${r.sex ? `<span class="pill ${r.sex == 'F' ? 'f' : 'm'}">${fmtSex(r.sex)}</span>` : ''}</td>`,
  pay: `<td>${patientDue(r.id) > 0 ? `<div class="due" data-a="ptpay:${r.id}" title="Record payment"><b>KHR ${patientDue(r.id).toLocaleString('en-US')}</b><br>${usd(patientDue(r.id))}</div>` : `<span class="paid">✔ Paid</span> <a href="#" data-a="ptinv:${r.id}" title="Invoice">🧾</a>`}</td>`,
  phone: `<td>${r.phone ? '📞 ' + esc(r.phone) : '<span class="mu">📞</span>'}</td>`, addr: `<td title="${esc(r.addr || '')}">${esc(trunc(r.addr || 'N/A', 14))}</td>`, act: `<td style="white-space:nowrap">${act(r, i)}</td>` });
const cellsDet = (r, i) => ({
  id: `<td>${r.id}</td>`, name: `<td>${ptNm(r, false)}</td>`, latin: `<td>${esc(r.latin_name || '')}</td>`, phone: `<td>${esc(r.phone || '')}</td>`, addr: `<td>${esc(r.addr || '')}</td>`,
  followup: followUpCell(r),
  comp: `<td style="white-space:pre-wrap;min-width:180px">${esc(r.complaints || '')}</td>`, hist: `<td style="white-space:pre-wrap;min-width:180px">${esc(r.history || '')}</td>`,
  regd: `<td>${esc((r.reg_date || '').replace('T', ' '))}</td>`, nssf: `<td>${esc(r.nssf_id || '')}</td>`, nat: `<td>${esc(r.national_id || '')}</td>`, act: `<td style="white-space:nowrap">${act(r, i)}</td>` });
function ptView() {
  const L = ptRows(), n = Math.max(1, Math.ceil(L.length / 10)); pg = Math.min(pg, n); const S = (pg - 1) * 10, page = L.slice(S, S + 10), det = tab == 'Details', cols = ptShown();
  const sm = !det && !ptHide.full.has('latin');
  return { count: L.length,
    body: page.map(([r, i]) => { const c = det ? cellsDet(r, i) : cellsFull(r, i, sm); return `<tr>${cols.map(([k]) => c[k].replace('<td', `<td class="pt-col-${k}"`)).join('')}</tr>`; }).join('') || `<tr><td colspan="${cols.length}" class="emp">No patients.</td></tr>`,
    pager: `<span>Showing ${L.length ? S + 1 : 0} to ${Math.min(L.length, S + 10)} of ${L.length} records</span><div><button class="btn s" data-a="pg:${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>‹ Previous</button>${pgNums(pg, n).map((x) => x == '…' ? '<span class="mu">…</span>' : `<button class="btn s ${x == pg ? 'p' : ''}" data-a="pg:${x}">${x}</button>`).join('')}<button class="btn s" data-a="pg:${pg + 1}" ${pg >= n ? 'disabled' : ''}>Next ›</button></div>` };
}
// typing in a filter only refreshes the rows, so the cursor stays in the box
function ptRefresh() { const v = ptView(), b = $('#ptbody'), p = $('#ptpg'), c = $('#pfclr'); if (b) b.innerHTML = v.body; if (p) p.innerHTML = v.pager; if (c) c.hidden = !pfActive().length; }
R.pt = function () {
  const det = tab == 'Details', v = ptView(), cols = ptShown(), defs = ptDefs();
  const panel = ptColsOpen ? `<div class="card pdc"><div class="tools" style="justify-content:space-between"><b>Show or hide columns</b><button class="btn s" data-a="ptcolsall">Show all</button></div><div class="pdcg" style="border:0;margin:8px 0 0;padding:0">${defs.map(([k, l]) => `<label class="cb"><input type="checkbox" data-a="ptcol:${k}" ${ptHide[ptMode()].has(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div></div>` : '';
  return `<div class="tools" style="margin-bottom:12px">${sr('Search Name, Phone, NSSF, National ID…')}<button class="btn p" data-a="reg">+ Add Patient</button><div class="tabs">${PTAB.map(([k, l]) => `<button class="${tab == k ? 'on' : ''}" data-a="tab:${k}">${l}</button>`).join('')}</div><button class="btn ${ptColsOpen ? 'on2' : ''}" data-a="ptcols">☰ Columns</button><button class="btn ${ptFilt ? 'on2' : ''}" data-a="ptfilt">Filters</button><button class="btn" id="pfclr" data-a="pfclear" ${pfActive().length ? '' : 'hidden'}>✕ Clear filters</button><button class="btn" data-a="csv">Export Excel</button></div>${panel}
<div class="card patient-table-wrap"><table class="ptb"><thead><tr>${cols.map(([k, l]) => `<th class="pt-col-${k} ${k == 'latin' && !det ? 'c-latin' : ''}">${l}</th>`).join('')}</tr>${ptFilt ? `<tr class="frow">${cols.map(([k]) => fCell(k == 'act' ? null : k)).join('')}</tr>` : ''}</thead><tbody id="ptbody">${v.body}</tbody></table></div>
<div class="pg" id="ptpg">${v.pager}</div>`;
};
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.pf; if (!k) return; pf[k] = e.target.value; pg = 1; ptRefresh(); });
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.pf; if (!k) return; pf[k] = e.target.value; pg = 1; ptRefresh(); });
async function ptAdmit(id) {
  try {
    const p = ptById(id);
    if (p.type == 'IPD') return await returnIpdPatientToOpd(id);
    else return bedForm(id);
  } catch (e) { toast(e.message); }
}
async function returnIpdPatientToOpd(id) {
  const p = ptById(id);
  if (!p) throw new Error('Patient not found');
  if (p.type != 'IPD') return;
  for (const r of D.ipd.filter((x) => String(x.code) == String(id) && !x.out)) await api('PUT', 'ipd/' + r.id, { out: 1, dis: ymd(new Date()) });
  await api('PUT', 'patients/' + id, { type: 'OPD' });
  await load();
  rt = 'pt'; tab = 'OPD'; q = ''; pg = 1;
  render(); toast('Discharged');
}
async function movePatientToFollowUp(patientId) {
  const patient = ptById(patientId);
  if (!patient) return toast(T('Patient not found.'));
  try {
    await api('PUT', `patients/${patient.id}`, { follow_up: 1 });
    await load();
    $('#md').classList.remove('on');
    rt = 'pt'; tab = 'Follow Up'; q = ''; pg = 1;
    render();
    toast(T('Moved to Follow Up'));
  } catch (error) { toast(error.message); }
}
function patientDiagnosisForm(patientId, selectedDiagnosis = null) {
  const patient = ptById(patientId);
  if (!patient) return toast(T('Patient not found.'));
  const diagnosis = selectedDiagnosis || patient.diagnosis;
  const options = ['', ...new Set([diagnosis, ...D.dx.map((item) => item.name)].filter(Boolean))];
  modal('Diagnosis', [['Diagnosis', 'diagnosis', 'sel', options]], { ...patient, diagnosis }, (values) => api('PUT', `patients/${patient.id}`, values));
  $('#mf').innerHTML += `<button type="button" class="btn s" data-a="ptdxnewdx:${patient.id}">＋ ${T('New Diagnosis')}</button>`;
}
function newDiagnosisForm(patientId) {
  const patient = ptById(patientId);
  if (!patient) return toast(T('Patient not found.'));
  const form = $('#mf');
  form.className = 'wide';
  form.innerHTML = `<h3 style="margin:0 0 8px">${T('New Diagnosis')}</h3>${fIn(T('Diagnosis'), 'name', '', 'text', 'required')}<div class="tools fb" style="justify-content:flex-end"><button type="button" class="btn" data-a="close">${T('Cancel')}</button><button class="btn p">${T('Save')}</button></div>`;
  $('#md').classList.add('on');
  form.onsubmit = async (event) => {
    event.preventDefault();
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name) return toast(T('Name is required'));
    if (D.dx.some((diagnosis) => diagnosis.name.toLowerCase() == name.toLowerCase())) return toast(T('Diagnosis already exists'));
    try {
      await api('POST', 'diagnoses', { name });
      await api('PUT', `patients/${patient.id}`, { diagnosis: name });
      await load();
      $('#md').classList.remove('on');
      render();
      toast(T('Saved'));
      patientDiagnosisForm(patient.id, name);
    } catch (error) { toast(error.message); }
  };
}
async function completePatientFollowUp(patientId) {
  const patient = ptById(patientId);
  if (!patient) return toast(T('Patient not found.'));
  try {
    for (const appointment of D.ap.filter((item) => item.type === 'Follow Up' && item.patient_id == patientId && !['Done', 'Cancelled'].includes(item.st))) {
      await api('PUT', `appointments/${appointment.id}`, { st: 'Done' });
    }
    for (const admission of D.ipd.filter((item) => String(item.code) == String(patientId) && !item.out)) {
      await api('PUT', `ipd/${admission.id}`, { out: 1, dis: ymd(new Date()) });
    }
    await api('PUT', `patients/${patientId}`, { follow_up: 0, type: 'OPD' });
    await load();
    rt = 'pt'; tab = 'OPD'; q = ''; pg = 1;
    render();
    toast(T('Returned to OPD'));
  } catch (error) { toast(error.message); }
}
function ptCard(id) {
  const p = ptById(id); printDoc('Patient card', ptBlock(p) + kv([['Treatment', p.treatment], ['Diagnosis', p.diagnosis || p.last_dx], ['Complaints', p.complaints], ['Past medical history', p.history], ['Registered', fmtD(p.reg_date || p.created_at)]]));
}
let tfPatientId = null, tfRows = [], tfHistory = [], tfShowHistory = false;
const TF_VITALS_TEMPLATE = ['សម្ពាធឈាម:', 'ជីពចរ:', 'ចង្វាក់បេះដូង:', 'ចង្វាក់ដង្ហើម:', 'សីតុណ្ហភាព:', 'អុកស៊ីសែន:', 'ជាតិស្ករ:'].join('\n');
const tfNewRow = () => ({ date: nowLocal(), vitals: TF_VITALS_TEMPLATE, diagnosis: '', notes: '' });
const tfRowFromRecord = (r) => {
  const d = jd(r);
  return { id: r.id, date: r.date || nowLocal(), vitals: d.vitals || TF_VITALS_TEMPLATE, diagnosis: d.diagnosis || '', notes: r.notes || '' };
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
  const rows = tfRows.map((r, i) => `<div class="tf-row"><div><input class="in" type="datetime-local" name="tf-date-${i}" value="${esc(r.date || nowLocal())}"><textarea class="in" name="tf-vitals-${i}">${esc(r.vitals ?? TF_VITALS_TEMPLATE)}</textarea></div>
<textarea class="in" name="tf-diagnosis-${i}" placeholder="${T("Describe patient's condition, symptoms, or diagnosis")}">${esc(r.diagnosis || '')}</textarea>
<textarea class="in" name="tf-notes-${i}" placeholder="${T('Prescribed medication, treatment plan, or notes...')}">${esc(r.notes || '')}</textarea>
<div class="tf-actions"><button type="button" class="btn s r" data-a="tfremove:${i}" title="${T('Remove row')}">✕</button></div></div>`).join('');
  const history = tfShowHistory ? `<div class="tf-history"><h4>${T('Treatment History')}</h4>${tfHistory.map((r) => {
    const d = jd(r);
    return `<div class="tf-history-row"><div><b>${esc((r.date || '').replace('T', ' '))}</b><div>${esc(d.diagnosis || '')}</div><div class="mu">${esc(r.notes || '')}</div></div><div class="tools"><button type="button" class="btn s" data-a="tfedit:${r.id}">${T('Edit')}</button><button type="button" class="btn s r" data-a="tfdelete:${r.id}" title="${T('Delete this record?')}">✕</button></div></div>`;
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
    tfHistory = (await api('GET', 'records?patient_id=' + tfPatientId + '&kind=treatment&limit=5000')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
    if (pdId == tfPatientId) await loadRecs();
    tfRows = [tfNewRow()];
    tfShowHistory = true;
    render();
    tfRender();
    toast('Saved');
  }, { cls: 'xl treatment-followup', ok: 'Save Record', keepOpen: true, extra: '<button type="button" class="btn" data-a="tfprint">Print All Records</button>' });
  const ftop = $('#mf h3');
  if (ftop) ftop.innerHTML = `<span>${T('Treatment Follow-up')} — ${esc(p.name)}</span><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button>`;
}
async function treatmentFollowup(pid) {
  const p = ptById(pid); if (!p) return toast('Patient not found.');
  tfPatientId = pid;
  tfHistory = (await api('GET', 'records?patient_id=' + pid + '&kind=treatment&limit=5000')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  tfRows = [tfNewRow()];
  tfShowHistory = false;
  tfRender();
}
function tfPrintAll() {
  const p = ptById(tfPatientId);
  if (!p) return toast('Patient not found.');
  const history = tfHistory.filter((r) => {
    const d = jd(r);
    return [d.vitals, d.diagnosis, r.notes || d.notes].some((value) => String(value || '').trim());
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows = history.map((r) => {
    const d = jd(r);
    const [date, time] = String(r.date || '').replace('T', ' ').split(/\s+/, 2);
    const dateTime = `${fmtD(date)}${time ? ` ${esc(time.slice(0, 5))}` : ''}`;
    const cell = (value) => esc(value || '').replace(/\r?\n/g, '<br>');
    return `<tr><td><div class="tf-print-date">${dateTime}</div><div class="tf-print-text">${cell(d.vitals)}</div></td><td class="tf-print-text">${cell(d.diagnosis)}</td><td class="tf-print-text">${cell(r.notes || d.notes)}</td></tr>`;
  }).join('');
  const today = fmtD(ymd(new Date()));
  const body = `<section class="tf-print">
<h2 class="tf-print-title"><span>ការតាមដានការព្យាបាល</span><small>TREATMENT FOLLOW-UP CHART</small></h2>
<div class="tf-print-patient">
  <div><b>ឈ្មោះអ្នកជំងឺ / Patient name:</b> ${esc(p.name || '')}</div><div><b>ភេទ / Sex:</b> ${esc(fmtSex(p.sex) || 'N/A')}</div>
  <div><b>អាយុ / Age:</b> ${esc(fmtAge(p))}</div>    <div><b>កាលបរិច្ឆេទ / Date:</b> ${today}</div>
</div>
<table class="tf-print-table"><colgroup><col style="width:22%"><col style="width:42%"><col style="width:36%"></colgroup>
<thead><tr><th><span>ថ្ងៃខែ / សញ្ញាជីវិត</span><small>Date / Vital Signs</small></th><th><span>ការវិវត្តន៍របស់អ្នកជំងឺ</span><small>Patient's Evolution</small></th><th><span>ការព្យាបាល</span><small>Treatment</small></th></tr></thead>
<tbody>${rows || `<tr><td colspan="3" class="emp">${T('No history records yet.')}</td></tr>`}</tbody></table>
<div class="tf-print-signature"><span>ហត្ថលេខាគ្រូពេទ្យព្យាបាល</span><div></div><small>Doctor's Signature</small></div></section>`;
  printDoc('', body);
}
async function tfDeleteRecord(id) {
  if (!confirm(T('Delete this record?'))) return;
  const draftRows = tfDraftRows();
  await api('DELETE', 'records/' + id);
  tfHistory = (await api('GET', 'records?patient_id=' + tfPatientId + '&kind=treatment&limit=5000')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  tfRows = draftRows;
  if (pdId == tfPatientId) await loadRecs();
  tfRender();
  toast('Deleted');
}
// ---------- billing ----------
let payAllContext = null;
const payAllLabel = (khmer, english) => `${khmer} / ${english}`;
async function payForm(pid, payAll = false) {
  const p = ptById(pid); if (!p) return;
  const list = await api('GET', 'records?patient_id=' + pid + '&limit=5000'), due = billTotals(list).bal;
  if (!(due > 0)) return toast('Paid');
  if (!payAll) {
    openForm('Record payment', `<p>${esc(p.name)} — Amount due: <b>${K(due)}</b> <span class="mu">(${usd(due)})</span></p>${fIn('Amount paid (KHR)', 'amount', due, 'number', `min="1" max="${due}" required`)}${fSel('Method', 'method', 'Cash', ['Cash', 'Bank'])}`, async (f) => {
      const m = new FormData(f), amt = Math.round(+m.get('amount') || 0); if (amt < 1) throw new Error('Enter an amount'); if (amt > due) throw new Error('Amount is more than the balance');
      const outstandingItems = billingOutstandingItems(list);
      await api('POST', 'records', { patient_id: pid, kind: 'payment', date: ymd(new Date()), data: { amount: amt, applied_amount: amt, method: m.get('method'), item_count: outstandingItems.length, paid_at: nowLocal() } });
      await load(); if (rt == 'pd' && pdId == pid) await loadRecs(); render(); toast('Saved');
    }, { cls: 'wide', ok: 'Save' });
    return;
  }
  const outstandingItems = billingOutstandingItems(list);
  const itemRows = outstandingItems.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${item.quantity || 1}</td><td>${K(item.price)}</td></tr>`).join('');
  const methodOptions = [['Cash', payAllLabel('សាច់ប្រាក់', 'Cash')], ['Bank', payAllLabel('ធនាគារ', 'Bank')]];
  payAllContext = { pid, list, due, items: outstandingItems, selectedIndexes: [], discountInput: 0, discountCurrency: 'KHR', allDiscountInput: 0, allDiscountCurrency: 'KHR' };
  const body = `<section class="payall-patient"><div><small>${payAllLabel('អ្នកជំងឺ', 'Patient')}</small><b>${esc(p.name)}</b></div><div><small>${payAllLabel('សេវាមិនទាន់បង់', 'Unpaid services')}</small><b>${outstandingItems.length}</b></div></section>
    <div class="payall-items-wrap"><table class="payall-items"><thead><tr><th>${payAllLabel('ល.រ', 'No.')}</th><th>${payAllLabel('សេវាកម្ម / បរិយាយ', 'Service / Description')}</th><th>${payAllLabel('ចំនួន', 'Qty')}</th><th>${payAllLabel('ទឹកប្រាក់', 'Amount')}</th></tr></thead><tbody>${itemRows || `<tr><td colspan="4">${payAllLabel('មិនមានសេវាមិនទាន់បង់', 'No unpaid services')}</td></tr>`}</tbody></table></div>
    <section class="payall-summary"><div><span>${payAllLabel('តម្លៃសរុប', 'Total price')}</span><b>${K(due)}</b></div>
      <div class="payall-discount-row payall-all-discount"><label for="payall-all-discount">${payAllLabel('បញ្ចុះតម្លៃគ្រប់សេវា', 'Discount all services')}</label><input class="in" id="payall-all-discount" name="all_discount" type="number" min="0" step="1" value="0" aria-label="${payAllLabel('ចំនួនបញ្ចុះតម្លៃគ្រប់សេវា', 'Discount amount for all services')}"><select class="in" name="all_discount_currency" aria-label="${payAllLabel('រូបិយប័ណ្ណបញ្ចុះតម្លៃគ្រប់សេវា', 'Currency for all-services discount')}"><option value="KHR">៛ KHR</option><option value="USD">$ USD</option></select></div>
      <div class="payall-discount-row"><span>${payAllLabel('បញ្ចុះតម្លៃតាមសេវាដែលបានជ្រើសរើស', 'Discount selected services')}</span><b id="payall-discount-total">${K(0)}</b><button type="button" class="btn payall-tag" data-a="payall-discount-open" title="${payAllLabel('ជ្រើសរើសសេវាសម្រាប់បញ្ចុះតម្លៃ', 'Select services for discount')}" aria-label="${payAllLabel('ជ្រើសរើសសេវាសម្រាប់បញ្ចុះតម្លៃ', 'Select services for discount')}">🏷 ${payAllLabel('ជ្រើសរើស', 'Select items')}</button></div>
      <div class="payall-final"><span>${payAllLabel('តម្លៃត្រូវបង់', 'Final total')}</span><b id="payall-final-total">${K(due)}</b></div>
    </section>
    <section class="payall-fields">${fSel(payAllLabel('វិធីទូទាត់', 'Payment method'), 'method', 'Cash', methodOptions)}${fIn(payAllLabel('កាលបរិច្ឆេទទូទាត់', 'Payment date'), 'payment_date', ymd(new Date()), 'date', 'required')}${fIn(payAllLabel('ប្រាក់ទទួល (KHR)', 'Money received (KHR)'), 'received', due, 'number', 'min="0" step="1" required')}${fIn(payAllLabel('ឈ្មោះអ្នកទទួលប្រាក់', 'Received by'), 'receiver_name', D.user && D.user.name || '', 'text', 'required')}</section>
    <div class="payall-balance" id="payall-remaining-balance-row"><span>${payAllLabel('សមតុល្យនៅសល់ក្នុងសេវាមិនទាន់បង់', 'Remaining balance in Unpaid')}</span><b id="payall-remaining-balance">${K(0)}</b><small>${payAllLabel('ការបញ្ចុះតម្លៃអនុវត្តនៅពេលបង់គ្រប់ចំនួនត្រូវបង់ប៉ុណ្ណោះ', 'Discounts apply only when the full final total is paid.')}</small></div>
    <div class="payall-shortcuts" aria-label="${payAllLabel('ប៊ូតុងទូទាត់រហ័ស', 'Payment shortcuts')}"><button type="button" class="btn" data-a="payall-print" aria-label="${payAllLabel('បោះពុម្ពវិក្កយបត្រ', 'Print payment invoice')}" title="${payAllLabel('បោះពុម្ពវិក្កយបត្រ', 'Print payment invoice')}">▣</button><button type="button" class="btn" data-a="payall-shortcut:exact" title="${payAllLabel('ទទួលប្រាក់ត្រឹមត្រូវតាមតម្លៃត្រូវបង់', 'Receive the exact final total')}">S-B</button><button type="button" class="btn" data-a="payall-shortcut:1000" title="${payAllLabel('បន្ថែម 1,000 KHR ទៅប្រាក់ទទួល', 'Add 1,000 KHR to money received')}">S</button><button type="button" class="btn" data-a="payall-shortcut:10000" title="${payAllLabel('បន្ថែម 10,000 KHR ទៅប្រាក់ទទួល', 'Add 10,000 KHR to money received')}">D</button><button type="button" class="btn" data-a="payall-shortcut:100000" title="${payAllLabel('បន្ថែម 100,000 KHR ទៅប្រាក់ទទួល', 'Add 100,000 KHR to money received')}">A</button></div>
    <div class="payall-shortcuts payall-more-actions"><button type="button" class="btn" data-a="payall-print:compact" aria-label="${payAllLabel('បោះពុម្ពបង្កាន់ដៃសង្ខេប', 'Print compact payment slip')}" title="${payAllLabel('បោះពុម្ពបង្កាន់ដៃសង្ខេប', 'Print compact payment slip')}">▣</button><button type="button" class="btn" data-a="payall-shortcut:exact" title="${payAllLabel('កំណត់ប្រាក់ទទួលឱ្យស្មើនឹងតម្លៃត្រូវបង់', 'Set money received to the exact final total')}">SV</button><button type="button" class="btn" data-a="payall-qr" title="${payAllLabel('បង្ហាញ QR ធនាគារ', 'Show configured bank QR')}">QR</button></div>`;
  openForm(`${payAllLabel('ទូទាត់ប្រាក់', 'Pay All')} — ${esc(p.name)}`, body, async (f) => {
    const m = new FormData(f), enteredDiscount = payAllContext.discountInput, currency = payAllContext.discountCurrency;
    const allDiscount = Number(m.get('all_discount')), allCurrency = String(m.get('all_discount_currency') || 'KHR');
    const calculation = payAllDiscountCalculation(outstandingItems, payAllContext.selectedIndexes, enteredDiscount, currency, allDiscount, allCurrency);
    if (!Number.isFinite(enteredDiscount) || enteredDiscount < 0 || !Number.isFinite(allDiscount) || allDiscount < 0) throw new Error(payAllLabel('សូមបញ្ចូលចំនួនបញ្ចុះតម្លៃឱ្យបានត្រឹមត្រូវ', 'Enter a valid discount'));
    if (!['KHR', 'USD'].includes(allCurrency)) throw new Error(payAllLabel('សូមជ្រើសរើសរូបិយប័ណ្ណបញ្ចុះតម្លៃ', 'Choose a valid discount currency'));
    if (calculation.itemDiscount > calculation.selectedTotal) throw new Error(payAllLabel('ការបញ្ចុះតម្លៃលើសពីតម្លៃសេវាដែលបានជ្រើសរើស', 'Selected-services discount exceeds selected services total'));
    if (calculation.discount > due) throw new Error(payAllLabel('ការបញ្ចុះតម្លៃសរុបលើសពីតម្លៃត្រូវបង់', 'Total discount is more than the balance'));
    const received = Number(m.get('received'));
    if (!Number.isFinite(received) || received <= 0) throw new Error(payAllLabel('សូមបញ្ចូលចំនួនទឹកប្រាក់ដែលបានទទួល', 'Enter the amount received'));
    const method = String(m.get('method') || '');
    if (!['Cash', 'Bank'].includes(method)) throw new Error(payAllLabel('សូមជ្រើសរើសវិធីទូទាត់', 'Choose a payment method'));
    const receiverName = String(m.get('receiver_name') || '').trim();
    if (!receiverName) throw new Error(payAllLabel('សូមបញ្ចូលឈ្មោះអ្នកទទួលប្រាក់', 'Enter the name of the person receiving payment'));
    const paymentDate = String(m.get('payment_date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error(payAllLabel('សូមបញ្ចូលកាលបរិច្ឆេទទូទាត់ឱ្យបានត្រឹមត្រូវ', 'Enter a valid payment date'));
    const isFullPayment = received >= calculation.finalTotal;
    const appliedAmount = isFullPayment ? due : Math.min(due, received);
    const appliedDiscount = isFullPayment ? calculation.discount : 0;
    const itemDiscounts = isFullPayment ? payAllDiscountAllocation(outstandingItems, payAllContext.selectedIndexes, calculation.itemDiscount) : outstandingItems.map(() => 0);
    const allItemDiscounts = isFullPayment ? payAllGeneralDiscountAllocation(outstandingItems, itemDiscounts, calculation.allDiscount) : outstandingItems.map(() => 0);
    await api('POST', 'records', { patient_id: pid, kind: 'payment', date: paymentDate, data: {
      amount: Math.round(received), applied_amount: appliedAmount, final_total: isFullPayment ? calculation.finalTotal : appliedAmount, received: Math.round(received),
      paid_at: nowLocal(),
      discount: appliedDiscount, discount_all: isFullPayment ? calculation.allDiscount : 0, discount_all_input: isFullPayment ? allDiscount : 0, discount_all_currency: allCurrency,
      discount_item: isFullPayment ? calculation.itemDiscount : 0, discount_input: isFullPayment ? enteredDiscount : 0, discount_currency: currency,
      discount_items: isFullPayment ? payAllContext.selectedIndexes.map((index) => ({ name: outstandingItems[index].name, price: outstandingItems[index].price, discount: itemDiscounts[index] })) : [],
      remaining_balance: Math.max(0, due - appliedAmount),
      change: isFullPayment ? Math.max(0, Math.round(received - calculation.finalTotal)) : 0, method, receiver_name: receiverName, item_count: outstandingItems.length,
      items: itemDiscounts.map((discountAmount, index) => {
        const item = outstandingItems[index];
        return { category: item.category, name: item.name, price: item.price, discount: discountAmount + allItemDiscounts[index], discount_item: discountAmount, discount_all: allItemDiscounts[index], quantity: item.quantity || 1, unitPrice: item.unitPrice ?? item.price };
      })
    } });
    await load(); if (rt == 'pd' && pdId == pid) await loadRecs(); render(); toast('Saved');
  }, { cls: 'wide payall-dialog', ok: payAllLabel('បញ្ជាក់ការទូទាត់', 'Confirm payment'), close: true, closeLabel: payAllLabel('បិទ', 'Close') });
  $('#mf').dataset.payallDue = String(due);
}
function payAllCalculation(due, discount, currency) {
  const rate = Number(D.clinic.rate) || 4000;
  const value = Number(discount);
  const appliedDiscount = Math.round(value * (currency == 'USD' ? rate : 1));
  return { discount: appliedDiscount, finalTotal: Math.max(0, Math.round(due - appliedDiscount)) };
}
function payAllDiscountCalculation(items, selectedIndexes, discount, currency, allDiscountInput = 0, allCurrency = 'KHR') {
  const selectedTotal = selectedIndexes.reduce((sum, index) => sum + (items[index] ? items[index].price : 0), 0);
  const itemDiscount = payAllCalculation(selectedTotal, discount, currency).discount;
  const allDiscount = payAllCalculation(items.reduce((sum, item) => sum + item.price, 0), allDiscountInput, allCurrency).discount;
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return { selectedTotal, itemDiscount, allDiscount, discount: itemDiscount + allDiscount, finalTotal: Math.max(0, Math.round(total - itemDiscount - allDiscount)) };
}
function payAllDiscountAllocation(items, selectedIndexes, discount) {
  const amounts = items.map(() => 0), selectedTotal = selectedIndexes.reduce((sum, index) => sum + (items[index] ? items[index].price : 0), 0);
  let remaining = discount;
  selectedIndexes.forEach((index, position) => {
    if (!items[index] || selectedTotal <= 0) return;
    const amount = position == selectedIndexes.length - 1 ? remaining : Math.min(remaining, Math.floor(discount * items[index].price / selectedTotal));
    amounts[index] = amount;
    remaining -= amount;
  });
  return amounts;
}
function payAllGeneralDiscountAllocation(items, itemDiscounts, discount) {
  const remainingPrices = items.map((item, index) => Math.max(0, item.price - (itemDiscounts[index] || 0)));
  const total = remainingPrices.reduce((sum, price) => sum + price, 0);
  let lastEligible = -1;
  remainingPrices.forEach((price, index) => { if (price > 0) lastEligible = index; });
  let allocated = 0;
  return remainingPrices.map((price, index) => {
    if (!price || !total) return 0;
    const amount = index == lastEligible ? discount - allocated : Math.floor(discount * price / total);
    allocated += amount;
    return amount;
  });
}
function payAllDiscountModalHtml() {
  const context = payAllContext;
  if (!context) return '';
  const rows = context.items.map((item, index) => `<label class="payall-discount-item"><input type="checkbox" data-payall-discount-item="${index}" ${context.draftSelectedIndexes.includes(index) ? 'checked' : ''}><span>${esc(item.name)}</span><b>${K(item.price)}</b></label>`).join('');
  return `<div id="payall-discount-overlay" class="payall-discount-overlay"><section class="payall-discount-dialog" role="dialog" aria-modal="true" aria-labelledby="payall-discount-title"><header><h3 id="payall-discount-title">${payAllLabel('ជ្រើសរើសសេវាសម្រាប់បញ្ចុះតម្លៃ', 'Select services for discount')}</h3><button type="button" class="btn s" data-a="payall-discount-close" aria-label="${payAllLabel('បិទ', 'Close')}">×</button></header><div class="payall-discount-list">${rows || `<p class="emp">${payAllLabel('មិនមានសេវាមិនទាន់បង់', 'No unpaid services')}</p>`}</div><div class="payall-discount-selected"><span>${payAllLabel('តម្លៃសេវាដែលបានជ្រើសរើស', 'Selected services total')}</span><b id="payall-selected-total">${K(0)}</b></div><div class="payall-discount-entry"><input class="in" name="payall_discount_input" type="number" min="0" step="1" value="${esc(context.draftDiscountInput)}" aria-label="${payAllLabel('ចំនួនបញ្ចុះតម្លៃ', 'Discount amount')}"><select class="in" name="payall_discount_currency" aria-label="${payAllLabel('រូបិយប័ណ្ណបញ្ចុះតម្លៃ', 'Discount currency')}"><option value="KHR" ${context.draftDiscountCurrency == 'KHR' ? 'selected' : ''}>៛</option><option value="USD" ${context.draftDiscountCurrency == 'USD' ? 'selected' : ''}>$</option></select></div><p class="payall-discount-error" id="payall-discount-error" aria-live="polite"></p><div class="payall-discount-actions"><button type="button" class="btn p" data-a="payall-discount-apply">${payAllLabel('អនុវត្ត', 'Apply')}</button></div></section></div>`;
}
function payAllDiscountOpen() {
  if (!payAllContext) return toast(payAllLabel('មិនមានព័ត៌មានទូទាត់ទេ', 'Payment details are unavailable'));
  const old = document.querySelector('#payall-discount-overlay');
  if (old) old.remove();
  payAllContext.draftSelectedIndexes = payAllContext.selectedIndexes.slice();
  payAllContext.draftDiscountInput = payAllContext.discountInput;
  payAllContext.draftDiscountCurrency = payAllContext.discountCurrency;
  $('#md').insertAdjacentHTML('beforeend', payAllDiscountModalHtml());
  payAllDiscountRefresh();
}
function payAllDiscountRefresh() {
  const overlay = document.querySelector('#payall-discount-overlay');
  if (!overlay || !payAllContext) return;
  const checked = Array.from(overlay.querySelectorAll('[data-payall-discount-item]:checked')).map((input) => Number(input.dataset.payallDiscountItem));
  const selectedTotal = checked.reduce((sum, index) => sum + (payAllContext.items[index] ? payAllContext.items[index].price : 0), 0);
  const amountInput = overlay.querySelector('[name="payall_discount_input"]'), currencyInput = overlay.querySelector('[name="payall_discount_currency"]');
  const entered = Number(amountInput.value), currency = currencyInput.value, discount = payAllCalculation(0, entered, currency).discount;
  const selectedTotalElement = overlay.querySelector('#payall-selected-total'), errorElement = overlay.querySelector('#payall-discount-error');
  if (selectedTotalElement) selectedTotalElement.textContent = K(selectedTotal);
  if (errorElement) errorElement.textContent = entered > 0 && checked.length == 0
    ? payAllLabel('សូមជ្រើសរើសសេវាកម្មយ៉ាងតិចមួយ', 'Select at least one service')
    : discount > selectedTotal ? payAllLabel('ការបញ្ចុះតម្លៃលើសពីតម្លៃសេវាដែលបានជ្រើសរើស', 'Discount exceeds selected services total') : '';
}
function payAllDiscountApply() {
  const overlay = document.querySelector('#payall-discount-overlay');
  if (!overlay || !payAllContext) return;
  payAllDiscountRefresh();
  const checked = Array.from(overlay.querySelectorAll('[data-payall-discount-item]:checked')).map((input) => Number(input.dataset.payallDiscountItem));
  const amountInput = overlay.querySelector('[name="payall_discount_input"]'), currencyInput = overlay.querySelector('[name="payall_discount_currency"]');
  const entered = Number(amountInput.value), currency = currencyInput.value;
  const calculation = payAllDiscountCalculation(payAllContext.items, checked, entered, currency);
  if (!Number.isFinite(entered) || entered < 0) return toast(payAllLabel('សូមបញ្ចូលចំនួនបញ្ចុះតម្លៃឱ្យបានត្រឹមត្រូវ', 'Enter a valid discount'));
  if (entered > 0 && !checked.length) return toast(payAllLabel('សូមជ្រើសរើសសេវាកម្មយ៉ាងតិចមួយ', 'Select at least one service'));
  if (!['KHR', 'USD'].includes(currency)) return toast(payAllLabel('សូមជ្រើសរើសរូបិយប័ណ្ណបញ្ចុះតម្លៃ', 'Choose a valid discount currency'));
  if (calculation.discount > calculation.selectedTotal) return toast(payAllLabel('ការបញ្ចុះតម្លៃលើសពីតម្លៃសេវាដែលបានជ្រើសរើស', 'Discount is more than the selected services total'));
  payAllContext.selectedIndexes = checked;
  payAllContext.discountInput = entered;
  payAllContext.discountCurrency = currency;
  overlay.remove();
  payAllRefresh();
}
function payAllRefresh() {
  const form = $('#mf'), context = payAllContext;
  if (!context) return;
  context.allDiscountInput = Number(form.querySelector('[name="all_discount"]').value) || 0;
  context.allDiscountCurrency = form.querySelector('[name="all_discount_currency"]').value;
  const calculation = payAllDiscountCalculation(context.items, context.selectedIndexes, context.discountInput, context.discountCurrency, context.allDiscountInput, context.allDiscountCurrency);
  const received = Number(form.querySelector('[name="received"]').value);
  const remaining = Number.isFinite(received) && received >= calculation.finalTotal ? 0 : Math.max(0, context.due - (Number.isFinite(received) ? received : 0));
  $('#payall-final-total').textContent = K(calculation.finalTotal);
  $('#payall-discount-total').textContent = K(calculation.discount);
  $('#payall-remaining-balance').textContent = K(remaining);
}
function payAllShortcut(kind) {
  const form = $('#mf'), received = form.querySelector('[name="received"]'), context = payAllContext;
  payAllRefresh();
  const finalTotal = payAllDiscountCalculation(context.items, context.selectedIndexes, context.discountInput, context.discountCurrency, context.allDiscountInput, context.allDiscountCurrency).finalTotal;
  received.value = kind == 'exact' ? finalTotal : finalTotal + Number(kind);
  payAllRefresh();
}
function payAllPrint(compact = false) {
  if (!payAllContext) return toast('Payment details are unavailable');
  const patient = ptById(payAllContext.pid), rows = payAllContext.items;
  if (!patient) return toast('Patient not found');
  const due = payAllContext.due, calculation = payAllDiscountCalculation(rows, payAllContext.selectedIndexes, payAllContext.discountInput, payAllContext.discountCurrency);
  const html = `<h2>${payAllLabel('វិក្កយបត្រទូទាត់', 'Payment invoice')}</h2><p>${payAllLabel('អ្នកជំងឺ', 'Patient')}: ${esc(patient.name)} · ${payAllLabel('កាលបរិច្ឆេទ', 'Date')}: ${esc(ymd(new Date()))}</p><table><thead><tr><th>${payAllLabel('ល.រ', 'No.')}</th><th>${payAllLabel('សេវាកម្ម', 'Service')}</th><th>${payAllLabel('ចំនួន', 'Qty')}</th><th>${payAllLabel('ទឹកប្រាក់', 'Amount')}</th></tr></thead><tbody>${rows.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${item.quantity || 1}</td><td>${K(item.price)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">${payAllLabel('តម្លៃសរុប', 'Total')}</th><th>${K(due)}</th></tr><tr><th colspan="3">${payAllLabel('បញ្ចុះតម្លៃ', 'Discount')}</th><th>${K(calculation.discount)}</th></tr><tr><th colspan="3">${payAllLabel('តម្លៃត្រូវបង់', 'Final total')}</th><th>${K(calculation.finalTotal)}</th></tr></tfoot></table>`;
  printDoc(compact ? payAllLabel('បង្កាន់ដៃទូទាត់', 'Payment slip') : payAllLabel('វិក្កយបត្រទូទាត់', 'Payment invoice'), html);
}
function payAllQr() {
  const qr = D.clinic && D.clinic.qr;
  if (!qr) return toast('No bank QR code has been configured in Settings');
  if (!payAllContext) return toast('Payment details are unavailable');
  const due = payAllContext.due, calculation = payAllDiscountCalculation(payAllContext.items, payAllContext.selectedIndexes, payAllContext.discountInput, payAllContext.discountCurrency);
  const patient = ptById(payAllContext.pid);
  printDoc(payAllLabel('ទូទាត់តាម QR ធនាគារ', 'Bank QR payment'), `<div style="text-align:center"><h2>${payAllLabel('ទូទាត់តាម QR ធនាគារ', 'Bank QR payment')}</h2><p>${payAllLabel('អ្នកជំងឺ', 'Patient')}: ${esc(patient && patient.name || '')} · ${payAllLabel('តម្លៃត្រូវបង់', 'Final total')}: ${K(calculation.finalTotal)}</p><img src="${API_BASE}/uploads/${esc(qr)}" alt="${payAllLabel('QR ទូទាត់តាមធនាគារ', 'Bank payment QR')}" style="width:70mm;max-height:70mm;object-fit:contain"></div>`);
}
function billingLineItems(list) {
  return list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (+a.id || 0) - (+b.id || 0)).flatMap((r) => {
    const d = jd(r);
    if (r.kind == 'schedule' && schBillable(r)) return [{ category: 'Treatment Charges', name: [d.selection, d.treatment_type, d.diagnosis || d.dx, r.notes].filter(Boolean).join(' — ') || r.title || 'Treatment charge', price: +d.amount || 0 }];
    if (r.kind == 'lab') {
      if (Array.isArray(d.tests) && d.tests.length) return d.tests.map((test) => ({ category: 'Lab Charges', name: test.name || d.test_name || r.title || T('Lab result'), price: +test.price || 0 }));
      return +d.price > 0 ? [{ category: 'Lab Charges', name: d.test_name || r.title || T('Lab result'), price: +d.price }] : [];
    }
    if (r.kind == 'investigation' && Array.isArray(d.items)) return d.items.map((item, itemIndex) => {
      const quantity = Math.max(1, +item.quantity || 1), unitPrice = +item.unit_price || +item.price || 0;
      return { category: 'Service Charges', name: item.name || 'Service', price: unitPrice * quantity, quantity, unitPrice, recordId: r.id, itemIndex };
    });
    return [];
  });
}
function billingOutstandingItems(list) {
  let paid = list.filter((r) => r.kind == 'payment').reduce((sum, r) => sum + (Number(jd(r).applied_amount ?? jd(r).amount) || 0), 0);
  return billingLineItems(list).map((item) => {
    const applied = Math.min(paid, item.price);
    paid -= applied;
    return { ...item, price: item.price - applied };
  }).filter((item) => item.price > 0);
}
const billTotals = (list) => { const ch = billingLineItems(list).reduce((t, item) => t + item.price, 0), pd = list.filter((r) => r.kind == 'payment').reduce((t, r) => t + (Number(jd(r).applied_amount ?? jd(r).amount) || 0), 0); return { ch, pd, bal: Math.max(0, ch - pd) }; };
function paidHistoryDate(record, data) {
  const paidAt = String(data.paid_at || ''), time = paidAt.includes('T') ? paidAt.slice(11, 16) : '';
  return `<span class="bill-payment-date"><span>${esc(record.date || paidAt.slice(0, 10) || '')}</span><small>${esc(time || '—')}</small></span>`;
}
function paidHistoryTable(payments, records) {
  const total = payments.reduce((sum, r) => sum + (Number(jd(r).amount) || 0), 0);
  const rows = payments.map((r) => {
    const d = jd(r), count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(records).length;
    return `<tr><td>${paidHistoryDate(r, d)}</td><td>PAY-${esc(r.id)}</td><td>${esc(d.method || '—')}</td><td>${count}</td><td><b>${K(d.amount || 0)}</b></td><td><button type="button" class="btn s" data-a="payreceipt:${r.id}">${T('Receipt')}</button></td></tr>`;
  }).join('');
  const cards = payments.map((r) => {
    const d = jd(r), count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(records).length;
    return `<article class="bill-payment-card"><div class="bill-payment-card-head"><b>${paidHistoryDate(r, d)}</b><button type="button" class="btn s" data-a="payreceipt:${r.id}">▣ ${T('Receipt')}</button></div><div class="mu">PAY-${esc(r.id)}</div><div class="bill-payment-card-details"><span>${T('Method')}</span><b>${esc(d.method || '—')}</b><span>${T('Items')}</span><b>${count}</b><span>${T('Total Paid')}</span><b>${K(d.amount || 0)}</b></div></article>`;
  }).join('');
  const html = paidHistoryView == 'table'
    ? `<div class="bill-payment-table-wrap"><table class="bill-payment-table"><thead><tr><th>${T('Date')}</th><th>${T('Receipt')}</th><th>${T('Method')}</th><th>${T('Items')}</th><th>${T('Total Paid')}</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="4">${T('Total Paid')}</th><th>${K(total)}</th><th></th></tr></tfoot></table></div>`
    : `<div class="bill-payment-cards">${cards}</div>`;
  return { total, html };
}
function paidHistoryPanelInner(payments, records) {
  const history = paidHistoryTable(payments, records), nextView = paidHistoryView == 'table' ? 'cards' : 'table';
  const icon = paidHistoryView == 'table' ? '▦' : '☷';
  return `<h4><span>◇ ${T('Paid History')}</span><span class="paid-history-controls">${payments.length ? `<span class="billing-total-badge paid-total-badge">${T('Total Paid')}: ${K(history.total)}</span>` : ''}<button type="button" class="btn s paid-view-toggle" data-a="paidview" title="${T('Switch to ' + nextView + ' view')}" aria-label="${T('Switch to ' + nextView + ' view')}">${icon}</button></span></h4>${payments.length ? history.html : `<p class="emp">${T('No paid bills found.')}</p>`}`;
}
function billPanel() {
  const t = billTotals(recs), items = billingOutstandingItems(recs), pays = recs.filter((r) => r.kind == 'payment').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const categories = [...new Set(items.map((item) => item.category))];
  const unpaidItems = categories.map((category) => {
    const group = items.filter((item) => item.category == category), total = group.reduce((sum, item) => sum + item.price, 0);
    return `<div class="bill-charge-group"><div class="bill-charge-heading"><b>◇ ${T(category)}</b><b>${K(total)}</b></div>${group.map((item) => `<div class="bill-charge-item"><div>${esc(item.name)}<small>${K(item.unitPrice ?? item.price)}${item.quantity > 1 ? ` × ${item.quantity}` : ''}</small></div><div class="bill-charge-right"><b>${K(item.price)}</b>${item.category == 'Service Charges' ? `<div class="bill-quantity"><button type="button" class="btn s" data-a="svcminus:${item.recordId}:${item.itemIndex}" title="${T('Remove one')}">−</button><span>${item.quantity}</span><button type="button" class="btn s" data-a="svcplus:${item.recordId}:${item.itemIndex}" title="${T('Add one')}">+</button></div>` : ''}</div></div>`).join('')}</div>`;
  }).join('');
  return `<div class="billing-page"><div class="billing-toolbar"><h2 class="rh">▱ ${T('Billing history')}</h2><div class="tools"><button class="btn" data-a="schinv">${T('Invoice')}</button><button class="btn" data-a="recpay" ${t.bal ? '' : 'disabled'}>+ ${T('Record payment')}</button><button class="btn g billing-payall" data-a="payall" ${t.bal ? '' : 'disabled'}>$ ${T('Pay All')}: ${K(t.bal)}</button></div></div>
<div class="billing-columns"><section class="billing-panel"><h4><span>◇ ${T('Unpaid')}</span><span class="billing-total-badge">${T('Total')}: ${K(t.bal)}</span></h4>${t.bal ? unpaidItems : `<p class="emp">${T('No unpaid bills found.')}</p>`}<div class="bill-total"><b>${T('Total Unpaid Amount')}:</b><b>${K(t.bal)}</b></div></section>
<section class="billing-panel paid-history-panel">${paidHistoryPanelInner(pays, recs)}</section></div></div>`;
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
  const d = jd(r), p = curPt(), clinic = D.clinic || {};
  const items = Array.isArray(d.items) ? d.items : billingLineItems(recs);
  const itemRows = items.map((item, index) => {
    const quantity = item.quantity || 1, unitPrice = item.unitPrice ?? item.price;
    return `<tr><td>${index + 1}</td><td>${esc(item.name)}${Number(item.discount) > 0 ? `<small class="payment-receipt-item-discount">${payAllLabel('បញ្ចុះតម្លៃ', 'Discount')}: ${K(item.discount)}</small>` : ''}</td><td>${quantity}</td><td>${K(unitPrice)}</td><td>${K(Math.max(0, item.price - (Number(item.discount) || 0)))}</td></tr>`;
  }).join('');
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discount = Number(d.discount) || 0, grandTotal = Number(d.final_total ?? d.applied_amount ?? d.amount) || 0, received = Number(d.received ?? d.amount) || 0;
  const banner = clinic.banner ? `<img class="payment-receipt-banner" src="${API_BASE}/uploads/${esc(clinic.banner)}" alt="">` : `<div class="payment-receipt-clinic">${esc(clinic.name || '')}${clinic.specialty ? `<small>${esc(clinic.specialty)}</small>` : ''}${clinic.address ? `<small>${esc(clinic.address)}</small>` : ''}${clinic.phone ? `<small>${esc(clinic.phone)}</small>` : ''}</div>`;
  const html = `<div class="payment-receipt">
    <header class="payment-receipt-header">${banner}</header>
    <h1>វិក្កយបត្រលម្អិត<small>DETAILED INVOICE</small></h1>
    <section class="payment-receipt-meta">
      <div><b>អតិថិជន៖</b> ${esc(p && p.name || '')}<br><b>ID:</b> ${esc(p && p.id || '')}<br><b>រោគវិនិច្ឆ័យ៖</b> ${esc(p && p.diagnosis || '')}</div>
      <div><b>លេខវិក្កយបត្រ៖</b> PAY-${esc(r.id)}<br><b>កាលបរិច្ឆេទ៖</b> ${esc((r.date || '').replace('T', ' '))}<br><b>វិធីបង់ប្រាក់៖</b> ${esc(d.method || '')}</div>
    </section>
    <table class="payment-receipt-table"><thead><tr><th>ល.រ</th><th>បរិយាយ/Description</th><th>ចំនួន/Qty</th><th>តម្លៃ/Price</th><th>សរុប/Amount</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">&nbsp;</td></tr>'}</tbody></table>
    <section class="payment-receipt-totals"><div><span>សរុប/Subtotal:</span><b>${K(subtotal)}</b></div>${discount ? `<div><span>បញ្ចុះតម្លៃ/Discount:</span><b>${K(discount)}</b></div>` : ''}<div class="payment-receipt-grand-total"><span>សរុបរួម/Grand Total:</span><b>${K(grandTotal)}</b></div><div><span>បានទទួល/Amount Received:</span><b>${K(received)}</b></div>${Number(d.remaining_balance) > 0 ? `<div><span>នៅសល់ត្រូវបង់/Remaining Balance:</span><b>${K(d.remaining_balance)}</b></div>` : ''}${Number(d.change) > 0 ? `<div><span>ប្រាក់អាប់/Change:</span><b>${K(d.change)}</b></div>` : ''}</section>
    <footer class="payment-receipt-signatures"><div><span>អ្នកទទួលប្រាក់ / Received by</span><i></i><small>(${esc(d.receiver_name || D.user && D.user.name || '')})</small></div><div><span>អតិថិជន / Customer</span><i></i><small>(${esc(p && p.name || '')})</small></div></footer>
  </div>`;
  printDoc('', html, { headerHtml: '<div class="payment-receipt-no-default-header"></div>' });
}
async function openIpdBilling(pid) {
  const p = ptById(pid); if (!p) return toast('Patient not found.');
  pdId = pid;
  await loadRecs();
  const pays = recs.filter((r) => r.kind == 'payment').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const t = billTotals(recs), unpaid = t.bal > 0, outstanding = billingOutstandingItems(recs);
  const categories = [...new Set(outstanding.map((item) => item.category))];
  const unpaidItems = categories.map((category) => {
    const group = outstanding.filter((item) => item.category == category), total = group.reduce((sum, item) => sum + item.price, 0);
    return `<div class="bill-charge-group"><div class="bill-charge-heading"><b>◇ ${T(category)}</b><b>${K(total)}</b></div>${group.map((item) => `<div class="bill-charge-item"><div>${esc(item.name)}${item.quantity > 1 ? `<small>${K(item.unitPrice)} × ${item.quantity}</small>` : ''}</div><b>${K(item.price)}</b></div>`).join('')}</div>`;
  }).join('');
  const f = $('#mf');
  f.className = 'xl billing-dialog';
  f.innerHTML = `<div class="billing-title"><b>${esc(p.name)}</b><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div>
<div class="billing-toolbar"><h3>${T('Billing history')}</h3><div class="tools"><button type="button" class="btn" data-a="ipdinvoice:${pid}">${T('Invoice')}</button><button type="button" class="btn" data-a="recpay" ${unpaid ? '' : 'disabled'}>+ ${T('Record payment')}</button><button type="button" class="btn g billing-payall" data-a="payall" ${unpaid ? '' : 'disabled'}>${T('Pay All')}: ${K(t.bal)}</button></div></div>
<div class="billing-columns"><section class="billing-panel"><h4><span>◇ ${T('Unpaid')}</span><span class="billing-total-badge">${T('Total')}: ${K(t.bal)}</span></h4>${unpaid ? `${unpaidItems || `<div class="bill-item"><b>${T('Outstanding balance')}</b><b>${K(t.bal)}</b></div>`}<div class="bill-total"><b>${T('Total Unpaid Amount')}:</b><b>${K(t.bal)}</b></div>` : '<p class="emp">No unpaid bills found.</p>'}</section>
<section class="billing-panel paid-history-panel">${paidHistoryPanelInner(pays, recs)}</section></div>`;
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
Object.assign(L, { 'Waiting': 'រង់ចាំ', 'Confirmed': 'បានបញ្ជាក់', 'Status': 'ស្ថានភាព', 'Edit': 'កែប្រែ' });
Object.assign(L, { 'Follow Up': 'ការតាមដាន', 'Schedule and track follow-up appointments and reminders.': 'កំណត់ពេល និងតាមដានការណាត់ជួបបន្ត និងការរំលឹក။', 'Schedule Follow Up': 'កំណត់ពេលតាមដាន', 'Follow-up appointments': 'ការណាត់ជួបតាមដាន', 'Reminders due': 'ការរំលឹកដល់ពេល', 'Reason / service': 'មូលហេតុ / សេវាកម្ម', 'Appointment date': 'កាលបរិច្ឆេទណាត់ជួប', 'Reminder date': 'កាលបរិច្ឆេទរំលឹក', 'Reminder status': 'ស្ថានភាពរំលឹក', 'Mark reminder sent': 'សម្គាល់ថាបានផ្ញើការរំលឹក', 'Reminder marked as sent': 'បានសម្គាល់ថាបានផ្ញើការរំលឹក', 'Select patient': 'ជ្រើសរើសអ្នកជំងឺ', 'Select doctor': 'ជ្រើសរើសគ្រូពេទ្យ', 'Select a patient': 'សូមជ្រើសរើសអ្នកជំងឺ', 'Appointment date is required': 'ត្រូវបញ្ចូលកាលបរិច្ឆេទណាត់ជួប', 'Reminder date must be on or before the appointment date': 'កាលបរិច្ឆេទរំលឹកត្រូវមុន ឬត្រូវនឹងថ្ងៃណាត់ជួប', 'Follow-up appointment not found.': 'រកមិនឃើញការណាត់ជួបតាមដានទេ។', 'No follow-up appointments yet.': 'មិនទាន់មានការណាត់ជួបតាមដានទេ។', 'Pending': 'រង់ចាំ', 'Sent': 'បានផ្ញើ', 'Scheduled': 'បានកំណត់ពេល', 'Due': 'ដល់ពេល', 'Edit Follow Up': 'កែប្រែការតាមដាន' });
Object.assign(L, { 'Overdue': 'ហួសកំណត់' });
Object.assign(L, { 'Moved to Follow Up': 'បានផ្លាស់ទៅការតាមដាន' });
Object.assign(L, { 'Done - return to OPD': 'រួចរាល់ - ត្រឡប់ទៅ OPD', 'Returned to OPD': 'បានត្រឡប់ទៅ OPD' });
Object.assign(L, { 'New Diagnosis': 'បន្ថែមរោគវិនិច្ឆ័យថ្មី', 'Diagnosis already exists': 'រោគវិនិច្ឆ័យនេះមានរួចហើយ' });
Object.assign(L, { 'All': 'ទាំងអស់', 'With record': 'មានកំណត់ត្រា', 'No record': 'គ្មានកំណត់ត្រា', '✕ Clear filters': '✕ សម្អាតតម្រង', 'Export Excel': 'នាំចេញ Excel' });
Object.assign(L, { 'Columns': 'ជួរឈរ', '☰ Columns': '☰ ជួរឈរ', 'Filters': 'តម្រង', 'Show all': 'បង្ហាញទាំងអស់', 'Show or hide columns': 'បង្ហាញ ឬលាក់ជួរឈរ', 'At least one column must stay visible': 'ត្រូវទុកយ៉ាងហោចណាស់ជួរឈរមួយ' });
Object.assign(L, { 'Request service': 'ស្នើសុំសេវាកម្ម', 'Search services…': 'ស្វែងរកសេវាកម្ម…', 'Add selected': 'បន្ថែមសេវាកម្មដែលបានជ្រើស', 'Service requests': 'សំណើសេវាកម្ម', 'No services requested yet.': 'មិនទាន់មានសំណើសេវាកម្មទេ។', 'No matching services.': 'រកមិនឃើញសេវាកម្មដែលត្រូវគ្នាទេ។', 'Requested services': 'សេវាកម្មដែលបានស្នើ', 'Select at least one service': 'សូមជ្រើសរើសសេវាកម្មយ៉ាងតិចមួយ', 'Services requested': 'បានស្នើសេវាកម្ម' });
Object.assign(L, { 'Service Charges': 'ថ្លៃសេវាកម្ម', 'Treatment Charges': 'ថ្លៃព្យាបាល', 'Lab Charges': 'ថ្លៃតេស្ត Lab', 'Total Unpaid Amount': 'ចំនួនទឹកប្រាក់មិនទាន់បង់សរុប', 'Items': 'មុខទំនិញ' });
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
  }, { cls: '', ok: 'Save', extra: `<button type="button" class="btn" data-a="bedfollowup:${pid}">${T('Follow Up')}</button>` });
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
const ipdHead = ['Name', 'Latin name', 'IPD/OPD', 'Room / Bed', 'Treatment', 'Billing history', 'Admission date', 'Discharge date', 'Days', 'Actions'];
function ipdRow(r) {
  const p = ipdPt(r), i = D.ipd.indexOf(r), d = ipdDays(r), st = ipdStart(r), due = p ? patientDue(p.id) : 0;
  return `<tr><td><div class="pn"><div><a href="#" data-a="${p ? 'open:' + p.id : 'ipdedit:' + r.id}">${esc(r.name)}</a> <span class="mu">(${esc(r.code)})</span></div></div></td>
<td>${esc((p && p.latin_name) || 'N/A')}</td>
<td>${p && p.type == 'IPD' && !r.out ? `<button type="button" class="pill ipd clk" data-a="ipdreturn:${p.id}" title="Return to Patients (OPD)">IPD</button>` : `<span class="pill ${(p ? p.type : r.out ? 'OPD' : 'IPD') == 'IPD' ? 'ipd' : 'opd'}">${esc(p ? p.type || 'OPD' : r.out ? 'OPD' : 'IPD')}</span>`}</td>
<td><a href="#" class="ed" data-a="ipdbed:${r.id}" title="Edit room and bed">✎</a> ${r.room ? `<span title="Room">🚪 ${esc(r.room)}</span>` : ''} ${r.bed ? `<span title="Bed">🛏 ${esc(r.bed)}</span>` : ''}</td>
<td title="${esc(r.treatment || (p && p.treatment) || '')}">${esc(trunc(r.treatment || (p && p.treatment), 16) || '')} <a href="#" class="ed" data-a="ipdtreat:${r.id}" title="Edit treatment">✎</a></td>
<td>${p ? `<a href="#" class="${due > 0 ? 'due' : 'paidb'}" data-a="ipdbill:${p.id}" title="Open billing history">${due > 0 ? `<b>KHR ${due.toLocaleString('en-US')}</b>` : '✔ Paid'}</a>` : `<span class="paidb">✔ Paid</span>`}</td>
<td>${st ? fmtD(st) : 'N/A'}</td>
<td>${r.out ? (r.dis ? fmtD(r.dis) : 'N/A') : `<button class="dcb" data-a="ipdout:${r.id}">Discharge</button>`}</td>
<td>${d == null ? 'N/A' : d + (d == 1 ? ' day' : ' days')}</td>
<td style="white-space:nowrap" class="iac">${p ? `<a href="#" data-a="open:${p.id}" title="Open patient file">👁</a>` : ''}<a href="#" data-a="ipdprint:${r.id}" title="Print">🖨</a><a href="#" data-a="ipdshare:${r.id}" title="Share summary">✈</a><a href="#" data-a="ipdedit:${r.id}" title="Edit">✎</a><a href="#" class="rd" data-a="del:ipd:${i}" title="Delete">🗑</a></td></tr>`;
}
function ipdPage(current) {
  const rows = D.ipd.filter((r) => (!current || !r.out) && (!q || lc([r.name, r.code, r.room, r.bed, (ipdPt(r) || {}).latin_name].join(' ')).includes(lc(q.trim()))));
  return `<div class="hd"><div class="tools" style="align-items:center"><div class="ibox">🛏</div><div><h1>${current ? 'Current IPD patients' : 'Inpatients (IPD)'}</h1><p class="mu">${current ? 'Patients not yet discharged' : 'Manage all admitted patients.'}</p></div></div><div class="tools">${sr('Search patient by name or ID…')}<button class="btn g" data-a="ipdadd">+ Add</button><button class="btn" data-a="csv">Export Excel</button></div></div>
<div class="card"><table class="ipdt"><thead><tr>${ipdHead.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(ipdRow).join('') || `<tr><td colspan="10" class="emp">Nothing here yet.</td></tr>`}</tbody></table></div>`;
}
R.ipd = () => ipdPage(false); R.cur = () => ipdPage(true);
async function ipdOut(id) {
  try { const r = ipdById(id); await api('PUT', 'ipd/' + id, { out: 1, dis: ymd(new Date()) }); await syncOpd(r); await load(); render(); toast('Discharged'); } catch (e) { toast(e.message); }
}
function ipdBed(id) {
  const r = ipdById(id); if (!r) return;
  const patient = ipdPt(r);
  openForm('Update Bed Information', fIn('Room Number', 'room', r.room) + fIn('Bed Number', 'bed', r.bed), async (f) => {
    const m = new FormData(f); await api('PUT', 'ipd/' + id, { room: (m.get('room') || '').trim(), bed: (m.get('bed') || '').trim() }); await load(); render(); toast('Saved');
  }, { cls: '', ok: 'Save', extra: patient ? `<button type="button" class="btn" data-a="bedfollowup:${patient.id}">${T('Follow Up')}</button>` : '' });
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
document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id == 'echo-service-search') echoReportServiceResults(target.value);
  if (target.id == 'echo-template-search') {
    const query = String(target.value || '').trim().toLocaleLowerCase();
    const options = Array.from($('#mf').querySelectorAll('.echo-template-option'));
    let visible = 0;
    for (const option of options) {
      const matches = option.textContent.toLocaleLowerCase().includes(query);
      option.hidden = !matches;
      if (matches) visible++;
    }
    const empty = $('#mf .echo-template-empty');
    if (empty) empty.hidden = visible > 0;
  }
  if (target.id == 'echo-preview-text-size') {
    echoReportPreviewTextSize(target.value);
  }
  if ((target.dataset && String(target.dataset.echoEditor || '').startsWith('patient-report')) || (target.closest && target.closest('[data-echo-report-field]')) || target.id == 'echo-report-doctor-new') echoReportPreviewUpdate();
});
document.addEventListener('change', (event) => {
  const target = event.target;
  const editorImage = /^echo-image-file-(patient-report(?:-\d+)?)$/.exec(target.id || '');
  if (editorImage) {
    echoUploadImage(editorImage[1], target.files && target.files[0]).then(echoReportPreviewUpdate).finally(() => { target.value = ''; });
    return;
  }
  if (target.id == 'echo-report-date') {
    const parts = target.value.split('-');
    if (parts.length == 3) {
      $('#echo-report-year').value = String(Number(parts[0]));
      $('#echo-report-month').value = String(Number(parts[1]));
      $('#echo-report-day').value = String(Number(parts[2]));
      echoReportPreviewUpdate();
    }
  } else if (['echo-report-day', 'echo-report-month', 'echo-report-year'].includes(target.id)) {
    const year = Number($('#echo-report-year').value), month = Number($('#echo-report-month').value), requestedDay = Number($('#echo-report-day').value);
    const day = Math.min(requestedDay, new Date(year, month, 0).getDate());
    $('#echo-report-day').value = String(day);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    $('#echo-report-date').value = date;
    echoReportPreviewUpdate();
  } else if (target.id == 'echo-report-upload') {
    echoReportUpload(target.files).finally(() => { target.value = ''; });
  } else if (target.id == 'echo-report-doctor') {
    echoReportPreviewUpdate();
  }
});
document.addEventListener('mousedown', (event) => {
  const button = event.target.closest && event.target.closest('[data-a="patient-echo-insert-date"]');
  const panel = button && button.closest('.echo-report-note-panel');
  const editor = panel && panel.querySelector('[data-echo-editor]'), selection = window.getSelection && window.getSelection();
  if (button && editor && selection && selection.rangeCount && editor.contains(selection.anchorNode)) echoToolbarSelection = selection.getRangeAt(0).cloneRange();
});
