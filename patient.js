/* Patient features: registration, patient file (records), appointment calendar, printing, CSV export.
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
  const r = await fetch(API_BASE + '/api/uploads', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + tok }, body: blob }), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Upload failed'); return j.photo;
}

// ---------- printing (uses the clinic header from Clinic Settings) ----------
function printDoc(title, html) {
  const c = D.clinic || {};
  const head = `<div class="ph-head">${c.banner ? `<img class="ph-banner" src="${API_BASE}/uploads/${esc(c.banner)}" alt="">` : ''}${c.show_name && c.name ? `<h2>${esc(c.name)}</h2>` : ''}${c.show_address && c.address ? `<div>${esc(c.address)}</div>` : ''}${c.show_phone && c.phone ? `<div>Tel: ${esc(c.phone)}</div>` : ''}</div>`;
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
const PT = [['vitals', 'Vital signs'], ['medical', 'Medical Record'], ['mdhistory', 'MD History'], ['beu', 'BEU'], ['schedule', 'Treatment Schedule'], ['consultation', 'Consultation'], ['operation', 'Operation'], ['investigation', 'Investigation request'], ['lab', 'Lab results'], ['echo', 'Echo results'], ['xray', 'X-Ray results'], ['homecare', 'Homecare'], ['prescription', 'Prescription'], ['medlist', 'Medication list'], ['documents', 'Documents'], ['appts', 'Appointment history']];
const VSF = [['t', 'Temperature (°C)'], ['hr', 'Heart rate (bpm)'], ['rr', 'Respiratory rate (bpm)'], ['bp', 'Blood pressure (mmHg)'], ['spo2', 'SpO2 (%)'], ['p', 'Pulse (P)'], ['w', 'Weight (kg)'], ['h', 'Height (cm)']];
const COLORS = ['#e5e7eb', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
let pdId = null, ptab = 'vitals', recs = [], pdDate = '';
const curPt = () => D.pt.find((x) => x.id == pdId);
const jd = (r) => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } };
async function loadRecs() { recs = await api('GET', 'records?patient_id=' + pdId + '&limit=5000'); }
async function openPatient(id) { pdId = id; ptab = 'vitals'; pdDate = ''; rt = 'pd'; await loadRecs(); render(); }
const lbl = (k) => (PT.find((x) => x[0] == k) || [0, k])[1];
R.pd = function () {
  const p = curPt(); if (!p) return hd('Patients', '') + '<p class="emp">Patient not found.</p>';
  const ed = (k, l) => `<span class="mu">${l}</span> <a href="#" data-a="pedit:${k}" title="Edit">✎</a><br><b>${esc(p[k] || 'N/A')}</b>`;
  return `<div class="mu" style="margin-bottom:10px"><a href="#" data-a="go:pt">Patient Management</a> / <b>${esc(p.name)}</b></div>
<div class="card pdh"><div class="pda"><div class="av big">${p.photo ? `<img src="${API_BASE}/uploads/${esc(p.photo)}" alt="">` : '👤'}</div><label class="btn s" style="margin-top:6px;cursor:pointer">Change photo<input type="file" id="pfp" accept="image/*" hidden></label></div>
<div class="pdi"><div class="tools" style="justify-content:space-between"><div><span class="mu">Name</span> <b style="font-size:18px">${esc(p.name)}</b>${p.latin_name ? ` <span class="mu">(${esc(p.latin_name)})</span>` : ''} &nbsp; <span class="mu">ID:</span> ${p.id} &nbsp; <span class="mu">Age:</span> <b>${fmtAge(p)}</b></div><div class="tools"><button class="btn" data-a="pdprint">History</button><button class="btn" data-a="regedit:${D.pt.indexOf(p)}">Edit patient</button></div></div>
<div class="gr2 pdg"><div><span class="mu">Gender</span><br><b>${esc(fmtSex(p.sex) || 'N/A')}</b></div><div><span class="mu">Phone</span><br><b>${esc(p.phone || 'N/A')}</b></div><div>${ed('nssf_id', 'NSSF ID')}</div><div>${ed('national_id', 'National ID')}</div><div><span class="mu">Address</span><br><b>${esc(p.addr || 'N/A')}</b></div><div><span class="mu">Date</span><br><input type="date" id="pdd" class="in" value="${esc(pdDate)}"></div></div></div></div>
<div class="pdw"><div class="card pdm">${PT.map(([k, l]) => `<div class="it ${k == ptab ? 'on' : ''}" data-a="rtab:${k}">${l}</div>`).join('')}</div><div class="card pdr" id="rp">${recPanel()}</div></div>`;
};
function recCard(r) {
  const d = jd(r), act = `<div class="ra"><button class="btn s" data-a="redit:${r.id}">Edit</button><button class="btn s r" data-a="rdel:${r.id}">✕</button></div>`, when = esc((r.date || '').replace('T', ' '));
  if (r.kind == 'vitals') return `<div class="rc">${act}<div class="mu">${when}</div><div class="vs">${VSF.filter(([k]) => d[k]).map(([k, l]) => `<span><b>${l.replace(/ \(.*/, '')}:</b> ${esc(d[k])} ${(l.match(/\((.*)\)/) || [])[1] || ''}</span>`).join('') || '—'}</div></div>`;
  if (r.kind == 'medical') return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d.dx || d.cc || 'Medical Record')}</b><div class="mu">${esc((d.cc || '').slice(0, 140))}</div><div class="ra2"><button class="btn s" data-a="rprint:${r.id}">Print</button></div></div>`;
  const img = r.image ? `<a href="${API_BASE}/uploads/${esc(r.image)}" target="_blank"><img class="rimg" src="${API_BASE}/uploads/${esc(r.image)}" alt=""></a>` : '';
  return `<div class="rc" ${r.kind == 'beu' && r.color ? `style="border-left:6px solid ${esc(r.color)}"` : ''}>${act}<b>${esc(r.title || lbl(r.kind))}</b> <span class="mu">${when}</span><div style="white-space:pre-wrap">${esc(r.notes || '')}</div>${img}</div>`;
}
function recPanel() {
  const p = curPt(); if (!p) return '';
  if (ptab == 'schedule') return schPanel();
  if (ptab == 'appts') { const L = D.ap.filter((a) => (a.name || '').toLowerCase() == (p.name || '').toLowerCase()); return `<h2 class="rh">${lbl(ptab)}</h2>${L.map((a) => `<div class="rc"><b>${esc(a.date)} ${esc(a.time || '')}</b> ${esc(a.svc || '')} <span class="mu">${esc(a.doc || '')}</span> <span class="bd">${esc(a.st)}</span></div>`).join('') || '<p class="emp">Nothing here yet.</p>'}`; }
  const L = recs.filter((r) => r.kind == ptab && (!pdDate || (r.date || '').startsWith(pdDate)));
  return `<div class="hd"><h2 class="rh">${lbl(ptab)}</h2>${ptab == 'medical' ? '<div class="tools"><button class="btn" data-a="htc" title="HT Controls">⚙</button><button class="btn" data-a="mhist">History</button><button class="btn" data-a="mrd">MRD</button><button class="btn g" data-a="radd">+ Add</button></div>' : '<button class="btn g" data-a="radd">+ Add</button>'}</div>${ptab == 'beu' ? `<div class="gr">${L.map(recCard).join('')}</div>` : L.map(recCard).join('')}${L.length ? '' : '<p class="emp">Nothing here yet.</p>'}`;
}
function genForm(r) {
  const k = ptab, e = !!r; r = r || { date: ymd(new Date()) };
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
    return h + (r.kind == 'vitals' ? kv(VSF.map(([k, l]) => [l, d[k]])) : r.kind == 'medical' ? mrPrintHtml(d) : r.kind == 'mrd' ? kv([['Diagnosis', d.dx], ['Request', d.req], ['Result', d.res]]) : r.kind == 'cnf' ? cnPrintHtml(d) : `<p>${esc(r.notes || '').replace(/\n/g, '<br>')}</p>`); }).join('');
  printDoc('Patient history', ptBlock(p) + body);
}

// ---------- Treatment Schedule: named schedules (tabs), rows with amount and done tick, invoice, print ----------
let sch = 'Standard';
const sName = (r) => r.title || 'Standard';
const schNames = () => { const s = new Set(['Standard']); recs.filter((r) => r.kind == 'schedule' || r.kind == 'schedulenote').forEach((r) => s.add(sName(r))); return [...s]; };
const schRows = () => recs.filter((r) => r.kind == 'schedule' && sName(r) == sch).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const schNote = () => recs.find((r) => r.kind == 'schedulenote' && sName(r) == sch);
const schTotal = () => schRows().reduce((t, r) => t + (+jd(r).amount || 0), 0);
function schPanel() {
  if (!schNames().includes(sch)) sch = 'Standard';
  const rows = schRows(), n = schNote();
  return `<div class="hd"><h2 class="rh">Treatment Schedule</h2><div class="tools"><div class="tabs">${schNames().map((x) => `<button class="${x == sch ? 'on' : ''}" data-a="schtab:${esc(x)}" translate="no">${esc(x)}</button>`).join('')}<button data-a="schaddtab" title="New schedule">+</button></div>
