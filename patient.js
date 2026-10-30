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
const readFormValue = (form, ...keys) => {
  const sources = [];
  if (form && form.__m && typeof form.__m == 'object') sources.push(form.__m);
  try { const data = new FormData(form); if (data && typeof data.get == 'function') sources.push(data); } catch (error) {}
  for (const source of sources) {
    for (const key of keys) {
      const value = typeof source.get == 'function' ? source.get(key) : source[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }
  for (const key of keys) {
    const value = form && form[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
};
function openForm(title, body, save, o = {}) {
  const f = $('#mf'); f.className = o.cls || 'wide';
  const heading = o.close ? `<div class="operation-form-heading"><h3>${title}</h3><button type="button" class="btn s" data-a="close" aria-label="${esc(o.closeLabel || 'Close')}">×</button></div>` : `<h3 style="margin:0 0 8px">${title}</h3>`;
  f.innerHTML = `${heading}${body}${o.hideFooter ? '' : `<div class="tools fb" style="justify-content:flex-end">${o.extra || ''}${o.hideCancel ? '' : `<button type="button" class="btn" data-a="close">${o.cancelLabel || T('Cancel')}</button>`}${o.hideSubmit ? '' : `<button class="btn p">${T(o.ok || 'Save')}</button>`}</div>`}`;
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
  const head = omitClinicBranding ? bannerOnly : hasCustomHeader ? options.headerHtml : `<div class="ph-head">${c.banner ? `<img class="ph-banner" src="${API_BASE}/uploads/${esc(c.banner)}" alt="">` : c.logo ? `<img class="ph-logo" src="${API_BASE}/uploads/${esc(c.logo)}" alt="">` : ''}${c.specialty ? `<div>${esc(c.specialty)}</div>` : ''}${c.show_address && c.address ? `<div>${esc(c.address)}</div>` : ''}${c.show_phone && c.phone ? `<div>${esc(c.phone)}</div>` : ''}</div>`;
  const customHeader = c.print_header ? `<div class="print-config-header">${esc(c.print_header)}</div>` : '';
  const footer = c.print_footer ? `<footer class="print-config-footer">${esc(c.print_footer)}</footer>` : '';
  const footerContent = c.footer_banner_mode == 'text'
    ? c.footer_banner_text ? `<div class="print-footer-text">${esc(c.footer_banner_text)}</div>` : ''
    : c.footer_banner ? `<div class="print-footer-banner"><img src="${API_BASE}/uploads/${esc(c.footer_banner)}" alt=""></div>` : '';
  let template = c.print_template || {};
  if (typeof template == 'string') {
    try { template = JSON.parse(template); } catch (error) { if (error instanceof SyntaxError) template = {}; else throw error; }
  }
  if (!template || typeof template != 'object' || Array.isArray(template)) template = {};
  const paperSize = ['A4', 'A5', 'Letter'].includes(template.paperSize) ? template.paperSize : '';
  const orientation = ['portrait', 'landscape'].includes(template.orientation) ? template.orientation : '';
  const margin = [5, 8, 10, 12, 15, 20].includes(Number(template.marginMm)) ? Number(template.marginMm) : null;
  const fonts = { inter: 'Inter, "Noto Sans Khmer", sans-serif', arial: 'Arial, "Noto Sans Khmer", sans-serif', khmer: '"Noto Sans Khmer", Inter, sans-serif' };
  const font = fonts[template.fontFamily] || '';
  const fontSize = [8, 9, 10, 11, 12, 14, 16, 18].includes(Number(template.fontSizePt)) ? Number(template.fontSizePt) : null;
  const pageSizeRule = [paperSize, orientation].filter(Boolean).join(' ');
  const templateStyles = pageSizeRule || margin !== null || font || fontSize
    ? `<style class="print-template-config">${pageSizeRule || margin !== null ? `@page{${pageSizeRule ? `size:${pageSizeRule};` : ''}${margin !== null ? 'margin:0;' : ''}}` : ''}${font || fontSize || margin !== null ? `@media print{#pa{${font ? `font-family:${font}!important;` : ''}${fontSize ? `font-size:${fontSize}pt!important;` : ''}${margin !== null ? `padding:${margin}mm!important;` : ''}}}` : ''}</style>`
    : '';
  const templateItems = Array.isArray(template.elements) ? template.elements : [];
  const templateElements = (zone) => {
    const columns = { item: 'Item', description: 'Description', qty: 'Qty', each: 'Each', vat: 'VAT', total: 'Total' };
    return templateItems.filter((item) => item && item.zone == zone
      && (item.condition != 'hasLogo' || !!c.logo)
      && (item.condition != 'hasClinicAddress' || !!c.address)).map((item) => {
      const number = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : fallback;
      const width = number(item.width, 30), height = number(item.height, 20), left = Math.min(number(item.x, 0), 100 - width), top = Math.min(number(item.y, 0), 100 - height);
      const color = /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#111827';
      const background = item.background == 'transparent' ? 'transparent' : /^#[0-9a-f]{6}$/i.test(item.background) ? item.background : 'transparent';
      const align = ['left', 'center', 'right'].includes(item.align) ? item.align : 'left';
      const size = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].includes(Number(item.fontSize)) ? Number(item.fontSize) : 10;
      const style = `left:${left}%;top:${top}%;width:${width}%;height:${height}%;font-size:${size}pt;color:${color};background:${background};text-align:${align};font-weight:${item.bold ? 700 : 400}`;
      const value = item.field == 'clinicName' ? c.name : item.field == 'documentTitle' ? title : item.field == 'currentDate' ? new Date().toLocaleDateString() : item.field == 'clinicAddress' ? c.address : item.field == 'clinicPhone' ? c.phone : item.text;
      let content = '';
      if (item.type == 'line' || item.type == 'vline') content = `<span class="print-template-line ${item.type == 'vline' ? 'vertical' : ''}"></span>`;
      else if (item.type == 'image') content = c.logo ? `<img src="${API_BASE}/uploads/${esc(c.logo)}" alt="Clinic logo">` : '';
      else if (item.type == 'table') {
        const selectedColumns = Array.isArray(item.columns) ? item.columns.filter((column) => Object.hasOwn(columns, column)) : [];
        content = `<table class="print-template-table"><thead><tr>${selectedColumns.map((column) => `<th>${columns[column]}</th>`).join('')}</tr></thead><tbody><tr>${selectedColumns.map((column) => `<td>${column == 'description' ? 'Form details' : '—'}</td>`).join('')}</tr></tbody></table>`;
      } else if (item.type == 'summary' || item.type == 'tax') {
        content = `<div class="print-template-summary"><b>${esc(item.text || (item.type == 'tax' ? 'Tax summary' : 'Payment summary'))}</b><span>${item.type == 'tax' ? 'Tax' : 'Subtotal'} <i>—</i></span>${item.type == 'summary' ? '<span>Tax <i>—</i></span>' : ''}<strong>Total <i>—</i></strong></div>`;
      } else content = esc(value || (item.type == 'field' ? '—' : ''));
      return `<div class="print-template-element ${item.border ? 'has-border' : ''}" style="${style}">${content}</div>`;
    }).join('');
  };
  const headerElements = templateElements('header'), footerElements = templateElements('footer');
  const printTemplateHeader = headerElements ? `<div class="print-template-elements print-template-elements-header">${headerElements}</div>` : '';
  const printTemplateFooter = footerElements ? `<div class="print-template-elements print-template-elements-footer">${footerElements}</div>` : '';
  let pa = $('#pa'); if (!pa) { pa = document.createElement('div'); pa.id = 'pa'; document.body.appendChild(pa); }
  pa.innerHTML = `<div class="print-document">${head || ''}${customHeader}${printTemplateHeader}${title ? `<h3>${esc(title)}</h3>` : ''}<main class="print-document-content">${html}</main>${footer}${printTemplateFooter}${footerContent}</div>${templateStyles}`;
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
const PT = [['vitals', 'Vital signs'], ['medical', 'Medical Record'], ['mdhistory', 'MD History'], ['beu', 'BEU'], ['schedule', 'Treatment Schedule'], ['consultation', 'Consultation'], ['operation', 'Operation'], ['investigation', 'ស្នើសុំពិនិត្យ'], ['lab', 'Lab results'], ['echo', 'Echo results'], ['xray', 'X-Ray results'], ['homecare', 'Homecare'], ['prescription', 'វេជ្ជបញ្ជា'], ['medlist', 'បញ្ជីបើកថ្នាំ'], ['documents', 'Documents'], ['billing', 'Billing history'], ['appts', 'Appointment history'], ['allergy', 'Allergy History'], ['vaccination', 'ប័ណ្ណចាក់វ៉ាក់សាំង'], ['referral', 'Referral'], ['diagnosis_history', 'Diagnosis History'], ['laborder', 'កិច្ចសន្យា'], ['imagingorder', 'Imaging Orders']];
const PATIENT_DOCUMENT_TYPES = [
  ['referral', 'របាយការណ៍បញ្ជូនអ្នកជំងឺ', '▰'],
  ['referral-letter', 'លិខិតបញ្ជូនអ្នកជំងឺ', '▤'],
  ['treatment', 'លិខិតអនុញ្ញាតិចេញពីមន្ទីរសម្រាកព្យាបាល', '✎'],
  ['hospital', 'ឯកសារអ្នកជំងឺសម្រាកពេទ្យ', '▱'],
  ['medical-card', 'ព្រឹត្តិប័ត្រវិភាគ', '♧'],
  ['health', 'លិខិតណែនាំការព្យាបាលបន្ត', '▯'],
  ['birth', 'លិខិតបញ្ជាក់កំណើត', '☻'],
  ['medical-rest-a', 'Medical Rest Certificate Template A', '♧'],
  ['prescription-note', 'កំណត់ហេតុហេជ្ជបញ្ចា', '▤']
];
const REFERRAL_SYSTEMS = [
  ['general', 'ទូទៅ'], ['respiratory', 'ដង្ហើម'], ['cardiovascular', 'បេះដូង និងសរសៃឈាម'],
  ['digestive', 'រំលាយអាហារ'], ['urinary', 'ទឹកនោម'], ['musculoskeletal', 'សាច់ដុំ/ឆ្អឹង'],
  ['nervous', 'ប្រព័ន្ធប្រសាទ'], ['skin', 'ស្បែក'], ['ent', 'ត្រចៀក/ច្រមុះ/បំពង់ក'],
  ['reproductive', 'បន្តពូជ'], ['eyes', 'ភ្នែក'], ['other', 'ផ្សេងៗ']
];
const REFERRAL_EXAMINATIONS = [
  ['general', 'ពិនិត្យទូទៅ'], ['head', 'ក្បាល'], ['eyes', 'ភ្នែក'], ['ears', 'ត្រចៀក'],
  ['nose_throat', 'ច្រមុះ/បំពង់ក'], ['chest', 'ទ្រូង'], ['heart', 'បេះដូង'],
  ['abdomen', 'ពោះ'], ['limbs', 'ដៃ/ជើង'], ['skin', 'ស្បែក'], ['neurological', 'ប្រព័ន្ធប្រសាទ']
];
const REFERRAL_DISPOSITIONS = [
  ['emergency', 'បន្ទាន់'], ['admit', 'សម្រាកពេទ្យ'], ['consult', 'ពិគ្រោះជំនាញ'],
  ['transfer', 'បញ្ជូនបន្ត'], ['followup', 'តាមដាន'], ['other', 'ផ្សេងៗ']
];
const REFERRAL_TRAFFIC_TYPES = [['motorcycle', 'ទោចក្រ'], ['car', 'រថយន្ត'], ['pedestrian', 'ថ្មើរជើង']];
const REFERRAL_YES_NO_UNKNOWN = [['yes', 'មាន'], ['no', 'អត់'], ['unknown', 'មិនដឹង']];
const REFERRAL_INJURY_AREAS = [
  ['head', 'ក្បាល'], ['neck', 'ក'], ['chest', 'ទ្រូង'], ['abdomen', 'ពោះ'], ['back', 'ខ្នង'],
  ['upper_limbs', 'អវយវៈលើ'], ['lower_limbs', 'អវយវៈក្រោម'], ['pelvis', 'ត្រគាក'],
  ['genitals', 'ប្រដាប់បន្តពូជ'], ['skin', 'ស្បែក']
];
const REFERRAL_INJURY_CAUSES = [
  ['congenital', 'ផលវិបាកកំណើត'], ['explosive', 'អាវុធជាតិផ្ទុះ'], ['sharp_object', 'វត្ថុមុតស្រួច'],
  ['poisoning', 'ពុល'], ['drowning', 'លង់ទឹក'], ['snakebite', 'ពស់ចឹក']
];
const REFERRAL_EMERGENCY_TREATMENTS = [
  ['suction', 'បូមស្លេស្ម'], ['oxygen', 'ដាក់អុកស៊ីសែន'], ['intubation', 'អាំងទុយបេ និងសប់'],
  ['bag_mask', 'សប់ដោយបាល់ឡុង'], ['cpr', 'សង្គ្រោះបេះដូង'], ['neck_support', 'ដាក់ប្រដាប់ទប់ក'],
  ['fracture_support', 'ទប់អបឆ្អឹងបាក់'], ['iv', 'បញ្ចូលសេរ៉ូម'], ['shock', 'ព្យាបាលស្តុក'],
  ['warming', 'រក្សាកម្តៅ']
];
const CARE_MODULES = {
  allergy: { title: 'Allergy History', fields: [['allergen', 'Allergen'], ['reaction', 'Reaction'], ['severity', 'Severity', 'sel', ['Mild', 'Moderate', 'Severe']], ['status', 'Status', 'sel', ['Active', 'Resolved']] ] },
  vaccination: { title: 'Vaccination', fields: [['vaccine', 'Vaccine'], ['dose', 'Dose'], ['lot', 'Lot / Batch number'], ['next_due', 'Next due date', 'date']] },
  referral: { title: 'Referral', fields: [['referred_to', 'Referred to'], ['specialty', 'Department / Specialty'], ['reason', 'Reason for referral'], ['status', 'Status', 'sel', ['Pending', 'Accepted', 'Completed']] ] },
  diagnosis_history: { title: 'Diagnosis History', fields: [['diagnosis', 'Diagnosis'], ['code', 'ICD / Diagnosis code'], ['status', 'Status', 'sel', ['Active', 'Resolved', 'Chronic']] ] },
  laborder: { title: 'កិច្ចសន្យា', fields: [['patient_name', 'ខ្ញុំបាទ/នាងខ្ញុំឈ្មោះ'], ['sex', 'ភេទ'], ['age', 'អាយុ'], ['nationality', 'ត្រូវជា'], ['occupation', 'អ្នកជំងឺឈ្មោះ'], ['child_sex', 'ភេទ'], ['child_age', 'អាយុ'], ['child_name', 'ដែលកំពុងស្នាក់នៅ'], ['treatment_details', 'បានទទួលការពន្យល់ណែនាំដោយវេជ្ជបណ្ឌិត'], ['witness', 'សាក្សីដឹងឮ'], ['relationship', 'ខ្ញុំបានគិតយ៉ាង...']] },
  imagingorder: { title: 'Imaging Orders', fields: [['modality', 'Modality', 'sel', ['X-Ray', 'Ultrasound', 'CT', 'MRI', 'Other']], ['body_part', 'Body part'], ['priority', 'Priority', 'sel', ['Routine', 'Urgent', 'STAT']], ['status', 'Status', 'sel', ['Requested', 'Scheduled', 'Completed', 'Cancelled']], ['indication', 'Clinical indication', 'ta']] }
};
const VSF = [['t', 'Temperature (°C)'], ['hr', 'Heart rate (bpm)'], ['rr', 'Respiratory rate (bpm)'], ['bp', 'Blood pressure (mmHg)'], ['spo2', 'SpO2 (%)'], ['p', 'Pulse (P)'], ['w', 'Weight (kg)'], ['h', 'Height (cm)']];
const COLORS = ['#e5e7eb', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
let pdId = null, ptab = 'vitals', recs = [], pdDate = '', investigationQuery = '', investigationSelection = new Set(), paidHistoryView = 'table', labPickerQuery = '', labPickerSelection = new Set(), labSubtab = 'results', echoSubtab = 'reports', echoPageSize = 'A4', echoTemplateId = '', echoPreviewZoom = 81, documentTypeMenuOpen = false, documentTypeKey = '';
let rxEntryRows = [], rxEntrySearch = '', rxEntrySearchOpen = false, rxTemplatePickerOpen = false;
let medlistItems = [], medlistTab = 'medicines', medlistQuery = '';
let medlistDispenseItems = [], medlistDispenseQuery = '';
try {
  const savedPatientId = Number(sessionStorage.getItem('currentPatientId'));
  if (Number.isInteger(savedPatientId) && savedPatientId > 0) pdId = savedPatientId;
  ptab = sessionStorage.getItem('currentPatientTab') || ptab;
} catch (e) { /* use defaults */ }
const curPt = () => D.pt.find((x) => x.id == pdId);
const jd = (r) => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } };
async function loadRecs() {
  recs = await api('GET', 'records?patient_id=' + pdId + '&limit=5000');
  D.billing = D.billing.filter((r) => String(r.patient_id) != String(pdId) || !['schedule', 'payment', 'investigation', 'prescription', 'medlist'].includes(r.kind))
    .concat(recs.filter((r) => ['schedule', 'payment', 'investigation', 'prescription', 'medlist'].includes(r.kind)));
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
  const top = `<div class="tools" style="justify-content:space-between;margin-bottom:10px"><div class="mu"><a href="#" data-a="go:pt">Patient Management</a> / <b>${esc(p.name)}</b></div><div class="tools"><button class="btn" data-a="pdschedule-followup">＋ ${T('Schedule Follow Up')}</button><button class="btn p" data-a="pdprint">${printerIcon()} History</button><button class="btn ${pdCtl ? 'on2' : ''}" data-a="pdctl" title="Hide controls">🙈</button><button class="btn ${pdLay == 'grid' ? 'on2' : ''}" data-a="pdlay" title="Change layout">▦</button></div></div>`;
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
  const d = jd(r), act = r.kind == 'investigation' ? `<div class="ra"><button class="btn s r" data-a="rdel:${r.id}" title="Delete request">✕</button></div>` : `<div class="ra">${r.kind == 'laborder' ? `<button class="btn s" data-a="contractprint:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'vaccination' ? `<button class="btn s" data-a="vaxprint:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'prescription' ? `<button class="btn s" data-a="rxprint:${r.id}" title="បោះពុម្ព / Print" aria-label="បោះពុម្ព / Print">${printerIcon()}</button>` : ''}${r.kind == 'documents' && ['referral', 'referral-letter'].includes(d.document_type) ? `<button class="btn s" data-a="patient-referral-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'hospital' ? `<button class="btn s" data-a="patient-hospital-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'treatment' ? `<button class="btn s" data-a="patient-treatment-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'health' ? `<button class="btn s" data-a="patient-health-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'birth' ? `<button class="btn s" data-a="patient-birth-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'medical-rest-a' ? `<button class="btn s" data-a="patient-medical-rest-a-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'documents' && d.document_type == 'prescription-note' ? `<button class="btn s" data-a="patient-prescription-note-print:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button>` : ''}${r.kind == 'consultation' && d.consultation_mode == 'center' ? `<button class="btn s" data-a="centerprint-record:${r.id}" title="បោះពុម្ព" aria-label="បោះពុម្ព">${printerIcon()}</button>` : ''}<button class="btn s" data-a="redit:${r.id}">Edit</button><button class="btn s r" data-a="rdel:${r.id}">✕</button></div>`, when = esc((r.date || '').replace('T', ' '));
  if (r.kind == 'prescription' && Array.isArray(d.medicines)) return `<article class="rc rx-record">${act}<div class="mu">${esc((r.date || '').slice(0, 10))}</div><b>${esc(d.diagnosis || r.title || 'វេជ្ជបញ្ជា')}</b>${d.doctor ? `<div class="mu">វេជ្ជបណ្ឌិត៖ ${esc(d.doctor)}</div>` : ''}<div class="rx-record-medicines">${d.medicines.map((medicine) => `<div><span><b>${esc(medicine.name)}</b><small>${esc([medicine.morning && `ព្រឹក៖ ${medicine.morning}`, medicine.noon && `ថ្ងៃត្រង់៖ ${medicine.noon}`, medicine.evening && `ល្ងាច៖ ${medicine.evening}`, medicine.night && `យប់៖ ${medicine.night}`, medicine.duration && `រយៈពេល៖ ${medicine.duration}`, medicine.instruction].filter(Boolean).join(' · '))}</small></span><span>${K((+medicine.price || 0) * (+medicine.quantity || 0))}${+medicine.quantity ? `<small>ចំនួន៖ ${esc(medicine.quantity)}</small>` : ''}</span></div>`).join('')}</div>${r.notes ? `<div class="mu">${esc(r.notes)}</div>` : ''}</article>`;
  if (r.kind == 'medlist' && Array.isArray(d.items)) {
    const total = d.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
    return `<article class="rc medlist-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'Medication & Service Selection')}</b><div class="medlist-record-items">${d.items.map((item) => `<div><span>${esc(item.name)}<small>${item.type == 'service' ? 'សេវាកម្ម' : esc(item.unit_name || 'ថ្នាំ')}${Number(item.quantity) > 1 ? ` · × ${Number(item.quantity)}` : ''}</small></span><b>${K((Number(item.price) || 0) * (Number(item.quantity) || 1))}</b></div>`).join('')}</div><div class="medlist-record-total">Total: <b>${K(total)}</b></div></article>`;
  }
  if (r.kind == 'documents' && ['referral', 'referral-letter'].includes(d.document_type)) return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || (d.document_type == 'referral-letter' ? 'លិខិតបញ្ជូនអ្នកជំងឺ' : 'របាយការណ៍បញ្ជូនអ្នកជំងឺ'))}</b><div>${esc(d.referral_to || '—')} · ${esc(d.referral_patient_name || curPt()?.name || '')}</div>${(d.referral_reason || d.referral_recommendation || d.referral_complaint) ? `<div class="mu">${esc(d.referral_reason || d.referral_recommendation || d.referral_complaint)}</div>` : ''}</article>`;
  if (r.kind == 'documents' && d.document_type == 'treatment') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'លិខិតអនុញ្ញាតិចេញពីមន្ទីរសម្រាកព្យាបាល')}</b><div>${esc(d.treatment_patient_name || curPt()?.name || '')}${d.treatment_diagnosis ? ` · ${esc(d.treatment_diagnosis)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'medical-card') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'ព្រឹត្តិប័ត្រវិភាគ')}</b><div>${esc(d.medical_card_patient_name || curPt()?.name || '')}${d.medical_card_diagnosis ? ` · ${esc(d.medical_card_diagnosis)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'health') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'លិខិតណែនាំការព្យាបាលបន្ត')}</b><div>${esc(d.health_patient_name || curPt()?.name || '')}${d.health_diagnosis ? ` · ${esc(d.health_diagnosis)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'birth') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'លិខិតបញ្ជាក់កំណើត')}</b><div>${esc(d.birth_certificate_number || d.birth_child_sex || '')}${d.birth_date ? ` · ${esc(d.birth_date)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'medical-rest-a') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'Medical Rest Certificate Template A (Admission Form)')}</b><div>${esc(d.rest_a_patient_name || curPt()?.name || '')}${d.rest_a_diagnosis ? ` · ${esc(d.rest_a_diagnosis)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'prescription-note') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>${esc(r.title || 'កំណត់ហេតុហេជ្ជបញ្ចា')}</b><div>${esc(d.rxnote_patient_name || curPt()?.name || '')}${d.rxnote_diagnosis ? ` · ${esc(d.rxnote_diagnosis)}` : ''}</div></article>`;
  if (r.kind == 'documents' && d.document_type == 'hospital') return `<article class="rc patient-referral-record">${act}<div class="mu">${when}</div><b>បន្ថែម ឯកសារសម្រាកពេទ្យ</b><div>${esc(d.patient_name || curPt()?.name || '')}${d.registration_no ? ` · ${esc(d.registration_no)}` : ''}</div>${d.admission_diagnosis ? `<div class="mu">${esc(d.admission_diagnosis)}</div>` : ''}</article>`;
  if (r.kind == 'vitals') return `<div class="rc">${act}<div class="mu">${when}</div><div class="vs">${VSF.filter(([k]) => d[k]).map(([k, l]) => `<span><b>${l.replace(/ \(.*/, '')}:</b> ${esc(d[k])} ${(l.match(/\((.*)\)/) || [])[1] || ''}</span>`).join('') || '—'}</div></div>`;
  if (r.kind == 'medical') return `<div class="rc">${act}<div class="mu">${when}</div><b>${esc(d.dx || d.cc || 'Medical Record')}</b><div class="mu">${esc((d.cc || '').slice(0, 140))}</div><div class="ra2"><button class="btn s" data-a="rprint:${r.id}">Print</button></div></div>`;
  if (r.kind == 'investigation' && Array.isArray(d.items)) return `<div class="rc investigation-record">${act}<div class="mu">${when}</div><b>Requested services</b><div class="investigation-record-items">${d.items.map((item) => { const qty = Math.max(1, +item.quantity || 1), unit = +item.unit_price || +item.price || 0; return `<div><span>${esc(item.name)}${qty > 1 ? ` × ${qty}` : ''}</span><b>${K(unit * qty)}</b></div>`; }).join('')}</div><div class="investigation-record-total">Total: <b>${K(d.items.reduce((sum, item) => sum + (+item.unit_price || +item.price || 0) * Math.max(1, +item.quantity || 1), 0))}</b></div></div>`;
  if (r.kind == 'lab' && Array.isArray(d.fields)) return `<article class="rc lab-result-record lab-result-summary"><div class="lab-result-summary-copy"><b class="lab-result-summary-title">${esc(d.test_name || r.title || 'Lab result')}</b><span class="mu">${esc(T('Date'))}: ${when}</span><span class="lab-result-status"><span aria-hidden="true">✓</span>${T('Completed')}</span></div><div class="ra lab-result-actions"><button type="button" class="btn p" data-a="redit:${r.id}" title="${esc(T('Edit'))}" aria-label="${esc(T('Edit'))}"><span aria-hidden="true">✎</span>${T('Edit')}</button><button type="button" class="btn p" data-a="labrecordprint:${r.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}${T('Print')}</button><button type="button" class="btn lab-result-format" data-a="labrecordprint:${r.id}:sl" title="Print S+L report" aria-label="Print S+L report"><span aria-hidden="true">⌁</span>S+L</button><button type="button" class="btn lab-result-format" data-a="labrecordprint:${r.id}:cl" title="Print CL report" aria-label="Print CL report">${printerIcon()}CL</button><button type="button" class="btn r" data-a="rdel:${r.id}" title="${esc(T('Delete'))}" aria-label="${esc(T('Delete'))}"><span aria-hidden="true">▤</span></button></div></article>`;
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
function contractPrint(record) {
  const data = jd(record), patient = curPt() || {};
  const patientName = data.patient_name || patient.name || '';
  const patientSex = data.sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const patientAge = data.age || (patient.age ? fmtAge(patient) : '');
  const childName = data.occupation || patientName;
  const childSex = data.child_sex || patientSex;
  const childAge = data.child_age || patientAge;
  const residence = data.child_name || patient.addr || '';
  const witness = data.witness || '';
  const relationship = data.relationship || 'ដិតដល់';
  const date = String(data.contract_date || record.date || ymd(new Date())).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dateText = date ? `ថ្ងៃទី ${Number(date[3])} ខែ ${Number(date[2])} ឆ្នាំ ${date[1]}` : esc(data.contract_date || record.date || '');
  const blank = (value) => `<span class="consent-print-line">${value ? esc(value) : '&nbsp;'}</span>`;
  const tick = (checked) => `<span class="consent-print-check">${checked === true || checked === 1 || checked === '1' || checked === 'on' ? '✓' : ''}</span>`;
  const html = `<style>
    @page{size:A4 portrait;margin:8mm}
    #pa{font-family:"Noto Sans Khmer","Leelawadee UI",sans-serif}
    #pa .consent-print{color:#111;font-size:10.5pt;line-height:1.35}
    #pa .consent-print-title{text-align:center;margin:0;font:700 13.5pt/1.35 "Noto Sans Khmer","Leelawadee UI",sans-serif;text-decoration:underline}
    #pa .consent-print-subtitle{text-align:center;margin:1mm 0 0;font-size:9pt}
    #pa .consent-print-english{text-align:center;margin:1mm 0 4mm;font:10pt/1.3 Georgia,serif}
    #pa .consent-print-rule{border:0;border-top:.25mm solid #9ca3af;margin:0 0 3mm}
    #pa .consent-print-fields{display:grid;grid-template-columns:3.4fr 1fr 1fr 1.1fr;gap:3mm 4mm;align-items:end;margin:0 0 3mm}
    #pa .consent-print-field{display:flex;align-items:end;gap:1mm;min-width:0}
    #pa .consent-print-field-name{grid-column:span 1}
    #pa .consent-print-label{flex:0 0 auto}
    #pa .consent-print-line{display:inline-block;flex:1 1 auto;min-width:10mm;min-height:4mm;border-bottom:.25mm dotted #222;padding:0 1mm;white-space:pre-wrap}
    #pa .consent-print-residence{display:flex;align-items:end;gap:1mm;margin-bottom:3mm}
    #pa .consent-print-intro{margin:4mm 0 2mm}
    #pa .consent-print-doctor{margin:2mm 0}
    #pa .consent-print-steps{margin:1mm 0 2mm;padding-left:9mm}
    #pa .consent-print-steps li{padding-left:1mm;margin:1mm 0}
    #pa .consent-print-decision{margin:2mm 0 1mm}
    #pa .consent-print-option{display:flex;align-items:flex-start;gap:2mm;margin:1mm 0 1mm 4mm}
    #pa .consent-print-check{display:inline-flex;flex:0 0 4mm;width:4mm;height:4mm;align-items:center;justify-content:center;border:.35mm solid #111;font:9pt/1 Arial,sans-serif}
    #pa .consent-print-paragraph{margin:2mm 0;text-align:justify}
    #pa .consent-print-foreigner{display:flex;align-items:flex-start;gap:2mm;margin:4mm 0 1mm}
    #pa .consent-print-foreigner-en{margin:0 0 8mm 6mm;font:9pt/1.35 Georgia,serif}
    #pa .consent-print-signatures{display:grid;grid-template-columns:1fr 1.2fr;gap:8mm;margin-top:8mm;min-height:24mm}
    #pa .consent-print-signature{text-align:center;font-weight:700}
    #pa .consent-print-signature-line{margin-top:12mm;text-align:center;font-weight:400}
    #pa .consent-print-date{text-align:right;margin-bottom:2mm}
    @media print{
      #pa{padding:0!important}
      #pa .ph-head{margin-bottom:3mm}
      #pa .ph-banner{max-height:28mm}
      #pa .consent-print{break-inside:avoid}
      #pa .consent-print-option,#pa .consent-print-foreigner{break-inside:avoid}
    }
  </style><section class="consent-print">
    <h1 class="consent-print-title">ទម្រង់កិច្ចសន្យា (CONSENT FORM)</h1>
    <div class="consent-print-subtitle">(សម្រាប់ការព្យាបាលដោយវេជ្ជសាស្ត្រ សល្យសាស្ត្រ និង/ឬទម្រង់ការវេជ្ជសាស្ត្រនានា)</div>
    <div class="consent-print-english">CONSENT TO ALL MEDICAL PROCEDURES AND/OR TREATMENT</div>
    <hr class="consent-print-rule">
    <div class="consent-print-fields">
      <div class="consent-print-field consent-print-field-name"><span class="consent-print-label">ខ្ញុំបាទ/នាងខ្ញុំឈ្មោះ៖</span>${blank(patientName)}</div>
      <div class="consent-print-field"><span class="consent-print-label">ភេទ៖</span>${blank(patientSex)}</div>
      <div class="consent-print-field"><span class="consent-print-label">អាយុ៖</span>${blank(patientAge)}</div>
      <div class="consent-print-field"><span class="consent-print-label">ត្រូវជា៖</span>${blank(data.nationality)}</div>
      <div class="consent-print-field consent-print-field-name"><span class="consent-print-label">អ្នកជំងឺឈ្មោះ៖</span>${blank(childName)}</div>
      <div class="consent-print-field"><span class="consent-print-label">ភេទ៖</span>${blank(childSex)}</div>
      <div class="consent-print-field"><span class="consent-print-label">អាយុ៖</span>${blank(childAge)}</div>
      <div></div>
    </div>
    <div class="consent-print-residence"><span class="consent-print-label">ដែលកំពុងស្នាក់នៅ៖</span>${blank(residence)}</div>
    <hr class="consent-print-rule">
    <p class="consent-print-intro">និងទទួលការព្យាបាលដោយយកចិត្តទុកដាក់ពីក្រុមគ្រូពេទ្យ និងបុគ្គលិកនៃ មន្ទីរសម្រាកព្យាបាលជំងឺ សុវណ្ណវិទូ។</p>
    <p class="consent-print-doctor">បានទទួលការពន្យល់ណែនាំដោយវេជ្ជបណ្ឌិត៖ ${esc(data.treatment_details || '...')}</p>
    <ol class="consent-print-steps">
      <li>បានស្តាប់ការពន្យល់របស់គ្រូពេទ្យពីស្ថានភាពរបស់អ្នកជំងឺ។</li>
      <li>បានពិភាក្សាជាមួយក្រុមគ្រួសារ និងភាគីដែលពាក់ព័ន្ធ។</li>
      <li>បានសិក្សាស្វែងយល់ពីស្ថានភាពរបស់អ្នកជំងឺ។</li>
      <li>បានសាកសួរបន្ថែម និងទទួលបានការពន្យល់ពីក្រុមគ្រូពេទ្យនៃ មន្ទីរសម្រាកព្យាបាលជំងឺ សុវណ្ណវិទូ។</li>
    </ol>
    <p class="consent-print-decision">ខ្ញុំបាទ/នាងខ្ញុំ តំណាងឲ្យក្រុមគ្រួសារបងប្អូនសាច់ញាតិបានសម្រេចចិត្តចំពោះ៖</p>
    <div class="consent-print-option">${tick(data.consent_treatment)}<span>ការព្យាបាលដោយវេជ្ជសាស្ត្រ និងទម្រង់ការវេជ្ជសាស្ត្រគ្រប់ប្រភេទរួមទាំងការបញ្ចូលឈាម</span></div>
    <div class="consent-print-option">${tick(data.consent_information)}<span>ការព្យាបាលដោយវះកាត់ និងទម្រង់ការវេជ្ជសាស្ត្រគ្រប់ប្រភេទរួមទាំងការបញ្ចូលឈាម</span></div>
    <p class="consent-print-paragraph">ខ្ញុំបាទ/នាងខ្ញុំបានទទួលការពន្យល់ណែនាំរួមទាំងសាច់ញាតិដែលមានឈ្មោះដូចខាងក្រោមជាសាក្សីដឹងឮ៖ ${esc(witness || '...')}</p>
    <p class="consent-print-paragraph">ក្នុងពេលដែលចុះហត្ថលេខា ឬផ្តិតមេដៃយល់ព្រមខាងក្រោមនេះ ខ្ញុំបាទ/នាងខ្ញុំ សូមបញ្ជាក់ថាខ្ញុំបានគិតយ៉ាង ${esc(relationship)} ដោយគ្មានការបង្ខិតបង្ខំ និងអនុញ្ញាតឲ្យក្រុមគ្រូពេទ្យធ្វើតាមសេចក្តីសម្រេចខាងលើដោយពុំមានការរារាំងឡើយ។</p>
    <p class="consent-print-paragraph">ខ្ញុំបាទ/នាងខ្ញុំសន្យាថាទទួលយល់ព្រម និងទទួលយកទាំងស្រុងក្នុងករណីដែលមានគ្រោះថ្នាក់ដោយប្រការណាមួយ ដោយមិនមានប្តឹងផ្តល់ ឬទាមទារសំណងអ្វីឡើយ។</p>
    <div class="consent-print-foreigner">${tick(data.foreigner)}<span>FOR FOREIGNER/EXPATRIATE PLEASE TICK HERE:</span></div>
    <p class="consent-print-foreigner-en">As a foreigner/expatriate who does not speak Khmer, the medical staff have explained the consent form to me and relatives in English/my preferred language. I have understood the consent form in Khmer and agree to its terms.</p>
    <div class="consent-print-signatures">
      <div class="consent-print-signature">សាក្សី${witness ? `<div class="consent-print-signature-line">${esc(witness)}<br>(ឈ្មោះ/ស្នាមមេដៃ ឬហត្ថលេខា)</div>` : `<div class="consent-print-signature-line">(ឈ្មោះ/ស្នាមមេដៃ ឬហត្ថលេខា)</div>`}</div>
      <div><div class="consent-print-date">ធ្វើនៅ មន្ទីរសម្រាកព្យាបាលជំងឺ សុវណ្ណវិទូ, ${dateText}</div><div class="consent-print-signature">អ្នកជំងឺ/អាណាព្យាបាល<div class="consent-print-signature-line">${esc(patientName)}<br>(ឈ្មោះ/ស្នាមមេដៃ ឬហត្ថលេខា)</div></div></div>
    </div>
  </section>`;
  printDoc('', html, { omitClinicBranding: true, includeClinicBanner: true });
}
function vaccinationDoses(data) {
  return Array.isArray(data.doses) ? data.doses : data.vaccine ? [{ vaccine: data.vaccine, dose: data.dose, date: data.next_due, given: false, notes: data.lot ? `Lot / Batch: ${data.lot}` : '' }] : [];
}
function vaccinationPrint(r) {
  const d = jd(r), doses = vaccinationDoses(d);
  const patient = curPt() || {}, categories = [
    ['child', 'វ៉ាក់សាំងកុមារ'],
    ['adult', 'វ៉ាក់សាំងមនុស្សពេញវ័យ'],
    ['other', 'ផ្សេងៗ']
  ];
  const age = fmtAge(patient).replace(/(\d+)\s*y\b/g, '$1 ឆ្នាំ').replace(/(\d+)\s*m\b/g, '$1 ខែ').replace(/(\d+)\s*d\b/g, '$1 ថ្ងៃ');
  const sex = patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '';
  const rows = Array.from({ length: Math.max(VACCINE_DOSE_COUNT, d.dose_count || 0, doses.length) }, (_, index) => {
    const dose = doses[index] || {};
    const date = String(dose.date || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return `<tr><td class="vaccination-card-number">${index + 1}</td><td>${esc(dose.vaccine || `ចាក់វ៉ាក់សាំងទី${index + 1}`)}</td><td>${date ? `${date[3]}/${date[2]}/${date[1]}` : ''}</td><td class="vaccination-card-check">${dose.given ? '☑' : '☐'}</td><td>${esc(dose.notes || '')}</td></tr>`;
  }).join('');
  const today = ymd(new Date()).split('-');
  const printDate = `ថ្ងៃទី ${Number(today[2])} ខែ ${Number(today[1])} ឆ្នាំ ${today[0]}`;
  const html = `<style>
    @page{size:A4 portrait;margin:12mm}
    #pa .vaccination-card{font-family:inherit;color:#111;font-size:11pt}
    #pa .vaccination-card-title{text-align:center;margin:2mm 0 0;font-size:18pt;text-decoration:underline}
    #pa .vaccination-card-subtitle{text-align:center;margin:0 0 6mm;font-size:9pt}
    #pa .vaccination-card-info{display:flex;justify-content:space-between;gap:8mm;margin:3mm 0}
    #pa .vaccination-card-info p{margin:1mm 0}
    #pa .vaccination-card-options{display:flex;flex-wrap:wrap;gap:0 5mm}
    #pa .vaccination-card table{width:100%;border-collapse:collapse;table-layout:fixed;margin:4mm 0}
    #pa .vaccination-card th,#pa .vaccination-card td{border:.3mm solid #111;padding:1.5mm;text-align:center;vertical-align:middle}
    #pa .vaccination-card th{background:#e5e7eb!important;color:#111!important;font-weight:700}
    #pa .vaccination-card th:nth-child(1){width:8%}
    #pa .vaccination-card th:nth-child(2){width:25%}
    #pa .vaccination-card th:nth-child(3){width:20%}
    #pa .vaccination-card th:nth-child(4){width:12%}
    #pa .vaccination-card th:nth-child(5){width:35%}
    #pa .vaccination-card tbody tr{height:8mm}
    #pa .vaccination-card .vaccination-card-number{width:8%}
    #pa .vaccination-card .vaccination-card-check{font-size:14pt}
    #pa .vaccination-card-notes{margin-top:3mm}
    #pa .vaccination-card-signature{margin:10mm 0 0 auto;width:45%;text-align:center}
    #pa .vaccination-card-signature-line{border-bottom:.3mm solid #111;height:12mm}
    #pa .vaccination-card-signature-label{margin-top:2mm}
    @media print{#pa .vaccination-card{break-inside:avoid}}
  </style><section class="vaccination-card">
    <h2 class="vaccination-card-title">ប័ណ្ណចាក់វ៉ាក់សាំង</h2>
    <div class="vaccination-card-subtitle">VACCINATION CARD</div>
    <div class="vaccination-card-info">
      <div><p>ប្រភេទវ៉ាក់សាំង៖ <span class="vaccination-card-options">${categories.map(([key, label]) => `${d.category == key ? '☑' : '☐'} ${label}`).join(' ')}</span></p><p>ឈ្មោះ៖ ${esc(patient.name || '')}</p><p>ឈ្មោះក្រុមវ៉ាក់សាំង៖ ${esc(d.vaccine_group || d.vaccine_type || '')}</p></div>
      <div><p>អាយុ៖ ${esc(age)}</p><p>ភេទ៖ ${esc(sex)}</p><p>លេខសម្គាល់៖ ${esc(patient.id || '')}</p></div>
    </div>
    <table><thead><tr><th>ល.រ</th><th>ចំនួនដូសវ៉ាក់សាំង</th><th>ថ្ងៃ ខែ ឆ្នាំ</th><th>ចាក់រួច</th><th>ហត្ថលេខាអ្នកចាក់</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="vaccination-card-notes">ចំណាំ៖ ${esc(d.notes || r.notes || '')}</p>
    <div class="vaccination-card-signature"><div>${printDate}</div><div class="vaccination-card-signature-line"></div><div class="vaccination-card-signature-label">${esc(d.administered_by || 'បុគ្គលិកចាក់វ៉ាក់សាំង')}</div><div>(ហត្ថលេខា)</div></div>
  </section>`;
  printDoc('', html);
}
function recPanel() {
  const p = curPt(); if (!p) return '';
  if (ptab == 'schedule') return schPanel();
  if (ptab == 'billing') return billPanel();
  if (ptab == 'appts') {
    const appointments = D.ap.filter((appointment) => String(appointment.patient_id || '') == String(p.id) || (!appointment.patient_id && (appointment.name || '').toLowerCase() == (p.name || '').toLowerCase()));
    return `<div class="patient-appointment-history"><div class="tools" style="justify-content:space-between"><h2 class="rh">${lbl(ptab)}</h2><button type="button" class="btn p" data-a="ptapadd">＋ បន្ថែមការណាត់ជួប</button></div>${appointments.map((appointment) => `<article class="rc"><b>${esc(appointment.date || '')} ${esc(appointment.time || '')}</b> ${esc(appointment.svc || '')} <span class="mu">${esc(appointment.doc || '')}</span> <span class="bd">${esc(appointment.st || 'Waiting')}</span>${appointment.description ? `<div class="mu">${esc(appointment.description)}</div>` : ''}</article>`).join('') || '<p class="emp">Nothing here yet.</p>'}</div>`;
  }
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
  if (ptab == 'medlist') return medlistPanel(L);
  if (ptab == 'documents') return patientDocumentsPanel(recs.filter((r) => r.kind == 'documents' && (!pdDate || (r.date || '').startsWith(pdDate))));
  return `<div class="hd"><h2 class="rh">${lbl(ptab)}</h2>${ptab == 'medical' ? '<div class="tools"><button class="btn" data-a="htc" title="HT Controls">⚙</button><button class="btn" data-a="mhist">History</button><button class="btn" data-a="mrd">MRD</button><button class="btn g" data-a="radd">+ Add</button></div>' : '<button class="btn g" data-a="radd">+ Add</button>'}</div>${ptab == 'beu' ? `<div class="gr">${L.map(recCard).join('')}</div>` : L.map(recCard).join('')}${L.length ? '' : '<p class="emp">Nothing here yet.</p>'}`;
}
function patientDocumentsPanel(records) {
  const selectedType = PATIENT_DOCUMENT_TYPES.find(([key]) => key == documentTypeKey);
  const menu = documentTypeMenuOpen
    ? `<div class="patient-documents-type-menu" role="menu">${PATIENT_DOCUMENT_TYPES.map(([key, label, icon]) => `<button type="button" class="patient-documents-type-option" role="menuitem" data-a="patient-doctype:${key}"><span aria-hidden="true">${icon}</span>${esc(label)}</button>`).join('')}</div>`
    : '';
  return `<section class="patient-documents"><header class="patient-documents-header"><div><h2>ឯកសារ/Documents</h2></div><div class="patient-documents-actions"><div class="patient-documents-type"><button type="button" class="btn patient-documents-type-button" data-a="patient-doctype-menu" aria-haspopup="menu" aria-expanded="${documentTypeMenuOpen}">${esc(selectedType ? selectedType[1] : 'ឯកសារមានប្រភេទ')}<span aria-hidden="true">⌄</span></button></div><button type="button" class="btn p patient-documents-upload" data-a="patient-document-upload"><span aria-hidden="true">↥</span> បញ្ចូល</button>${menu}</div></header><div class="patient-documents-list">${records.map(recCard).join('') || `<p class="emp">${T('Nothing here yet.')}</p>`}</section>`;
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
  }, { cls: mode == 'md' ? 'md-consultation-dialog' : 'xl consultation-form-dialog', close: true, hideCancel: true, ok: editing ? 'រក្សាទុកការកែប្រែ' : 'រក្សាទុក', extra: `<button type="button" class="btn" data-a="consultation-print">${printerIcon()} បោះពុម្ព</button>` });
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
  }, { cls: 'center-form-dialog', close: true, hideCancel: true, ok: 'រក្សាទុក', extra: `<button type="button" class="btn" data-a="centerprint">${printerIcon()} បោះពុម្ព</button>` });
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
function collectLegacyPatientReferralData(form) {
  const formData = new FormData(form), result = {};
  const multiSelectKeys = [
    'referral_systems', 'referral_body_areas', 'referral_medical_conditions', 'referral_treatments',
    'referral_diagnostics', 'referral_examinations', 'referral_disposition', 'referral_traffic_types',
    'referral_helmet', 'referral_seatbelt', 'referral_scene_interventions', 'referral_injury_areas',
    'referral_awareness', 'referral_mental_signs', 'referral_pupils', 'referral_injury_causes',
    'referral_breathing_signs', 'referral_circulation_signs', 'referral_emergency_treatments'
  ];
  for (const [key, value] of formData) {
    if (multiSelectKeys.includes(key)) continue;
    result[key] = value;
  }
  multiSelectKeys.forEach((key) => {
    const selected = formData.getAll(key);
    if (selected.length) result[key] = selected;
  });
  result.document_type = 'referral';
  return result;
}
function legacyPatientReferralForm(record = null) {
  const patient = curPt() || {}, data = record ? jd(record) : {};
  const field = (label, key, type = 'text', fallback = '') => fIn(label, key, data[key] || fallback, type);
  const area = (label, key, rows = 3) => `<label class="fl">${label}<textarea class="in" name="${key}" rows="${rows}">${esc(data[key] || '')}</textarea></label>`;
  const checks = (label, key, options) => {
    const selected = Array.isArray(data[key]) ? data[key] : [];
    return `<fieldset class="patient-referral-fieldset"><legend>${label}</legend><div class="patient-referral-checks">${options.map(([value, text]) => fCb(text, key, selected.includes(value), value)).join('')}</div></fieldset>`;
  };
  const radios = (label, key, options, fallback = '') => `<fieldset class="patient-referral-fieldset"><legend>${label}</legend><div class="patient-referral-checks">${options.map(([value, text]) => `<label class="cb"><input type="radio" name="${key}" value="${esc(value)}" ${(data[key] || fallback) == value ? 'checked' : ''}> ${text}</label>`).join('')}</div></fieldset>`;
  const medicalHistory = [
    ['hypertension', 'លើសឈាម'], ['diabetes', 'ទឹកនោមផ្អែម'], ['heart_disease', 'ជំងឺបេះដូង'],
    ['asthma', 'ហឺត'], ['tuberculosis', 'របេង'], ['surgery', 'ធ្លាប់វះកាត់'],
    ['medication', 'ប្រើថ្នាំប្រចាំ'], ['allergy', 'ប្រតិកម្មថ្នាំ'], ['other', 'ផ្សេងៗ']
  ];
  const treatments = [
    ['medicine', 'ផ្តល់ថ្នាំ'], ['iv', 'ចាក់សេរ៉ូម'], ['oxygen', 'ផ្តល់អុកស៊ីសែន'],
    ['wound_care', 'សម្អាតរបួស'], ['other', 'ផ្សេងៗ']
  ];
  const diagnostics = [
    ['blood_test', 'ពិនិត្យឈាម'], ['urine_test', 'ពិនិត្យទឹកនោម'], ['xray', 'ថត X-Ray'],
    ['ultrasound', 'អេកូ'], ['ecg', 'ECG'], ['other', 'ផ្សេងៗ']
  ];
  const choices = {
    referral_sex: [['male', 'ប្រុស'], ['female', 'ស្រី']],
    referral_past_condition: [['yes', 'មាន'], ['no', 'គ្មាន'], ['unknown', 'មិនដឹង']],
    referral_previous_visit: [['yes', 'មាន'], ['no', 'គ្មាន'], ['unknown', 'មិនដឹង']],
    referral_awareness: [['A', 'ដឹងខ្លួន'], ['V', 'ឆ្លើយតបពេលហៅ'], ['P', 'ឆ្លើយតបពេលឈឺ'], ['U', 'មិនឆ្លើយតប']],
    referral_severity: [['stable', 'មានស្ថិរភាព'], ['urgent', 'បន្ទាន់'], ['critical', 'ធ្ងន់ធ្ងរ']],
    referral_disposition: REFERRAL_DISPOSITIONS
  };
  const awarenessValue = ({ alert: 'A', verbal: 'V', pain: 'P', unresponsive: 'U' }[data.referral_awareness] || data.referral_awareness);
  if (awarenessValue) data.referral_awareness = Array.isArray(awarenessValue) ? awarenessValue[0] : awarenessValue;
  const date = data.referral_date || (record?.date || '').slice(0, 10) || ymd(new Date());
  const symptomFields = [
    ['referral_symptom_day', 'ថ្ងៃ'], ['referral_symptom_time', 'ម៉ោង'],
    ['referral_symptom_frequency', 'ញឹកញាប់'], ['referral_symptom_severity', 'ធ្ងន់/ស្រាល'],
    ['referral_symptom_location', 'ទីតាំង']
  ].map(([key, label]) => field(label, key));
  const timeFields = [
    ['referral_time_onset', 'ទទួលទូរស័ព្ទ'], ['referral_time_arrival', 'ចេញដំណើរ'],
    ['referral_time_exam', 'ដល់គោលដៅ'], ['referral_time_treatment', 'ចេញពីគោលដៅ'],
    ['referral_time_transfer', 'ដល់មន្ទីរពេទ្យ']
  ].map(([key, label]) => field(label, key, 'time'));
  const bodyDiagram = '<div class="patient-referral-body-diagram"><img src="/assets/referral-body-diagram.png" alt="គំនូសបង្ហាញរាងកាយខាងមុខ និងខាងក្រោយ"></div>';
  const body = `<div class="patient-referral-form">
    <div class="patient-referral-top-grid">${field('បញ្ជូនពី', 'referral_from')}${field('បញ្ជូនទៅ', 'referral_to')}${field('ថ្ងៃ', 'referral_date', 'date', date)}</div>
    <fieldset class="patient-referral-fieldset"><legend>ព័ត៌មានអ្នកជំងឺ</legend><div class="patient-referral-patient-grid">${field('ឈ្មោះអ្នកជំងឺ', 'referral_patient_name', 'text', patient.name || '')}${field('លេខសម្គាល់', 'referral_patient_id', 'text', patient.id || '')}${field('អាយុ', 'referral_age', 'text', fmtAge(patient))}${radios('ភេទ', 'referral_sex', choices.referral_sex, patient.sex == 'M' ? 'male' : patient.sex == 'F' ? 'female' : '')}${field('លេខទូរស័ព្ទ', 'referral_phone', 'tel', patient.phone || '')}${field('អាសយដ្ឋាន', 'referral_address', 'text', patient.addr || '')}</div></fieldset>
    <fieldset class="patient-referral-fieldset"><legend>ប្រវត្តិ និងរោគសញ្ញា</legend><div class="patient-referral-three-grid">${field('រោគសញ្ញា/មូលហេតុ', 'referral_complaint')}${field('អាយុ/រយៈពេលឈឺ', 'referral_duration')}${radios('ស្ថានភាព', 'referral_severity', choices.referral_severity)}${area('រោគសញ្ញាបច្ចុប្បន្ន', 'referral_symptom_progress', 2)}</div><div class="patient-referral-five-grid">${symptomFields.join('')}</div></fieldset>
    <fieldset class="patient-referral-fieldset"><legend>ពេលវេលា</legend><div class="patient-referral-five-grid">${timeFields.join('')}</div></fieldset>
    <div class="patient-referral-columns">
      <fieldset class="patient-referral-fieldset"><legend>ប្រវត្តិជំងឺ និងការព្យាបាល</legend>${checks('ប្រវត្តិជំងឺ', 'referral_medical_conditions', medicalHistory)}${radios('ធ្លាប់មានជំងឺនេះពីមុនដែរឬទេ?', 'referral_past_condition', choices.referral_past_condition)}${radios('ធ្លាប់ពិនិត្យ/ព្យាបាលនៅកន្លែងផ្សេងដែរឬទេ?', 'referral_previous_visit', choices.referral_previous_visit)}${area('កំណត់ត្រាប្រវត្តិជំងឺ', 'referral_history_notes', 2)}${field('ថ្នាំដែលបានប្រើ', 'referral_medication_notes')}${field('ប្រតិកម្ម/អាលែកហ្ស៊ី', 'referral_allergy_notes')}</fieldset>
      <fieldset class="patient-referral-fieldset"><legend>ការព្យាបាលមុនពេលបញ្ជូន</legend>${checks('បានអនុវត្ត', 'referral_treatments', treatments)}${area('ការព្យាបាល និងលទ្ធផល', 'referral_treatment_notes', 3)}${checks('ការពិនិត្យ/វិភាគដែលបានធ្វើ', 'referral_diagnostics', diagnostics)}${area('លទ្ធផលពិនិត្យ', 'referral_test_notes', 2)}</fieldset>
    </div>
    <div class="patient-referral-assessment">
      <fieldset class="patient-referral-fieldset"><legend>ពិនិត្យតាមប្រព័ន្ធ</legend>${checks('ប្រព័ន្ធរាងកាយ', 'referral_systems', REFERRAL_SYSTEMS)}</fieldset>
      <fieldset class="patient-referral-fieldset"><legend>តំបន់រាងកាយ</legend>${bodyDiagram}${checks('តំបន់ដែលមានបញ្ហា', 'referral_body_areas', [['head','ក្បាល'],['chest','ទ្រូង'],['abdomen','ពោះ'],['back','ខ្នង'],['arms','ដៃ'],['legs','ជើង']])}${area('កំណត់ចំណាំ', 'referral_symptom_other', 2)}</fieldset>
      <div class="patient-referral-vitals"><fieldset class="patient-referral-fieldset"><legend>សញ្ញាជីវិត</legend>${radios('សភាពស្មារតី', 'referral_awareness', choices.referral_awareness)}<div class="patient-referral-vital-grid">${field('សីតុណ្ហភាព (°C)', 'referral_temperature', 'number')}${field('ជីពចរ (/នាទី)', 'referral_pulse', 'number')}${field('សម្ពាធឈាម', 'referral_blood_pressure')}${field('អត្រាដង្ហើម (/នាទី)', 'referral_respiratory_rate', 'number')}${field('SpO₂ (%)', 'referral_oxygen', 'number')}${field('ទម្ងន់ (គក.)', 'referral_weight', 'number')}${field('កម្ពស់ (សម.)', 'referral_height', 'number')}</div></fieldset>
      <fieldset class="patient-referral-fieldset"><legend>ការពិនិត្យរាងកាយ</legend>${checks('ផ្នែកដែលបានពិនិត្យ', 'referral_examinations', REFERRAL_EXAMINATIONS)}${area('លទ្ធផលពិនិត្យ', 'referral_exam_notes', 3)}</fieldset></div>
    </div>
    <fieldset class="patient-referral-fieldset"><legend>វិភាគជំងឺ និងការព្យាបាល</legend><div class="patient-referral-three-grid">${field('រោគវិនិច្ឆ័យបឋម', 'referral_diagnosis')}${field('រោគវិនិច្ឆ័យបន្ថែម', 'referral_secondary_diagnosis')}${field('មូលហេតុបញ្ជូន', 'referral_recommendation')}</div>${area('ការព្យាបាលដែលបានផ្តល់ និងផែនការ', 'referral_treatment_plan', 3)}</fieldset>
    <div class="patient-referral-columns"><fieldset class="patient-referral-fieldset"><legend>ការសម្រេច និងការណែនាំ</legend>${checks('ស្ថានភាព/សកម្មភាព', 'referral_disposition', REFERRAL_DISPOSITIONS)}${area('សេចក្តីណែនាំបន្ថែម', 'referral_disposition_notes', 3)}</fieldset><fieldset class="patient-referral-fieldset"><legend>ព័ត៌មានវេជ្ជបណ្ឌិត</legend>${field('ឈ្មោះវេជ្ជបណ្ឌិត', 'referral_doctor')}${field('លេខទំនាក់ទំនង', 'referral_contact', 'tel')}${area('កំណត់ចំណាំផ្សេងៗ', 'referral_notes', 4)}</fieldset></div>
    <fieldset class="patient-referral-fieldset"><legend>ព័ត៌មានបន្ថែមសម្រាប់របាយការណ៍ PDF</legend>
      <div class="patient-referral-three-grid">${field('ថ្ងៃខែឆ្នាំកំណើត', 'referral_birth_date', 'date', patient.dob || '')}${field('ផ្លូវ', 'referral_address_street')}${field('ភូមិ', 'referral_address_village')}${field('ឃុំ/សង្កាត់', 'referral_address_commune')}${field('ស្រុក/ខណ្ឌ', 'referral_address_district')}${field('ខេត្ត/ក្រុង', 'referral_address_province')}</div>
      <div class="patient-referral-three-grid">${checks('ប្រភេទគ្រោះថ្នាក់ចរាចរណ៍', 'referral_traffic_types', REFERRAL_TRAFFIC_TYPES)}${radios('ពាក់មួកសុវត្ថិភាព', 'referral_helmet', REFERRAL_YES_NO_UNKNOWN)}${radios('ពាក់ខ្សែក្រវ៉ាត់', 'referral_seatbelt', REFERRAL_YES_NO_UNKNOWN)}</div>
      <div class="patient-referral-three-grid">${field('គ្រោះថ្នាក់ផ្សេងៗ', 'referral_other_accident')}${field('ជំងឺផ្សេងៗ', 'referral_other_illness')}${checks('អន្តរាគមន៍នៅកន្លែងកើតហេតុ', 'referral_scene_interventions', [['police','នគរបាល'],['public','ប្រជាជន'],['medical','ពេទ្យ']])}${field('ផ្សេងៗ', 'referral_scene_other')}</div>
      <div class="patient-referral-three-grid">${checks('វិភាគរបួសស្នាម', 'referral_injury_areas', REFERRAL_INJURY_AREAS)}${checks('សញ្ញាផ្សេងៗ', 'referral_mental_signs', [['agitation','រវើរវាយ'],['seizure','ប្រកាច់']])}${checks('កូនក្រមុំភ្នែក', 'referral_pupils', [['dilated','រីកធំ'],['constricted','រួមតូច']])}${checks('មូលហេតុជំងឺ', 'referral_injury_causes', REFERRAL_INJURY_CAUSES)}${field('ផ្សេងៗ', 'referral_injury_other')}</div>
      <div class="patient-referral-three-grid">${field('ចង្វាក់ដង្ហើម (/នាទី)', 'referral_breathing_rate', 'number')}${checks('ការដកដង្ហើម', 'referral_breathing_signs', [['apnea','អត់ដកដង្ហើម'],['gasping','ដកដង្ហក់'],['secretions','ឡើងស្លេស្ម'],['cyanosis','ឡើងស្វាយ']])}${field('អុកស៊ីសែនក្នុងឈាម (%)', 'referral_oxygen', 'number')}${checks('ចរន្តឈាមរត់', 'referral_circulation_signs', [['bleeding','ឃាត់ឈាម'],['cardiac_arrest','គាំងបេះដូង'],['pale','ស្លេកស្លាំង'],['sweating','បែកញើស']])}${field('CRT (វិនាទី)', 'referral_crt', 'number')}${field('សីតុណ្ហភាព (°C)', 'referral_temperature', 'number')}${field('ជាតិស្ករ', 'referral_glucose', 'number')}</div>
      <div class="patient-referral-three-grid">${checks('ការសង្គ្រោះដែលបានធ្វើ', 'referral_emergency_treatments', REFERRAL_EMERGENCY_TREATMENTS)}${field('ផ្សេងៗ', 'referral_emergency_treatment_other')}${area('ថ្នាំ និងសម្ភារៈដែលបានប្រើ', 'referral_medications_used', 3)}</div>
      <div class="patient-referral-three-grid">${field('អ្នកបើករថយន្ត', 'referral_driver_name')}${field('គិលានសង្គ្រោះ', 'referral_nurse_name')}${field('អ្នកទទួលជំងឺ', 'referral_receiver_name')}${field('អ្នកបញ្ជូនជំងឺ', 'referral_referrer_name')}${area('បរិយាយបន្ថែម', 'referral_narrative', 3)}</div>
    </fieldset>
  </div>`;
  openForm('របាយការណ៍បញ្ជូនអ្នកជំងឺ', body, async (form) => {
    const submitted = collectLegacyPatientReferralData(form), submittedDate = submitted.referral_date || date;
    const payload = { patient_id: pdId, kind: 'documents', title: 'របាយការណ៍បញ្ជូនអ្នកជំងឺ', date: submittedDate, notes: submitted.referral_recommendation || '', data: submitted };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-referral-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក និង បិទ',
    cancelLabel: T('បោះបង់'),
    extra: `<button type="button" class="btn patient-referral-clear" data-a="patient-referral-clear">លុបព័ត៌មាន</button><button type="button" class="btn" data-a="patient-referral-report-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
  const form = $('#mf');
  form.dataset.patientReferralRecordId = record ? String(record.id) : '';
  form.dataset.patientReferralDate = date;
}
function legacyPatientReferralPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const value = (key, fallback = '') => data[key] == null || data[key] === '' ? fallback : data[key];
  const mm = (points) => `${points * 25.4 / 72}mm`;
  const at = (key, x, y, width, fallback = '', multiline = false) => {
    const current = value(key, fallback);
    if (current == null || current === '') return '';
    return `<span class="referral-template-text${multiline ? ' multiline' : ''}" style="left:${mm(x)};top:${mm(y)};width:${mm(width)}">${esc(current)}</span>`;
  };
  const marks = (key, positions, fallback = '') => {
    const current = value(key, fallback), selected = Array.isArray(current) ? current : current ? [current] : [];
    return positions.filter(([option]) => selected.includes(option)).map(([, x, y, circle = false]) =>
      `<span class="referral-template-mark${circle ? ' circle' : ''}" style="left:${mm(x)};top:${mm(y)}">✓</span>`).join('');
  };
  const clinic = D.clinic || {}, referralDate = String(value('referral_date', date)).slice(0, 10).split('-');
  const printableDate = (input) => input ? String(input).slice(0, 10).split('-').reverse().join('/') : '';
  const birthDate = printableDate(value('referral_birth_date', patient.dob || ''));
  const ageAndBirth = [value('referral_age', fmtAge(patient)), birthDate].filter(Boolean).join(' / ');
  const sexFallback = { M: 'male', F: 'female' }[patient.sex] || '';
  const addressKeys = ['referral_address_street', 'referral_address_village', 'referral_address_commune', 'referral_address_district', 'referral_address_province'];
  const addressFields = addressKeys.map((key) => value(key));
  const hasAddressParts = addressFields.some(Boolean);
  const fallbackAddress = String(value('referral_address', patient.addr || '')).split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean).slice(-addressKeys.length);
  const addressParts = hasAddressParts
    ? addressFields
    : [...Array(addressKeys.length - fallbackAddress.length).fill(''), ...fallbackAddress];
  const incidentMarks = marks('referral_traffic_types', [['motorcycle',94.1,229.9],['car',145.9,229.9],['pedestrian',190.9,229.9]])
    + marks('referral_helmet', [['yes',56.6,241.9,true],['no',93.4,241.9,true],['unknown',127.1,241.9,true]])
    + marks('referral_seatbelt', [['yes',78.4,253.9,true],['no',114.4,253.9,true],['unknown',148.1,253.9,true]])
    + marks('referral_scene_interventions', [['police',364.9,241.9],['public',420.4,241.9],['medical',473.6,241.9]]);
  const injuryMarks = marks('referral_injury_areas', [['head',16.1,316.9],['neck',52.9,316.9],['chest',76.9,316.9],['abdomen',109.1,316.9],['back',142.1,316.9],['upper_limbs',16.1,328.9],['lower_limbs',69.4,328.9],['pelvis',133.9,328.9],['genitals',16.1,340.9],['skin',88.9,340.9]])
    + marks('referral_awareness', [['A',488.6,316.9,true],['V',513.4,316.9,true],['P',433.9,328.9,true],['U',457.9,328.9,true]], ({ alert:'A', verbal:'V', pain:'P', unresponsive:'U' }[data.referral_awareness] || ''))
    + marks('referral_mental_signs', [['agitation',433.9,340.9],['seizure',479.6,340.9]])
    + marks('referral_pupils', [['dilated',490.9,352.9,true],['constricted',527.6,352.9,true]])
    + marks('referral_injury_causes', [['congenital',433.9,382.9],['explosive',514.9,382.9],['sharp_object',433.9,394.9],['poisoning',493.1,394.9],['drowning',524.6,394.9],['snakebite',433.9,406.9]]);
  const observationMarks = marks('referral_breathing_signs', [['apnea',119.6,462.4],['gasping',193.1,462.4],['secretions',248.6,462.4],['cyanosis',305.6,462.4]])
    + marks('referral_circulation_signs', [['bleeding',143.6,475.1],['cardiac_arrest',202.9,475.1],['pale',16.1,487.9],['sweating',72.4,487.9]])
    + marks('referral_emergency_treatments', [['suction',16.1,519.4],['oxygen',143.6,519.4],['intubation',16.1,531.4],['bag_mask',143.6,531.4],['cpr',16.1,543.4],['neck_support',143.6,543.4],['fracture_support',16.1,555.4],['iv',143.6,555.4],['shock',16.1,567.4],['warming',143.6,567.4]]);
  const dateParts = referralDate.length === 3 ? [referralDate[2], referralDate[1], referralDate[0]] : ['', '', ''];
  const sexMarks = [['male',388.9,97.9,true],['female',364.9,109.9,true]];
  const html = `<style>
    @page{size:Letter portrait;margin:0}
    @media print{
      html,body{width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:215.9mm;height:279.4mm;margin:0!important;padding:0!important;overflow:hidden}
      #pa .print-document,#pa .print-document-content{width:215.9mm;height:279.4mm;margin:0;padding:0;overflow:hidden}
    }
    .referral-template{position:relative;width:215.9mm;height:279.4mm;overflow:hidden;color:#111;font-family:inherit;line-height:1}
    .referral-template-background{position:absolute;inset:0;display:block;width:100%;height:100%}
    .referral-template-text,.referral-template-mark{position:absolute;z-index:1;font-family:inherit;font-size:8pt;line-height:1.15;color:#111}
    .referral-template-text{white-space:nowrap;overflow:hidden}
    .referral-template-text.multiline{white-space:pre-wrap;overflow-wrap:anywhere}
    .referral-template-mark{display:flex;width:${mm(6.8)};height:${mm(6.8)};align-items:center;justify-content:center;font-size:6.5pt;font-weight:bold}
    .referral-template-mark.circle{font-size:6pt}
  </style><article class="referral-template"><img class="referral-template-background" src="/assets/referral-template-background.png" alt="">
    ${at('referral_from',50,55,180,clinic.name || '')}
    ${at('referral_to',294,55,175)}
    ${at('',513,55,12,dateParts[0])}${at('',548,55,12,dateParts[1])}${at('',580,55,20,dateParts[2])}
    ${at('referral_patient_name',46,101,220,patient.name || '')}
    ${at('',320,107,48,ageAndBirth)}
    ${marks('referral_sex', sexMarks, sexFallback)}
    ${at('referral_phone',484,101,105,patient.phone || '')}
    ${at('',80,126,42,addressParts[0])}${at('',141,126,45,addressParts[1])}
    ${at('',229,126,43,addressParts[2])}${at('',315,126,43,addressParts[3])}
    ${at('',402,126,100,addressParts[4])}
    ${at('referral_time_onset',94,183,45)}${at('referral_time_arrival',227,183,42)}
    ${at('referral_time_exam',292,183,48)}${at('referral_time_treatment',377,183,45)}
    ${at('referral_time_transfer',488,183,52)}
    ${incidentMarks}
    ${at('referral_other_accident',85,264,135)}${at('referral_other_illness',64,276,150)}
    ${at('referral_scene_other',401,252,95)}
    ${injuryMarks}${at('referral_injury_other',52,351,92)}
    ${at('referral_complaint',464,418,110)}
    ${observationMarks}
    ${at('referral_breathing_rate',76,459,19,value('referral_respiratory_rate'))}
    ${at('referral_oxygen',480,460,42)}
    ${at('referral_pulse',98,472,24)}
    ${at('referral_crt',291,473,44)}
    ${at('referral_temperature',178,486,44)}
    ${at('referral_glucose',274,486,45)}
    ${at('referral_emergency_treatment_other',72,578,110)}
    ${at('referral_medications_used',280,518,145,'',true)}
    ${at('referral_receiver_name',80,608,175)}
    ${at('referral_referrer_name',287,608,136)}
    ${at('referral_driver_name',455,602,120)}
    ${at('referral_nurse_name',455,614,120)}
    ${at('referral_narrative',20,668,550,'',true)}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function collectPatientReferralData(form) {
  return { ...Object.fromEntries(new FormData(form)), document_type: 'referral-letter' };
}
function patientReferralForm(record = null) {
  const patient = curPt() || {}, data = record ? jd(record) : {};
  const field = (label, key, fallback = '', type = 'text') => `<label class="fl">${label}<input class="in" type="${type}" name="${key}" value="${esc(data[key] || fallback)}"></label>`;
  const area = (label, key, fallback = '', rows = 3) => `<label class="fl patient-referral-full">${label}<textarea class="in" name="${key}" rows="${rows}">${esc(data[key] || fallback)}</textarea></label>`;
  const date = data.referral_date || (record?.date || '').slice(0, 10) || ymd(new Date());
  const sex = data.referral_sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : '');
  const body = `<div class="patient-referral-form">
    ${field('ឈ្មោះអ្នកជំងឺ:', 'referral_patient_name', patient.name || '')}
    ${field('អាយុ:', 'referral_age', patient.age == null ? '' : String(patient.age))}
    ${field('ភេទ:', 'referral_sex', sex)}
    ${field('សញ្ជាតិ:', 'referral_nationality', patient.khmer ? 'ខ្មែរ' : '')}
    ${field('អាសយដ្ឋាន:', 'referral_address', patient.addr || '')}
    ${field('លេខទូរស័ព្ទ:', 'referral_phone', patient.phone || '', 'tel')}
    ${field('មុខរបរ:', 'referral_occupation')}
    ${field('កាលបរិច្ឆេទ:', 'referral_date', date, 'date')}
    ${field('គ្រូពេទ្យព្យាបាលផ្នែក:', 'referral_department', data.referral_from || '')}
    ${field('បញ្ជូនទៅកាន់:', 'referral_to')}
    ${area('មូលហេតុបញ្ជូន:', 'referral_reason', data.referral_recommendation || data.referral_complaint || '')}
    ${area('ការព្យាបាលដែលបានទទួលរួចហើយ:', 'referral_treatment_received', data.referral_treatment_plan || data.referral_treatment_notes || '')}
    <p class="patient-referral-note patient-referral-full">សូមលោកប្រធានមន្ទីរពេទ្យ ជួយបន្តការពិនិត្យព្យាបាល អ្នកជំងឺនេះដោយអនុគ្រោះ។</p>
    ${area('សូមភ្ជាប់មកជាមួយ:', 'referral_attachments', data.referral_notes || '')}
  </div>`;
  openForm('លិខិតបញ្ជូនអ្នកជំងឺ', body, async (form) => {
    const submitted = { ...data, ...collectPatientReferralData(form) };
    const submittedDate = submitted.referral_date || date;
    const payload = { patient_id: pdId, kind: 'documents', title: 'លិខិតបញ្ជូនអ្នកជំងឺ', date: submittedDate, notes: submitted.referral_reason || '', data: submitted };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-referral-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក និង បិទ',
    cancelLabel: 'បោះបង់',
    extra: `<button type="button" class="btn" data-a="patient-referral-letter-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
  $('#mf').dataset.patientReferralRecordId = record ? String(record.id) : '';
  $('#mf').dataset.patientReferralDate = date;
}
function patientReferralPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const value = (key, fallback = '', aliases = []) => {
    for (const candidate of [key, ...aliases]) {
      if (data[candidate] != null && data[candidate] !== '') return data[candidate];
    }
    return fallback;
  };
  const mm = (points) => `${points * 25.4 / 72}mm`;
  const place = (text, x, y, width, multiline = false) => text == null || text === '' ? '' : `<span class="referral-letter-value${multiline ? ' multiline' : ''}" style="left:${mm(x)};top:${mm(y)};width:${mm(width)}">${esc(text)}</span>`;
  const printableSex = ({ male: 'ប្រុស', female: 'ស្រី', M: 'ប្រុស', F: 'ស្រី' }[value('referral_sex', patient.sex || '')] || value('referral_sex', patient.sex || ''));
  const rawAge = String(value('referral_age', patient.age == null ? '' : String(patient.age)));
  const age = rawAge && /ឆ្នាំ|ខែ|ថ្ងៃ/.test(rawAge) ? rawAge : rawAge ? `${rawAge} ឆ្នាំ` : '';
  const [year = '', month = '', day = ''] = String(value('referral_date', date)).slice(0, 10).split('-');
  const html = `<style>
    @page{size:Letter portrait;margin:0}
    @media print{
      html,body{width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .referral-letter{position:relative;width:215.9mm;height:279.4mm;overflow:hidden;background:#fff;color:#2563eb;font-family:"Noto Sans Khmer",system-ui,sans-serif;line-height:1}
    .referral-letter-background{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:fill}
    .referral-letter-value{position:absolute;z-index:1;overflow:hidden;color:#2563eb;font-size:11pt;line-height:1.35;white-space:nowrap}
    .referral-letter-value.multiline{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}
  </style><article class="referral-letter"><img class="referral-letter-background" src="/assets/referral-letter-background.png" alt="">
    ${place(value('referral_department', '', ['referral_from']), 154, 82, 430)}
    ${place(value('referral_patient_name', patient.name || ''), 151, 115, 245)}
    ${place(value('referral_nationality'), 458, 115, 130)}
    ${place(printableSex, 59, 145, 130)}
    ${place(age, 252, 145, 145)}
    ${place(value('referral_address', patient.addr || ''), 92, 175, 205)}
    ${place(value('referral_phone', patient.phone || ''), 380, 175, 208)}
    ${place(value('referral_occupation'), 70, 205, 518)}
    ${place(value('referral_to'), 105, 235, 483)}
    ${place(value('referral_reason', '', ['referral_recommendation', 'referral_complaint']), 25, 289, 562, true)}
    ${place(value('referral_treatment_received', '', ['referral_treatment_plan', 'referral_treatment_notes']), 25, 367, 562, true)}
    ${place(value('referral_attachments', '', ['referral_notes']), 25, 473, 562, true)}
    ${place(day, 492, 615, 16)}${place(month, 527, 615, 16)}${place(year, 561, 615, 28)}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function collectPatientHospitalData(form) {
  const formData = new FormData(form);
  const submitted = Object.fromEntries(formData);
  submitted.family_status = formData.getAll('family_status');
  submitted.discharge_status = formData.getAll('discharge_status');
  submitted.document_type = 'hospital';
  return submitted;
}
function patientHospitalForm(record = null) {
  const patient = curPt() || {}, data = record ? jd(record) : {};
  const field = (label, key, type = 'text', fallback = '') => fIn(label, key, data[key] != null ? data[key] : fallback, type);
  const area = (label, key, rows = 4) => fTa(label, key, data[key] || '', rows);
  const checks = (key, options, selected = []) => options.map(([value, label]) => fCb(label, key, selected.includes(value), value)).join('');
  const today = ymd(new Date());
  const familyStatus = Array.isArray(data.family_status) ? data.family_status : [];
  const dischargeStatus = Array.isArray(data.discharge_status) ? data.discharge_status : [];
  const body = `<div class="patient-hospital-form">
    <div class="patient-hospital-grid patient-hospital-top">${field('ផ្នែក (Service)', 'service')}${field('បន្ទប់ (Room)', 'room')}${field('លេខគ្រែ (Bed)', 'bed')}${field('លេខចុះបញ្ជី (Registration N°)', 'registration_no')}</div>
    <section class="patient-hospital-section"><h4>អ្នកជំងឺ (Patient)</h4><div class="patient-hospital-grid">${field('មុខរបរ (Occupation)', 'occupation')}${field('ទីកន្លែងស្នាក់នៅ', 'address', 'text', patient.addr || '')}${field('ប្តី/ប្រពន្ធ (Spouse)', 'spouse')}${field('មុខរបរ (Occupation)', 'spouse_occupation')}${field('ឪពុក (Father)', 'father')}${field('ម្តាយ (Mother)', 'mother')}</div></section>
    <section class="patient-hospital-section"><h4>ស្ថានភាពគ្រួសារ</h4><div class="patient-hospital-status">${checks('family_status', [['single', 'នៅលីវ'], ['married', 'រៀបការ']], familyStatus)}<label class="patient-hospital-children">ចំនួនកូន <input class="in" type="number" min="0" name="children_count" value="${esc(data.children_count == null ? '' : data.children_count)}"></label>${checks('family_status', [['living_with_family', 'រស់បែកគ្នា'], ['widowed', 'មេម៉ាយ/ពោះម៉ាយ'], ['divorced', 'លែងលះ'], ['deceased', 'ស្លាប់']], familyStatus)}</div></section>
    <div class="patient-hospital-grid patient-hospital-grid-two">${field('អាសយដ្ឋាន', 'contact_address', 'text', patient.addr || '')}${field('លេខទូរស័ព្ទ', 'contact_phone', 'tel', patient.phone || '')}</div>
    <div class="patient-hospital-grid patient-hospital-vitals">${field('ទម្ងន់ (kg)', 'weight', 'number')}${field('កម្ពស់ (cm)', 'height', 'number')}${field('សម្ពាធឈាម', 'blood_pressure')}${field('ចង្វាក់បេះដូង', 'heart_rate', 'number')}${field('កម្ដៅ', 'temperature', 'number')}${field('ចង្វាក់ដង្ហើម', 'respiratory_rate', 'number')}${field('អុកស៊ីសែន (%)', 'oxygen_saturation', 'number')}</div>
    <div class="patient-hospital-grid patient-hospital-admission">${field('ថ្ងៃចូលសម្រាក', 'admission_date', 'date', today)}${field('ម៉ោង', 'admission_time', 'time')}${field('អ្នកពិនិត្យ', 'attending_physician')}${field('មូលហេតុចូលសម្រាក', 'admission_reason')}</div>
    <div class="patient-hospital-grid patient-hospital-grid-two">${area('រោគវិនិច្ឆ័យចូល', 'admission_diagnosis')}${area('រោគវិនិច្ឆ័យចេញ', 'treatment_notes')}</div>
    <div class="patient-hospital-grid patient-hospital-discharge">${field('ថ្ងៃចេញពីពេទ្យ', 'discharge_date', 'date')}${field('ម៉ោង', 'discharge_time', 'time')}${field('ចំនួនថ្ងៃសម្រាកពេទ្យ', 'days_in_hospital', 'number')}</div>
    <section class="patient-hospital-section patient-hospital-last"><h4>សេចក្តីសន្និដ្ឋាន</h4><div class="patient-hospital-status">${checks('discharge_status', [['recovered', 'អនុញ្ញាត'], ['family_request', 'តាមការស្នើសុំ'], ['transferred', 'បញ្ជូន'], ['deceased', 'ស្លាប់']], dischargeStatus)}</div></section>
  </div>`;
  const title = 'បន្ថែម ឯកសារសម្រាកពេទ្យ';
  const date = data.admission_date || (record?.date || '').slice(0, 10) || today;
  openForm(title, body, async (form) => {
    const submitted = { ...data, ...collectPatientHospitalData(form), patient_name: patient.name || '' };
    const payload = { patient_id: pdId, kind: 'documents', title, date: submitted.admission_date || date, notes: submitted.admission_diagnosis || '', data: submitted };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-hospital-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក',
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="close">បោះបង់</button><button type="button" class="btn p" data-a="patient-hospital-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
  $('#mf [name="service"]').focus();
}
function patientMedicalCardList() {
  const records = recs.filter((record) => record.kind == 'documents' && jd(record).document_type == 'medical-card');
  const body = records.length
    ? `<div class="patient-medical-card-list">${records.map((record) => {
      const data = jd(record);
      return `<article class="patient-medical-card-record"><div><b>${esc(data.medical_card_patient_name || curPt()?.name || '')}</b><span>${esc(data.medical_card_date || record.date || '')}</span></div><div class="patient-medical-card-record-actions"><button type="button" class="btn s" data-a="redit:${record.id}" title="${esc(T('Edit'))}" aria-label="${esc(T('Edit'))}">✎</button><button type="button" class="btn s" data-a="patient-medical-card-print:${record.id}" title="${esc(T('Print'))}" aria-label="${esc(T('Print'))}">${printerIcon()}</button></div></article>`;
    }).join('')}</div>`
    : '<p class="patient-medical-card-empty">មិនមានទិន្នន័យវិភាគទេ។</p>';
  openForm('ព្រឹត្តិប័ត្រវិភាគ', body, async () => {}, {
    cls: 'patient-medical-card-list-dialog',
    close: true,
    closeLabel: T('Close'),
    hideCancel: true,
    hideSubmit: true,
    extra: '<button type="button" class="btn p" data-a="patient-medical-card-new">＋ បង្កើតព្រឹត្តិប័ត្រវិភាគ</button>'
  });
}
function patientMedicalCardForm(record = null) {
  const patient = curPt() || {};
  const data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type, fallback = '') => fIn(label, key, data[key] != null ? data[key] : fallback, type);
  const area = (label, key, rows) => fTa(label, key, data[key] || '', rows);
  const body = `<div class="patient-medical-card-form">
    <div class="patient-medical-card-grid">${field('ឈ្មោះអ្នកជំងឺ', 'medical_card_patient_name', 'text', patient.name || '')}${field('ភេទ', 'medical_card_sex', 'text', patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '')}${field('អាយុ', 'medical_card_age', 'number', patient.age == null ? '' : String(patient.age))}${field('កាលបរិច្ឆេទ', 'medical_card_date', 'date', today)}</div>
    ${area('រោគវិនិច្ឆ័យ', 'medical_card_diagnosis', 3)}
    ${area('សំណូមពរ', 'medical_card_request', 3)}
    ${area('លទ្ធផល', 'medical_card_result', 5)}
  </div>`;
  const title = 'ព្រឹត្តិប័ត្រវិភាគ';
  openForm('បង្កើត ព្រឹត្តិប័ត្រវិភាគ', body, async (form) => {
    const submitted = { ...data, ...Object.fromEntries(new FormData(form)), document_type: 'medical-card' };
    const payload = {
      patient_id: pdId,
      kind: 'documents',
      title,
      date: submitted.medical_card_date || today,
      notes: submitted.medical_card_diagnosis || '',
      data: submitted
    };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
    patientMedicalCardList();
  }, {
    cls: 'patient-medical-card-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក',
    hideCancel: true,
    keepOpen: true,
    extra: `<button type="button" class="btn" data-a="close">បោះបង់</button><button type="button" class="btn p" data-a="patient-medical-card-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
}
function patientMedicalCardPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const mmX = (points) => (points * 210 / 595.5).toFixed(3);
  const mmY = (points) => (points * 297 / 842).toFixed(3);
  const place = (x, y, width, value, options = '') => value == null || value === ''
    ? ''
    : `<span class="medical-analysis-value${options ? ` ${options}` : ''}" style="left:${mmX(x)}mm;top:${mmY(y)}mm;width:${mmX(width)}mm">${esc(value)}</span>`;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.medical_card_date || date || ''));
  const printDate = dateParts
    ? [
      place(106.84, 551.74, 32.11, `${dateParts[3]}.`, 'date'),
      place(151.61, 551.74, 32.11, `${dateParts[2]}.`, 'date'),
      place(211, 551.74, 17.51, dateParts[1].slice(-2), 'date'),
      place(398.44, 551.74, 23.35, `${dateParts[3]}.`, 'date'),
      place(434.47, 551.74, 23.36, `${dateParts[2]}.`, 'date'),
      place(470.13, 551.74, 26.27, dateParts[1], 'date')
    ].join('')
    : '';
  const sex = data.medical_card_sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const age = data.medical_card_age || (patient.age == null ? '' : fmtAge(patient));
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .medical-analysis-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#000;font-family:"Leelawadee UI",Arial,sans-serif}
    .medical-analysis-template{position:absolute;inset:0;width:100%;height:100%}
    .medical-analysis-value{position:absolute;overflow:hidden;background:#fff;color:#111;font:10.5pt/4.2mm "Leelawadee UI",Arial,sans-serif;white-space:nowrap}
    .medical-analysis-value.line{height:4.2mm;border-bottom:.2mm dotted #111}
    .medical-analysis-value.spaced{box-sizing:border-box;padding-left:.9em}
    .medical-analysis-value.spaced-one{box-sizing:border-box;padding-left:.3em}
    .medical-analysis-value.date{height:3.3mm;font-family:Arial,sans-serif;line-height:3.3mm}
    .medical-analysis-value.area{height:auto;max-height:92mm;padding:1mm;background:transparent;font:10.5pt/1.5 "Leelawadee UI",Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
  </style><article class="medical-analysis-print"><img class="medical-analysis-template" src="/assets/medical-analysis-form-template-v2.png" alt="">
    ${place(82.53, 161.74, 95.93, data.medical_card_patient_name || patient.name, 'line spaced')}
    ${place(236.71, 161.74, 23.98, sex, 'spaced-one')}
    ${place(425.52, 161.74, 25, age)}
    ${place(75.92, 188.74, 239.35, data.medical_card_diagnosis, 'line')}
    ${place(29.5, 240, 257, data.medical_card_request, 'area')}
    ${place(293.5, 240, 271, data.medical_card_result, 'area')}
    ${printDate}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientPrescriptionNoteForm(record = null) {
  const patient = curPt() || {};
  const data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type = 'text', fallback = '') => `<label>${label}<input class="in" name="${key}" type="${type}" value="${esc(data[key] ?? fallback)}"></label>`;
  const area = (label, key, rows) => `<label>${label}<textarea class="in" name="${key}" rows="${rows}">${esc(data[key] || '')}</textarea></label>`;
  const patientSex = patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '';
  const formBody = `<div class="patient-prescription-note-form">
    <table class="patient-prescription-note-table"><tbody>
      <tr><th class="patient-prescription-note-heading-emphasis" colspan="2">ព័ត៌មានវេជ្ជបណ្ឌិត និងអ្នកជំងឺ / Doctor & Patient</th></tr>
      <tr><td>${field('ឈ្មោះវេជ្ជបណ្ឌិត / Doctor Name', 'rxnote_doctor_name', 'text', D.dr.find((doctor) => doctor.id == data.doctor_id)?.name || '')}</td><td>${field('ឈ្មោះអ្នកជំងឺ / Patient Name', 'rxnote_patient_name', 'text', patient.name || '')}</td></tr>
      <tr><td>${field('ភេទ / Sex', 'rxnote_sex', 'text', patientSex)}</td><td>${field('ថ្ងៃខែឆ្នាំកំណើត / Date of birth', 'rxnote_dob', 'date', patient.dob || '')}</td></tr>
      <tr><td>${field('អាយុ / Age', 'rxnote_age', 'text', patient.age == null ? '' : `${patient.age}${patient.age_unit == 'M' ? ' ខែ' : patient.age_unit == 'D' ? ' ថ្ងៃ' : ' ឆ្នាំ'}`)}</td><td>${field('កាលបរិច្ឆេទ / Date', 'rxnote_date', 'date', record?.date || today)}</td></tr>
      <tr><th class="patient-prescription-note-heading-emphasis" colspan="2">រោគវិនិច្ឆ័យ / Diagnostic</th></tr>
      <tr><td colspan="2">${area('រោគវិនិច្ឆ័យ', 'rxnote_diagnosis', 3)}</td></tr>
      <tr><th colspan="2">សេចក្តីសន្និដ្ឋាន / Conclusion</th></tr>
      <tr><td>${field('ចំនួនថ្ងៃសម្រាក / Need to rest (Days)', 'rxnote_rest_days', 'number')}</td><td><div class="patient-prescription-note-date-range">${field('ពី / From', 'rxnote_from_date', 'date')}${field('ដល់ / To', 'rxnote_to_date', 'date')}</div></td></tr>
      <tr><th colspan="2">មូលហេតុ / Reason</th></tr>
      <tr><td colspan="2">${area('មូលហេតុ', 'rxnote_reason', 3)}</td></tr>
      <tr><th colspan="2">ហត្ថលេខា / Signatures</th></tr>
      <tr><td>${field('ឈ្មោះ និងហត្ថលេខាអ្នកជំងឺ', 'rxnote_patient_signature', 'text', patient.name || '')}</td><td>${field('ឈ្មោះ និងហត្ថលេខាវេជ្ជបណ្ឌិត', 'rxnote_doctor_signature', 'text', D.dr.find((doctor) => doctor.id == data.doctor_id)?.name || '')}</td></tr>
      <tr><td>${field('កាលបរិច្ឆេទអ្នកជំងឺ', 'rxnote_patient_signature_date', 'date', today)}</td><td>${field('កាលបរិច្ឆេទវេជ្ជបណ្ឌិត', 'rxnote_doctor_signature_date', 'date', today)}</td></tr>
    </tbody></table>
  </div>`;
  openForm('កំណត់ហេតុហេជ្ជបញ្ចា', formBody, async (form) => {
    const submitted = { ...data, ...Object.fromEntries(new FormData(form)), document_type: 'prescription-note' };
    const payload = {
      patient_id: pdId,
      kind: 'documents',
      title: 'កំណត់ហេតុហេជ្ជបញ្ចា',
      date: submitted.rxnote_date || today,
      notes: submitted.rxnote_diagnosis || '',
      data: submitted
    };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-prescription-note-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក',
    hideCancel: true,
    keepOpen: true,
    extra: `<button type="button" class="btn" data-a="close">បោះបង់</button><button type="button" class="btn p" data-a="patient-prescription-note-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
}
function patientPrescriptionNotePrint(data) {
  const patient = curPt() || {};
  const mm = (points) => (points * 25.4 / 72).toFixed(3);
  const value = (x, y, width, height, text, cls = 'line') => text == null || text === ''
    ? ''
    : `<span class="patient-prescription-note-print-value ${cls}" style="left:${mm(x)}mm;top:${mm(y)}mm;width:${mm(width)}mm;height:${mm(height)}mm">${esc(String(text).replace(/\s+/g, ' ').trim())}</span>`;
  const date = (key) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data[key] || ''));
    return match ? `${match[3]} / ${match[2]} / ${match[1]}` : '';
  };
  const patientName = data.rxnote_patient_name || patient.name || '';
  const doctorName = data.rxnote_doctor_name || '';
  const html = `<style>
    @page{size:letter portrait;margin:0}
    @media print{
      html,body{width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:215.9mm!important;height:279.4mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:215.9mm!important;height:279.4mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .patient-prescription-note-print{position:relative;width:215.9mm;height:279.4mm;overflow:hidden;color:#111;font-family:"Leelawadee UI",Arial,sans-serif}
    .patient-prescription-note-template{position:absolute;inset:0;width:100%;height:100%}
    .patient-prescription-note-print-value{position:absolute;display:block;box-sizing:border-box;overflow:hidden;background:#fff;color:#111;font:11.26pt/1 "Leelawadee UI",Arial,sans-serif;white-space:nowrap}
    .patient-prescription-note-print-value.line{border-bottom:.2mm dotted #111}
    .patient-prescription-note-print-value.diagnosis{font-size:13.17pt}
    .patient-prescription-note-print-value.number{font-size:14.97pt;font-weight:700}
    .patient-prescription-note-print-value.date{font:14.97pt/1 "Leelawadee UI",Arial,sans-serif;font-weight:700;white-space:nowrap}
  </style><article class="patient-prescription-note-print"><img class="patient-prescription-note-template" src="/assets/medical-record-prescription-form-template.png" alt="">
    ${value(284, 280, 228, 18.5, doctorName)}
    ${value(232, 360, 139, 19, patientName)}
    ${value(415, 360, 97, 19, data.rxnote_sex)}
    ${value(250, 394, 137, 17, date('rxnote_dob'), 'date line')}
    ${value(462, 393, 43, 18, data.rxnote_age, 'diagnosis line')}
    ${value(137, 452, 383, 19, data.rxnote_diagnosis, 'diagnosis line')}
    ${value(312, 516, 29, 19, data.rxnote_rest_days, 'number')}
    ${value(189, 526, 143, 18, date('rxnote_from_date'), 'date line')}
    ${value(361, 526, 158, 18, date('rxnote_to_date'), 'date line')}
    ${value(166, 575, 364, 21, data.rxnote_reason, 'line')}
    ${value(94, 663, 217, 17, data.rxnote_patient_signature || patientName, 'line')}
    ${value(364, 663, 130, 17, data.rxnote_doctor_signature || doctorName, 'line')}
    ${value(102, 690, 122, 18, date('rxnote_patient_signature_date'), 'date line')}
    ${value(374, 690, 121, 18, date('rxnote_doctor_signature_date'), 'date line')}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientHealthForm(record = null) {
  const patient = curPt() || {};
  const data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type = 'text', fallback = '') => fIn(label, key, data[key] != null ? data[key] : fallback, type);
  const area = (label, key, rows = 4) => fTa(label, key, data[key] || '', rows);
  const body = `<div class="patient-health-form">
    <fieldset class="patient-health-fieldset"><legend>ព័ត៌មានអ្នកជំងឺ</legend><div class="patient-health-grid patient-health-patient">
      ${field('ឈ្មោះអ្នកជំងឺ', 'health_patient_name', 'text', patient.name || '')}
      ${field('ទូរស័ព្ទ', 'health_patient_phone', 'tel', patient.phone || '')}
      ${field('ភេទ', 'health_patient_sex', 'text', patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '')}
      ${field('អាយុ', 'health_patient_age', 'number', patient.age == null ? '' : String(patient.age))}
      ${field('សញ្ជាតិ', 'health_nationality', 'text', patient.khmer ? 'ខ្មែរ' : '')}
    </div></fieldset>
    <fieldset class="patient-health-fieldset"><legend>អាសយដ្ឋាន</legend><div class="patient-health-grid patient-health-address">
      ${field('ផ្ទះ', 'health_house')}
      ${field('ភូមិ', 'health_village')}
      ${field('ឃុំ/សង្កាត់', 'health_commune')}
      ${field('ផ្លូវ', 'health_street')}
      ${field('ស្រុក/ខណ្ឌ', 'health_district')}
      ${field('ខេត្ត/រាជធានី', 'health_province')}
    </div></fieldset>
    <fieldset class="patient-health-fieldset"><legend>ព័ត៌មានអំពីជំងឺ</legend><div class="patient-health-sections">
      ${area('មូលហេតុចូលពេទ្យ', 'health_reason')}
      ${area('ការព្យាបាល និងតេស្តបឋម', 'health_treatment')}
      ${area('រោគវិនិច្ឆ័យ', 'health_diagnosis')}
      ${area('សេចក្តីណែនាំរបស់វេជ្ជបណ្ឌិត', 'health_advice')}
    </div></fieldset>
    <fieldset class="patient-health-fieldset"><legend>ព័ត៌មានគ្រូពេទ្យ</legend><div class="patient-health-grid patient-health-doctor">
      ${field('ឈ្មោះគ្រូពេទ្យ', 'health_doctor_name')}
      ${field('កាលបរិច្ឆេទ', 'health_date', 'date', today)}
    </div></fieldset>
  </div>`;
  const title = 'លិខិតណែនាំការព្យាបាលបន្ត';
  openForm(title, body, async (form) => {
    const submitted = { ...data, ...Object.fromEntries(new FormData(form)), document_type: 'health' };
    const payload = {
      patient_id: pdId,
      kind: 'documents',
      title,
      date: submitted.health_date || today,
      notes: submitted.health_diagnosis || '',
      data: submitted
    };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-health-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក និង បិទ',
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="close">បោះបង់</button><button type="button" class="btn p" data-a="patient-health-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
}
function patientHealthPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const mmX = (points) => (points * 210 / 594.96).toFixed(3);
  const mmY = (points) => (points * 297 / 841.92).toFixed(3);
  const value = (x, y, text, type = '') => text == null || text === ''
    ? ''
    : `<span class="ongoing-care-print-value${type ? ` ${type}` : ''}" style="left:${mmX(x)}mm;top:${mmY(y)}mm">${esc(text)}</span>`;
  const printDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.health_date || date || ''));
  const dateValues = printDate
    ? [
      value(413.6, 624.67, printDate[3], 'date'),
      value(452.72, 624.67, printDate[2], 'date'),
      value(491.46, 624.67, printDate[1], 'date')
    ].join('')
    : '';
  const sex = data.health_patient_sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const age = data.health_patient_age || (patient.age == null ? '' : String(patient.age));
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .ongoing-care-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#111;font-family:"Leelawadee UI",Arial,sans-serif}
    .ongoing-care-print-template{position:absolute;inset:0;width:100%;height:100%}
    .ongoing-care-print-value{position:absolute;z-index:1;max-width:90mm;padding:0 .35mm;background:#fff;color:#111;font:10.5pt/4.15mm "Leelawadee UI",Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
    .ongoing-care-print-value.area{max-width:150mm;background:transparent;line-height:5.2mm;text-shadow:-.5px 0 #fff,.5px 0 #fff,0 -.5px #fff,0 .5px #fff}
    .ongoing-care-print-value.date{font-family:Arial,sans-serif;line-height:4.15mm}
  </style><article class="ongoing-care-print"><img class="ongoing-care-print-template" src="/assets/ongoing-care-form-template.png" alt="">
    ${value(154.65, 180.67, data.health_patient_name || patient.name)}
    ${value(314.73, 180.67, sex)}
    ${value(373.23, 180.67, age)}
    ${value(458.1, 180.67, data.health_nationality || (patient.khmer ? 'ខ្មែរ' : ''))}
    ${value(140.81, 210.67, data.health_house)}
    ${value(187.54, 210.67, data.health_street)}
    ${value(278.3, 210.67, data.health_village)}
    ${value(385.93, 210.67, data.health_commune)}
    ${value(114.19, 240.67, data.health_district)}
    ${value(253.71, 240.67, data.health_province)}
    ${value(151.66, 270.67, data.health_reason)}
    ${value(190.31, 300.67, data.health_treatment)}
    ${value(122, 371.49, data.health_diagnosis, 'area')}
    ${value(66.75, 484, data.health_advice, 'area')}
    ${dateValues}
    ${value(381.57, 740, data.health_doctor_name)}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientBirthForm(record = null) {
  const data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type = 'text', fallback = '') => fIn(label, key, data[key] != null ? data[key] : fallback, type);
  const parentFields = (parent) => `
    <div class="patient-birth-grid patient-birth-parent">
      ${field('ឈ្មោះ:', `birth_${parent}_name`)}
      ${field('អាយុ', `birth_${parent}_age`, 'number')}
      ${field('សញ្ជាតិ', `birth_${parent}_nationality`, 'text', 'ខ្មែរ')}
      ${field('មុខរបរ', `birth_${parent}_occupation`)}
      ${field('ភូមិ', `birth_${parent}_village`)}
      ${field('ឃុំ/សង្កាត់', `birth_${parent}_commune`)}
      ${field('ស្រុក/ខណ្ឌ', `birth_${parent}_district`)}
    </div>`;
  const body = `<div class="patient-birth-form">
    <fieldset class="patient-birth-fieldset"><legend>កំណត់ហេតុ</legend><div class="patient-birth-grid patient-birth-meta">
      ${field('លេខលិខិត', 'birth_certificate_number')}
      ${field('កាលបរិច្ឆេទចេញលិខិត', 'birth_issued_date', 'date', today)}
    </div></fieldset>
    <fieldset class="patient-birth-fieldset"><legend>កំណត់ហេតុម្តាយ</legend>${parentFields('mother')}</fieldset>
    <fieldset class="patient-birth-fieldset"><legend>កំណត់ហេតុឪពុក</legend>${parentFields('father')}</fieldset>
    <fieldset class="patient-birth-fieldset"><legend>កំណត់ហេតុទារក</legend><div class="patient-birth-grid patient-birth-child">
      ${field('បានសម្រាលកូនចំនួន', 'birth_child_condition')}
      ${field('សម្រាលលើកទី', 'birth_child_order')}
      ${field('ភេទ', 'birth_child_sex')}
      ${field('ទម្ងន់ (ក្រាម)', 'birth_child_weight_grams', 'number')}
      ${field('ពេលវេលា', 'birth_time', 'time')}
      ${field('ថ្ងៃខែឆ្នាំកំណើត', 'birth_date', 'date', today)}
      ${field('ទីកន្លែងកើត', 'birth_place')}
      ${field('ដាក់ឈ្មោះ', 'birth_child_name')}
    </div></fieldset>
  </div>`;
  const title = 'លិខិតបញ្ជាក់កំណើត';
  openForm(title, body, async (form) => {
    const submitted = { ...data, ...Object.fromEntries(new FormData(form)), document_type: 'birth' };
    const payload = {
      patient_id: pdId,
      kind: 'documents',
      title,
      date: submitted.birth_issued_date || today,
      notes: submitted.birth_child_name || submitted.birth_date || '',
      data: submitted
    };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-birth-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក និង បិទ',
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="close">ចាកចេញ</button><button type="button" class="btn p" data-a="patient-birth-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
}
function patientMedicalRestAForm(record = null) {
  const patient = curPt() || {};
  const data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type = 'text', fallback = '') => fIn(label, key, data[key] != null ? data[key] : fallback, type);
  const body = `<div class="patient-medical-rest-a-form">
    <div class="patient-medical-rest-a-column">
      <div class="patient-medical-rest-a-department">${field('Doctor Department', 'rest_a_doctor_department')}<label class="cb"><input type="checkbox" name="rest_a_gyneco" value="1" ${data.rest_a_gyneco ? 'checked' : ''}> Gyneco</label></div>
      <div class="patient-medical-rest-a-patient">
        ${field('Patient Name', 'rest_a_patient_name', 'text', patient.name || '')}
        ${field('Age', 'rest_a_age', 'text', patient.age == null ? '' : patient.age)}
        ${field('Gender', 'rest_a_gender', 'text', patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '')}
      </div>
      <div class="patient-medical-rest-a-pair">${field('Nationality', 'rest_a_nationality', 'text', 'ខ្មែរ')}${field('Phone', 'rest_a_phone', 'tel', patient.phone || '')}</div>
      <div class="patient-medical-rest-a-pair">${field('Occupation', 'rest_a_occupation')}${field('Organization/Unit', 'rest_a_organization')}</div>
      <div class="patient-medical-rest-a-pair">${field('Father Name', 'rest_a_father_name')}${field('Father Occupation', 'rest_a_father_occupation')}</div>
      <div class="patient-medical-rest-a-pair">${field('Mother Name', 'rest_a_mother_name')}${field('Mother Occupation', 'rest_a_mother_occupation')}</div>
    </div>
    <div class="patient-medical-rest-a-column">
      <h4 class="patient-medical-rest-a-address-title">Address</h4>
      <div class="patient-medical-rest-a-address-three">${field('House No', 'rest_a_house_no')}${field('Street', 'rest_a_street')}${field('Group', 'rest_a_group')}</div>
      <div class="patient-medical-rest-a-address-two">${field('Village', 'rest_a_village')}${field('Commune', 'rest_a_commune')}</div>
      <div class="patient-medical-rest-a-address-two">${field('District', 'rest_a_district')}${field('Province', 'rest_a_province')}</div>
      ${field('Diagnosis', 'rest_a_diagnosis')}
      ${field('Referred From', 'rest_a_referred_from')}
      ${field('Admission Date', 'rest_a_admission_date', 'date', today)}
    </div>
  </div>`;
  const title = 'Medical Rest Certificate Template A (Admission Form)';
  openForm(title, body, async (form) => {
    const formData = new FormData(form);
    const submitted = { ...data, ...Object.fromEntries(formData), rest_a_gyneco: formData.get('rest_a_gyneco') || '', document_type: 'medical-rest-a' };
    const payload = {
      patient_id: pdId,
      kind: 'documents',
      title,
      date: submitted.rest_a_admission_date || today,
      notes: submitted.rest_a_diagnosis || '',
      data: submitted
    };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-medical-rest-a-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'Save',
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="close">Cancel</button><button type="button" class="btn p" data-a="patient-medical-rest-a-print-draft">${printerIcon()} Print</button>`
  });
}
function patientMedicalRestAPrint(data) {
  const patient = curPt() || {};
  const mmX = (points) => (points * 210 / 594.96).toFixed(3);
  const mmY = (points) => (points * 297 / 841.92).toFixed(3);
  const place = (x, y, width, value) => value == null || value === ''
    ? ''
    : `<span class="medical-rest-a-print-value" style="left:${mmX(x)}mm;top:${mmY(y)}mm;width:${mmX(width)}mm">${esc(value)}</span>`;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.rest_a_admission_date || ''));
  const addressStreetGroup = [data.rest_a_street, data.rest_a_group].filter(Boolean).join(' / ');
  const checkmark = data.rest_a_gyneco
    ? `<span class="medical-rest-a-print-check" style="left:${mmX(504.5)}mm;top:${mmY(189.5)}mm">✓</span>`
    : '';
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .medical-rest-a-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#111;font-family:"Leelawadee UI",Arial,sans-serif}
    .medical-rest-a-print-template{position:absolute;inset:0;width:100%;height:100%}
    .medical-rest-a-print-value{position:absolute;z-index:1;box-sizing:border-box;overflow:hidden;padding:0 .2mm;color:#111;font:8.5pt/4mm "Leelawadee UI",Arial,sans-serif;white-space:nowrap;text-shadow:-.5px 0 #fff,.5px 0 #fff,0 -.5px #fff,0 .5px #fff}
    .medical-rest-a-print-check{position:absolute;z-index:1;display:flex;width:${mmX(16)}mm;height:${mmY(16)}mm;align-items:center;justify-content:center;color:#111;font:700 9pt/1 Arial,sans-serif}
  </style><article class="medical-rest-a-print"><img class="medical-rest-a-print-template" src="/assets/medical-rest-a-form-template.png" alt="">
    ${place(160, 185, 222, data.rest_a_doctor_department)}
    ${checkmark}
    ${place(188, 247, 210, data.rest_a_patient_name || patient.name)}
    ${place(435, 247, 24, data.rest_a_gender)}
    ${place(502, 248, 20, data.rest_a_age)}
    ${place(165, 283, 143, data.rest_a_nationality)}
    ${place(408, 283, 132, data.rest_a_phone)}
    ${place(96, 320, 216, data.rest_a_occupation)}
    ${place(374, 320, 166, data.rest_a_organization)}
    ${place(197, 357, 47, data.rest_a_house_no)}
    ${place(296, 357, 72, addressStreetGroup)}
    ${place(395, 357, 96, data.rest_a_village)}
    ${place(56, 389, 480, data.rest_a_commune)}
    ${place(106, 416, 218, data.rest_a_district)}
    ${place(378, 416, 162, data.rest_a_province)}
    ${place(114, 453, 426, data.rest_a_diagnosis)}
    ${place(136, 490, 404, data.rest_a_referred_from)}
    ${dateParts ? place(192, 532, 20, dateParts[3]) + place(251, 532, 20, dateParts[2]) + place(306, 532, 36, dateParts[1]) : ''}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientBirthPrint(data) {
  const mmX = (points) => (points * 210 / 594.96).toFixed(3);
  const mmY = (points) => (points * 297 / 841.92).toFixed(3);
  const place = (x, y, width, text, type = '') => text == null || text === ''
    ? ''
    : `<span class="birth-certificate-print-value${type ? ` ${type}` : ''}" style="left:${mmX(x)}mm;top:${mmY(y)}mm;width:${mmX(width)}mm">${esc(text)}</span>`;
  const dateParts = (value) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  const birthDate = dateParts(data.birth_date);
  const issuedDate = dateParts(data.birth_issued_date);
  const timeParts = /^(\d{2}):(\d{2})$/.exec(String(data.birth_time || ''));
  const childName = String(data.birth_child_name || data.birth_attendant || '').trim();
  const nameGraphemes = typeof Intl.Segmenter == 'function'
    ? Array.from(new Intl.Segmenter('km', { granularity: 'grapheme' }).segment(childName), (part) => part.segment)
    : Array.from(childName);
  const firstNameLine = nameGraphemes.slice(0, 12).join('');
  const secondNameLine = nameGraphemes.slice(12).join('');
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .birth-certificate-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#111;font-family:"Leelawadee UI",Arial,sans-serif}
    .birth-certificate-print-template{position:absolute;inset:0;width:100%;height:100%}
    .birth-certificate-print-value{position:absolute;z-index:1;box-sizing:border-box;overflow:hidden;padding:0 .2mm;color:#111;font:10.5pt/4.05mm "Leelawadee UI",Arial,sans-serif;white-space:nowrap;text-shadow:-.5px 0 #fff,.5px 0 #fff,0 -.5px #fff,0 .5px #fff}
    .birth-certificate-print-value.area{height:auto;max-height:10mm;white-space:normal;overflow-wrap:anywhere;line-height:4.5mm}
    .birth-certificate-print-value.number{font-family:Arial,sans-serif}
  </style><article class="birth-certificate-print"><img class="birth-certificate-print-template" src="/assets/birth-certificate-form-template.png" alt="">
    ${place(128.2, 126.3, 70.1, data.birth_certificate_number, 'number')}
    ${place(113.26, 261.64, 192.82, data.birth_mother_name)}
    ${place(335.3, 261.64, 14.02, 'ស្រី')}
    ${place(387.94, 261.64, 53.38, data.birth_mother_age, 'number')}
    ${place(502.9, 261.64, 20.01, data.birth_mother_occupation)}
    ${place(212.64, 318.64, 66.72, data.birth_mother_house)}
    ${place(329.7, 318.64, 80.06, data.birth_mother_village)}
    ${place(498.55, 318.64, 26.69, data.birth_mother_commune)}
    ${place(200.26, 342.64, 73.39, data.birth_mother_district)}
    ${place(120.97, 375.64, 200.16, data.birth_mother_province)}
    ${place(124.23, 408.64, 66.72, data.birth_mother_nationality || 'ខ្មែរ')}
    ${place(295.24, 408.64, 133.44, data.birth_father_name)}
    ${place(489.08, 408.64, 40.03, data.birth_father_nationality || 'ខ្មែរ')}
    ${place(175.49, 432.64, 53.38, data.birth_father_age, 'number')}
    ${place(329.99, 432.64, 73.39, data.birth_father_occupation)}
    ${place(212.64, 465.64, 66.72, data.birth_father_house)}
    ${place(338.91, 465.64, 73.39, data.birth_father_village)}
    ${place(503.4, 465.64, 20.02, data.birth_father_commune)}
    ${place(203.54, 489.64, 80.07, data.birth_father_district)}
    ${place(120.97, 522.64, 200.16, data.birth_father_province)}
    ${place(225.43, 555.64, 20.02, data.birth_child_condition, 'number')}
    ${place(315.61, 555.64, 53.38, data.birth_child_order, 'number')}
    ${place(409.25, 555.64, 46.71, data.birth_child_sex)}
    ${place(490.93, 555.64, 36.71, data.birth_child_weight_grams, 'number')}
    ${timeParts ? place(143.4, 612.64, 66.73, timeParts[1], 'number') : ''}
    ${timeParts ? place(239.6, 612.64, 53.4, timeParts[2], 'number') : ''}
    ${birthDate ? place(338.8, 612.64, 66.74, birthDate[3], 'number') : ''}
    ${birthDate ? place(426, 612.64, 60.05, birthDate[2], 'number') : ''}
    ${birthDate ? place(90.15, 636.64, 73.04, birthDate[1], 'number') : ''}
    ${birthDate ? place(225.06, 634.55, 34.28, String(Number(birthDate[1]) + 543), 'number') : ''}
    ${issuedDate ? place(129.52, 669.64, 53.38, issuedDate[3], 'number') : ''}
    ${issuedDate ? place(203.37, 669.64, 53.38, issuedDate[2], 'number') : ''}
    ${issuedDate ? place(297.26, 669.64, 73.03, issuedDate[1], 'number') : ''}
    ${place(423.91, 669.64, 100.08, firstNameLine)}
    ${place(66.75, 693.64, 96.74, secondNameLine)}
    ${issuedDate ? place(430.9, 741.64, 20.02, issuedDate[3], 'number') : ''}
    ${issuedDate ? place(465.4, 741.64, 20.02, issuedDate[2], 'number') : ''}
    ${issuedDate ? place(499.5, 741.64, 30.03, issuedDate[1], 'number') : ''}
  </article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientHospitalPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const mmX = (points) => (points * 210 / 595).toFixed(3);
  const mmY = (points) => (points * 297 / 842).toFixed(3);
  const place = (x, y, width, value) => `<span class="hospitalization-print-value" style="left:${mmX(x)}mm;top:${mmY(y)}mm;width:${mmX(width)}mm">${esc(value == null ? '' : value)}</span>`;
  const mark = (x, y, checked) => checked ? `<span class="hospitalization-print-check" style="left:${mmX(x)}mm;top:${mmY(y)}mm">✓</span>` : '';
  const family = Array.isArray(data.family_status) ? data.family_status : [];
  const discharge = Array.isArray(data.discharge_status) ? data.discharge_status : [];
  const sex = data.sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const age = data.age || (patient.age != null ? fmtAge(patient) : '');
  const values = [
    place(124.56, 171.85, 200, data.service),
    place(124.98, 189.85, 100, data.room),
    place(357.93, 189.85, 100, data.bed),
    place(168.30, 207.10, 87, data.registration_no),
    place(409.92, 207.10, 103, patient.id),
    place(122.77, 248.35, 95, data.patient_name || patient.name),
    place(265.46, 248.35, 25, sex),
    place(422.20, 248.35, 33, age),
    place(152.44, 266.35, 200, data.occupation),
    place(163.28, 283.60, 50, data.address),
    place(153.30, 301.60, 88, data.spouse),
    place(383.81, 301.60, 88, data.spouse_occupation),
    place(126.01, 318.85, 100, data.father),
    place(357.08, 318.85, 100, data.mother),
    place(188, 361.88, 24, data.children_count),
    place(147.46, 378.10, 25, data.contact_address),
    place(236.36, 392.35, 175, data.contact_phone),
    place(94.01, 410.35, 10, data.weight),
    place(161.57, 410.35, 10, data.height),
    place(252.20, 410.35, 42, data.blood_pressure),
    place(385.46, 410.35, 10, data.respiratory_rate),
    place(93.02, 424.60, 10, data.temperature),
    place(174.22, 424.60, 10, data.heart_rate),
    place(309.48, 424.60, 13, data.oxygen_saturation),
    place(168.21, 442.60, 38, data.admission_date || data.contract_date || date),
    place(350.72, 442.60, 38, data.admission_time),
    place(182.57, 456.85, 75, data.attending_physician),
    place(344.65, 471.85, 125, data.admission_reason),
    place(220.61, 486.10, 200, data.admission_diagnosis),
    place(213.41, 501.10, 200, data.treatment_notes),
    place(114.28, 530.35, 25, data.discharge_date),
    place(273.59, 515.35, 25, data.discharge_time),
    place(457.79, 530.35, 25, data.days_in_hospital)
  ].join('');
  const checkmarks = [
    mark(67.12, 361.88, family.includes('single')),
    mark(109.88, 361.88, family.includes('married')),
    mark(220.88, 361.88, family.includes('living_with_family')),
    mark(278.62, 361.88, family.includes('widowed')),
    mark(365.62, 361.88, family.includes('divorced')),
    mark(414.38, 361.88, family.includes('deceased')),
    mark(116.62, 549.38, discharge.includes('recovered')),
    mark(169.12, 549.38, discharge.includes('family_request')),
    mark(252.38, 549.38, discharge.includes('transferred')),
    mark(293.62, 549.38, discharge.includes('deceased'))
  ].join('');
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .hospitalization-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#000;font-family:"Noto Sans Khmer",system-ui,sans-serif}
    .hospitalization-print-template{position:absolute;inset:0;width:100%;height:100%}
    .hospitalization-print-value{position:absolute;height:3.56mm;overflow:hidden;border-bottom:.2mm dotted #222;background:#fff;color:#111;font-size:8pt;line-height:3.56mm;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hospitalization-print-check{position:absolute;display:flex;width:2.92mm;height:2.92mm;align-items:center;justify-content:center;color:#111;font:700 8pt/1 Arial,sans-serif}
  </style><article class="hospitalization-print"><img class="hospitalization-print-template" src="/assets/hospitalization-form-template.png" alt="">${values}${checkmarks}</article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientTreatmentForm(record = null) {
  const patient = curPt() || {}, data = record ? jd(record) : {};
  const today = ymd(new Date());
  const field = (label, key, type = 'text', fallback = '', placeholder = '') => `<label class="fl">${label}<input class="in" type="${type}" name="${key}" value="${esc(data[key] != null ? data[key] : fallback)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}></label>`;
  const area = (label, key, rows = 3, fallback = '') => `<label class="fl patient-treatment-full">${label}<textarea class="in" name="${key}" rows="${rows}">${esc(data[key] != null ? data[key] : fallback)}</textarea></label>`;
  const patientSex = data.treatment_patient_sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const patientAge = data.treatment_patient_age != null ? data.treatment_patient_age : patient.age != null ? String(patient.age) : '';
  const body = `<div class="patient-treatment-form">
    <fieldset class="patient-treatment-fieldset"><legend>ព័ត៌មានលិខិត</legend><div class="patient-treatment-grid">${field('លេខ', 'treatment_letter_number')}${field('ថ្ងៃចេញលិខិត', 'treatment_letter_date', 'date', today)}</div></fieldset>
    <fieldset class="patient-treatment-fieldset"><legend>ព័ត៌មានអ្នកជំងឺ</legend><div class="patient-treatment-grid patient-treatment-patient">${field('អ្នកជំងឺឈ្មោះ', 'treatment_patient_name', 'text', patient.name || '')}${field('ភេទ', 'treatment_patient_sex', 'text', patientSex)}${field('អាយុ', 'treatment_patient_age', 'number', patientAge)}${field('ជនជាតិ', 'treatment_nationality', 'text', patient.khmer ? 'ខ្មែរ' : '')}${field('អាសយដ្ឋាន', 'treatment_address', 'text', patient.addr || '')}${field('បច្ចុប្បន្នធ្វើការនៅ', 'treatment_referred_from')}</div></fieldset>
    <fieldset class="patient-treatment-fieldset"><legend>ព័ត៌មានសម្រាកពេទ្យ</legend><div class="patient-treatment-grid">${field('ចូលមន្ទីរពេទ្យ ថ្ងៃ', 'treatment_admission_date', 'date', today)}${field('ម៉ោងចូល', 'treatment_admission_time', 'time')}${field('ចេញពីមន្ទីរពេទ្យ ថ្ងៃ', 'treatment_discharge_date', 'date', today)}${field('ម៉ោងចេញ', 'treatment_discharge_time', 'time')}${area('រោគវិនិច្ឆ័យ', 'treatment_diagnosis', 3)}</div></fieldset>
    <fieldset class="patient-treatment-fieldset"><legend>ការអនុញ្ញាតិ និង ដំបូន្មាន</legend><div class="patient-treatment-grid">${area('ដំបូន្មានពេទ្យ', 'treatment_advice', 3, 'សូមអនុវត្តតាមការណែនាំរបស់គ្រូពេទ្យ និងត្រឡប់មកពិនិត្យតាមការណាត់ជួប។')}${field('អនុញ្ញាតឲ្យសម្រាកចំនួនថ្ងៃ', 'treatment_leave_days', 'number', '01')}${field('កាលបរិច្ឆេទចាប់ផ្តើម', 'treatment_leave_start', 'date', today)}${field('ដល់ថ្ងៃ', 'treatment_leave_end', 'date', today)}</div></fieldset>
    <fieldset class="patient-treatment-fieldset patient-treatment-signatures"><legend>អ្នកទទួលខុសត្រូវ</legend><div class="patient-treatment-grid">${field('ប្រធានមន្ទីរសម្រាកព្យាបាល', 'treatment_hospital_director', 'text', '', 'លេខ:ប្រធាន')}${field('គ្រូពេទ្យព្យាបាល', 'treatment_attending_physician', 'text', '', 'លេខ:គ្រូពេទ្យ')}</div></fieldset>
  </div>`;
  const title = 'លិខិតអនុញ្ញាតិចេញពីមន្ទីរសម្រាកព្យាបាល';
  const letterDate = data.treatment_letter_date || (record?.date || '').slice(0, 10) || today;
  openForm(title, body, async (form) => {
    const submitted = { ...data, ...Object.fromEntries(new FormData(form)), document_type: 'treatment' };
    const payload = { patient_id: pdId, kind: 'documents', title, date: submitted.treatment_letter_date || letterDate, notes: submitted.treatment_diagnosis || '', data: submitted };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-treatment-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក និង បិទ',
    hideCancel: true,
    extra: `<button type="button" class="btn" data-a="close">បោះបង់</button><button type="button" class="btn p" data-a="patient-treatment-print-draft">${printerIcon()} បោះពុម្ព</button>`
  });
}
function patientTreatmentPrint(data, date = ymd(new Date())) {
  const patient = curPt() || {};
  const patientSex = data.treatment_patient_sex || (patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '');
  const patientAge = data.treatment_patient_age != null ? data.treatment_patient_age : patient.age != null ? String(patient.age) : '';
  const mmX = (points) => (points * 210 / 595).toFixed(3);
  const mmY = (points) => (points * 297 / 842).toFixed(3);
  const place = (x, y, width, value, plain = false, small = false) => {
    if (value == null || value === '') return '';
    const text = String(value);
    const plainText = plain || /^[\x20-\x7E]*$/.test(text);
    return `<span class="treatment-discharge-value${plainText ? ' plain' : ''}${small ? ' small' : ''}" style="left:${mmX(x)}mm;top:${mmY(y)}mm;width:${mmX(width)}mm">${esc(text)}</span>`;
  };
  const dateParts = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? { day: match[3], month: match[2], year: match[1] } : null;
  };
  const dateValues = (value, y, dayX, monthX, yearX) => {
    const parts = dateParts(value);
    if (!parts) return '';
    return [
      place(dayX, y, 25, `${parts.day}.`, true),
      place(monthX, y, 25, `${parts.month}.`, true),
      place(yearX, y, 31, `${parts.year}.`, true)
    ].join('');
  };
  const timeValues = (value, y, hourX, minuteX) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return '';
    return place(hourX, y, 25, `${match[1]}.`, true) + place(minuteX, y, 25, `${match[2]}.`, true);
  };
  const values = [
    place(91.89, 177.85, 39, data.treatment_letter_number, true),
    place(84.35, 229.67, 91, data.treatment_patient_name || patient.name),
    place(204.06, 228, 17, patientSex),
    place(244.98, 229.67, 33, patientAge, true),
    place(335.3, 228, 29, data.treatment_nationality || (patient.khmer ? 'ខ្មែរ' : '')),
    place(82.13, 254.42, 141, data.treatment_address || patient.addr),
    place(106.75, 278.42, 147, data.treatment_referred_from),
    place(78.21, 351.92, 174, data.treatment_diagnosis),
    place(123.18, 398.6, 447, data.treatment_advice),
    place(208.87, 425.42, 30, data.treatment_leave_days, true),
    dateValues(data.treatment_admission_date, 303, 143.8, 180.57, 216.99),
    timeValues(data.treatment_admission_time, 303, 294.95, 336.37),
    dateValues(data.treatment_discharge_date, 327, 147.37, 184.13, 220.55),
    timeValues(data.treatment_discharge_time, 327, 298.52, 339.93),
    dateValues(data.treatment_leave_start, 452.4, 459.19, 495.96, 532.37),
    dateValues(data.treatment_leave_end, 477.2, 459.19, 495.96, 532.37),
    dateValues(data.treatment_letter_date || date, 501.9, 459.19, 495.96, 532.37),
    place(112, 554, 100, data.treatment_hospital_director),
    place(407.77, 601, 100, data.treatment_attending_physician)
  ].join('');
  const html = `<style>
    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
      #pa{display:block!important;width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important}
      #pa .print-document,#pa .print-document-content{display:block!important;width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    }
    .treatment-discharge-print{position:relative;width:210mm;height:297mm;overflow:hidden;color:#000;font-family:"Noto Sans Khmer",system-ui,sans-serif}
    .treatment-discharge-template{position:absolute;inset:0;width:100%;height:100%}
    .treatment-discharge-value{position:absolute;height:3.56mm;overflow:hidden;border-bottom:.2mm dotted #222;background:#fff;color:#111;font:9.75pt/3.56mm "Leelawadee UI",Arial,sans-serif;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .treatment-discharge-value.plain{border:0;background:transparent;font-family:Arial,sans-serif}
  </style><article class="treatment-discharge-print"><img class="treatment-discharge-template" src="/assets/treatment-discharge-form-template-v2.png" alt="">${values}</article>`;
  printDoc('', html, { omitClinicBranding: true });
}
function patientDocumentUploadForm() {
  const selectedType = PATIENT_DOCUMENT_TYPES.find(([key]) => key == documentTypeKey);
  const title = selectedType ? selectedType[1] : '';
  openForm(T('Upload Document'), `<div class="g2">${fIn(T('Document name'), 'title', title, 'text', 'required')}${fIn(T('Date'), 'date', ymd(new Date()), 'date')}</div>${fTa(T('Notes'), 'notes', '', 3)}${imgField(T('Document image'), 'image', '', T('Remove picture'))}`, async (form) => {
    const data = new FormData(form), image = data.get('image');
    if (!image) throw new Error(T('Select a document image'));
    await api('POST', 'records', { patient_id: pdId, kind: 'documents', title: data.get('title'), date: data.get('date'), notes: data.get('notes'), image, data: selectedType ? { document_type: selectedType[0] } : {} });
    await loadRecs();
    render();
    toast(T('Saved'));
  }, { cls: 'wide lab-upload-form', ok: T('Save') });
  $('#mf [name="title"]').required = true;
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
  const technician = records.map((record) => jd(record).lab_technician).find(Boolean) || '';
  printDoc(T('Lab results'), ptBlock(curPt()) + `<table class="pk full"><thead><tr>${['Date', 'Test', 'Result', 'Notes'].map((label) => `<th>${esc(T(label))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="4">${esc(T('Nothing here yet.'))}</td></tr>`}</tbody></table>${labPrintSignature(technician)}`);
}
function labPrintSignature(technician) {
  return `<footer class="lab-report-signature"><div>Technical Laboratory</div><span aria-hidden="true"></span><small>${esc(technician || '....................')}</small></footer>`;
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
  return `<section class="lab-workspace"><header class="lab-workspace-header"><h2 class="rh">${T('Lab results')}</h2><div class="lab-workspace-actions"><button type="button" class="btn lab-upload-button" data-a="labupload"><span aria-hidden="true">↥</span>${T('Upload Document')}</button><button type="button" class="btn" data-a="labhistory"><span aria-hidden="true">◴</span>${T('History')}</button><button type="button" class="btn" data-a="labprint">${printerIcon()}${T('Print')}</button><button type="button" class="btn p" data-a="radd"><span aria-hidden="true">＋</span>${T('Add Lab Result')}</button></div></header><div class="lab-workspace-tabs" role="tablist"><button type="button" class="lab-workspace-tab ${resultsActive ? 'on' : ''}" role="tab" aria-selected="${resultsActive}" data-a="labtab:results"><span aria-hidden="true">⚗</span>${T('Results')} (${allLabRecords.length})</button><button type="button" class="lab-workspace-tab ${!resultsActive ? 'on' : ''}" role="tab" aria-selected="${!resultsActive}" data-a="labtab:documents"><span aria-hidden="true">▤</span>${T('Documents')} (${documents.length})</button></div>${resultsActive
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
    <select class="in echo-font-select" data-echo-command="fontName" data-echo-section="patient-report" aria-label="${T('Font')}"><option>Arial</option><option>Times New Roman</option><option>Khmer OS</option><option>Khmer OS Battambang</option><option>Moul</option><option>Koulen</option></select>
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
      <section class="echo-report-attachments" aria-label="បញ្ចូលរូបភាព"><label class="echo-report-label">រូបភាព</label><div id="echo-report-image-list" class="echo-report-image-list">${echoReportImageRows(reportImages)}</div><label class="echo-report-upload" for="echo-report-upload"><span aria-hidden="true">⇧</span><span>បញ្ចូលរូបភាព</span><input id="echo-report-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><small class="echo-report-attachment-hint">${T('JPG, PNG or WebP (max 10 MB)')}</small></section>
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
      if (file.size > 10e6) throw new Error(T('Picture is too large (max 10 MB)'));
      const response = await fetch(API_BASE + '/api/echo-uploads', { method: 'POST', headers: { 'Content-Type': file.type, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: file });
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
function echoReportDocumentHtml(patient, date, content, images = [], preview = false, doctor = '', format = '') {
  const sex = patient?.sex == 'M' ? 'ប្រុស' : patient?.sex == 'F' ? 'ស្រី' : fmtSex(patient?.sex);
  const dateText = String(date || '').slice(0, 10).split('-').reverse().join('/');
  const attachments = images.filter((image) => image && image.photo).map((image) => `<figure class="echo-report-document-image"><img src="${esc(API_BASE + '/uploads/' + encodeURIComponent(image.photo))}" alt=""></figure>`).join('');
  const title = format == 'PT' ? 'ECHO REPORT' : 'របាយការណ៍អេកូ (ECHO REPORT)';
  return `<article class="echo-report-document${preview ? ' echo-report-document-preview' : ''}">${preview ? echoReportClinicHeaderHtml() : ''}<div class="echo-report-patient-meta"><div><b>Name:</b><span>${esc(patient?.name || '')}</span></div><div><b>ID:</b><span>${esc(patient?.id || '')}</span></div><div><b>Age/Sex:</b><span>${esc(fmtAge(patient || {}))} / ${esc(sex || 'N/A')}</span></div><div><b>Date:</b><span>${esc(dateText)}</span></div></div><h2 class="echo-report-document-title">${title}</h2><div class="echo-report-document-columns${attachments ? ' has-images' : ''}"><section class="echo-report-document-result"><h3>Result :</h3><div class="echo-report-document-content">${content || ''}</div></section>${attachments ? `<section class="echo-report-document-images">${attachments}</section>` : ''}</div>${doctor ? `<footer class="echo-report-document-signature"><span>វេជ្ជបណ្ឌិត / Doctor</span><b>${esc(doctor)}</b></footer>` : ''}</article>`;
}
function echoReportContent(record, preview = false, format = '') {
  const data = jd(record);
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const fields = sections.flatMap((section) => section.values || []).filter((field) => field.value).map((field) => `<p><b>${esc(field.name)}:</b> ${esc(field.value)}</p>`).join('');
  const report = Array.isArray(data.report_notes) && data.report_notes.length
    ? `${data.report_notes.map((note, index) => `${data.report_notes.length > 1 ? `<h3>${esc(note.title || `កំណត់ហេតុ (${index + 1})`)}</h3>` : ''}${note.content || ''}`).join('')}${fields}`
    : data.report_content
      ? `${data.report_content}${fields}`
      : sections.map((section) => `${section.title ? `<h3>${esc(section.title)}</h3>` : ''}${section.content || ''}${(section.values || []).map((field) => `<p><b>${esc(field.name)}:</b> ${esc(field.value || '')}</p>`).join('')}`).join('');
  const images = Array.isArray(data.images) && data.images.length ? data.images : record.image ? [{ photo: record.image }] : [];
  return echoReportDocumentHtml(curPt(), record.date, report, images, preview, data.doctor || '', format);
}
function echoReportView(record) {
  echoPreviewZoom = 81;
  const form = $('#mf');
  form.className = 'echo-report-preview-dialog';
  form.innerHTML = `<header class="echo-preview-toolbar"><div class="echo-preview-title"><span aria-hidden="true">▣</span><b>${T('Print Preview')}</b></div><div class="echo-preview-controls"><div class="echo-preview-zoom-controls"><button type="button" data-a="patient-echo-preview-zoom:out" aria-label="${T('Zoom out')}">−</button><output id="echo-preview-zoom-label">${echoPreviewZoom}%</output><button type="button" data-a="patient-echo-preview-zoom:in" aria-label="${T('Zoom in')}">＋</button><button type="button" data-a="patient-echo-preview-zoom:reset" aria-label="${T('Reset zoom')}">⟳</button></div><label class="echo-preview-text-controls"><span aria-hidden="true">T</span><small>A</small><input id="echo-preview-text-size" type="range" min="80" max="140" value="100" aria-label="${T('Preview text size')}"><b>A</b></label></div><div class="echo-preview-actions"><button type="button" class="btn p" data-a="patient-echo-preview-print:${record.id}">${printerIcon()} ${T('Print')}</button><button type="button" class="echo-preview-close" data-a="close" aria-label="${T('Close')}">×</button></div></header><main class="echo-preview-stage"><div class="echo-preview-paper" style="--echo-preview-zoom:${echoPreviewZoom / 100}">${echoReportContent(record, true)}</div></main>`;
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
  const html = `<style>@page{size:${size};margin:8mm}</style><div class="echo-report-print echo-report-print-${esc(format.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${echoReportContent(record, false, format)}</div>`;
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
    return `<article class="rc echo-report-card"><div class="echo-report-card-copy"><b>${esc(record.title || 'Echo Report')}</b><div class="echo-report-card-meta"><span>▧ ${esc(date)}</span>${data.doctor ? `<span class="echo-doctor-chip">♙ ${esc(data.doctor)}</span>` : ''}</div></div><div class="echo-report-card-actions"><button type="button" class="btn echo-view-action" data-a="patient-echo-view:${record.id}">◉ ${T('View')}</button><button type="button" class="btn" data-a="patient-echo-edit:${record.id}">▧ ${T('Edit')}</button><span class="echo-print-options"><button type="button" class="btn" data-a="patient-echo-print:${record.id}:Default">${printerIcon()} ${T('Default')}</button>${['RI', 'LF', 'PT'].map((format) => `<button type="button" class="btn" data-a="patient-echo-print:${record.id}:${format}">${format}</button>`).join('')}</span><button type="button" class="btn p" data-a="patient-echo-print:${record.id}:P-I">${printerIcon()} P-I</button><button type="button" class="btn r" data-a="rdel:${record.id}" aria-label="${T('Delete')}" title="${T('Delete')}">▤</button></div></article>`;
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
  const formatLabel = format && !['CL', 'S+L'].includes(format) ? `<div class="lab-report-format">${esc(format)}</div>` : '';
  printDoc('', `<section class="lab-report${formatClass}">${header}${formatLabel}${vitals}<div class="lab-report-sections">${sections}</div>${labPrintSignature(technician)}</section>`, { omitClinicBranding: true, includeClinicBanner: true });
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
  'JPG, PNG or WebP (max 10 MB)': 'JPG, PNG ឬ WebP (អតិបរមា 10 MB)',
  'Picture is too large (max 10 MB)': 'រូបភាពធំពេក (អតិបរមា 10 MB)',
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
function vaccineRow(d, i) {
  const row = (Array.isArray(d.doses) && d.doses[i]) || {};
  const name = row.vaccine || (!d.doses && i == 0 ? d.vaccine : '') || '';
  const date = row.date || (!d.doses && i == 0 ? d.next_due : '') || '';
  const notes = row.notes || (!d.doses && i == 0 && d.lot ? `Lot / Batch: ${d.lot}` : '') || '';
  return `<tr><td><label class="vax-name"><span class="vax-dose-index">${i + 1}</span><input class="in" name="vax_name_${i}" value="${esc(name)}" placeholder="ចាក់លើកទី${i + 1}"></label></td><td><input class="in" name="vax_date_${i}" type="date" value="${esc(date)}" aria-label="ថ្ងៃ ខែ ឆ្នាំ"></td><td><label class="vax-check"><input type="checkbox" name="vax_given_${i}" value="1" ${row.given ? 'checked' : ''} aria-label="ចាក់រួច"></label></td><td><input class="in" name="vax_note_${i}" value="${esc(notes)}"></td></tr>`;
}
const vaccineRows = (d, count = VACCINE_DOSE_COUNT) => Array.from({ length: Math.max(VACCINE_DOSE_COUNT, count, d.dose_count || 0, d.doses && d.doses.length || 0) }, (_, i) => vaccineRow(d, i)).join('');
function vaccinationForm(r) {
  const editing = !!r, d = r ? jd(r) : {}, date = (r && r.date ? r.date : ymd(new Date())).slice(0, 10);
  const doseCount = Math.max(VACCINE_DOSE_COUNT, d.dose_count || 0, d.doses && d.doses.length || 0);
  const categories = [['Child vaccination', 'child'], ['Adult vaccination', 'adult'], ['Other', 'other']];
  const category = d.category || 'child';
  const body = `<div class="vaccination-form">
    <label class="fl">ប្រភេទវ៉ាក់សាំង<div class="vax-categories">${categories.map(([, value]) => `<label class="cb"><input type="radio" name="category" value="${value}" ${category == value ? 'checked' : ''}> ${value == 'child' ? 'វ៉ាក់សាំងកុមារ' : value == 'adult' ? 'វ៉ាក់សាំងមនុស្សពេញវ័យ' : 'ផ្សេងៗ'}</label>`).join('')}</div></label>
    ${fIn('ឈ្មោះក្រុមវ៉ាក់សាំង', 'vaccine_group', d.vaccine_group || (!d.doses ? d.vaccine : ''), 'text', 'placeholder="បញ្ចូលប្រភេទវ៉ាក់សាំង"')}
    <div class="vax-table-wrap"><table class="vax-table"><thead><tr><th>ចំនួនដូសវ៉ាក់សាំង</th><th>ថ្ងៃ ខែ ឆ្នាំ</th><th>ចាក់រួច</th><th>បញ្ជាក់មូលហេតុ</th></tr></thead><tbody id="vax-dose-rows">${vaccineRows(d, doseCount)}</tbody></table></div>
    <input type="hidden" id="vax-dose-count" name="vax_dose_count" value="${doseCount}">
    <button type="button" class="btn s vax-add-row" data-a="vaxaddfield">＋ បន្ថែមជួរ</button>
    <label class="fl">ចំណាំ<textarea class="in" name="notes" rows="2" placeholder="សូមបញ្ចូលព័ត៌មានការចាក់វ៉ាក់សាំង">${esc(d.notes || r && r.notes || 'សូមមកទទួលវ៉ាក់សាំងតាមការណាត់ជួប និង សូមយកប័ណ្ណចាក់វ៉ាក់សាំងនេះមកជាមួយនូវពេលណាត់ជួបក្រោយៗ ។')}</textarea></label>
    <div class="g2 vax-footer">${fIn('កាលបរិច្ឆេទចាក់វ៉ាក់សាំង', 'date', date, 'date')}${fIn('បុគ្គលិកចាក់វ៉ាក់សាំង', 'administered_by', d.administered_by || '')}</div>
  </div>`;
  openForm(editing ? 'កែប្រែបញ្ជីការចាក់វ៉ាក់សាំង' : 'បញ្ចូលបញ្ជីការចាក់វ៉ាក់សាំង', body, async (f) => {
    const m = new FormData(f), doses = Array.from({ length: Math.max(VACCINE_DOSE_COUNT, Number(m.get('vax_dose_count')) || 0) }, (_, i) => ({
      vaccine: String(m.get(`vax_name_${i}`) || '').trim(),
      date: m.get(`vax_date_${i}`) || '',
      given: m.get(`vax_given_${i}`) === '1',
      notes: String(m.get(`vax_note_${i}`) || '').trim()
    })).filter((dose) => dose.vaccine || dose.date || dose.given || dose.notes);
    const data = { category: m.get('category') || 'child', vaccine_group: String(m.get('vaccine_group') || '').trim(), dose_count: Math.max(VACCINE_DOSE_COUNT, Number(m.get('vax_dose_count')) || 0), doses, notes: m.get('notes') || '', administered_by: String(m.get('administered_by') || '').trim() };
    const body = { patient_id: pdId, kind: 'vaccination', title: data.vaccine_group || T('Vaccination'), date: m.get('date') || date, notes: data.notes, data };
    editing ? await api('PUT', 'records/' + r.id, body) : await api('POST', 'records', body);
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'vaccination-form-dialog', ok: 'រក្សាទុក', cancelLabel: 'បោះបង់', close: true, closeLabel: 'បិទ' });
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
function contractForm(record = null) {
  const data = record ? jd(record) : {};
  const patient = curPt() || {};
  const patientName = patient.name || '';
  const patientSex = patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : patient.sex || '';
  const patientAge = patient.age ? fmtAge(patient) : '';
  const full = (label, key, type = 'text', value = data[key] || '') => `<div class="patient-contract-full">${fIn(label, key, value, type)}</div>`;
  const check = (label, key) => `<label class="cb patient-contract-check"><input type="checkbox" name="${esc(key)}" value="1" ${data[key] ? 'checked' : ''}><span>${label}</span></label>`;
  const form = `<div class="patient-contract-form">
    ${full('ខ្ញុំបាទ/នាងខ្ញុំឈ្មោះ', 'patient_name', 'text', data.patient_name || patientName)}
    <div class="g3 patient-contract-grid">
      ${fIn('ភេទ', 'sex', data.sex || patientSex)}
      ${fIn('អាយុ', 'age', data.age || patientAge)}
      ${fIn('ត្រូវជា', 'nationality', data.nationality || '')}
    </div>
    ${full('អ្នកជំងឺឈ្មោះ', 'occupation', 'text', data.occupation || patientName)}
    <div class="g2 patient-contract-grid">
      ${fIn('ភេទ', 'child_sex', data.child_sex || patientSex)}
      ${fIn('អាយុ', 'child_age', data.child_age || patientAge)}
    </div>
    ${full('ដែលកំពុងស្នាក់នៅ', 'child_name', 'text', data.child_name || patient.addr || '')}
    ${full('បានទទួលការពន្យល់ណែនាំដោយវេជ្ជបណ្ឌិត', 'treatment_details')}
    <div class="patient-contract-consent">
      <b>ខ្ញុំបាទ/នាងខ្ញុំ តំណាងឲ្យក្រុមគ្រួសារបងប្អូនសាច់ញាតិបានសម្រេចចិត្តចំពោះ៖</b>
      ${check('ការព្យាបាលដោយវេជ្ជសាស្ត្រ និងទម្រង់ការវេជ្ជសាស្ត្រគ្រប់ប្រភេទរួមទាំងការបញ្ចូលឈាម', 'consent_treatment')}
      ${check('ការព្យាបាលដោយវះកាត់ និងទម្រង់ការវេជ្ជសាស្ត្រគ្រប់ប្រភេទរួមទាំងការបញ្ចូលឈាម', 'consent_information')}
    </div>
    ${full('សាក្សីដឹងឮ', 'witness')}
    <div class="patient-contract-full">${fIn('ខ្ញុំបានគិតយ៉ាង...', 'relationship', record ? (data.relationship || '') : 'ដិតដល់')}</div>
    <div class="patient-contract-foreign">${check('FOR FOREIGNER/EXPATRIATE PLEASE TICK HERE', 'foreigner')}</div>
    <div class="patient-contract-full">${fIn('កាលបរិច្ឆេទ', 'contract_date', data.contract_date || ymd(new Date()), 'date')}</div>
  </div>`;
  openForm(record ? 'កែប្រែកិច្ចសន្យាព្យាបាល' : 'បញ្ចូលកិច្ចសន្យាព្យាបាល', form, async (f) => {
    const m = new FormData(f), values = {};
    for (const key of ['patient_name', 'sex', 'age', 'nationality', 'occupation', 'child_sex', 'child_age', 'child_name', 'treatment_details', 'witness', 'relationship', 'contract_date']) {
      values[key] = String(m.get(key) || '').trim();
    }
    values.consent_treatment = m.get('consent_treatment') || '';
    values.consent_information = m.get('consent_information') || '';
    values.foreigner = m.get('foreigner') || '';
    if (!values.patient_name) throw new Error('សូមបញ្ចូលឈ្មោះអ្នកជំងឺ');
    const body = {
      patient_id: pdId, kind: 'laborder', title: CARE_MODULES.laborder.title,
      date: values.contract_date || ymd(new Date()), notes: '', data: values
    };
    record ? await api('PUT', 'records/' + record.id, body) : await api('POST', 'records', body);
    await loadRecs(); render(); toast('Saved');
  }, { cls: 'patient-contract-dialog', close: true, cancelLabel: 'បោះបង់', ok: 'រក្សាទុក', closeLabel: 'បិទ' });
}
function genForm(r) {
  const k = r ? r.kind : ptab, e = !!r; r = r || { date: ymd(new Date()) };
  if (k == 'laborder') { contractForm(e ? r : null); return; }
  if (k == 'vaccination') { vaccinationForm(e ? r : null); return; }
  if (k == 'prescription') { prescriptionForm(e ? r : null); return; }
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
  genericRecordForm(k, e, r);
}
function genericRecordForm(k, e, r) {
  const body = fIn('Title', 'title', r.title, 'text', k == 'beu' ? 'placeholder="e.g., Before treatment"' : '') + (k == 'beu' ? `<div class="fl">Label colour<div class="sws">${COLORS.map((c, i) => `<label class="sw"><input type="radio" name="color" value="${c}" ${(r.color || COLORS[0]) == c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>` : '') + fIn('Date', 'date', (r.date || '').slice(0, 10), 'date') + fTa('Notes', 'notes', r.notes, 4) + imgField(k == 'beu' ? 'Image' : 'Picture (optional)', 'image', r.image, 'Remove picture');
  openForm((e ? 'Edit ' : 'Add ') + lbl(k), body, async (f) => {
    const m = new FormData(f), b = { patient_id: pdId, kind: k, title: m.get('title'), date: m.get('date'), notes: m.get('notes'), image: m.get('image') || '', color: k == 'beu' ? (m.get('color') || '') : '' };
    e ? await api('PUT', 'records/' + r.id, b) : await api('POST', 'records', b); await loadRecs(); render(); toast('Saved');
  }, { ok: k == 'beu' ? 'Save Record' : 'Save' });
}
function medlistCatalogHtml() {
  const query = medlistQuery.trim().toLocaleLowerCase();
  if (medlistTab == 'medicines') {
    const medicines = D.med.filter((medicine) => !query || `${medicine.name || ''} ${medicine.composition || ''}`.toLocaleLowerCase().includes(query));
    return medicines.map((medicine) => {
      const id = String(medicine.id), selected = medlistItems.some((item) => item.type == 'medicine' && String(item.item_id) == id);
      const unit = medicineUnits(medicine)[0]?.name || 'ឯកតា';
      return `<label class="medlist-option${selected ? ' selected' : ''}"><input type="checkbox" data-medlist-item-type="medicine" data-medlist-item-id="${esc(id)}" ${selected ? 'checked' : ''}><span class="medlist-option-details"><b>${esc(medicine.name)}</b><small>ស្តុក: ${Number(medicine.stock) || 0}</small></span><b class="medlist-option-price">${K(Number(medicine.price) || 0)}</b><small class="medlist-option-unit">ឯកតា: ${esc(unit)}</small></label>`;
    }).join('') || '<p class="medlist-empty">រកមិនឃើញថ្នាំទេ</p>';
  }
  const services = D.sv.filter((service) => !query || String(service.name || '').toLocaleLowerCase().includes(query));
  return services.map((service) => {
    const id = String(service.id), selected = medlistItems.some((item) => item.type == 'service' && String(item.item_id) == id);
    return `<label class="medlist-option${selected ? ' selected' : ''}"><input type="checkbox" data-medlist-item-type="service" data-medlist-item-id="${esc(id)}" ${selected ? 'checked' : ''}><span class="medlist-option-details"><b>${esc(service.name)}</b><small>សេវាកម្ម</small></span><b class="medlist-option-price">${K(Number(service.price) || 0)}</b></label>`;
  }).join('') || '<p class="medlist-empty">រកមិនឃើញសេវាកម្មទេ</p>';
}
function medlistSelectedHtml() {
  if (!medlistItems.length) return '<p class="medlist-no-selection">No items selected</p>';
  return medlistItems.map((item) => `<article class="medlist-selected-item"><span><b>${esc(item.name)}</b><small>${item.type == 'service' ? 'សេវាកម្ម' : 'ថ្នាំ'}</small></span><b>${K(Number(item.price) || 0)}</b><button type="button" class="btn s medlist-remove" data-a="medlist-remove:${item.type}:${esc(item.item_id)}" aria-label="Remove ${esc(item.name)}">×</button></article>`).join('');
}
function refreshMedlistDialog() {
  const catalog = $('#medlist-catalog'), selected = $('#medlist-selected'), total = $('#medlist-total');
  if (catalog) catalog.innerHTML = medlistCatalogHtml();
  if (selected) selected.innerHTML = medlistSelectedHtml();
  if (total) total.textContent = K(medlistItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0));
}
function medlistForm(record = null) {
  const data = record ? jd(record) : {};
  medlistItems = Array.isArray(data.items) ? data.items.map((item) => ({ ...item, price: Number(item.price) || 0 })) : [];
  medlistTab = 'medicines';
  medlistQuery = '';
  const body = `<div class="medlist-picker"><section class="medlist-picker-catalog"><div class="medlist-tabs" role="tablist" aria-label="Medication and service type"><button type="button" class="medlist-tab${medlistTab == 'medicines' ? ' on' : ''}" role="tab" aria-selected="${medlistTab == 'medicines'}" data-a="medlist-tab:medicines">💊 Medicines</button><button type="button" class="medlist-tab${medlistTab == 'services' ? ' on' : ''}" role="tab" aria-selected="${medlistTab == 'services'}" data-a="medlist-tab:services">🩺 Services</button></div><label class="medlist-search"><span aria-hidden="true">⌕</span><input id="medlist-search" class="in" type="search" placeholder="ស្វែងរកថ្នាំ / Search Medicine..." value=""></label><div id="medlist-catalog" class="medlist-catalog">${medlistCatalogHtml()}</div></section><aside class="medlist-selection"><h4>🛒 Selected Items</h4><div id="medlist-selected" class="medlist-selected">${medlistSelectedHtml()}</div></aside></div>`;
  const title = `Medication &amp; Service Selection <span class="medlist-total-badge">Total: <b id="medlist-total">${K(medlistItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0))}</b></span>`;
  openForm(title, body, async () => {
    if (!medlistItems.length) throw new Error('Select at least one medicine or service');
    const items = medlistItems.map((item) => ({ ...item, price: Number(item.price) || 0, quantity: 1 }));
    const payload = { patient_id: pdId, kind: 'medlist', title: 'Medication & Service Selection', date: record && record.date || ymd(new Date()), data: { items, total: items.reduce((sum, item) => sum + item.price, 0) } };
    if (record) await api('PUT', 'records/' + record.id, payload);
    else await api('POST', 'records', payload);
    await loadRecs();
    render();
    toast('Saved');
  }, { cls: 'medlist-dialog', ok: 'Confirm & Save', cancelLabel: 'Cancel', close: true, closeLabel: 'Close' });
}
function toggleMedlistItem(type, id, selected) {
  const collection = type == 'medicine' ? D.med : type == 'service' ? D.sv : null;
  const item = collection && collection.find((entry) => String(entry.id) == String(id));
  if (!item) {
    if (selected) toast(type == 'medicine' ? 'រកមិនឃើញថ្នាំទេ' : 'រកមិនឃើញសេវាកម្មទេ');
    return;
  }
  medlistItems = medlistItems.filter((entry) => !(entry.type == type && String(entry.item_id) == String(id)));
  if (selected) medlistItems.push({ type, item_id: item.id, name: item.name, price: Number(item.price) || 0 });
  refreshMedlistDialog();
}
function medlistDispenseCatalogHtml() {
  const query = medlistDispenseQuery.trim().toLocaleLowerCase();
  const medicines = D.med.filter((medicine) => !query || `${medicine.name || ''} ${medicine.composition || ''}`.toLocaleLowerCase().includes(query));
  return medicines.map((medicine) => {
    const stock = Math.max(0, Number(medicine.stock) || 0);
    const units = medicineUnits(medicine);
    return `<article class="medlist-dispense-medicine"><div class="medlist-dispense-medicine-heading"><b>${esc(medicine.name)}</b><span class="medlist-dispense-stock">ស្តុក: ${stock}</span></div><div class="medlist-dispense-units">${units.map((unit, index) => `<button type="button" class="btn" data-a="medlist-add:${esc(medicine.id)}:${index}" ${stock < Math.max(1, Number(unit.qty) || 1) ? 'disabled' : ''}>${esc(unit.name || 'Unit')}</button>`).join('')}</div></article>`;
  }).join('') || '<p class="emp">មិនមានថ្នាំទេ</p>';
}
function medlistDispenseSelectedHtml() {
  if (!medlistDispenseItems.length) return '<p class="medlist-dispense-empty">មិនទាន់មានថ្នាំ</p>';
  return medlistDispenseItems.map((item, index) => `<article class="medlist-dispense-selected"><div class="medlist-dispense-item-name"><b>${esc(item.name)} <span>(${esc(item.unit_name)})</span></b></div><input class="in medlist-dispense-quantity" type="number" min="1" step="1" value="${Number(item.quantity) || 1}" data-medlist-quantity="${index}" aria-label="Quantity for ${esc(item.name)}"><label class="medlist-dispense-flag"><input type="checkbox" data-medlist-flag="${index}:home" ${item.home ? 'checked' : ''}>ទៅផ្ទះ</label><label class="medlist-dispense-flag"><input type="checkbox" data-medlist-flag="${index}:md" ${item.md ? 'checked' : ''}>MD</label><label class="medlist-dispense-flag"><input type="checkbox" data-medlist-flag="${index}:ipd" ${item.ipd ? 'checked' : ''}>IPD</label><button type="button" class="medlist-dispense-remove" data-a="medlist-adjust:${index}:0" aria-label="Remove ${esc(item.name)}" title="Remove ${esc(item.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7"/></svg></button></article>`).join('');
}
function medlistDispenseTotal() {
  return medlistDispenseItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
}
function medlistPanel(records) {
  const history = records.map(medlistHistoryCard).join('') || '<p class="emp">មិនទាន់មានប្រវត្តិទេ</p>';
  return `<section class="medlist-dispense card"><header class="medlist-dispense-header"><h2>ចែកថ្នាំ / Dispense Medicine</h2><button type="button" class="btn r medlist-md-order" data-a="medlist-md-order">ⓘ MD Order</button></header><div class="medlist-dispense-workspace"><section class="medlist-dispense-catalog"><h3>បញ្ជីថ្នាំ</h3><label class="medlist-dispense-search"><span aria-hidden="true">⌕</span><input id="medlist-dispense-search" class="in" type="search" placeholder="ស្វែងរកថ្នាំ..." value="${esc(medlistDispenseQuery)}"></label><div id="medlist-dispense-list" class="medlist-dispense-list">${medlistDispenseCatalogHtml()}</div></section><section class="medlist-dispense-selection"><h3>ថ្នាំដែលបានជ្រើស</h3><div id="medlist-dispense-selected" class="medlist-dispense-selected">${medlistDispenseSelectedHtml()}</div></section></div><div class="medlist-dispense-actions"><button type="button" class="btn p" data-a="medlist-save" ${medlistDispenseItems.length ? '' : 'disabled'}>បញ្ជាក់ និងបញ្ចេញថ្នាំ${medlistDispenseItems.length ? ` · ${K(medlistDispenseTotal())}` : ''}</button></div><section class="medlist-dispense-history"><h3>ប្រវត្តិការប្រើប្រាស់ថ្នាំ</h3><div class="medlist-dispense-history-list">${history}</div></section></section>`;
}
function medlistHistoryCard(record) {
  const data = jd(record), items = Array.isArray(data.items) ? data.items : [];
  const date = record.created_at ? new Date(record.created_at).toLocaleString() : (record.date || '').replace('T', ' ');
  const trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7"/></svg>';
  const pencil = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
  return `<article class="medlist-history-card" data-medlist-transaction="${esc(record.id)}"><div class="medlist-history-card-content"><b class="medlist-history-date">កាលបរិច្ឆេទ៖ ${esc(date)}</b><ul>${items.map((item, index) => `<li><span>${esc(item.name)}${item.unit_name ? ` (${esc(item.unit_name)})` : ''} - ចំនួន៖ ${Number(item.quantity) || 1}</span><button type="button" class="medlist-history-edit" data-a="medlist-history-edit:${record.id}:${index}" aria-label="កែប្រែ ${esc(item.name)}" title="កែប្រែ">${pencil}</button></li>`).join('')}</ul></div><button type="button" class="medlist-history-delete" data-a="medlist-history-delete:${record.id}" aria-label="លុបប្រវត្តិការប្រើប្រាស់ថ្នាំ" title="លុប">${trash}</button></article>`;
}
function medlistHistoryEdit(recordId, itemIndex) {
  const record = recs.find((entry) => String(entry.id) == String(recordId) && entry.kind == 'medlist');
  if (!record) return toast('រកមិនឃើញប្រវត្តិថ្នាំទេ');
  const data = jd(record), items = Array.isArray(data.items) ? data.items.map((item) => ({ ...item })) : [], item = items[itemIndex];
  if (!item) return toast('រកមិនឃើញថ្នាំក្នុងប្រវត្តិទេ');
  const body = `<div class="medlist-history-edit-form">${fIn('ឈ្មោះថ្នាំ', 'medicine_name', item.name || '')}${fIn('ចំនួន', 'quantity', Number(item.quantity) || 1, 'number', 'min="1" step="1"')}${fCb('ទៅផ្ទះ', 'home', !!item.home)}${fCb('MD', 'md', !!item.md)}${fCb('IPD', 'ipd', !!item.ipd)}</div>`;
  openForm('កែប្រែថ្នាំ', body, async (form) => {
    const values = new FormData(form), quantity = Number(values.get('quantity'));
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('ចំនួនត្រូវតែជាចំនួនគត់ធំជាងសូន្យ');
    items[itemIndex] = { ...item, name: String(values.get('medicine_name') || '').trim(), quantity, home: values.get('home') === '1', md: values.get('md') === '1', ipd: values.get('ipd') === '1' };
    if (!items[itemIndex].name) throw new Error('សូមបញ្ចូលឈ្មោះថ្នាំ');
    data.items = items;
    data.total = items.reduce((sum, entry) => sum + (Number(entry.price) || 0) * (Number(entry.quantity) || 1), 0);
    await api('PUT', 'records/' + record.id, { patient_id: pdId, kind: 'medlist', title: record.title, date: record.date, notes: record.notes, data });
    await loadRecs();
    render();
    toast('បានរក្សាទុក');
  }, { cls: 'medlist-history-edit-dialog', ok: 'រក្សាទុក' });
}
function medlistHistoryDelete(recordId) {
  if (!confirm('លុបប្រវត្តិការប្រើប្រាស់ថ្នាំនេះ?')) return;
  api('DELETE', 'records/' + recordId).then(loadRecs).then(render).catch((error) => toast(error.message));
}
function refreshMedlistDispense() {
  const list = $('#medlist-dispense-list'), selected = $('#medlist-dispense-selected'), action = document.querySelector('[data-a="medlist-save"]');
  if (list) list.innerHTML = medlistDispenseCatalogHtml();
  if (selected) selected.innerHTML = medlistDispenseSelectedHtml();
  if (action) {
    action.disabled = !medlistDispenseItems.length;
    action.textContent = `បញ្ជាក់ និងបញ្ចេញថ្នាំ${medlistDispenseItems.length ? ` · ${K(medlistDispenseTotal())}` : ''}`;
  }
}
function addMedlistDispenseItem(id, unitIndex) {
  const medicine = D.med.find((item) => String(item.id) == String(id));
  if (!medicine) return toast('រកមិនឃើញថ្នាំទេ');
  const unit = medicineUnits(medicine)[Number(unitIndex)];
  if (!unit) return toast('រកមិនឃើញឯកតាថ្នាំទេ');
  const unitQty = Math.max(1, Number(unit.qty) || 1), stock = Math.max(0, Number(medicine.stock) || 0);
  const selected = medlistDispenseItems.find((item) => String(item.medicine_id) == String(medicine.id) && item.unit_name == unit.name);
  const requestedStock = medlistDispenseItems.filter((item) => String(item.medicine_id) == String(medicine.id)).reduce((sum, item) => sum + (Number(item.unit_qty) || 1) * (Number(item.quantity) || 1), 0) + unitQty;
  if (requestedStock > stock) return toast('ស្តុកថ្នាំមិនគ្រប់គ្រាន់');
  if (selected) selected.quantity = (Number(selected.quantity) || 1) + 1;
  else medlistDispenseItems.push({ type: 'medicine', medicine_id: medicine.id, item_id: medicine.id, name: medicine.name, unit_name: unit.name || 'Unit', unit_qty: unitQty, price: Number(unit.price) || Number(medicine.price) || 0, quantity: 1 });
  refreshMedlistDispense();
}
function adjustMedlistDispense(index, delta) {
  const item = medlistDispenseItems[index];
  if (!item) return;
  if (!delta) medlistDispenseItems.splice(index, 1);
  else {
    const quantity = (Number(item.quantity) || 1) + Number(delta);
    if (quantity < 1) medlistDispenseItems.splice(index, 1);
    else {
      const medicine = D.med.find((entry) => String(entry.id) == String(item.medicine_id));
      const requested = medlistDispenseItems.filter((entry) => String(entry.medicine_id) == String(item.medicine_id)).reduce((sum, entry) => sum + (Number(entry.unit_qty) || 1) * (Number(entry.quantity) || 1), 0) + (delta > 0 ? Number(item.unit_qty) || 1 : 0);
      if (delta > 0 && medicine && requested > (Number(medicine.stock) || 0)) return toast('ស្តុកថ្នាំមិនគ្រប់គ្រាន់');
      item.quantity = quantity;
    }
  }
  refreshMedlistDispense();
}
function setMedlistDispenseQuantity(index, value) {
  const item = medlistDispenseItems[index], quantity = Number(value);
  if (!item) return;
  if (!Number.isInteger(quantity) || quantity < 1) return refreshMedlistDispense();
  const medicine = D.med.find((entry) => String(entry.id) == String(item.medicine_id));
  const requested = medlistDispenseItems.filter((entry) => String(entry.medicine_id) == String(item.medicine_id)).reduce((sum, entry) => sum + (Number(entry.unit_qty) || 1) * (Number(entry.quantity) || 1), 0) + (quantity - (Number(item.quantity) || 1)) * (Number(item.unit_qty) || 1);
  if (medicine && requested > (Number(medicine.stock) || 0)) {
    toast('ស្តុកថ្នាំមិនគ្រប់គ្រាន់');
    return refreshMedlistDispense();
  }
  item.quantity = quantity;
  refreshMedlistDispense();
}
async function saveMedlistDispense() {
  if (!medlistDispenseItems.length) throw new Error('សូមជ្រើសរើសថ្នាំជាមុនសិន');
  const items = medlistDispenseItems.map((item) => ({ ...item, price: Number(item.price) || 0, quantity: Number(item.quantity) || 1 }));
  await api('POST', 'records', { patient_id: pdId, kind: 'medlist', title: 'Dispensed medicines', date: ymd(new Date()), data: { dispensed: true, items, total: medlistDispenseTotal() } });
  medlistDispenseItems = [];
  medlistDispenseQuery = '';
  await loadRecs();
  render();
  toast('បានរក្សាទុក');
}
const rxBilingual = (khmer) => `<span class="rx-entry-bilingual">${khmer}</span>`;
const RX_ENTRY_INSTRUCTIONS = ['លេបក្រោយបាយ ៣០នាទី', 'លេបមុនបាយ', 'លេបក្រោយបាយ', 'លេបក្រោយបាយ ១ម៉ោង', 'លេបមុនចូលគេង'];
const RX_DEFAULT_MEDICINE_DOSAGE = { morning: '1', noon: '1', evening: '1', night: '0', duration: '5', quantity: 15 };
function rxEntryMedicineSearch() {
  const query = rxEntrySearch.trim().toLocaleLowerCase();
  return D.med.filter((medicine) => !query || `${medicine.name} ${medicine.composition || ''}`.toLocaleLowerCase().includes(query))
    .map((medicine) => {
      const selected = rxEntryRows.some((row) => String(row.medicine_id) == String(medicine.id));
      const unit = medicineUnits(medicine)[0]?.name || 'ឯកតា';
      return `<label class="rx-entry-medicine${selected ? ' selected' : ''}"><input type="checkbox" data-rx-medicine-select="${esc(medicine.id)}" ${selected ? 'checked' : ''}><span class="rx-entry-medicine-details"><b>${esc(medicine.name)}</b><small>ស្តុក: ${Number(medicine.stock) || 0}</small></span><b class="rx-entry-medicine-price">${K(medicine.price)}</b><small class="rx-entry-medicine-unit">ឯកតា: ${esc(unit)}</small></label>`;
    }).join('')
    || `<p class="rx-entry-empty">រកមិនឃើញថ្នាំទេ</p>`;
}
function rxEntryRowsHtml() {
  if (!rxEntryRows.length) return `<tr><td colspan="8" class="rx-entry-empty">សូមស្វែងរក និងជ្រើសរើសថ្នាំខាងលើ</td></tr>`;
  return rxEntryRows.map((medicine, index) => {
    const name = esc(medicine.name);
    const fields = [['morning','ព្រឹក'],['noon','ថ្ងៃត្រង់'],['evening','ល្ងាច'],['night','យប់'],['duration','រយៈពេល (ថ្ងៃ)'],['quantity','ចំនួន']];
    const instructionOptions = [`<option value="">ជ្រើសរើស</option>`, ...RX_ENTRY_INSTRUCTIONS.map((instruction) => `<option value="${esc(instruction)}" ${medicine.instruction == instruction ? 'selected' : ''}>${esc(instruction)}</option>`)].join('');
    return `<tr class="rx-entry-dose-row"><td class="rx-entry-medicine-name"><button type="button" class="rx-entry-remove" data-a="rxentryremove:${index}" aria-label="លុប ${name}">×</button><b>${name}</b></td>${fields.map(([key,label]) => `<td><input class="in rx-entry-dose" data-rx-entry-index="${index}" data-rx-entry-field="${key}" aria-label="${label} ${name}" value="${esc(medicine[key] ?? '')}" ${['duration','quantity'].includes(key) ? 'type="number" min="0" step="1"' : ''}></td>`).join('')}<td><select class="in rx-entry-dose" data-rx-entry-index="${index}" data-rx-entry-field="instruction" aria-label="ការណែនាំ ${name}">${instructionOptions}</select></td></tr>`;
  }).join('');
}
function rxEntryCollect(form) {
  const values = new FormData(form);
  const medicines = rxEntryRows.map((medicine) => ({ ...medicine, quantity: Number(medicine.quantity) || 0, price: Number(medicine.price) || 0 }));
  return {
    date: String(values.get('date') || ymd(new Date())),
    diagnosis: String(values.get('diagnosis') || '').trim(),
    disease: String(values.get('disease') || '').trim(),
    doctor: String(values.get('doctor') || '').trim(),
    notes: String(values.get('notes') || '').trim(),
    print_format: String(values.get('rx_print_format') || 'A'),
    medicines
  };
}
const RX_PRINT_FORMATS = ['A', 'B', 'C', 'D', 'E', 'EG', 'CH', 'AG', 'AD'];
function rxPrintFormatControl(value = 'A') {
  const selected = RX_PRINT_FORMATS.includes(value) ? value : 'A';
  return `<label class="rx-print-format"><span>ប្លង់បោះពុម្ព / Print layout</span><select class="in" name="rx_print_format" id="rx-print-format">${RX_PRINT_FORMATS.map((format) => `<option value="${format}" ${format == selected ? 'selected' : ''}>គំរូ${format}</option>`).join('')}</select></label>`;
}
function rxPrintPicker(data, patient = curPt()) {
  if (!patient) return toast('រកមិនឃើញអ្នកជំងឺទេ');
  openForm('ជ្រើសរើសប្លង់បោះពុម្ព', rxPrintFormatControl(data.print_format || 'A'), async (form) => {
    const format = String(new FormData(form).get('rx_print_format') || '');
    if (!RX_PRINT_FORMATS.includes(format)) throw new Error('សូមជ្រើសរើសប្លង់បោះពុម្ពត្រឹមត្រូវ');
    await rxEntryPrint(data, patient, format);
  }, { cls: 'rx-print-picker', ok: 'បោះពុម្ព' });
}
async function rxEntryPrint(data, patient = curPt(), format = data.print_format || 'A') {
  if (!patient) return toast('រកមិនឃើញអ្នកជំងឺទេ');
  if (!RX_PRINT_FORMATS.includes(format)) return toast('ប្លង់បោះពុម្ពមិនត្រឹមត្រូវ');
  let portalQr = '';
  let portalError = '';
  try {
    const portal = await api('POST', `patients/${encodeURIComponent(patient.id)}/portal`, { portal_origin: location.origin });
    if (!portal || typeof portal.qr !== 'string' || !portal.qr.startsWith('data:image/png;base64,')) {
      throw new Error('Could not generate the patient portal QR code');
    }
    portalQr = `<aside class="rx-print-portal"><img src="${esc(portal.qr)}" alt="Patient portal QR code"><span>ស្កេនដើម្បីមើលព័ត៌មានអ្នកជំងឺ / Scan for patient portal</span></aside>`;
  } catch (error) {
    portalError = error.message || 'Could not generate the patient portal QR code';
  }
  const medicines = Array.isArray(data.medicines) ? data.medicines : [];
  const vitalsRecord = recs.filter((record) => record.kind == 'vitals' && String(record.patient_id) == String(patient.id))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  const vitals = vitalsRecord ? jd(vitalsRecord) : {};
  const value = (text) => esc(text === '' || text == null ? '—' : text);
  const date = String(data.date || '').slice(0, 10).split('-').reverse().join('/');
  const sex = patient.sex == 'M' ? 'ប្រុស' : patient.sex == 'F' ? 'ស្រី' : fmtSex(patient.sex) || '—';
  const usage = (medicine) => [medicine.morning && `ព្រឹក ${medicine.morning}`, medicine.noon && `ថ្ងៃត្រង់ ${medicine.noon}`, medicine.evening && `ល្ងាច ${medicine.evening}`, medicine.night && `យប់ ${medicine.night}`, medicine.instruction].filter(Boolean).join(' · ') || '—';
  const dosage = (medicine) => [medicine.morning, medicine.noon, medicine.evening, medicine.night].filter(Boolean).join(' / ') || medicine.instruction || '—';
  const row = (cells) => `<tr>${cells.map((cell) => `<td>${value(cell)}</td>`).join('')}</tr>`;
  const table = (headings, rows, blankCount = 0) => {
    const blanks = Array.from({ length: Math.max(0, blankCount - rows.length) }, () => `<tr class="rx-print-blank">${headings.map(() => '<td>&nbsp;</td>').join('')}</tr>`);
    return `<table class="rx-print-table"><thead><tr>${headings.map((heading) => `<th>${heading}</th>`).join('')}</tr></thead><tbody>${rows.concat(blanks).join('')}</tbody></table>`;
  };
  const itemRows = (mapping) => medicines.map((medicine, index) => row(mapping(medicine, index)));
  const patientFields = (fields) => `<div class="rx-print-meta">${fields.map(([label, text]) => `<div><b>${label}</b><span>${value(text)}</span></div>`).join('')}</div>`;
  const vitalsText = [['ទម្ងន់ / Weight', vitals.w || vitals.weight], ['កម្ពស់ / Height', vitals.h || vitals.height], ['សីតុណ្ហភាព / Temp', vitals.t || vitals.temperature], ['សម្ពាធឈាម / BP', vitals.bp || vitals.blood_pressure], ['ជីពចរ / Pulse', vitals.p || vitals.pulse]].filter(([, text]) => text).map(([label, text]) => `<span><b>${label}៖</b> ${value(text)}</span>`).join('');
  const title = `<h2 class="rx-print-title">វេជ្ជបញ្ជា <small>/ Prescription</small></h2>`;
  let content = '';
  if (format == 'A' || format == 'B') {
    const headings = format == 'A'
      ? ['ល.រ / No.', 'ឈ្មោះថ្នាំ / Medicine', 'ការណែនាំ / Instruction', 'ថ្ងៃ / Days', 'ចំនួន / Qty']
      : ['ល.រ / No.', 'ឈ្មោះថ្នាំ / Medicine', 'ការប្រើប្រាស់ / Instruction', 'រយៈពេល / Days', 'ចំនួន / Qty'];
    content = `${title}${patientFields([['ឈ្មោះ / Name', patient.name], ['អាយុ / Age', fmtAge(patient)], ['ភេទ / Gender', sex], ['កាលបរិច្ឆេទ / Date', date], ['លេខអ្នកជំងឺ / Patient ID', patient.id], ['ទូរស័ព្ទ / Phone', patient.phone], ['រោគវិនិច្ឆ័យ / Diagnosis', data.diagnosis]])}${table(headings, itemRows((medicine, index) => [index + 1, medicine.name, usage(medicine), medicine.duration, medicine.quantity]))}${format == 'B' && data.notes ? `<p class="rx-print-note"><b>ចំណាំ / Note៖</b> ${value(data.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
  } else if (format == 'C') {
    content = `${title}${patientFields([['ឈ្មោះ / Name', patient.name], ['អាយុ / Age', fmtAge(patient)], ['ភេទ / Gender', sex], ['កាលបរិច្ឆេទ / Date', date], ['លេខអ្នកជំងឺ / Patient ID', patient.id], ['ទូរស័ព្ទ / Phone', patient.phone]])}<p class="rx-print-diagnosis"><b>ជំងឺ / Disease / Condition៖</b> ${value(data.disease || data.diagnosis)}</p>${table(['ល.រ / No.', 'ឈ្មោះថ្នាំ / Medicine', 'ចំនួន / Qty', 'ការប្រើប្រាស់ / Instruction'], itemRows((medicine, index) => [index + 1, medicine.name, medicine.quantity, usage(medicine)]))}`;
  } else if (format == 'D' || format == 'E' || format == 'EG') {
    const patientInfo = [['ឈ្មោះ / Name', patient.name], ['អាយុ / Age', fmtAge(patient)], ['ទម្ងន់ / Weight', vitals.w || vitals.weight], ['ភេទ / Gender', sex], ['កម្ពស់ / Height', vitals.h || vitals.height], ['ទូរស័ព្ទ / Phone', patient.phone], ['កាលបរិច្ឆេទ / Date', date], ['អាសយដ្ឋាន / Address', patient.addr]];
    content = `${title}${patientFields(patientInfo)}<p class="rx-print-diagnosis"><b>រោគវិនិច្ឆ័យ / Diagnosis៖</b> ${value(data.diagnosis || data.disease)}</p>${format == 'EG' ? table(['ល.រ / No.', 'ឈ្មោះថ្នាំ / Medicine', 'កម្រិតប្រើ / Dosage', 'រយៈពេល / Duration', 'ផ្សេងៗ / Others'], itemRows((medicine, index) => [index + 1, medicine.name, dosage(medicine), medicine.duration, [medicine.quantity && `Qty ${medicine.quantity}`, medicine.instruction].filter(Boolean).join(' · ')]), 10) : table(['ល.រ / No.', 'ឈ្មោះថ្នាំ / Medicine name', 'កម្រិតប្រើ / Dosage', 'រយៈពេល / Duration', 'ផ្សេងៗ / Others'], itemRows((medicine, index) => [index + 1, medicine.name, dosage(medicine), medicine.duration, [medicine.quantity && `Qty ${medicine.quantity}`, medicine.instruction].filter(Boolean).join(' · ')]), 10)}${data.notes ? `<p class="rx-print-note"><b>ចំណាំ / Note៖</b> ${value(data.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
  } else if (format == 'CH') {
    content = `${title}${patientFields([['ឈ្មោះ / Name', patient.name], ['ភេទ / Gender', sex], ['ទូរស័ព្ទ / Phone', patient.phone], ['អាយុ / Age', fmtAge(patient)], ['កម្ដៅ / Temp', vitals.t || vitals.temperature], ['សម្ពាធឈាម / BP', vitals.bp || vitals.blood_pressure], ['ជីពចរ / Pulse', vitals.p || vitals.pulse], ['កាលបរិច្ឆេទ / Date', date], ['រោគវិនិច្ឆ័យ / Diagnosis', data.diagnosis]])}${table(['No.', 'Medicine', 'Usage', 'Number of days', 'Total'], itemRows((medicine, index) => [index + 1, medicine.name, usage(medicine), medicine.duration, medicine.quantity]))}`;
  } else if (format == 'AG') {
    content = `${title}${patientFields([['ឈ្មោះ / Name', patient.name], ['កាលបរិច្ឆេទ / Date', date], ['ភេទ / Gender', sex], ['លេខសម្គាល់ / Ref.', patient.national_id || patient.nssf_id], ['អាយុ / Age', fmtAge(patient)], ['រោគវិនិច្ឆ័យ / Diagnosis', data.diagnosis || data.disease]])}${table(['ល.រ', 'ឈ្មោះថ្នាំ', 'ព្រឹក', 'ថ្ងៃត្រង់', 'ល្ងាច', 'យប់', 'រយៈពេល', 'ចំនួន', 'ការណែនាំ'], itemRows((medicine, index) => [index + 1, medicine.name, medicine.morning, medicine.noon, medicine.evening, medicine.night, medicine.duration, medicine.quantity, medicine.instruction]))}`;
  } else {
    content = `${title}${patientFields([['ឈ្មោះ / Name', patient.name], ['កាលបរិច្ឆេទ / Date', date], ['លេខអ្នកជំងឺ / ID', patient.id], ['អាយុ / Age', fmtAge(patient)], ['ភេទ / Gender', sex], ['ទូរស័ព្ទ / Phone', patient.phone], ['អាសយដ្ឋាន / Address', patient.addr]])}${vitalsText ? `<section class="rx-print-vitals"><b>សញ្ញាជីវិត / Vital signs</b>${vitalsText}</section>` : ''}<p class="rx-print-diagnosis"><b>រោគវិនិច្ឆ័យ / Diagnosis៖</b> ${value(data.diagnosis || data.disease)}</p>${table(['ល.រ', 'ឈ្មោះថ្នាំ', 'កម្រិតប្រើ', 'រយៈពេល', 'ចំនួន', 'ការណែនាំ'], itemRows((medicine, index) => [index + 1, medicine.name, dosage(medicine), medicine.duration, medicine.quantity, medicine.instruction]), 8)}${data.notes ? `<p class="rx-print-note"><b>កំណត់ចំណាំ៖</b> ${value(data.notes).replace(/\n/g, '<br>')}</p>` : ''}<p class="rx-print-disclaimer">សូមប្រើថ្នាំតាមការណែនាំរបស់វេជ្ជបណ្ឌិត។</p>`;
  }
  const signature = data.doctor ? `<p class="rx-print-signature">វេជ្ជបណ្ឌិត / Doctor៖ <b>${value(data.doctor)}</b></p>` : '';
  const printStyles = `
    @page { size: A4 portrait; margin: 10mm; }
    #pa .rx-print { color: #111; font: 10pt "Khmer OS Battambang", "Noto Sans Khmer", Arial, sans-serif; }
    #pa .rx-print-title { margin: 2mm 0 5mm; text-align: center; font-size: 15pt; }
    #pa .rx-print-title small { font-size: 11pt; }
    #pa .rx-print-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2mm 5mm; margin: 0 0 4mm; padding: 2mm 0; border-bottom: .3mm solid #555; }
    #pa .rx-print-meta > div { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 1mm; min-width: 0; }
    #pa .rx-print-meta span { overflow-wrap: anywhere; }
    #pa .rx-print-table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 9pt; }
    #pa .rx-print-table th, #pa .rx-print-table td { padding: 2mm 1.5mm; text-align: left; vertical-align: top; }
    #pa .rx-print-table th { border-top: .5mm solid #111; border-bottom: .5mm solid #111; text-align: center; }
    #pa .rx-print-table tr { break-inside: avoid; page-break-inside: avoid; }
    #pa .rx-print-diagnosis, #pa .rx-print-note { margin: 3mm 0; padding: 2mm 0; border-bottom: .25mm solid #777; }
    #pa .rx-print-vitals { display: flex; flex-wrap: wrap; gap: 2mm 5mm; margin: 3mm 0; padding: 2mm; border-block: 1px solid #777; }
    #pa .rx-print-vitals > b { width: 100%; }
    #pa .rx-print-signature { margin: 14mm 8mm 0; text-align: right; }
    #pa .rx-print-portal { display: flex; align-items: center; gap: 3mm; margin: 5mm 0 0 auto; width: 68mm; font-size: 7pt; }
    #pa .rx-print-portal img { display: block; width: 25mm; height: 25mm; image-rendering: pixelated; }
    #pa .rx-print-disclaimer { margin-top: 8mm; padding: 2mm; border: 1px solid #bbb; font-size: 8pt; }
    #pa .rx-print-b .rx-print-table th, #pa .rx-print-b .rx-print-table td,
    #pa .rx-print-c .rx-print-table th, #pa .rx-print-c .rx-print-table td,
    #pa .rx-print-ch .rx-print-table th, #pa .rx-print-ch .rx-print-table td { border-bottom: .25mm solid #111; }
    #pa .rx-print-d .rx-print-table th, #pa .rx-print-d .rx-print-table td,
    #pa .rx-print-e .rx-print-table th, #pa .rx-print-e .rx-print-table td,
    #pa .rx-print-eg .rx-print-table th, #pa .rx-print-eg .rx-print-table td,
    #pa .rx-print-ag .rx-print-table th, #pa .rx-print-ag .rx-print-table td,
    #pa .rx-print-ad .rx-print-table th, #pa .rx-print-ad .rx-print-table td { border: .25mm solid #222; }
    #pa .rx-print-d .rx-print-blank td, #pa .rx-print-e .rx-print-blank td,
    #pa .rx-print-eg .rx-print-blank td, #pa .rx-print-ad .rx-print-blank td { height: 8mm; }
    #pa .rx-print-e .rx-print-meta { border-bottom: 1px dotted #555; }
    #pa .rx-print-eg .rx-print-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    #pa .rx-print-ag .rx-print-table { font-size: 8pt; }
    #pa .rx-print-ad .rx-print-table th { background: #eee !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @media print {
      #pa .rx-print-table th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }`;
  const html = `<style>${printStyles}</style><article class="rx-print rx-print-${format.toLowerCase()}">${content}${signature}${portalQr}</article>`;
  printDoc('', html, { omitClinicBranding: true, includeClinicBanner: true });
  if (portalError) toast(`Patient Portal QR unavailable; printing will continue without it. ${portalError}`);
}
async function revokePatientPortalAccess(patient = curPt()) {
  if (!patient) throw new Error('រកមិនឃើញអ្នកជំងឺទេ');
  if (!confirm('Revoke all active patient portal QR links for this patient?')) return;
  await api('DELETE', `patients/${encodeURIComponent(patient.id)}/portal`);
  toast('បានបិទតំណភ្ជាប់ Patient Portal ទាំងអស់');
}
async function savePrescription(form, bill = false) {
  const data = rxEntryCollect(form);
  if (!data.diagnosis && !data.disease) throw new Error('សូមបញ្ចូលរោគវិនិច្ឆ័យ ឬជំងឺ');
  if (!data.medicines.length) throw new Error('សូមជ្រើសរើសថ្នាំយ៉ាងហោចណាស់មួយ');
  const recordId = form.dataset.rxRecordId, existing = recordId && recs.find((record) => String(record.id) == recordId);
  const body = { patient_id: pdId, kind: 'prescription', title: data.diagnosis || data.disease, date: data.date, notes: data.notes, data };
  if (existing) await api('PUT', 'records/' + existing.id, body);
  else await api('POST', 'records', body);
  await loadRecs();
  if (bill) {
    ptab = 'billing';
    try { sessionStorage.setItem('currentPatientTab', ptab); } catch (e) { /* keep the current view */ }
  }
  render();
  toast(bill ? 'បានរក្សាទុក និងបញ្ចូលវិក្កយបត្រ' : 'បានរក្សាទុក');
}
function prescriptionForm(record = null) {
  const data = record ? jd(record) : {};
  rxEntryRows = (Array.isArray(data.medicines) ? data.medicines : []).map((medicine) => ({ ...medicine }));
  rxEntrySearch = ''; rxEntrySearchOpen = false; rxTemplatePickerOpen = false;
  const diagnosisOptions = [...new Set((D.dx || []).map((item) => String(item.name || '').trim()).filter(Boolean))];
  const diseaseOptions = (D.rx || []).filter((template) => template.name);
  const doctorOptions = [...new Set((D.dr || []).map((doctor) => String(doctor.name || '').trim()).filter(Boolean))];
  const doctors = doctorOptions.length
    ? `<select class="in" name="doctor"><option value="">ជ្រើសរើសវេជ្ជបណ្ឌិត</option>${doctorOptions.map((doctor) => `<option value="${esc(doctor)}" ${doctor == data.doctor ? 'selected' : ''}>${esc(doctor)}</option>`).join('')}</select>`
    : `<input class="in" name="doctor" value="${esc(data.doctor || '')}" placeholder="បញ្ចូលឈ្មោះវេជ្ជបណ្ឌិត">`;
  openForm(rxBilingual(record ? 'កែប្រែវេជ្ជបញ្ជា' : 'បង្កើតវេជ្ជបញ្ជា'), `<div class="rx-entry-form">
    <div class="rx-entry-header-row">
      <label class="rx-entry-date">${rxBilingual('កាលបរិច្ឆេទ')}<input class="in" name="date" type="date" value="${esc((record && record.date || ymd(new Date())).slice(0,10))}" required></label>
      <label class="rx-entry-diagnosis">${rxBilingual('រោគវិនិច្ឆ័យ')}<input class="in" name="diagnosis" list="rx-diagnosis-options" value="${esc(data.diagnosis || '')}" placeholder="ជ្រើសរើស ឬបញ្ចូលរោគវិនិច្ឆ័យ"><datalist id="rx-diagnosis-options">${diagnosisOptions.map((name) => `<option value="${esc(name)}">`).join('')}</datalist></label>
    </div>
    <div class="rx-entry-prescriber-row"><label class="rx-entry-doctor">${rxBilingual('ឈ្មោះវេជ្ជបណ្ឌិត')}${doctors}</label><div class="rx-entry-medicine-picker"><button type="button" class="btn rx-entry-search-button" data-a="rxsearch" aria-expanded="${rxEntrySearchOpen}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></svg>ស្វែងរកថ្នាំ</button><div class="rx-entry-medicine-search" ${rxEntrySearchOpen ? '' : 'hidden'}><label class="rx-entry-medicine-query"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></svg><input class="in" id="rx-entry-search" placeholder="ស្វែងរកថ្នាំ / Search Medicine..." value="${esc(rxEntrySearch)}"></label><div id="rx-entry-medicine-list" class="rx-entry-medicine-list">${rxEntryMedicineSearch()}</div></div></div></div>
    <div class="rx-entry-disease-row"><span class="rx-entry-book-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5a2 2 0 0 1 2-2h5.5v16H6a2 2 0 0 0-2 2zM20 5.5a2 2 0 0 0-2-2h-5.5v16H18a2 2 0 0 1 2 2z"/></svg></span><b>ជំងឺ / ស្ថានភាព:<small>ជ្រើសរើសទម្រង់ជំងឺ</small></b><input class="in" name="disease" value="${esc(data.disease || '')}" placeholder="បញ្ចូលឈ្មោះជំងឺ ឬជ្រើសរើសទម្រង់"><button type="button" class="btn s" data-a="rxshowtemplates" aria-expanded="${rxTemplatePickerOpen}">ទម្រង់</button><div id="rx-template-list" class="rx-entry-choice-list rx-entry-template-list" ${rxTemplatePickerOpen ? '' : 'hidden'}>${diseaseOptions.map((template) => `<button type="button" data-a="rxquicktemplate:${D.rx.indexOf(template)}">${esc(template.name)}</button>`).join('') || '<span>មិនមានទម្រង់ទេ</span>'}</div></div>
    <div class="rx-entry-table-wrap"><table class="rx-entry-table"><colgroup><col class="rx-col-medicine"><col class="rx-col-dose"><col class="rx-col-dose"><col class="rx-col-dose"><col class="rx-col-dose"><col class="rx-col-duration"><col class="rx-col-quantity"><col class="rx-col-instructions"></colgroup><thead><tr>${['ឈ្មោះថ្នាំ','ព្រឹក','ថ្ងៃត្រង់','ល្ងាច','យប់','រយៈពេល (ថ្ងៃ)','ចំនួន','ការណែនាំ'].map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody id="rx-entry-rows">${rxEntryRowsHtml()}</tbody></table></div>
    <label class="rx-entry-notes">${rxBilingual('កំណត់ចំណាំ')}<textarea class="in" name="notes" rows="3" placeholder="បញ្ចូលកំណត់ចំណាំ">${esc(data.notes || record && record.notes || '')}</textarea></label>
  </div>`, async (form) => savePrescription(form), { cls: 'xl rx-entry-dialog', ok: 'រក្សាទុកវេជ្ជបញ្ជា', hideCancel: true, close: true, closeLabel: 'បិទ', extra: `<div class="rx-entry-actions"><button type="submit" class="btn p">រក្សាទុក</button>${rxPrintFormatControl(data.print_format || 'A')}<button type="button" class="btn" data-a="rxprintdraft">${printerIcon()} បោះពុម្ព</button><button type="button" class="btn g" data-a="rxsavebill">រក្សាទុក និងចេញវិក្កយបត្រ</button></div><button type="button" class="btn s rx-portal-revoke" data-a="rxportalrevoke">បិទតំណ Patient Portal ទាំងអស់</button><button type="button" class="btn s rx-entry-footer-close" data-a="close">× បិទ</button>` });
  if (record) $('#mf').dataset.rxRecordId = String(record.id);
}
function applyPrescriptionTemplate(template = null) {
  const form = $('#mf'), name = String(form.elements.namedItem('disease').value || '').trim();
  template = template || (D.rx || []).find((item) => String(item.name || '').trim().toLocaleLowerCase() == name.toLocaleLowerCase());
  if (!template) return toast('រកមិនឃើញទម្រង់ជំងឺទេ');
  form.elements.namedItem('disease').value = template.name;
  rxEntryRows = rxTemplateMeds(template.meds).map((item) => {
    const medicine = D.med.find((candidate) => (item.medicine_id && String(candidate.id) == String(item.medicine_id)) || candidate.name.toLocaleLowerCase() == String(item.name).toLocaleLowerCase());
    return { ...item, medicine_id: medicine ? medicine.id : item.medicine_id, name: medicine ? medicine.name : String(item.name || ''), price: medicine ? Number(medicine.price) || 0 : Number(item.price) || 0, quantity: item.quantity || 1 };
  });
  rxTemplatePickerOpen = false;
  $('#rx-template-list').hidden = true;
  const templateButton = document.querySelector('[data-a="rxshowtemplates"]');
  if (templateButton) templateButton.setAttribute('aria-expanded', 'false');
  $('#rx-entry-rows').innerHTML = rxEntryRowsHtml();
}
function togglePrescriptionMedicine(id, selected) {
  const medicine = D.med.find((item) => String(item.id) == String(id));
  if (!medicine) {
    if (selected) toast('រកមិនឃើញថ្នាំទេ');
    return;
  }
  if (selected) {
    if (!rxEntryRows.some((row) => String(row.medicine_id) == String(medicine.id))) {
      rxEntryRows.push({
        medicine_id: medicine.id,
        name: medicine.name,
        price: Number(medicine.price) || 0,
        morning: medicine.default_morning || RX_DEFAULT_MEDICINE_DOSAGE.morning,
        noon: medicine.default_noon || RX_DEFAULT_MEDICINE_DOSAGE.noon,
        evening: medicine.default_evening || RX_DEFAULT_MEDICINE_DOSAGE.evening,
        night: medicine.default_night || RX_DEFAULT_MEDICINE_DOSAGE.night,
        duration: Number(medicine.default_duration) > 0 ? String(medicine.default_duration) : RX_DEFAULT_MEDICINE_DOSAGE.duration,
        quantity: Number(medicine.default_quantity) > 0 ? Number(medicine.default_quantity) : RX_DEFAULT_MEDICINE_DOSAGE.quantity,
        instruction: ''
      });
    }
  } else {
    rxEntryRows = rxEntryRows.filter((row) => String(row.medicine_id) != String(medicine.id));
  }
  $('#rx-entry-rows').innerHTML = rxEntryRowsHtml();
  $('#rx-entry-medicine-list').innerHTML = rxEntryMedicineSearch();
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
const schBillable = (r) => { const d = jd(r); const billable = d.billable; return billable === true || billable === 1 || billable === '1'; };
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

function patientAppointmentForm() {
  const patient = curPt();
  if (!patient) return;
  const today = ymd(new Date());
  const textArea = (label, key, placeholder) => `<label class="fl">${T(label)}<textarea class="in" name="${key}" rows="3" placeholder="${esc(T(placeholder))}"></textarea></label>`;
  const body = `<div class="patient-appointment-form">
    ${fIn('កាលបរិច្ឆេទណាត់ជួប', 'date', today, 'date', 'required')}
    ${fIn('ម៉ោងណាត់ជួប', 'time', '', 'time')}
    ${fIn('ឈ្មោះគ្រូពេទ្យ', 'doc', '', 'text', `placeholder="បញ្ចូលឈ្មោះគ្រូពេទ្យ"`)}
    ${fIn('សេវាកម្ម', 'svc', '', 'text', `placeholder="បញ្ជាក់សេវាកម្ម"`)}
    ${fIn('Telesales', 'telesales', '', 'text', `placeholder="បញ្ចូលព័ត៌មាន Telesales"`)}
    ${fIn('Pancake', 'pancake', '', 'text', `placeholder="បញ្ជាក់ Pancake"`)}
    ${textArea('ការពិពណ៌នា', 'description', 'បញ្ចូលមូលហេតុនៃការណាត់ជួប')}
    ${textArea('ចំណាំ', 'notes', 'បញ្ចូលកំណត់ចំណាំ')}
    ${fIn('កាលបរិច្ឆេទរំលឹក', 'reminder_date', '', 'date')}
  </div>`;
  openForm(`បង្កើតការណាត់ជួបសម្រាប់ ${esc(patient.name)}`, body, async (form) => {
    const values = Object.fromEntries(new FormData(form));
    if (!values.date) throw new Error(T('Appointment date is required'));
    await api('POST', 'appointments', {
      name: patient.name,
      patient_id: patient.id,
      phone: patient.phone || '',
      date: values.date,
      time: values.time || '',
      doc: values.doc || '',
      svc: values.svc || '',
      telesales: values.telesales || '',
      pancake: values.pancake || '',
      description: values.description || '',
      notes: values.notes || '',
      reminder_date: values.reminder_date || '',
      reminder_status: values.reminder_date ? 'Pending' : '',
      st: 'Waiting'
    });
    await load();
    render();
    toast(T('Saved'));
  }, {
    cls: 'patient-appointment-form-dialog',
    close: true,
    closeLabel: T('Close'),
    ok: 'រក្សាទុក',
    hideCancel: true,
    extra: '<button type="button" class="btn" data-a="close">បោះបង់</button>'
  });
}

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

function patientFollowupDate(date, offset) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function patientFollowupPreview(updateDate = false) {
  const form = $('#mf'), preview = $('#patient-followup-preview');
  if (!form || !preview) return;
  const daysInput = form.querySelector('[name="days_until_return"]'), dateInput = form.querySelector('[name="date"]');
  const days = Math.min(365, Math.max(1, Number(daysInput?.value) || 1));
  if (updateDate && dateInput) dateInput.value = patientFollowupDate(ymd(new Date()), days);
  const date = dateInput?.value || '';
  const displayDate = (value) => value ? new Intl.DateTimeFormat('en-US').format(new Date(`${value}T12:00:00`)) : '—';
  const patientId = form.dataset.patientFollowupId;
  const previous = followUpRows().filter((appointment) => String(appointment.patient_id) === String(patientId))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((appointment, index) => `<li>លើកទី ${index + 1}: ${esc(displayDate(appointment.date))}</li>`);
  if (date) previous.push(`<li>លើកទី ${previous.length + 1}: ${esc(displayDate(date))} (ក្រោយ ${days} ថ្ងៃ)</li>`);
  preview.innerHTML = previous.join('') || '<li>មិនទាន់មានប្រវត្តិទេ។</li>';
}

function patientFollowupScheduleForm(patientId) {
  const patient = ptById(patientId);
  if (!patient) return toast('រកមិនឃើញអ្នកជំងឺទេ។');
  const startDate = patientFollowupDate(ymd(new Date()), 1);
  const defaultCategory = patient.type === 'IPD' ? 'IPD' : patient.nssf ? 'NSSF' : 'OPD';
  const categories = [['OPD', 'បញ្ជីអ្នកជំងឺ OPD'], ['IPD', 'បញ្ជីអ្នកជំងឺ IPD'], ['NSSF', 'បញ្ជី NSSF']];
  const body = `<div class="patient-followup-schedule">
    <p class="patient-followup-schedule-intro">តើអ្នកជំងឺមកលើកក្រោយមែនទេ? ការធ្វើបែបនេះនឹងផ្លាស់ទីអ្នកជំងឺទៅលើគេ។</p>
    <div class="patient-followup-schedule-fields">
      <label>ចំនួនថ្ងៃត្រូវមកពិនិត្យឡើងវិញ<input class="in" name="days_until_return" type="number" min="1" max="365" value="1" required></label>
      <label>កាលបរិច្ឆេទមកពិនិត្យឡើងវិញ<input class="in" name="date" type="date" value="${esc(startDate)}" required></label>
    </div>
    <div class="patient-followup-intervals" role="group" aria-label="ជ្រើសរើសចំនួនថ្ងៃត្រូវមកពិនិត្យឡើងវិញ">${[1, 3, 7, 14].map((days) => `<button type="button" class="btn p" data-a="ptmoreinterval:${days}">${days}</button>`).join('')}</div>
    <fieldset class="patient-followup-categories"><legend>បញ្ជូនទៅកាន់បញ្ជី</legend>${categories.map(([category, label]) => `<label class="cb"><input type="checkbox" name="categories" value="${category}" ${category === defaultCategory ? 'checked' : ''}> ${label}</label>`).join('')}</fieldset>
    <section class="patient-followup-preview"><h3>ប្រវត្តិការមកពិនិត្យឡើងវិញ</h3><ol id="patient-followup-preview"></ol></section>
  </div>`;
  $('#mf').dataset.patientFollowupId = String(patient.id);
  openForm('បញ្ជាក់ការមកពិនិត្យឡើងវិញ', body, async (form) => {
    const values = new FormData(form);
    const date = String(values.get('date') || ''), days = Math.min(365, Math.max(1, Number(values.get('days_until_return')) || 1));
    const selectedCategories = values.getAll('categories');
    if (!date) throw new Error('សូមបញ្ចូលកាលបរិច្ឆេទណាត់ជួប');
    if (!selectedCategories.length) throw new Error('សូមជ្រើសរើសប្រភេទអ្នកជំងឺយ៉ាងតិចមួយ');
    await api('POST', 'appointments', {
      name: patient.name,
      patient_id: patient.id,
      phone: patient.phone || '',
      type: 'Follow Up',
      svc: selectedCategories.join(', '),
      date,
      time: '',
      doc: '',
      st: 'Waiting',
      reminder_date: '',
      reminder_status: 'Pending',
      notes: `មកពិនិត្យឡើងវិញក្រោយ ${days} ថ្ងៃ`
    });
    await load();
    render();
    toast('បានរក្សាទុក');
  }, { cls: 'patient-followup-schedule-dialog', close: true, closeLabel: 'បិទ', ok: 'រក្សាទុក', cancelLabel: 'បោះបង់' });
  patientFollowupPreview();
}

document.addEventListener('input', (event) => {
  if (event.target.closest && event.target.closest('.patient-followup-schedule')) patientFollowupPreview(event.target.name === 'days_until_return');
});
document.addEventListener('change', (event) => {
  if (event.target.closest && event.target.closest('.patient-followup-schedule')) patientFollowupPreview(event.target.name === 'days_until_return');
});

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
async function importPatientsFile(file) {
  if (!file) return;
  try {
    if (!/\.xlsx$/i.test(file.name || '')) throw new Error(T('Choose an Excel workbook (.xlsx)'));
    if (file.size > 1e6) throw new Error(T('Import file must be smaller than 1 MB'));
    const response = await fetch(API_BASE + '/api/patients/import-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: await file.arrayBuffer(),
    });
    const result = await response.json().catch(() => null);
    if (response.status == 401 && tok) logout();
    if (response.status == 404) throw new Error(T('Patient import API not found. Restart or redeploy the backend, then try again.'));
    if (!response.ok) throw new Error(result && result.error || T('Request failed'));
    await load();
    q = '';
    render();
    toast(`${T('Imported')} ${result.imported} ${T('patients')}`);
  } catch (error) { toast(error.message); }
}
document.addEventListener('change', (event) => {
  if (event.target.id == 'pt-import-file') return importPatientsFile(event.target.files[0]).finally(() => { event.target.value = ''; });
});

// ---------- click dispatcher (called from app.js for actions it does not know) ----------
function pAct(a, x, y, el) {
  const rec = () => recs.find((r) => r.id == x);
  if (a == 'reg') regForm(); else if (a == 'regedit') regForm(D.pt[+x]); else if (a == 'open') openPatient(+x).catch((e) => toast(e.message));
  else if (a == 'ptimport') $('#pt-import-file').click();
  else if (a == 'patient-doctype-menu') { documentTypeMenuOpen = !documentTypeMenuOpen; render(); }
  else if (a == 'patient-doctype') { if (PATIENT_DOCUMENT_TYPES.some(([key]) => key == x)) { documentTypeKey = x; documentTypeMenuOpen = false; render(); if (x == 'referral') legacyPatientReferralForm(); else if (x == 'referral-letter') patientReferralForm(); else if (x == 'hospital') patientHospitalForm(); else if (x == 'treatment') patientTreatmentForm(); else if (x == 'medical-card') patientMedicalCardList(); else if (x == 'health') patientHealthForm(); else if (x == 'birth') patientBirthForm(); else if (x == 'medical-rest-a') patientMedicalRestAForm(); else if (x == 'prescription-note') patientPrescriptionNoteForm(); } }
  else if (a == 'patient-document-upload') { documentTypeKey == 'referral' ? legacyPatientReferralForm() : documentTypeKey == 'referral-letter' ? patientReferralForm() : documentTypeKey == 'hospital' ? patientHospitalForm() : documentTypeKey == 'treatment' ? patientTreatmentForm() : documentTypeKey == 'medical-card' ? patientMedicalCardList() : documentTypeKey == 'health' ? patientHealthForm() : documentTypeKey == 'birth' ? patientBirthForm() : documentTypeKey == 'medical-rest-a' ? patientMedicalRestAForm() : documentTypeKey == 'prescription-note' ? patientPrescriptionNoteForm() : patientDocumentUploadForm(); }
  else if (a == 'patient-medical-card-new') patientMedicalCardForm();
  else if (a == 'patient-medical-card-print-draft') patientMedicalCardPrint(Object.fromEntries(new FormData($('#mf'))), $('#mf [name="medical_card_date"]').value);
  else if (a == 'patient-medical-card-print') { const record = rec(); if (record) patientMedicalCardPrint(jd(record), record.date); }
  else if (a == 'patient-health-print-draft') patientHealthPrint(Object.fromEntries(new FormData($('#mf'))), $('#mf [name="health_date"]').value);
  else if (a == 'patient-health-print') { const record = rec(); if (record) patientHealthPrint(jd(record), record.date); }
  else if (a == 'patient-birth-print-draft') patientBirthPrint(Object.fromEntries(new FormData($('#mf'))));
  else if (a == 'patient-birth-print') { const record = rec(); if (record) patientBirthPrint(jd(record)); }
  else if (a == 'patient-medical-rest-a-print-draft') patientMedicalRestAPrint(Object.fromEntries(new FormData($('#mf'))));
  else if (a == 'patient-medical-rest-a-print') { const record = rec(); if (record) patientMedicalRestAPrint(jd(record)); }
  else if (a == 'patient-prescription-note-print-draft') patientPrescriptionNotePrint(Object.fromEntries(new FormData($('#mf'))));
  else if (a == 'patient-prescription-note-print') { const record = rec(); if (record) patientPrescriptionNotePrint(jd(record)); }
  else if (a == 'patient-referral-clear') $('#mf').reset();
  else if (a == 'patient-referral-report-print-draft') legacyPatientReferralPrint(collectLegacyPatientReferralData($('#mf')), $('#mf [name="referral_date"]').value);
  else if (a == 'patient-referral-letter-print-draft') patientReferralPrint(collectPatientReferralData($('#mf')), $('#mf [name="referral_date"]').value);
  else if (a == 'patient-referral-print') { const record = rec(); if (record) (jd(record).document_type == 'referral-letter' ? patientReferralPrint : legacyPatientReferralPrint)(jd(record), record.date); }
  else if (a == 'patient-hospital-print-draft') { const data = collectPatientHospitalData($('#mf')); data.patient_name = curPt()?.name || ''; patientHospitalPrint(data, data.admission_date); }
  else if (a == 'patient-hospital-print') { const record = rec(); if (record) patientHospitalPrint(jd(record), record.date); }
  else if (a == 'patient-treatment-print-draft') patientTreatmentPrint(Object.fromEntries(new FormData($('#mf'))));
  else if (a == 'patient-treatment-print') { const record = rec(); if (record) patientTreatmentPrint(jd(record), (record.date || '').slice(0, 10)); }
  else if (a == 'fuadd') followUpForm();
  else if (a == 'fuedit') followUpForm(Number(x));
  else if (a == 'fudone') return completePatientFollowUp(Number(x));
  else if (a == 'furemind') markFollowUpReminderSent(Number(x));
  else if (a == 'fuopen') openPatient(Number(x)).catch((e) => toast(e.message));
  else if (a == 'pdschedule-followup') followUpForm(null, x ? Number(x) : pdId);
  else if (a == 'ptmore') patientFollowupScheduleForm(Number(x));
  else if (a == 'ptapadd') patientAppointmentForm();
  else if (a == 'ptmoreinterval') {
    const days = $('#mf [name="days_until_return"]');
    if (days) { days.value = String(Math.min(365, Math.max(1, Number(x) || 1))); patientFollowupPreview(true); }
  }
  else if (a == 'agem') { $('#agebox').dataset.mode = x; document.querySelectorAll('#agem button').forEach((b) => b.classList.toggle('on', b.dataset.a == 'agem:' + x)); }
  else if (a == 'vsbtn') { $('#vsbox').hidden = !$('#vsbox').hidden; } else if (a == 'regprint') regPrint();
  else if (a == 'vaxaddfield') {
    const countInput = $('#vax-dose-count'), count = Math.max(VACCINE_DOSE_COUNT, Number(countInput.value) || 0);
    $('#vax-dose-rows').insertAdjacentHTML('beforeend', vaccineRow({}, count));
    countInput.value = count + 1;
  }
  else if (a == 'opaddphysician') $('#operation-participants').insertAdjacentHTML('beforeend', operationParticipantRow());
  else if (a == 'opremovephysician') el.closest('.operation-participant-row').remove();
  else if (a == 'rtab') { ptab = x; try { sessionStorage.setItem('currentPatientTab', ptab); } catch (e) { /* retain the current view */ } render(); } else if (a == 'radd') { ptab == 'vitals' ? vsForm() : ptab == 'medical' ? mrForm() : ptab == 'schedule' ? schForm() : ptab == 'consultation' ? consultationFormPicker() : ptab == 'lab' ? labResultPicker() : ptab == 'echo' ? echoReportForm() : ptab == 'medlist' ? medlistForm() : genForm(); }
  else if (a == 'medlist-add') addMedlistDispenseItem(x, y);
  else if (a == 'medlist-adjust') adjustMedlistDispense(Number(x), Number(y));
  else if (a == 'medlist-save') saveMedlistDispense().catch((error) => toast(error.message));
  else if (a == 'medlist-md-order') prescriptionForm();
  else if (a == 'medlist-history-edit') medlistHistoryEdit(x, Number(y));
  else if (a == 'medlist-history-delete') medlistHistoryDelete(x);
  else if (a == 'medlist-tab') {
    medlistTab = x;
    medlistQuery = '';
    const search = $('#medlist-search');
    if (search) {
      search.value = '';
      search.placeholder = x == 'services' ? 'ស្វែងរកសេវាកម្ម / Search Service...' : 'ស្វែងរកថ្នាំ / Search Medicine...';
    }
    document.querySelectorAll('.medlist-tab').forEach((button) => {
      const active = button.dataset.a == 'medlist-tab:' + x;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
    });
    refreshMedlistDialog();
  }
  else if (a == 'medlist-remove') {
    medlistItems = medlistItems.filter((item) => !(item.type == x && String(item.item_id) == String(y)));
    refreshMedlistDialog();
  }
  else if (a == 'rxentryremove') { rxEntryRows.splice(Number(x), 1); $('#rx-entry-rows').innerHTML = rxEntryRowsHtml(); }
  else if (a == 'rxapplytemplate') applyPrescriptionTemplate();
  else if (a == 'rxquicktemplate') applyPrescriptionTemplate(D.rx[Number(x)]);
  else if (a == 'rxshowtemplates') { rxTemplatePickerOpen = !rxTemplatePickerOpen; $('#rx-template-list').hidden = !rxTemplatePickerOpen; el.setAttribute('aria-expanded', rxTemplatePickerOpen); }
  else if (a == 'rxdiagnosis') $('#mf').elements.namedItem('diagnosis').value = decodeURIComponent(x);
  else if (a == 'rxsearch') {
    const search = $('#rx-entry-search'), panel = search.closest('.rx-entry-medicine-search');
    if (!panel) return toast('Medicine search panel is unavailable');
    rxEntrySearchOpen = panel.hidden;
    panel.hidden = !rxEntrySearchOpen;
    el.setAttribute('aria-expanded', rxEntrySearchOpen);
    if (rxEntrySearchOpen) search.focus();
  }
  else if (a == 'rxprintdraft') { const data = rxEntryCollect($('#mf')); rxEntryPrint(data, curPt(), data.print_format).catch((error) => toast(error.message)); }
  else if (a == 'rxportalrevoke') revokePatientPortalAccess().catch((error) => toast(error.message));
  else if (a == 'rxsavebill') savePrescription($('#mf'), true).catch((error) => toast(error.message));
  else if (a == 'rxprint') { const record = rec(); if (record) rxPrintPicker(jd(record), curPt()); }
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
  else if (a == 'redit') { const r = rec(); r.kind == 'documents' && jd(r).document_type == 'hospital' ? patientHospitalForm(r) : r.kind == 'documents' && jd(r).document_type == 'treatment' ? patientTreatmentForm(r) : r.kind == 'documents' && jd(r).document_type == 'health' ? patientHealthForm(r) : r.kind == 'documents' && jd(r).document_type == 'birth' ? patientBirthForm(r) : r.kind == 'documents' && jd(r).document_type == 'medical-rest-a' ? patientMedicalRestAForm(r) : r.kind == 'documents' && jd(r).document_type == 'prescription-note' ? patientPrescriptionNoteForm(r) : r.kind == 'documents' && jd(r).document_type == 'medical-card' ? patientMedicalCardForm(r) : r.kind == 'documents' && jd(r).document_type == 'referral' ? legacyPatientReferralForm(r) : r.kind == 'documents' && jd(r).document_type == 'referral-letter' ? patientReferralForm(r) : r.kind == 'prescription' ? prescriptionForm(r) : r.kind == 'medlist' ? medlistForm(r) : r.kind == 'vitals' ? vsForm(r) : r.kind == 'medical' ? mrForm(r) : r.kind == 'schedule' ? schForm(r) : r.kind == 'mrd' ? mrdForm(r) : r.kind == 'lab' && jd(r).lab_attachment ? genForm(r) : r.kind == 'lab' ? labResultForm(D.lab.find((lab) => String(lab.id) == String(jd(r).template_id)) || { id: jd(r).template_id, name: jd(r).test_name || r.title, cat: jd(r).category, price: jd(r).price, fields: JSON.stringify(jd(r).fields || []) }, r) : r.kind == 'cnf' ? cnfForm(r) : r.kind == 'consultation' && jd(r).consultation_mode == 'center' ? centerForm(r) : r.kind == 'consultation' && jd(r).consultation_mode ? consultationForm(jd(r).consultation_mode, r) : genForm(r); }
  else if (a == 'rdel') { if (confirm(T('Delete this record?'))) api('DELETE', 'records/' + x).then(loadRecs).then(render).catch((e) => toast(e.message)); }
  else if (a == 'rprint') { const r = rec(); printDoc('Medical Record', ptBlock(curPt()) + `<p>${esc((r.date || '').replace('T', ' '))}</p>` + mrPrintHtml(jd(r))); }
  else if (a == 'contractprint') { const r = rec(); if (r) contractPrint(r); }
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
  else if (t.dataset && t.dataset.rxEntryField == 'instruction') {
    const row = rxEntryRows[Number(t.dataset.rxEntryIndex)];
    if (row) row.instruction = t.value;
  }
  else if (t.dataset && t.dataset.medlistItemType) {
    toggleMedlistItem(t.dataset.medlistItemType, t.dataset.medlistItemId, t.checked);
  }
  else if (t.dataset && t.dataset.medlistFlag) {
    const [index, flag] = t.dataset.medlistFlag.split(':');
    const item = medlistDispenseItems[Number(index)];
    if (item && ['home', 'md', 'ipd'].includes(flag)) item[flag] = t.checked;
  }
  else if (t.dataset && t.dataset.medlistQuantity != null) {
    setMedlistDispenseQuantity(Number(t.dataset.medlistQuantity), t.value);
  }
  else if (t.dataset && t.dataset.rxMedicineSelect != null) {
    togglePrescriptionMedicine(t.dataset.rxMedicineSelect, t.checked);
  }
  else if (t.dataset && t.dataset.fill && t.value) { const ta = t.parentElement.querySelector('textarea'); ta.value = (ta.value ? ta.value.replace(/[,\s]+$/, '') + ', ' : '') + t.value; t.value = ''; }
});
document.addEventListener('input', (e) => {
  if (['payall_discount_input', 'payall_discount_currency'].includes(e.target.name)) payAllDiscountRefresh();
  else if (['received', 'all_discount'].includes(e.target.name) && $('#mf').classList.contains('payall-dialog')) payAllRefresh();
  else if (e.target.id == 'rx-entry-search') {
    rxEntrySearch = e.target.value;
    const list = $('#rx-entry-medicine-list');
    if (list) list.innerHTML = rxEntryMedicineSearch();
  }
  else if (e.target.id == 'medlist-search') {
    medlistQuery = e.target.value;
    const catalog = $('#medlist-catalog');
    if (catalog) catalog.innerHTML = medlistCatalogHtml();
  }
  else if (e.target.id == 'medlist-dispense-search') {
    medlistDispenseQuery = e.target.value;
    const list = $('#medlist-dispense-list');
    if (list) list.innerHTML = medlistDispenseCatalogHtml();
  }
  else if (e.target.classList && e.target.classList.contains('rx-entry-dose')) {
    const row = rxEntryRows[Number(e.target.dataset.rxEntryIndex)];
    if (row) {
      row[e.target.dataset.rxEntryField] = e.target.value;
      const total = e.target.closest('tr') && e.target.closest('tr').querySelector('td:nth-last-child(2) b');
      if (total) total.textContent = K((+row.price || 0) * (+row.quantity || 0));
    }
  }
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
const ptRows = () => {
  const priority = new Map();
  followUpRows().filter((appointment) => !['Done', 'Cancelled'].includes(appointment.st)).forEach((appointment) => {
    const patientId = String(appointment.patient_id), appointmentId = Number(appointment.id) || 0;
    if (appointmentId > (priority.get(patientId) || 0)) priority.set(patientId, appointmentId);
  });
  return ft('pt').filter(([r]) => tabOk(r) && colOk(r))
    .sort(([a], [b]) => (priority.get(String(b.id)) || 0) - (priority.get(String(a.id)) || 0));
};
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
const act = (r, i) => `<button class="sq b" data-a="regedit:${i}" title="Edit">✎</button> <button class="sq patient-more-action" data-a="ptmore:${r.id}" title="${T('More')}" aria-label="${T('More')}">☑</button> <button class="sq r" data-a="del:pt:${i}" title="Delete">🗑</button>`;
const ptNm = (r, sm = true) => `<div class="pn"><div><a href="#" data-a="open:${r.id}">${esc(r.name)}</a>${sm && r.latin_name ? `<small class="pl">${esc(r.latin_name)}</small>` : ''}</div><span class="ic"><a href="#" data-a="open:${r.id}" title="Open patient file">👁</a><a href="#" data-a="ptadmit:${r.id}" title="${r.type == 'IPD' ? 'Discharge' : 'Admit to IPD'}">${r.type == 'IPD' ? '🚪' : '🛏'}</a><a href="#" data-a="ptprint:${r.id}" title="Print patient card">${printerIcon()}</a></span></div>`;
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
  return `<div class="tools" style="margin-bottom:12px">${sr('Search Name, Phone, NSSF, National ID…')}<button class="btn p" data-a="reg">+ Add Patient</button><div class="tabs">${PTAB.map(([k, l]) => `<button class="${tab == k ? 'on' : ''}" data-a="tab:${k}">${l}</button>`).join('')}</div><button class="btn ${ptColsOpen ? 'on2' : ''}" data-a="ptcols">☰ Columns</button><button class="btn ${ptFilt ? 'on2' : ''}" data-a="ptfilt">Filters</button><button class="btn" id="pfclr" data-a="pfclear" ${pfActive().length ? '' : 'hidden'}>✕ Clear filters</button><button class="btn" data-a="ptimport">Import Excel</button><input type="file" id="pt-import-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="btn" data-a="csv">Export Excel</button></div>${panel}
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
  const printDateInput = $('#tf-print-date');
  const printDate = printDateInput ? printDateInput.value || ymd(new Date()) : ymd(new Date());
  const rows = tfRows.map((r, i) => `<div class="tf-row"><div><input class="in" type="datetime-local" name="tf-date-${i}" value="${esc(r.date || nowLocal())}"><textarea class="in" name="tf-vitals-${i}">${esc(r.vitals ?? TF_VITALS_TEMPLATE)}</textarea></div>
<textarea class="in" name="tf-diagnosis-${i}" placeholder="${T("Describe patient's condition, symptoms, or diagnosis")}">${esc(r.diagnosis || '')}</textarea>
<textarea class="in" name="tf-notes-${i}" placeholder="${T('Prescribed medication, treatment plan, or notes...')}">${esc(r.notes || '')}</textarea>
<div class="tf-actions"><button type="button" class="btn s r" data-a="tfremove:${i}" title="${T('Remove row')}">✕</button></div></div>`).join('');
  const history = tfShowHistory ? `<div class="tf-history"><h4>${T('Treatment History')}</h4>${tfHistory.map((r) => {
    const d = jd(r);
    return `<div class="tf-history-row"><div><b>${esc((r.date || '').replace('T', ' '))}</b><div>${esc(d.diagnosis || '')}</div><div class="mu">${esc(r.notes || '')}</div></div><div class="tools"><button type="button" class="btn s" data-a="tfedit:${r.id}">${T('Edit')}</button><button type="button" class="btn s r" data-a="tfdelete:${r.id}" title="${T('Delete this record?')}">✕</button></div></div>`;
  }).join('') || `<p class="emp">${T('No history records yet.')}</p>`}</div>` : '';
  openForm(`${T('Treatment Follow-up')} — ${esc(p.name)}`, `<div class="tf-patient">${T('Patient')}: ${esc(p.name)} &nbsp;|&nbsp; ${T('Age')}: ${esc(fmtAge(p))} &nbsp;|&nbsp; ${T('Sex')}: ${esc(fmtSex(p.sex) || 'N/A')}</div>
<div class="tf-toolbar"><button type="button" class="btn" data-a="tfhistory">${tfShowHistory ? T('Hide History') : T('View History')}</button><button type="button" class="btn g" data-a="tfadd">+ ${T('Add New Treatment Row')}</button><label class="tf-print-date-picker"><input class="in" id="tf-print-date" type="date" aria-label="កាលបរិច្ឆេទ / Date" value="${esc(printDate)}"></label><button type="button" class="btn" data-a="tfprint">Print All Records</button></div>
<div class="tf-grid"><div class="tf-columns"><b>${T('Date / Vital Signs')}</b><b>${T('Diagnosis / Evolution')}</b><b>${T('Treatment / Notes')}</b><b>${T('Actions')}</b></div>${rows || `<p class="emp">${T('Add a treatment row to begin.')}</p>`}</div>${history}`,
  async () => {
    const draftRows = tfDraftRows();
    const savedRows = draftRows.filter((r) => r.date && (r.vitals.trim() || r.diagnosis.trim() || r.notes.trim()));
    if (!savedRows.length) throw new Error(T('Enter treatment details before saving'));
    for (const r of savedRows) {
      const body = { patient_id: tfPatientId, kind: 'treatment', title: 'Treatment Follow-up', date: r.date, notes: r.notes, data: { vitals: r.vitals, diagnosis: r.diagnosis } };
      if (r.id) await api('PUT', 'records/' + r.id, body);
      else {
        const created = await api('POST', 'records', body);
        r.id = created.id;
      }
    }
    await load();
    tfHistory = (await api('GET', 'records?patient_id=' + tfPatientId + '&kind=treatment&limit=5000')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
    if (pdId == tfPatientId) await loadRecs();
    tfRows = draftRows;
    tfShowHistory = true;
    render();
    tfRender();
    toast('Saved');
  }, { cls: 'xl treatment-followup', ok: 'Save Record', keepOpen: true });
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
function tfPrintAll(selectedDate = $('#tf-print-date').value) {
  const p = ptById(tfPatientId);
  if (!p) return toast('Patient not found.');
  if (!selectedDate) return toast('Select a date before printing.');
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
  const printDate = fmtD(selectedDate);
  const body = `<section class="tf-print">
<h2 class="tf-print-title"><span>ការតាមដានការព្យាបាល</span><small>TREATMENT FOLLOW-UP CHART</small></h2>
<div class="tf-print-patient">
  <div><b>ឈ្មោះអ្នកជំងឺ / Patient name:</b> ${esc(p.name || '')}</div><div><b>ភេទ / Sex:</b> ${esc(fmtSex(p.sex) || 'N/A')}</div>
  <div><b>អាយុ / Age:</b> ${esc(fmtAge(p))}</div>    <div><b>កាលបរិច្ឆេទ / Date:</b> ${printDate}</div>
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
  const targetPid = Number(pdId || pid);
  const list = await api('GET', 'records?patient_id=' + targetPid + '&limit=5000'), due = billTotals(list).bal;
  if (!(due > 0)) return toast('Paid');
  if (!payAll) {
    openForm('Record payment', `<p>${esc(p.name)} — Amount due: <b>${K(due)}</b> <span class="mu">(${usd(due)})</span></p>${fIn('Amount paid (KHR)', 'amount', due, 'number', `min="1" max="${due}" required`)}${fSel('Method', 'method', 'Cash', ['Cash', 'Bank'])}`, async (f) => {
      const rawAmount = readFormValue(f, 'amount', 'received', 'paid_amount', 'applied_amount');
      const rawMethod = readFormValue(f, 'method', 'payment_method', 'pay_method');
      const amt = Math.round(Number(rawAmount) || 0);
      const method = String(rawMethod || 'Cash');
      const livePid = Number(pdId || targetPid || pid);
      const liveList = await api('GET', 'records?patient_id=' + livePid + '&limit=5000');
      const liveDue = billTotals(liveList).bal;
      if (amt < 1) throw new Error('Enter an amount');
      if (amt > liveDue) throw new Error('Amount is more than the balance');
      if (!['Cash', 'Bank'].includes(method)) throw new Error('Choose a payment method');
      const outstandingItems = billingOutstandingItems(liveList);
      await api('POST', 'records', { patient_id: livePid, kind: 'payment', date: ymd(new Date()), data: { amount: amt, applied_amount: amt, method, item_count: outstandingItems.length, paid_at: nowLocal() } });
      await load(); if (rt == 'pd' && pdId == livePid) await loadRecs(); render(); toast('Saved');
    }, { cls: 'wide', ok: 'Save' });
    return;
  }
  const liveList = await api('GET', 'records?patient_id=' + targetPid + '&limit=5000');
  const liveDue = billTotals(liveList).bal;
  const outstandingItems = billingOutstandingItems(liveList);
  const itemRows = outstandingItems.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${item.quantity || 1}</td><td>${K(item.price)}</td></tr>`).join('');
  const methodOptions = [['Cash', payAllLabel('សាច់ប្រាក់', 'Cash')], ['Bank', payAllLabel('ធនាគារ', 'Bank')]];
  payAllContext = { pid: targetPid, list: liveList, due: liveDue, items: outstandingItems, selectedIndexes: [], discountInput: 0, discountCurrency: 'KHR', allDiscountInput: 0, allDiscountCurrency: 'KHR' };
  const body = `<section class="payall-patient"><div><small>${payAllLabel('អ្នកជំងឺ', 'Patient')}</small><b>${esc(p.name)}</b></div><div><small>${payAllLabel('សេវាមិនទាន់បង់', 'Unpaid services')}</small><b>${outstandingItems.length}</b></div></section>
    <div class="payall-items-wrap"><table class="payall-items"><thead><tr><th>${payAllLabel('ល.រ', 'No.')}</th><th>${payAllLabel('សេវាកម្ម / បរិយាយ', 'Service / Description')}</th><th>${payAllLabel('ចំនួន', 'Qty')}</th><th>${payAllLabel('ទឹកប្រាក់', 'Amount')}</th></tr></thead><tbody>${itemRows || `<tr><td colspan="4">${payAllLabel('មិនមានសេវាមិនទាន់បង់', 'No unpaid services')}</td></tr>`}</tbody></table></div>
    <section class="payall-summary"><div><span>${payAllLabel('តម្លៃសរុប', 'Total price')}</span><b>${K(due)}</b></div>
      <div class="payall-discount-row payall-all-discount"><label for="payall-all-discount">${payAllLabel('បញ្ចុះតម្លៃគ្រប់សេវា', 'Discount all services')}</label><input class="in" id="payall-all-discount" name="all_discount" type="number" min="0" step="1" value="0" aria-label="${payAllLabel('ចំនួនបញ្ចុះតម្លៃគ្រប់សេវា', 'Discount amount for all services')}"><select class="in" name="all_discount_currency" aria-label="${payAllLabel('រូបិយប័ណ្ណបញ្ចុះតម្លៃគ្រប់សេវា', 'Currency for all-services discount')}"><option value="KHR">៛ KHR</option><option value="USD">$ USD</option></select></div>
      <div class="payall-discount-row"><span>${payAllLabel('បញ្ចុះតម្លៃតាមសេវាដែលបានជ្រើសរើស', 'Discount selected services')}</span><b id="payall-discount-total">${K(0)}</b><button type="button" class="btn payall-tag" data-a="payall-discount-open" title="${payAllLabel('ជ្រើសរើសសេវាសម្រាប់បញ្ចុះតម្លៃ', 'Select services for discount')}" aria-label="${payAllLabel('ជ្រើសរើសសេវាសម្រាប់បញ្ចុះតម្លៃ', 'Select services for discount')}">🏷 ${payAllLabel('ជ្រើសរើស', 'Select items')}</button></div>
      <div class="payall-final"><span>${payAllLabel('តម្លៃត្រូវបង់', 'Final total')}</span><b id="payall-final-total">${K(due)}</b></div>
    </section>
    <section class="payall-fields">${fSel(payAllLabel('វិធីទូទាត់', 'Payment method'), 'method', 'Cash', methodOptions)}${fIn(payAllLabel('កាលបរិច្ឆេទទូទាត់', 'Payment date'), 'payment_date', ymd(new Date()), 'date', 'required')}${fIn(payAllLabel('ប្រាក់ទទួល (KHR)', 'Money received (KHR)'), 'received', liveDue, 'number', 'min="0" step="1" required')}${fIn(payAllLabel('ឈ្មោះអ្នកទទួលប្រាក់', 'Received by'), 'receiver_name', D.user && D.user.name || '', 'text', 'required')}</section>
    <div class="payall-balance" id="payall-remaining-balance-row"><span>${payAllLabel('សមតុល្យនៅសល់ក្នុងសេវាមិនទាន់បង់', 'Remaining balance in Unpaid')}</span><b id="payall-remaining-balance">${K(0)}</b><small>${payAllLabel('ការបញ្ចុះតម្លៃអនុវត្តនៅពេលបង់គ្រប់ចំនួនត្រូវបង់ប៉ុណ្ណោះ', 'Discounts apply only when the full final total is paid.')}</small></div>
    <div class="payall-shortcuts" aria-label="${payAllLabel('ប៊ូតុងទូទាត់រហ័ស', 'Payment shortcuts')}"><button type="button" class="btn" data-a="payall-print" aria-label="${payAllLabel('បោះពុម្ពវិក្កយបត្រ', 'Print payment invoice')}" title="${payAllLabel('បោះពុម្ពវិក្កយបត្រ', 'Print payment invoice')}">${printerIcon()}</button><button type="button" class="btn" data-a="payall-shortcut:exact" title="${payAllLabel('ទទួលប្រាក់ត្រឹមត្រូវតាមតម្លៃត្រូវបង់', 'Receive the exact final total')}">S-B</button><button type="button" class="btn" data-a="payall-shortcut:1000" title="${payAllLabel('បន្ថែម 1,000 KHR ទៅប្រាក់ទទួល', 'Add 1,000 KHR to money received')}">S</button><button type="button" class="btn" data-a="payall-shortcut:10000" title="${payAllLabel('បន្ថែម 10,000 KHR ទៅប្រាក់ទទួល', 'Add 10,000 KHR to money received')}">D</button><button type="button" class="btn" data-a="payall-shortcut:100000" title="${payAllLabel('បន្ថែម 100,000 KHR ទៅប្រាក់ទទួល', 'Add 100,000 KHR to money received')}">A</button></div>
    <div class="payall-shortcuts payall-more-actions"><button type="button" class="btn" data-a="payall-print:compact" aria-label="${payAllLabel('បោះពុម្ពបង្កាន់ដៃសង្ខេប', 'Print compact payment slip')}" title="${payAllLabel('បោះពុម្ពបង្កាន់ដៃសង្ខេប', 'Print compact payment slip')}">${printerIcon()}</button><button type="button" class="btn" data-a="payall-shortcut:exact" title="${payAllLabel('កំណត់ប្រាក់ទទួលឱ្យស្មើនឹងតម្លៃត្រូវបង់', 'Set money received to the exact final total')}">SV</button><button type="button" class="btn" data-a="payall-qr" title="${payAllLabel('បង្ហាញ QR ធនាគារ', 'Show configured bank QR')}">QR</button></div>`;
  openForm(`${payAllLabel('ទូទាត់ប្រាក់', 'Pay All')} — ${esc(p.name)}`, body, async (f) => {
    const livePid = Number(pdId || pid || targetPid);
    const liveList = await api('GET', 'records?patient_id=' + livePid + '&limit=5000');
    const liveDue = billTotals(liveList).bal;
    const liveOutstandingItems = billingOutstandingItems(liveList);
    const enteredDiscount = payAllContext.discountInput, currency = payAllContext.discountCurrency;
    const rawAllDiscount = readFormValue(f, 'all_discount', 'discount', 'allDiscount');
    const rawAllCurrency = readFormValue(f, 'all_discount_currency', 'discount_currency', 'allDiscountCurrency');
    const allDiscount = Number(rawAllDiscount || 0), allCurrency = String(rawAllCurrency || 'KHR');
    const received = Number(readFormValue(f, 'received', 'amount', 'paid_amount', 'applied_amount') || 0);
    const calculation = payAllDiscountCalculation(liveOutstandingItems, payAllContext.selectedIndexes, enteredDiscount, currency, allDiscount, allCurrency);
    if (!Number.isFinite(enteredDiscount) || enteredDiscount < 0 || !Number.isFinite(allDiscount) || allDiscount < 0) throw new Error(payAllLabel('សូមបញ្ចូលចំនួនបញ្ចុះតម្លៃឱ្យបានត្រឹមត្រូវ', 'Enter a valid discount'));
    if (!['KHR', 'USD'].includes(allCurrency)) throw new Error(payAllLabel('សូមជ្រើសរើសរូបិយប័ណ្ណបញ្ចុះតម្លៃ', 'Choose a valid discount currency'));
    if (calculation.itemDiscount > calculation.selectedTotal) throw new Error(payAllLabel('ការបញ្ចុះតម្លៃលើសពីតម្លៃសេវាដែលបានជ្រើសរើស', 'Selected-services discount exceeds selected services total'));
    if (calculation.discount > liveDue) throw new Error(payAllLabel('ការបញ្ចុះតម្លៃសរុបលើសពីតម្លៃត្រូវបង់', 'Total discount is more than the balance'));
    if (!Number.isFinite(received) || received <= 0) throw new Error(payAllLabel('សូមបញ្ចូលចំនួនទឹកប្រាក់ដែលបានទទួល', 'Enter the amount received'));
    const method = String(readFormValue(f, 'method', 'payment_method', 'pay_method') || '');
    if (!['Cash', 'Bank'].includes(method)) throw new Error(payAllLabel('សូមជ្រើសរើសវិធីទូទាត់', 'Choose a payment method'));
    const receiverName = String(readFormValue(f, 'receiver_name', 'received_by', 'cashier_name', 'payer_name') || (D.user && D.user.name) || '').trim();
    const paymentDate = String(readFormValue(f, 'payment_date', 'date', 'paid_at', 'paymentDate') || ymd(new Date()));
    if (payAll && !receiverName) throw new Error(payAllLabel('សូមបញ្ចូលឈ្មោះអ្នកទទួលប្រាក់', 'Enter the name of the person receiving payment'));
    if (payAll && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error(payAllLabel('សូមបញ្ចូលកាលបរិច្ឆេទទូទាត់ឱ្យបានត្រឹមត្រូវ', 'Enter a valid payment date'));
    const isFullPayment = received >= calculation.finalTotal;
    const appliedAmount = isFullPayment ? liveDue : Math.min(liveDue, received);
    const appliedDiscount = isFullPayment ? calculation.discount : 0;
    const itemDiscounts = isFullPayment ? payAllDiscountAllocation(liveOutstandingItems, payAllContext.selectedIndexes, calculation.itemDiscount) : liveOutstandingItems.map(() => 0);
    const allItemDiscounts = isFullPayment ? payAllGeneralDiscountAllocation(liveOutstandingItems, itemDiscounts, calculation.allDiscount) : liveOutstandingItems.map(() => 0);
    await api('POST', 'records', { patient_id: livePid, kind: 'payment', date: paymentDate, data: {
      amount: Math.round(received), applied_amount: appliedAmount, final_total: isFullPayment ? calculation.finalTotal : appliedAmount, received: Math.round(received),
      paid_at: nowLocal(),
      discount: appliedDiscount, discount_all: isFullPayment ? calculation.allDiscount : 0, discount_all_input: isFullPayment ? allDiscount : 0, discount_all_currency: allCurrency,
      discount_item: isFullPayment ? calculation.itemDiscount : 0, discount_input: isFullPayment ? enteredDiscount : 0, discount_currency: currency,
      discount_items: isFullPayment ? payAllContext.selectedIndexes.map((index) => ({ name: liveOutstandingItems[index].name, price: liveOutstandingItems[index].price, discount: itemDiscounts[index] })) : [],
      remaining_balance: Math.max(0, liveDue - appliedAmount),
      change: isFullPayment ? Math.max(0, Math.round(received - calculation.finalTotal)) : 0, method, receiver_name: receiverName, item_count: liveOutstandingItems.length,
      items: itemDiscounts.map((discountAmount, index) => {
        const item = liveOutstandingItems[index];
        return { category: item.category, name: item.name, price: item.price, discount: discountAmount + allItemDiscounts[index], discount_item: discountAmount, discount_all: allItemDiscounts[index], quantity: item.quantity || 1, unitPrice: item.unitPrice ?? item.price };
      })
    } });
    await load(); if (rt == 'pd' && pdId == livePid) await loadRecs(); render(); toast('Saved');
  }, { cls: 'wide payall-dialog', ok: payAllLabel('បញ្ជាក់ការទូទាត់', 'Confirm payment'), close: true, closeLabel: payAllLabel('បិទ', 'Close') });
  $('#mf').dataset.payallDue = String(liveDue);
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
  const allDiscountInput = form.querySelector('[name="all_discount"]') || form.querySelector('[name="discount"]');
  const allDiscountCurrency = form.querySelector('[name="all_discount_currency"]') || form.querySelector('[name="discount_currency"]');
  const receivedInput = form.querySelector('[name="received"]') || form.querySelector('[name="amount"]') || form.querySelector('[name="paid_amount"]');
  context.allDiscountInput = Number(allDiscountInput ? allDiscountInput.value : 0) || 0;
  context.allDiscountCurrency = allDiscountCurrency ? allDiscountCurrency.value : 'KHR';
  const calculation = payAllDiscountCalculation(context.items, context.selectedIndexes, context.discountInput, context.discountCurrency, context.allDiscountInput, context.allDiscountCurrency);
  const received = Number(receivedInput ? receivedInput.value : 0) || 0;
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
    if (r.kind == 'prescription' && Array.isArray(d.medicines)) return d.medicines.map((item, itemIndex) => {
      const quantity = Math.max(0, +item.quantity || 0), unitPrice = +item.price || 0;
      return quantity && unitPrice ? { category: 'Pharmacy Charges', name: item.name || T('Prescription'), price: unitPrice * quantity, quantity, unitPrice, recordId: r.id, itemIndex } : null;
    }).filter(Boolean);
    if (r.kind == 'medlist' && (d.dispensed === true || r.title == 'Dispensed medicines') && Array.isArray(d.items)) return d.items.map((item, itemIndex) => {
      const quantity = Math.max(1, +item.quantity || 1), unitPrice = +item.price || 0;
      return unitPrice ? { category: 'Pharmacy Charges', name: [item.name, item.unit_name && `(${item.unit_name})`].filter(Boolean).join(' '), price: unitPrice * quantity, quantity, unitPrice, recordId: r.id, itemIndex } : null;
    }).filter(Boolean);
    return [];
  });
}
const paymentAmount = (data) => {
  const amount = Number(data.applied_amount ?? data.amount ?? data.received ?? data.paid_amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};
function billingOutstandingItems(list) {
  let paid = list.filter((r) => r.kind == 'payment').reduce((sum, r) => sum + paymentAmount(jd(r)), 0);
  return billingLineItems(list).map((item) => {
    const applied = Math.min(paid, item.price);
    paid -= applied;
    return { ...item, price: item.price - applied };
  }).filter((item) => item.price > 0);
}
const billTotals = (list) => { const ch = billingLineItems(list).reduce((t, item) => t + item.price, 0), pd = list.filter((r) => r.kind == 'payment').reduce((t, r) => t + paymentAmount(jd(r)), 0); return { ch, pd, bal: Math.max(0, ch - pd) }; };
function paidHistoryDate(record, data) {
  const paidAt = String(data.paid_at || ''), time = paidAt.includes('T') ? paidAt.slice(11, 16) : '';
  return `<span class="bill-payment-date"><span>${esc(record.date || paidAt.slice(0, 10) || '')}</span><small>${esc(time || '—')}</small></span>`;
}
function paidHistoryTable(payments, records) {
  const total = payments.reduce((sum, r) => sum + paymentAmount(jd(r)), 0);
  const rows = payments.map((r) => {
    const d = jd(r), amount = paymentAmount(d), count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(records).length;
    return `<tr><td>${paidHistoryDate(r, d)}</td><td>PAY-${esc(r.id)}</td><td>${esc(d.method || '—')}</td><td>${count}</td><td><b>${K(amount)}</b></td><td><button type="button" class="btn s" data-a="payreceipt:${r.id}">${T('Receipt')}</button></td></tr>`;
  }).join('');
  const cards = payments.map((r) => {
    const d = jd(r), amount = paymentAmount(d), count = Number.isFinite(+d.item_count) ? +d.item_count : Array.isArray(d.items) ? d.items.length : billingLineItems(records).length;
    return `<article class="bill-payment-card"><div class="bill-payment-card-head"><b>${paidHistoryDate(r, d)}</b><button type="button" class="btn s" data-a="payreceipt:${r.id}">▣ ${T('Receipt')}</button></div><div class="mu">PAY-${esc(r.id)}</div><div class="bill-payment-card-details"><span>${T('Method')}</span><b>${esc(d.method || '—')}</b><span>${T('Items')}</span><b>${count}</b><span>${T('Total Paid')}</span><b>${K(amount)}</b></div></article>`;
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
Object.assign(L, { 'Appointment time': 'ម៉ោងណាត់ជួប', 'Doctor name': 'ឈ្មោះគ្រូពេទ្យ', 'Doctor name placeholder': 'បញ្ចូលឈ្មោះគ្រូពេទ្យ', 'Service': 'សេវាកម្ម', 'Specify service': 'បញ្ជាក់សេវាកម្ម', 'Telesales': 'Telesales', 'Enter Telesales details': 'បញ្ចូលព័ត៌មាន Telesales', 'Pancake': 'Pancake', 'Specify Pancake': 'បញ្ជាក់ Pancake', 'Reason / description': 'ការពិពណ៌នា', 'Appointment reason placeholder': 'បញ្ចូលមូលហេតុនៃការណាត់ជួប', 'Appointment notes placeholder': 'បញ្ចូលកំណត់ចំណាំ', 'Add Appointment': 'បន្ថែមការណាត់ជួប', 'Create appointment for': 'បង្កើតការណាត់ជួបសម្រាប់' });
Object.assign(L, { 'Set the number of follow-up visits and their dates.': 'កំណត់ចំនួនដងតាមដាន និងកាលបរិច្ឆេទនីមួយៗ។', 'Number of follow-up visits': 'ចំនួនដងតាមដាន', 'First follow-up date': 'កាលបរិច្ឆេទតាមដានដំបូង', 'Days between visits': 'ចំនួនថ្ងៃរវាងការតាមដាន', 'Patient category': 'ប្រភេទអ្នកជំងឺ', 'Follow up as OPD': 'តាមដានជាអ្នកជំងឺក្រៅ', 'Follow up as IPD': 'តាមដានជាអ្នកជំងឺសម្រាកពេទ្យ', 'Follow up through NSSF': 'តាមដានតាមរយៈ ប.ស.ស', 'Follow-up schedule': 'កាលវិភាគតាមដាន', 'Visit': 'លើកទី', 'after': 'ក្រោយ', 'days': 'ថ្ងៃ', 'Select at least one patient category': 'សូមជ្រើសរើសប្រភេទអ្នកជំងឺយ៉ាងតិចមួយ', 'More': 'បន្ថែម' });
Object.assign(L, { 'Moved to Follow Up': 'បានផ្លាស់ទៅការតាមដាន' });
Object.assign(L, { 'Done - return to OPD': 'រួចរាល់ - ត្រឡប់ទៅ OPD', 'Returned to OPD': 'បានត្រឡប់ទៅ OPD' });
Object.assign(L, { 'New Diagnosis': 'បន្ថែមរោគវិនិច្ឆ័យថ្មី', 'Diagnosis already exists': 'រោគវិនិច្ឆ័យនេះមានរួចហើយ' });
Object.assign(L, { 'All': 'ទាំងអស់', 'With record': 'មានកំណត់ត្រា', 'No record': 'គ្មានកំណត់ត្រា', '✕ Clear filters': '✕ សម្អាតតម្រង', 'Export Excel': 'នាំចេញ Excel' });
Object.assign(L, { 'Columns': 'ជួរឈរ', '☰ Columns': '☰ ជួរឈរ', 'Filters': 'តម្រង', 'Show all': 'បង្ហាញទាំងអស់', 'Show or hide columns': 'បង្ហាញ ឬលាក់ជួរឈរ', 'At least one column must stay visible': 'ត្រូវទុកយ៉ាងហោចណាស់ជួរឈរមួយ' });
Object.assign(L, { 'Request service': 'ស្នើសុំសេវាកម្ម', 'Search services…': 'ស្វែងរកសេវាកម្ម…', 'Add selected': 'បន្ថែមសេវាកម្មដែលបានជ្រើស', 'Service requests': 'សំណើសេវាកម្ម', 'No services requested yet.': 'មិនទាន់មានសំណើសេវាកម្មទេ។', 'No matching services.': 'រកមិនឃើញសេវាកម្មដែលត្រូវគ្នាទេ។', 'Requested services': 'សេវាកម្មដែលបានស្នើ', 'Select at least one service': 'សូមជ្រើសរើសសេវាកម្មយ៉ាងតិចមួយ', 'Services requested': 'បានស្នើសេវាកម្ម' });
Object.assign(L, { 'Service Charges': 'ថ្លៃសេវាកម្ម', 'Treatment Charges': 'ថ្លៃព្យាបាល', 'Lab Charges': 'ថ្លៃតេស្ត Lab', 'Pharmacy Charges': 'ថ្លៃឱសថ', 'Total Unpaid Amount': 'ចំនួនទឹកប្រាក់មិនទាន់បង់សរុប', 'Items': 'មុខទំនិញ' });
Object.assign(L, { 'Add Vaccination': 'បញ្ចូលបញ្ជីការចាក់វ៉ាក់សាំង', 'Edit Vaccination': 'កែប្រែបញ្ជីការចាក់វ៉ាក់សាំង', 'Vaccine category': 'ប្រភេទវ៉ាក់សាំង', 'Child vaccination': 'វ៉ាក់សាំងកុមារ', 'Adult vaccination': 'វ៉ាក់សាំងមនុស្សពេញវ័យ', 'Other': 'ផ្សេងៗ', 'Vaccine group': 'ឈ្មោះក្រុមវ៉ាក់សាំង', 'Enter vaccine group': 'បញ្ចូលប្រភេទវ៉ាក់សាំង', 'Vaccination dose': 'ចាក់វ៉ាក់សាំង', 'Dose date': 'ថ្ងៃ ខែ ឆ្នាំ', 'Given': 'ចាក់រួច', 'Vaccine reason': 'បញ្ជាក់មូលហេតុ', 'Vaccination notes': 'ចំណាំ', 'Vaccination notes placeholder': 'សូមបញ្ចូលព័ត៌មានការចាក់វ៉ាក់សាំង', 'Vaccination date': 'កាលបរិច្ឆេទចាក់វ៉ាក់សាំង', 'Administered by': 'បុគ្គលិកចាក់វ៉ាក់សាំង' });

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
<td style="white-space:nowrap" class="iac">${p ? `<a href="#" data-a="open:${p.id}" title="Open patient file">👁</a>` : ''}<a href="#" data-a="ipdprint:${r.id}" title="Print">${printerIcon()}</a><a href="#" data-a="ipdshare:${r.id}" title="Share summary">✈</a><a href="#" data-a="ipdedit:${r.id}" title="Edit">✎</a><a href="#" class="rd" data-a="del:ipd:${i}" title="Delete">🗑</a></td></tr>`;
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
