'use strict';
(() => {
  const root = document.querySelector('#portal');
  const apiBase = (window.API_BASE || '').replace(/\/+$/, '');
  const token = location.hash.slice(1);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const display = (value) => value === '' || value == null ? 'N/A' : String(value);
  const recordKinds = {
    medical: 'Medical record', mdhistory: 'Medical history', beu: 'Before / after',
    schedule: 'Treatment schedule', treatment: 'Treatment follow-up', consultation: 'Consultation',
    operation: 'Operation', investigation: 'Investigation', lab: 'Lab result', echo: 'Echo report',
    xray: 'Imaging', homecare: 'Home care', prescription: 'Prescription', medlist: 'Medicine list',
    documents: 'Document', mrd: 'Medical record', schedulenote: 'Schedule note', cnf: 'Consultation form',
    allergy: 'Allergy', vaccination: 'Vaccination', referral: 'Referral', diagnosis_history: 'Diagnosis',
    laborder: 'Lab order', imagingorder: 'Imaging order', vitals: 'Vitals'
  };
  const safeData = (data) => Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {})
    .filter(([key]) => !/(^id$|image|photo|signature|token|password|created_by)/i.test(key))
    .map(([key, value]) => [key.replace(/[_-]+/g, ' '), typeof value === 'object' ? JSON.stringify(value) : display(value)])
    .filter(([, value]) => value !== 'N/A');
  const itemCard = (item, kind) => {
    const data = item.data || {};
    const title = item.title || data.test_name || data.dx || data.diagnosis || recordKinds[kind] || kind;
    const meta = safeData(data);
    return `<article class="portal-item"><h3>${esc(title)}</h3><time>${esc(String(item.date || '').replace('T', ' '))} · ${esc(recordKinds[kind] || kind)}</time>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}${meta.length ? `<dl>${meta.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>` : ''}</article>`;
  };
  const listSection = (items, kind) => items.length
    ? `<div class="portal-list">${items.map((item) => itemCard(item, kind || item.kind)).join('')}</div>`
    : '<div class="portal-card"><p class="portal-muted">No information available.</p></div>';
  const showError = () => {
    root.innerHTML = '<section class="portal-message"><h1>Portal link unavailable</h1><p>This patient portal link is invalid or has been revoked. Please contact the clinic for assistance.</p></section>';
  };
  function render(payload) {
    const patient = payload.patient, records = payload.records || [], appointments = payload.appointments || [];
    const vitals = records.filter((record) => record.kind === 'vitals');
    const latestVitals = vitals[0] && vitals[0].data || {};
    const allergyRecords = records.filter((record) => record.kind === 'allergy');
    const allergySummary = allergyRecords.length ? allergyRecords.map((record) => record.title || record.data?.allergy || record.notes || safeData(record.data).map(([, value]) => value).join(', ')).filter(Boolean).join(', ') : 'No known allergies recorded';
    const general = `<div class="portal-grid">
      <section class="portal-card"><h2>Personal Information</h2><div class="portal-info">
        <div><span>Full Name</span><b>${esc(display(patient.name))}</b></div><div><span>Nationality</span><b>${patient.khmer ? 'Cambodian' : 'N/A'}</b></div>
        <div><span>Phone Number</span><b>${esc(display(patient.phone))}</b></div><div><span>National ID / Passport</span><b>${esc(display(patient.national_id))}</b></div>
        <div><span>NSSF ID</span><b>${esc(display(patient.nssf_id))}</b></div><div><span>Address</span><b>${esc(display(patient.addr))}</b></div>
      </div></section>
      <section class="portal-card"><h2>Medical Profile</h2><p class="portal-muted">Physical Stats</p><div class="portal-info">
        <div><span>Weight</span><b>${esc(display(latestVitals.w || latestVitals.weight))}</b></div><div><span>Height</span><b>${esc(display(latestVitals.h || latestVitals.height))}</b></div>
        <div><span>Blood pressure</span><b>${esc(display(latestVitals.bp || latestVitals.blood_pressure))}</b></div><div><span>Temperature</span><b>${esc(display(latestVitals.t || latestVitals.temperature))}</b></div>
      </div><p class="portal-muted" style="margin-top:20px">Allergies</p><p>${esc(allergySummary)}</p>
        <div class="portal-actions"><button type="button" data-portal-tab="history">Diagnosis</button><button type="button" data-portal-tab="medical">Symptoms / Records</button></div>
      </section>
    </div>`;
    const historyKinds = new Set(['mdhistory', 'mrd', 'diagnosis_history', 'allergy', 'referral']);
    const visitKinds = new Set(['medical', 'consultation', 'treatment', 'operation', 'schedule', 'homecare']);
    const medicalKinds = new Set(['investigation', 'lab', 'echo', 'xray', 'prescription', 'medlist', 'documents', 'cnf', 'vaccination', 'laborder', 'imagingorder']);
    const tabs = [
      ['general', 'General'],
      ['visits', 'Visits'],
      ['vitals', 'Vitals'],
      ['appointments', 'Appointments'],
      ['history', 'History'],
      ['medical', 'Medical Records'],
    ];
    root.innerHTML = `<section class="portal-hero"><h1>${esc(display(patient.name))}</h1><p>Patient ID: ${esc(patient.id)} · ${esc(patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : 'N/A')} · ${esc(display(patient.age))} ${esc(patient.age_unit === 'M' ? 'Months' : patient.age_unit === 'D' ? 'Days' : 'Years')}</p></section>
      <nav class="portal-tabs" role="tablist" aria-label="Patient information">${tabs.map(([id, label], index) => `<button type="button" role="tab" id="portal-tab-${id}" aria-controls="portal-panel-${id}" aria-selected="${index === 0}" data-portal-tab="${id}">${label}</button>`).join('')}</nav>
      <section class="portal-panel" id="portal-panel-general" role="tabpanel" aria-labelledby="portal-tab-general">${general}</section>
      <section class="portal-panel" id="portal-panel-visits" role="tabpanel" aria-labelledby="portal-tab-visits" hidden>${listSection(records.filter((record) => visitKinds.has(record.kind)))}</section>
      <section class="portal-panel" id="portal-panel-vitals" role="tabpanel" aria-labelledby="portal-tab-vitals" hidden>${listSection(vitals)}</section>
      <section class="portal-panel" id="portal-panel-appointments" role="tabpanel" aria-labelledby="portal-tab-appointments" hidden>${appointments.length ? `<div class="portal-list">${appointments.map((appointment) => itemCard({ ...appointment, title: appointment.svc || appointment.type || 'Appointment', data: { time: appointment.time, doctor: appointment.doc, status: appointment.st } }, 'appointment')).join('')}</div>` : '<div class="portal-card"><p class="portal-muted">No appointments available.</p></div>'}</section>
      <section class="portal-panel" id="portal-panel-history" role="tabpanel" aria-labelledby="portal-tab-history" hidden>${patient.history || patient.complaints ? `<div class="portal-card"><h2>Patient History</h2>${patient.complaints ? `<p><b>Complaints:</b> ${esc(patient.complaints)}</p>` : ''}${patient.history ? `<p><b>Medical history:</b> ${esc(patient.history)}</p>` : ''}${patient.diagnosis ? `<p><b>Diagnosis:</b> ${esc(patient.diagnosis)}</p>` : ''}</div>` : ''}${listSection(records.filter((record) => historyKinds.has(record.kind)))}</section>
      <section class="portal-panel" id="portal-panel-medical" role="tabpanel" aria-labelledby="portal-tab-medical" hidden>${listSection(records.filter((record) => medicalKinds.has(record.kind)))}</section>
      <p class="portal-private">Read-only patient information. Anyone with this QR link can view the portal. Contact the clinic if you believe this link was shared by mistake.</p>
      <footer class="portal-footer">Protected Health Information</footer>`;
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-portal-tab]');
      if (button) activateTab(button.dataset.portalTab);
    });
  }
  function activateTab(id) {
    root.querySelectorAll('[role="tab"]').forEach((button) => {
      const selected = button.dataset.portalTab === id;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll('[role="tabpanel"]').forEach((panel) => { panel.hidden = panel.id !== `portal-panel-${id}`; });
  }
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) { showError(); return; }
  history.replaceState(null, '', location.pathname);
  fetch(`${apiBase}/api/portal/${encodeURIComponent(token)}`, { cache: 'no-store', credentials: 'omit' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Patient portal request failed');
      render(await response.json());
    })
    .catch(showError);
})();