<span class="bd" style="font-size:14px">Total: ${K(schTotal())}</span><button class="btn" data-a="schinv">Invoice</button><button class="btn" style="background:#16a34a;color:#fff;border-color:#16a34a" data-a="radd">+ Add Schedule</button><button class="btn" data-a="cnf">CNF</button><button class="btn" data-a="schprint">Print Schedule</button></div></div>
<div class="sec"><label class="fl">Schedule header note for “<span translate="no">${esc(sch)}</span>” (for print)<div class="tools" style="align-items:flex-start"><textarea class="in" id="schnote" rows="3" style="flex:1" placeholder="Enter note specifically for this schedule…">${esc(n ? n.notes : '')}</textarea><button class="btn" data-a="schnotesave" title="Save note">💾</button></div></label></div>
<div class="card"><table><thead><tr><th>No.</th><th>Date</th><th>Diagnosis / type</th><th>Treatment / notes</th><th>Amount</th><th>Done</th><th>Actions</th></tr></thead><tbody>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc(d.dx || '')}</td><td style="white-space:pre-wrap">${esc(r.notes || '')}</td><td>${K(d.amount || 0)}</td><td><input type="checkbox" data-a="schdone:${r.id}" ${d.done ? 'checked' : ''} style="width:auto;min-width:0"></td><td><button class="btn s" data-a="redit:${r.id}">Edit</button> <button class="btn s r" data-a="rdel:${r.id}">✕</button></td></tr>`; }).join('') || `<tr><td colspan="7" class="emp">No schedules found.</td></tr>`}</tbody></table></div>`;
}
function schForm(r) {
  const e = !!r, d = r ? jd(r) : {}; r = r || { date: ymd(new Date()) };
  openForm(e ? 'Edit schedule' : 'Add Schedule', `<div class="g2">${fIn('Date', 'date', (r.date || '').slice(0, 10), 'date')}${fIn('Amount (KHR)', 'amount', d.amount || '', 'number', 'min="0"')}</div>${fIn('Diagnosis / type', 'dx', d.dx)}${fTa('Treatment / notes', 'notes', r.notes, 4)}${fCb('Done', 'done', d.done)}`, async (f) => {
    const m = new FormData(f), b = { patient_id: pdId, kind: 'schedule', title: sch, date: m.get('date'), notes: m.get('notes'), data: { dx: m.get('dx'), amount: +m.get('amount') || 0, done: m.get('done') ? 1 : 0 } };
    e ? await api('PUT', 'records/' + r.id, { ...b, title: r.title }) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  });
}
function schTable(rows) { return `<table class="pk full"><tr><th>No.</th><th>Date</th><th>Diagnosis / type</th><th>Treatment / notes</th><th>Amount</th><th>Done</th></tr>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc(d.dx || '')}</td><td>${esc(r.notes || '')}</td><td>${K(d.amount || 0)}</td><td>${d.done ? '✔' : ''}</td></tr>`; }).join('')}<tr><th colspan="4">Total</th><td colspan="2"><b>${K(schTotal())}</b></td></tr></table>`; }
function schPrint(inv) {
  const n = schNote(), rows = schRows();
  printDoc(inv ? 'Invoice' : 'Treatment Schedule – ' + sch, ptBlock(curPt()) + (!inv && n && n.notes ? `<p>${esc(n.notes).replace(/\n/g, '<br>')}</p>` : '') + (inv ? `<table class="pk full"><tr><th>No.</th><th>Date</th><th>Description</th><th>Amount</th></tr>${rows.map((r, i) => { const d = jd(r); return `<tr><td>${i + 1}</td><td>${esc((r.date || '').slice(0, 10))}</td><td>${esc([d.dx, r.notes].filter(Boolean).join(' – '))}</td><td>${K(d.amount || 0)}</td></tr>`; }).join('')}<tr><th colspan="3">Total</th><td><b>${K(schTotal())}</b></td></tr></table>` : schTable(rows)));
}

// ---------- Consultation Form (CNF): questionnaire + agreement + assessment, with form history ----------
const CNF_AG = [['acc', 'Acceptance & Results'], ['care', 'Guarantee of Care'], ['priv', 'Privacy Notice'], ['photo', 'Photo Consent'], ['resp', 'Responsibility'], ['oth', 'Other Notices'], ['pay', 'Payment Policy']];
// generic placeholder wording: each clinic should replace it in Clinic Settings
const CNF_DEF = { acc: 'I understand and accept the treatment plan, the expected results and the possible risks that my doctor has explained to me.', care: 'I have been told how to look after myself after treatment and I will follow the doctor’s instructions.', priv: 'My personal and medical information is kept confidential and shared only with the people involved in my care, unless the law requires otherwise.', photo: 'I agree that photographs may be taken before and after treatment for my medical record.', resp: 'I understand that results differ between people and that I am responsible for following the treatment plan.', oth: 'Treatment documents are kept in the clinic’s records.', pay: 'Payment terms are explained and agreed before treatment starts.' };
const cnfTexts = () => { let t = {}; try { t = JSON.parse((D.clinic || {}).cnf_text || '{}'); } catch (e) { /* defaults */ } return { ...CNF_DEF, ...t }; };
const cnfSettingsHtml = (c) => { let t = {}; try { t = JSON.parse(c.cnf_text || '{}'); } catch (e) { /* defaults */ } return `<hr><b>Consultation form agreement text</b><p class="mu" style="font-size:12px;margin:2px 0 8px">Shown in every Consultation Form (CNF). Replace the placeholder wording with your clinic's own text.</p>${CNF_AG.map(([k, l]) => fTa(l, 'cnf_' + k, t[k] ?? CNF_DEF[k], 3)).join('')}`; };
const YES = ['Yes', 'No'];
const CN = [
  ['g2', [['occ', 'Occupation'], ['addr', 'Address override']]],
  ['h', '1. Problems & Concerns'], ['q', 'prob', '', ['Acne', 'Acne scars', 'Veins', 'Pigmentation', 'Dark spots', 'Wrinkles', 'Pores / holes', 'Large pores', 'Tags', 'Sensitive', 'Oily', 'Scar'], 'Other'],
  ['h', '2. Skin type'], ['q', 'skin', '', ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'], 'Other'],
  ['h', '3. History of reactions'], ['q', 'react', 'Have you had a reaction to any of these before?', ['Cosmetics', 'Metal', 'Medicine', 'Food', 'Fragrance', 'Pollen', 'Other', 'None'], 'If yes, describe'],
  ['h', '4. Skin reaction level'], ['q', 'level', '', ['Easy', 'Medium', 'High', 'Normal']],
  ['h', '5. Healing'], ['q', 'heal', '', ['Normal', 'Fast', 'Slow', 'Infection / keloid']],
  ['h', '6. Scar formation'], ['q', 'scar', '', ['Easy', 'Not easy', 'Normal']],
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
const CNP = [['a', 'as_ass', 'Assessment'], ['a', 'as_dx', 'Diagnosis'], ['a', 'as_plan', 'Treatment plan'], ['a', 'as_rec', 'Recommended products / treatments'], ['i', 'as_fu', 'Follow-up date', 'date'], ['a', 'as_note', 'Notes']];
function cnHtml(S, d) {
  return S.map((it) => { let [t, k, l, o, x] = it;
    if (t == 'box') { [t, k, l, o, x] = it.slice(1); o = o; return `<div class="sec cnb">${cnQ(k, l, o, x, d)}</div>`; }
    if (t == 'g2') return `<div class="sec"><div class="g2">${k.map(([kk, ll]) => fIn(ll, 'cn_' + kk, d[kk])).join('')}</div></div>`;
    if (t == 'H') return `<h4 class="cnH">${k}</h4>`; if (t == 'T') return `<h3 class="cnT">${k}</h3>`; if (t == 'h') return `<h5 class="cnh">${k}</h5>`;
    if (t == 'q') return cnQ(k, l, o, x, d); if (t == 'a') return fTa(l, 'cn_' + k, d[k], 3); if (t == 'i') return fIn(l, 'cn_' + k, d[k], o || 'text');
    if (t == 'ag') { const tx = cnfTexts(); return CNF_AG.map(([kk, ll]) => fTa(ll, 'cn_ag_' + kk, d['ag_' + kk] ?? tx[kk], 3)).join(''); }
    if (t == 'sig') return `<div class="sec g2 sig"><div><b>Customer name:</b><div class="sl">${esc((curPt() || {}).name || '')}</div></div><div><b>Date:</b><div class="sl">&nbsp;</div></div><div><b>Signature:</b><div class="sl">&nbsp;</div></div><div><b>Doctor signature and name:</b><div class="sl">&nbsp;</div></div></div>`;
    return ''; }).join('');
}
function cnQ(k, l, o, x, d) { return `<div class="cbg">${l ? `<b>${esc(l)}</b>` : ''}<div class="g4">${o.map((v) => fCb(v, 'cnc_' + k, (d[k] || []).includes(v), v)).join('')}</div>${x ? `<label class="fl cno">${esc(x)}: <input class="in" name="cn_${k}_o" value="${esc(d[k + '_o'] || '')}"></label>` : ''}</div>`; }
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
    if (t == 'g2') return kv(k.map(([kk, ll]) => [ll, d[kk]]));
    if (t == 'H') return `<h4>${esc(k)}</h4>`; if (t == 'T') return `<h3>${esc(k)}</h3>`; if (t == 'h') return `<h5>${esc(k)}</h5>`;
    if (t == 'q') { const v = [...(d[k] || []), ...(d[k + '_o'] ? [(x || 'Other') + ': ' + d[k + '_o']] : [])]; return v.length ? `<p>${l ? `<b>${esc(l)}:</b> ` : ''}${v.map(esc).join(', ')}</p>` : ''; }
    if (t == 'a' || t == 'i') return d[k] ? `<p><b>${esc(l)}:</b> ${esc(d[k]).replace(/\n/g, '<br>')}</p>` : '';
    if (t == 'ag') return CNF_AG.map(([kk, ll]) => `<p><b>${esc(ll)}:</b> ${esc(d['ag_' + kk] ?? cnfTexts()[kk]).replace(/\n/g, '<br>')}</p>`).join('');
    if (t == 'sig') return `<table class="pk full"><tr><th>Customer name</th><td>${esc((curPt() || {}).name || '')}</td><th>Date</th><td>&nbsp;</td></tr><tr><th>Signature</th><td>&nbsp;<br>&nbsp;</td><th>Doctor</th><td>&nbsp;</td></tr></table>`;
    return ''; }).join('');
  return sec(CN) + '<h3>Assessment &amp; Plan</h3>' + sec(CNP);
}
function cnfForm(r) {
  const e = !!r, d = r ? jd(r) : {}, hist = recs.filter((x) => x.kind == 'cnf');
  openForm('Consultation Form (CNF)', `<div class="cnfw"><div class="cnfl"><div class="tabs cnft"><button type="button" class="on" data-a="cnftab:gen">General Form</button><button type="button" data-a="cnftab:plan">Assessment & Plan</button></div>
<div id="cn-gen">${cnHtml(CN, d)}</div><div id="cn-plan" hidden>${cnHtml(CNP, d)}</div></div>
<div class="cnfh"><div class="tools" style="justify-content:space-between"><b>Form History</b><button type="button" class="btn s" data-a="cnfnew" title="New form">+</button></div>${hist.map((x) => `<div class="rc ${e && x.id == r.id ? 'sel' : ''}" data-a="cnfload:${x.id}" style="cursor:pointer"><b>${esc((x.date || '').replace('T', ' '))}</b><div class="mu">${esc(jd(x).as_dx || (jd(x).prob || []).slice(0, 3).join(', '))}</div></div>`).join('') || '<p class="mu" style="font-size:12px">No history records yet.</p>'}</div></div>`, async (f) => {
    const b = { patient_id: pdId, kind: 'cnf', date: e ? r.date : nowLocal(), data: { ...cnCollect(f, CN), ...cnCollect(f, CNP) } };
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

// ---------- CSV export (opens in Excel) ----------
function exportCsv() {
  const key = (P[rt] && P[rt].k) || rt, rows = D[key]; if (!Array.isArray(rows) || !rows.length) return toast('Nothing here yet.');
  const cols = Object.keys(rows[0]).filter((c) => !['created_at', 'updated_at', 'user_id', 'photo', 'data'].includes(c));
  const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const csv = '\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = key + '-' + ymd(new Date()) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- click dispatcher (called from app.js for actions it does not know) ----------
function pAct(a, x, y, el) {
  const rec = () => recs.find((r) => r.id == x);
  if (a == 'reg') regForm(); else if (a == 'regedit') regForm(D.pt[+x]); else if (a == 'open') openPatient(+x).catch((e) => toast(e.message));
  else if (a == 'agem') { $('#agebox').dataset.mode = x; document.querySelectorAll('#agem button').forEach((b) => b.classList.toggle('on', b.dataset.a == 'agem:' + x)); }
  else if (a == 'vsbtn') { $('#vsbox').hidden = !$('#vsbox').hidden; } else if (a == 'regprint') regPrint();
  else if (a == 'rtab') { ptab = x; render(); } else if (a == 'radd') { ptab == 'vitals' ? vsForm() : ptab == 'medical' ? mrForm() : ptab == 'schedule' ? schForm() : genForm(); }
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
  else if (a == 'csv') exportCsv();
  else if (a == 'dashap') { cal.mode = 'day'; cal.d = new Date(); cal.list = false; rt = 'ap'; q = ''; render(); }
  else if (a == 'dfilter') { dFrom = $('#dfrom').value; dTo = $('#dto').value; render(); } else if (a == 'dclear') { dFrom = ''; dTo = ''; render(); }
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id == 'pfp') { try { toast('Uploading…'); const ph = await upl(t.files[0]); await api('PUT', 'patients/' + pdId, { photo: ph }); await load(); render(); } catch (er) { toast(er.message); } }
  else if (t.dataset && t.dataset.fill && t.value) { const ta = t.parentElement.querySelector('textarea'); ta.value = (ta.value ? ta.value.replace(/[,\s]+$/, '') + ', ' : '') + t.value; t.value = ''; }
});
document.addEventListener('input', (e) => { if (e.target.id == 'pdd') { pdDate = e.target.value; $('#rp').innerHTML = recPanel(); } });

// ---------- Khmer ----------
Object.assign(L, { 'Register new patient': 'ចុះឈ្មោះអ្នកជំងឺថ្មី', 'Register Patient': 'ចុះឈ្មោះអ្នកជំងឺ', 'Edit patient': 'កែប្រែអ្នកជំងឺ', 'Patient registered': 'បានចុះឈ្មោះអ្នកជំងឺ', 'Basic information': 'ព័ត៌មានមូលដ្ឋាន', 'Patient name *': 'ឈ្មោះអ្នកជំងឺ *', 'Latin name (optional)': 'ឈ្មោះឡាតាំង (ស្រេចចិត្ត)', 'Latin name': 'ឈ្មោះឡាតាំង', 'Demographics': 'ប្រជាសាស្ត្រ', 'Sex': 'ភេទ', 'Select sex': 'ជ្រើសរើសភេទ', 'Male': 'ប្រុស', 'Female': 'ស្រី', 'Year': 'ឆ្នាំ', 'Month': 'ខែ', 'Day': 'ថ្ងៃ', 'Khmer national': 'ជនជាតិខ្មែរ', 'Clinical details': 'ព័ត៌មានគ្លីនិក', 'Complaints / symptoms': 'ពាក្យបណ្តឹង / រោគសញ្ញា', '+ Add symptom': '+ បន្ថែមរោគសញ្ញា', '+ Pick address': '+ ជ្រើសអាសយដ្ឋាន', 'Past medical history': 'ប្រវត្តិជំងឺកន្លងមក', '+ Record vital signs': '+ កត់ត្រាសញ្ញាជីវិត', 'Registration date': 'កាលបរិច្ឆេទចុះឈ្មោះ', 'Print': 'បោះពុម្ព', 'History': 'ប្រវត្តិ', 'Change photo': 'ប្តូររូបភាព', 'Patient Management': 'ការគ្រប់គ្រងអ្នកជំងឺ', 'Gender': 'ភេទ', 'Date': 'កាលបរិច្ឆេទ', 'Time': 'ម៉ោង',
  'Vital signs': 'សញ្ញាជីវិត', 'Lab results': 'លទ្ធផល Lab', 'Echo results': 'លទ្ធផលអេកូ', 'X-Ray results': 'លទ្ធផល X-Ray', 'Appointment history': 'ប្រវត្តិណាត់ជួប', 'Temperature (°C)': 'សីតុណ្ហភាព (°C)', 'Heart rate (bpm)': 'ចង្វាក់បេះដូង (bpm)', 'Respiratory rate (bpm)': 'ចង្វាក់ដកដង្ហើម (bpm)', 'Blood pressure (mmHg)': 'សម្ពាធឈាម (mmHg)', 'Pulse (P)': 'ជីពចរ (P)', 'Weight (kg)': 'ទម្ងន់ (kg)', 'Height (cm)': 'កំពស់ (cm)', 'Add vital signs': 'បន្ថែមសញ្ញាជីវិត', 'Edit vital signs': 'កែប្រែសញ្ញាជីវិត', 'Title': 'ចំណងជើង', 'Notes': 'កំណត់ចំណាំ', 'Label colour': 'ពណ៌ស្លាក', 'Image': 'រូបភាព', 'Save Record': 'រក្សាទុកកំណត់ត្រា',
  'List view': 'មើលជាបញ្ជី', 'Calendar view': 'មើលជាប្រតិទិន', 'Search patient name…': 'ស្វែងរកតាមឈ្មោះអ្នកជំងឺ…', 'Add appointment': 'បន្ថែមការណាត់ជួប', 'today': 'ថ្ងៃនេះ', 'month': 'ខែ', 'week': 'សប្តាហ៍', 'day': 'ថ្ងៃ', 'Sun': 'អាទិត្យ', 'Mon': 'ច័ន្ទ', 'Tue': 'អង្គារ', 'Wed': 'ពុធ', 'Thu': 'ព្រហស្បតិ៍', 'Fri': 'សុក្រ', 'Sat': 'សៅរ៍', 'Done': 'រួចរាល់', 'Cancelled': 'បានលុបចោល', 'Nothing here yet.': 'មិនទាន់មានទិន្នន័យទេ។', 'Patient not found.': 'រកមិនឃើញអ្នកជំងឺ។', 'Only the author or an admin can delete this record': 'មានតែអ្នកបង្កើត ឬអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចលុបបាន' });
Object.assign(L, { 'Invoice': 'វិក្កយបត្រ', 'Print Schedule': 'បោះពុម្ពកាលវិភាគ', 'Add Schedule': 'បន្ថែមកាលវិភាគ', 'Standard': 'ស្តង់ដារ', 'General Form': 'ទម្រង់ទូទៅ', 'Assessment & Plan': 'ការវាយតម្លៃ និងផែនការ', 'Form History': 'ប្រវត្តិទម្រង់', 'Print Current': 'បោះពុម្ពទម្រង់បច្ចុប្បន្ន', 'Save Only': 'រក្សាទុកតែប៉ុណ្ណោះ', 'HT Controls': 'ការគ្រប់គ្រងការបង្ហាញ', 'Hide content sections': 'លាក់ផ្នែកខ្លឹមសារ', 'Create MRD record': 'បង្កើតកំណត់ត្រា MRD', '+ Create new record': '+ បង្កើតកំណត់ត្រាថ្មី', 'No records yet.': 'មិនទាន់មានកំណត់ត្រានៅឡើយទេ។', 'Diagnosis': 'រោគវិនិច្ឆ័យ', 'Request': 'សំណូមពរ', 'Result': 'លទ្ធផល' });
document.addEventListener('keydown', (e) => { if (e.key == 'Enter' && e.target.matches && e.target.matches('.st[data-a]')) e.target.click(); });
Object.assign(L, { 'View data': 'មើលទិន្នន័យ', 'Patient statistics': 'ស្ថិតិប្រជាសាស្ត្រអ្នកជំងឺ', 'From date': 'ថ្ងៃចាប់ផ្តើម', 'To date': 'ថ្ងៃបញ្ចប់', 'Apply': 'អនុវត្ត', 'Clear': 'សម្អាត', 'Unknown': 'មិនស្គាល់' });
