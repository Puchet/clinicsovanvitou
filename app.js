const API_BASE=((typeof window!=='undefined'&&window.API_BASE)||'').replace(/\/+$/,'');
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),K=n=>D.clinic&&D.clinic.currency=='USD'?'$'+(Number(n)/(D.clinic.rate||4000)).toFixed(2):'KHR '+Number(n).toLocaleString('en-US');
const NM=['Sok Dara','Chan Sreyneang','Vann Rithy','Keo Sophea','Lim Sokha','Heng Vuthy','Pich Srey','Seng Bunthoeun','Mao Channary','Ouk Samnang','Tep Vanna','Nguon Sreymom'],AD=['Phnom Penh','Siem Reap','Kandal','Takeo','Battambang'];
const D={pt:[],ap:[],ipd:[],dr:[],payslips:[],med:[],sv:[],lab:[],labcategories:[],echo:[],dx:[],rx:[],sy:[],ad:[],sf:[],ch:[],expenses:[],sales:[],medicineSales:[],rev:0,bill:[],billing:[],clinic:{},user:{}};
// an admitted patient (IPD row linked by patient ID) goes back to OPD when the stay ends
const syncOpd=r=>{const p=D.pt.find(q=>String(q.id)==String(r.code));return p&&p.type=='IPD'?api('PUT','patients/'+p.id,{type:'OPD'}):0};
const billingData=r=>{try{return JSON.parse(r.data||'{}')}catch{return{}}};
const billingApplied=r=>{const d=billingData(r);return Number(d.applied_amount??d.amount)||0};
const billingCharge=r=>{const d=billingData(r);if(r.kind=='schedule')return d.billable!==0&&d.billable!==false?(+d.amount||0):0;if(r.kind=='investigation'&&Array.isArray(d.items))return d.items.reduce((n,item)=>n+(+item.unit_price||+item.price||0)*(Math.max(1,+item.quantity||1)),0);return 0};
const patientDue=id=>{const rs=D.billing.filter(r=>String(r.patient_id)==String(id));return Math.max(0,rs.reduce((n,r)=>n+billingCharge(r),0)-rs.filter(r=>r.kind=='payment').reduce((n,r)=>n+billingApplied(r),0))};
const ipdPaid=r=>{const p=D.pt.find(q=>String(q.id)==String(r.code));return p?patientDue(p.id)<=0:!!r.paid};
const mi=i=>D.med.find(m=>m.id==i)||{name:'(removed)',price:0};
let rt='dash',q='',pg=1,tab='OPD',pay='Cash',cart={},nt=0;
let doctorProfileId=null,doctorTab='payroll',medicineFormOpen=false,medicineEditIndex=null,medicineViewId=null,medicineLayout='table',medicineFormReturnPage=null;
try{medicineLayout=localStorage.getItem('medicineLayout')=='cards'?'cards':'table'}catch(e){}
const hd=(t,s,b='')=>`<div class="hd"><div><h1>${t}</h1><p class="mu">${s||''}</p></div><div class="tools">${b}</div></div>`,
sr=ph=>`<input id="q" class="in" placeholder="${ph||'Search…'}" value="${esc(q)}">`,
ex=`<button class="btn" data-a="csv">Export Excel</button>`,
add=(k,l)=>`<button class="btn g" data-a="add:${k}">+ ${l||'Add'}</button>`,
ft=(k)=>D[k].map((r,i)=>[r,i]).filter(([r])=>!q||JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
const bars=(t,e,c)=>{const m=Math.max(1,...e.map(x=>x[1]));return`<div class="card"><b>${t}</b>${e.map(x=>{const patients=x[2]||[],names=patients.slice(0,5).join(', ')+(patients.length>5?`, +${patients.length-5} more`:''),summary=patients.length?`${patients.length} patient${patients.length==1?'':'s'}: ${names}`:'No matching patients',tip=`${t}: ${x[0]} — ${x[1]} patient${x[1]==1?'':'s'} — ${summary}`;return`<div class="br" tabindex="0" role="img" aria-label="${esc(t+': '+x[0]+' — '+x[1]+' patients. '+summary)}" data-tooltip="${esc(tip)}"><u title="${esc(x[0])}">${esc(x[0])}</u><s style="width:${x[1]/m*100}%;${c?'background:'+c:''}"></s>${x[1]}</div>`}).join('')}</div>`};
const pic=r=>r.photo?`<img class="tn" src="${API_BASE}/uploads/${esc(r.photo)}" alt="">`:'',nm=r=>`<span>${pic(r)}${esc(r.name)}</span>`;
const imgField=(l,k,v,del)=>`<label>${l}<div class="pp"><img id="pv_${k}" alt="" ${v?`src="${API_BASE}/uploads/${esc(v)}"`:'hidden'}><input type="file" id="pf_${k}" accept="image/*"><button type="button" class="btn s" data-a="rmpic:${k}">${del||'Remove picture'}</button></div><input type="hidden" name="${k}" id="pk_${k}" value="${esc(v??'')}"></label>`;
const P={ap:{t:'Appointment list',s:'Manage all patient appointments.',h:['No.','Name','Service','Date','Doctor','Phone','Status'],c:(r,i)=>[i+1,r.name,r.svc,r.date+(r.time?' '+r.time:''),r.doc,r.phone,`<span class="bd ${r.st=='Waiting'?'b':r.st=='Cancelled'?'x':''}">${esc(r.st)}</span>`],f:[['Name','name'],['Service','svc'],['Date','date','date'],['Time','time','time'],['Doctor','doc'],['Phone','phone'],['Status','st','sel',['Waiting','Confirmed','Done','Cancelled']]],d:{st:'Waiting'},x:1},
ipd:{t:'Inpatients (IPD)',s:'Manage all admitted patients.',h:['Name','Room / Bed','Payment','Status'],c:r=>[`<b style="color:#3b82f6">${esc(r.name)}</b> <span class="mu">(${esc(r.code)})</span>`,[r.room,r.bed].filter(Boolean).join(' / ')||'—',ipdPaid(r)?'<span class="bd">Paid</span>':'<span class="bd x">Unpaid</span>',r.out?'Discharged':`<button class="btn s" data-a="out:IDX">Discharge</button>`],f:[['Name','name'],['ID','code'],['Room','room'],['Bed','bed']],d:{paid:0,out:0}},
cur:{k:'ipd',t:'Current IPD patients',s:'Patients not yet discharged',fl:r=>!r.out},
med:{t:'Medicines',s:'Manage your pharmacy list.',h:['Name','Price','In stock'],c:r=>[nm(r),K(r.price),`<span class="bd ${r.stock>0?'':'x'}">${r.stock}</span>`],f:[['Name','name'],['Price (KHR)','price'],['Stock','stock'],['Photo','photo','img']],ex:1},
sv:{t:'Services',s:'Manage all clinic services.',h:['Name','Price'],c:r=>[r.name,K(r.price)],f:[['Service name','name'],['Price (KHR)','price','number'],['Description','description','ta']],ex:1},
lab:{t:'Lab Templates',s:'Manage lab test templates and prices.',h:['Name','Price','Type'],c:r=>[r.name,K(r.price),r.cat],f:[['Name','name'],['Price (KHR)','price'],['Type','cat']],ex:1},
dx:{t:'Diagnosis',s:'Diagnoses available when writing a visit.',h:['Name'],c:r=>[r.name],f:[['Name','name']]},
rx:{t:'Prescription Templates',s:'Default medicines per disease.',h:['Disease name','Medicines'],c:r=>[r.name,r.meds],f:[['Disease name','name'],['Medicines','meds']],ex:1},
sy:{t:'Symptoms',s:'Manage symptoms list for patient complaints',h:['Symptom'],c:r=>[r.name],f:[['Symptom','name']]},
ad:{t:'Address Book',s:'',h:['Address'],c:r=>[r.name],f:[['Address','name']]},
sf:{t:'Sample file',s:'',h:['File name'],c:r=>[r.name],f:[['File name','name']]},
bill:{k:'bill',t:'Report',s:'Daily visits and revenue.',h:['Date','Visits','Revenue'],c:r=>[r.day,r.n,K(r.amt)],nf:1},
mr:{k:'med',t:'Medicine Report',s:'Stock status.',h:['Name','Stock','Status'],c:r=>[r.name,r.stock,r.stock<=0?'<span class="bd x">Out of stock</span>':r.stock<20?'<span class="bd b">Low</span>':'<span class="bd">OK</span>'],nf:1},
st:{k:'med',t:'Store',s:'Add items and manage stock and prices.',al:'Add item',h:['Item','Stock','Unit price','Value'],c:r=>[nm(r),r.stock,K(r.price),K(Math.max(0,r.stock)*r.price)]},
ns:{k:'sf',t:'NSSF',s:'Patients covered by NSSF.',h:['ID','Date','Name','NSSF ID','Treatment','Age','Unpaid'],c:()=>[],nf:1}};
function tp(id){let o={...P[id]};if(o.k)o={...P[o.k]||P.ipd,...o};const k=o.k||id,rows=ft(k).filter(([r])=>!o.fl||o.fl(r));
if(id==='dx'){
  return hd(o.t,o.s,`<button class="btn diagnosis-secondary" data-a="go:sy"><span>☰</span> Symptoms List</button><button class="btn diagnosis-primary" data-a="add:dx" aria-label="${T('New Diagnosis')}" title="${T('New Diagnosis')}">＋ ${T('New Diagnosis')}</button>`)+`<div class="diagnosis-shell"><div class="diagnosis-search"><span class="diagnosis-search-icon">⌕</span><input id="q" class="diagnosis-input" placeholder="Search diagnoses..." value="${esc(q)}"></div><div class="diagnosis-list">${rows.length?rows.map(([r,i])=>`<div class="diagnosis-row"><span class="diagnosis-name">${esc(r.name)}</span><div class="diagnosis-actions"><button class="btn diagnosis-edit" data-a="edit:${k}:${i}">Edit</button><button class="btn diagnosis-delete" data-a="del:${k}:${i}" aria-label="Delete ${esc(r.name)}">🗑</button></div></div>`).join(''):`<div class="diagnosis-empty">Nothing here yet.</div>`}</div></div>`;
}
return hd(o.t,o.s,sr()+(o.ex?ex:'')+(o.nf?'':add(id=='cur'?'ipd':k,o.al)))+`<div class="card"><table><thead><tr>${o.h.map(x=>`<th>${x}</th>`).join('')}${o.nf?'':'<th>Actions</th>'}</tr></thead><tbody>${rows.length&&id!='ns'?rows.map(([r,i])=>`<tr>${o.c(r,i).map(x=>`<td>${typeof x=='string'&&x[0]=='<'?x.replace('IDX',i):esc(x)}</td>`).join('')}${o.nf?'':`<td><button class="btn s" data-a="edit:${k}:${i}">Edit</button> <button class="btn s r" data-a="del:${k}:${i}">✕</button></td>`}</tr>`).join(''):`<tr><td colspan="9" class="emp">Nothing here yet.</td></tr>`}</tbody></table></div>`}
const moneyCents=n=>'$'+((Number(n)||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const slipPeriod=s=>`${new Date(+s.period_year,(+s.period_month)-1,1).toLocaleString('en-US',{month:'short'})} ${s.period_year}`;
function doctorProfileHtml(){
  const d=D.dr.find(x=>x.id==doctorProfileId);if(!d)return '<p class="emp">Doctor not found.</p>';
  const slips=D.payslips.filter(s=>s.doctor_id==d.id).sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month||b.id-a.id);
  const total=slips.reduce((a,s)=>{const earn=s.position_allowance_cents+s.overtime_cents+s.benefits_cents,gross=s.basic_cents+s.position_allowance_cents;a.net+=gross+s.overtime_cents+s.benefits_cents-s.deduction_cents;a.gross+=gross;a.earn+=earn;a.deduction+=s.deduction_cents;return a},{net:0,gross:0,earn:0,deduction:0});
  const tabs=[['overview','Profile'],['payroll','Payroll'],['timeline','Timeline'],['documents','Documents']];
  const nav=`<div class="doctor-profile-tabs">${tabs.map(([k,l])=>`<button class="${doctorTab==k?'on':''}" data-a="drtab:${k}">${l}</button>`).join('')}</div>`;
  const photo=d.photo?`<img src="${API_BASE}/uploads/${esc(d.photo)}" alt="">`:'<span>👤</span>';
  const details=`<div class="doctor-detail-grid">${[['Department',d.department],['Specialist',d.specialist],['EPF No',d.epf_no||'--'],['Basic Salary',moneyCents(d.basic_salary_cents)],['Contract Type',d.contract_type],['Work Shift',d.workdays||d.av],['Work Location',d.work_location],['Date Of Joining',d.date_joined]].map(([k,v])=>`<div><span>${k}</span><b>${esc(v||'--')}</b></div>`).join('')}</div>`;
  let content='';
  if(doctorTab=='overview')content=details+`<div class="doctor-section"><h3>Employment Details</h3><p>${esc(d.role||'')} · ${esc(d.phone||'')}</p></div>`;
  else if(doctorTab=='payroll')content=`<div class="payroll-summary">${[['Total Net Salary Paid',total.net],['Total Gross Salary',total.gross],['Total Earning',total.earn],['Total Deduction',total.deduction]].map(([l,v])=>`<div><b>${l}</b><strong>${moneyCents(v)}</strong></div>`).join('')}</div>
<div class="payroll-toolbar"><button type="button" class="btn g" data-a="payslipadd">＋ Add Payslip</button></div>
<div class="card payroll-table-wrap"><table class="payroll-table"><thead><tr><th>Payslip #</th><th>Month / Year</th><th>Date Range</th><th>Basic Salary</th><th>Allowances</th><th>Earning</th><th>Deduction</th><th>Net Salary ($)</th><th>Action</th></tr></thead><tbody>${slips.map(s=>`<tr><td>PAY-${s.id}</td><td>${slipPeriod(s)}</td><td>${esc(s.date_start)} - ${esc(s.date_end)}</td><td>${moneyCents(s.basic_cents)}</td><td>${moneyCents(s.position_allowance_cents)}</td><td>${moneyCents(s.overtime_cents+s.benefits_cents)}</td><td>${moneyCents(s.deduction_cents)}</td><td><b>${moneyCents(s.basic_cents+s.position_allowance_cents+s.overtime_cents+s.benefits_cents-s.deduction_cents)}</b></td><td class="payroll-actions"><button class="btn s" data-a="payslipprint:${s.id}" title="Print">⎙</button><button class="btn s" data-a="payslipedit:${s.id}" title="Edit">✎</button><button class="btn s r" data-a="payslipdel:${s.id}" title="Delete">✕</button></td></tr>`).join('')||'<tr><td colspan="9" class="payroll-empty">▤<br>No payslips available</td></tr>'}</tbody></table></div>`;
  else if(doctorTab=='timeline')content=`<div class="doctor-section"><h3>Employment Timeline</h3>${d.date_joined?`<p><b>${esc(d.date_joined)}</b> · Joined ${esc(d.work_location||'clinic')}</p>`:'<p class="mu">No joining date recorded.</p>'}${slips.map(s=>`<p><b>${slipPeriod(s)}</b> · Payslip ${moneyCents(s.basic_cents+s.position_allowance_cents+s.overtime_cents+s.benefits_cents-s.deduction_cents)}</p>`).join('')||'<p class="mu">No payroll events yet.</p>'}</div>`;
  else content=`<div class="doctor-section"><h3>Documents</h3><p class="mu">No documents available.</p></div>`;
  const bars=String(d.code||'').split('').map((c,i)=>`<i style="height:${18+(c.charCodeAt(0)*i%22)}px;width:${i%3==0?3:2}px"></i>`).join('');
  return `<div class="doctor-profile-head"><button type="button" class="btn s" data-a="doctorback">‹ Doctors</button><button type="button" class="btn s" data-a="edit:dr:${D.dr.indexOf(d)}">Edit Doctor</button></div>
<section class="doctor-profile-card"><div class="doctor-profile-top"><div class="doctor-identity"><div class="doctor-profile-avatar">${photo}</div><div><h2>${esc(d.name)}</h2><span class="bd b">${esc(d.role||'Staff')}</span><p><span class="doctor-icon">⚿</span> ${esc(d.code)}　<a href="#" data-a="edit:dr:${D.dr.indexOf(d)}">✎</a></p></div></div><div class="doctor-badges"><div><span>Staff ID</span><b>${esc(d.code)}</b></div><div><span>Role</span><b>${esc(d.role||'--')}</b></div><div><span>Designation</span><b>${esc(d.specialist||d.role||'--')}</b></div><div class="doctor-barcode"><span>Barcode</span><div>${bars}</div><b>${esc(d.code)}</b></div></div></div>${details}</section>
<section class="doctor-profile-content">${nav}<div class="doctor-tab-content">${content}</div></section>`;
}
function medicineUnits(m){
  if(m.units){const rows=JSON.parse(m.units);if(Array.isArray(rows)&&rows.length)return rows}
  return[{name:'Unit',price:Number(m.price)||0,qty:1}];
}
function medicineUnitRow(unit={name:'',price:'',qty:1}){
  return `<div class="medicine-unit-row"><label>Unit name<input class="in unit-name" value="${esc(unit.name||'')}" placeholder="e.g. Tablet" required></label><label>Price (KHR)<input class="in unit-price" type="number" min="0" step="1" value="${esc(unit.price??'')}" placeholder="e.g. 5000" required></label><label>Qty per unit<input class="in unit-qty" type="number" min="1" step="1" value="${esc(unit.qty??1)}" required></label><button type="button" class="btn s r" data-a="medunitdel" aria-label="Remove sales unit">×</button></div>`;
}
function medicineFormHtml(){
  const editing=medicineEditIndex!=null,r=editing?D.med[medicineEditIndex]:{},units=editing?medicineUnits(r):[{name:'',price:'',qty:1}];
  return `<section class="card medicine-form-card"><button type="button" class="medicine-form-toggle" data-a="medformclose"><span>បញ្ចូលឱសថថ្មី / ${editing?'Edit Medicine':'Add New Medicine'}</span><span>⌃</span></button><form id="medicine-form" class="medicine-form">
<div class="medicine-image-field"><label>រូបភាពឱសថ / Medicine Image</label><div class="medicine-image-control"><div class="medicine-image-preview"><img id="pv_photo" src="${r.photo?`${API_BASE}/uploads/${esc(r.photo)}`:''}" alt="" ${r.photo?'':'hidden'}><span id="medicine-photo-placeholder" ${r.photo?'hidden':''}>⇧</span></div><input type="file" id="pf_photo" accept="image/*" hidden><input type="hidden" name="photo" id="pk_photo" value="${esc(r.photo||'')}"><button class="btn" type="button" data-a="medphoto">Upload</button></div></div>
<div class="medicine-basic-grid"><label>ឈ្មោះថ្នាំ / Drug name<input class="in" name="name" value="${esc(r.name||'')}" placeholder="e.g. Paracetamol" required maxlength="255"></label><label>សមាសធាតុ / Composition<input class="in" name="composition" value="${esc(r.composition||'')}" placeholder="e.g. 500mg"></label><label class="medicine-stock-field">ចំនួនក្នុងស្តុក / In Stock<input class="in" name="stock" type="number" min="0" step="1" value="${esc(r.stock??'')}" placeholder="e.g. 100" required></label></div>
<section class="medicine-units"><div class="medicine-units-heading"><b>ឯកតាលក់ / Sales unit</b><span class="mu">Set each selling unit, price, and base-stock quantity.</span></div><div id="medicine-units-list">${units.map(medicineUnitRow).join('')}</div><button type="button" class="btn s medicine-unit-add" data-a="medunitadd">＋ Add sales unit</button></section>
<div class="medicine-dates-grid"><label>ថ្ងៃផុតកំណត់ / Expiration date<input class="in" name="expiration_date" type="date" value="${esc(r.expiration_date||'')}"></label><label>ថ្ងៃជូនដំណឹង / Notification date<input class="in" name="notification_date" type="date" value="${esc(r.notification_date||'')}"></label></div>
<div class="medicine-form-actions"><button type="button" class="btn" data-a="medformclose">Cancel</button><button type="submit" class="btn p">${editing?'Save changes':'បន្ថែម / Add'}</button></div></form></section>`;
}
async function medicineSave(e){
  e.preventDefault();const form=e.target,fields=Object.fromEntries(new FormData(form));
  const units=Array.from(form.querySelectorAll('.medicine-unit-row')).map(row=>({
    name:row.querySelector('.unit-name').value.trim(),
    price:Number(row.querySelector('.unit-price').value),
    qty:Number(row.querySelector('.unit-qty').value),
  }));
  if(!units.length)return toast('Add at least one sales unit');
  const payload={...fields,stock:Number(fields.stock),price:units[0].price,units:JSON.stringify(units)};
  try{
    const editing=medicineEditIndex!=null,item=editing?D.med[medicineEditIndex]:null;
    await api(editing?'PUT':'POST',editing?'medicines/'+item.id:'medicines',payload);
    await load();medicineFormOpen=false;medicineEditIndex=null;medicineViewId=null;if(medicineFormReturnPage){rt=medicineFormReturnPage;medicineFormReturnPage=null}render();toast(editing?'Medicine updated':'Medicine added');
  }catch(error){toast(error.message)}
}
async function importMedicinesFile(file){
  if(!file)return;
  try{
    if(!/\.xlsx$/i.test(file.name||''))throw new Error('Choose an Excel workbook (.xlsx)');
    if(file.size>1e6)throw new Error('Import file must be smaller than 1 MB');
    const response=await fetch(API_BASE+'/api/medicines/import-xlsx',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',...(tok?{Authorization:'Bearer '+tok}:{})},body:await file.arrayBuffer()});
    const result=await response.json().catch(()=>null);
    if(response.status==401&&tok)logout();
    if(!response.ok)throw new Error(result&&result.error||'Request failed');
    await load();q='';render();toast(`${result.imported} medicines imported`);
  }catch(error){toast(error.message)}
}
async function exportDiagnoses(){
  try{
    const rows=D.dx.map((item)=>({name:item.name}));
    const response=await fetch(API_BASE+'/api/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({rows})});
    const blob=await response.blob();
    if(!response.ok){
      let err='';
      try{const data=await response.json();err=data.error||'';}catch(e){}
      throw new Error(err||'Export failed');
    }
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='diagnoses.xlsx';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast(error.message)}
}
async function importDiagnosesFile(file){
  if(!file)return;
  try{
    const isXlsx=/\.xlsx$/i.test(file.name||'');
    const isCsv=/\.csv$/i.test(file.name||'');
    if(!isXlsx&&!isCsv)throw new Error('Choose an Excel workbook or CSV file');
    if(file.size>1e6)throw new Error('Import file must be smaller than 1 MB');
    const response=await fetch(API_BASE+'/api/diagnoses/import-xlsx',{method:'POST',headers:{'Content-Type':isCsv?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',...(tok?{Authorization:'Bearer '+tok}:{})},body:await file.arrayBuffer()});
    const result=await response.json().catch(()=>null);
    if(response.status==401&&tok)logout();
    if(response.status==404)throw new Error('Diagnosis import API not found. Restart or redeploy the backend, then try again.');
    if(!response.ok)throw new Error(result&&result.error||'Request failed');
    await load();q='';render();toast(`${result.imported} diagnoses imported`);
  }catch(error){toast(error.message)}
}
let dFrom='',dTo='';
let reportFrom='',reportTo='',reportQuery='',reportRange='';
let medicineReportFrom='',medicineReportTo='';
let doctorAnalyticsFrom='',doctorAnalyticsTo='',doctorAnalyticsId='';
function medicineActions(m,showView=true){const i=D.med.indexOf(m);return`<div class="medicine-actions">${showView?`<button class="btn s" title="View details" aria-label="View details" data-a="medview:${m.id}">View</button>`:''}<button class="btn s" title="Update Stock" aria-label="Update Stock" data-a="medstock:${i}">↻</button><button class="btn s" title="View Composition" aria-label="View Composition" data-a="medcomposition:${i}">▤</button><button class="btn s" title="Print QR Code" aria-label="Print QR Code" data-a="medqr:${i}">▦</button><button class="btn s" title="Print Barcode" aria-label="Print Barcode" data-a="medbarcode:${i}">▥</button><button class="btn s" title="Edit" aria-label="Edit" data-a="mededit:${i}">✎</button><button class="btn s r" title="Delete" aria-label="Delete" data-a="del:med:${i}">×</button></div>`}
let analyticsFrom='',analyticsTo='',analyticsPeriod='daily';
function analyticsDate(value){
  const text=String(value||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const date=new Date(text);
  return Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function analyticsInRange(date){return !!date&&(!analyticsFrom||date>=analyticsFrom)&&(!analyticsTo||date<=analyticsTo)}
function analyticsRecords(){
  const income=[
    ...D.billing.filter(record=>record.kind=='payment').map(record=>({date:analyticsDate(record.date),amount:Number(billingData(record).amount)||0})),
    ...D.sales.map(sale=>({date:analyticsDate(sale.created_at),amount:Number(sale.total)||0}))
  ].filter(record=>analyticsInRange(record.date));
  const expenses=D.expenses.map(expense=>({date:analyticsDate(expense.date),amount:Number(expense.amount)||0})).filter(record=>analyticsInRange(record.date));
  const periods=new Map(),add=(date,key,amount)=>{const row=periods.get(key)||{label:key,income:0,expenses:0};row[date]+=amount;periods.set(key,row)};
  const periodKey=date=>analyticsPeriod=='yearly'?date.slice(0,4):analyticsPeriod=='monthly'?date.slice(0,7):date;
  income.forEach(record=>add('income',periodKey(record.date),record.amount));
  expenses.forEach(record=>add('expenses',periodKey(record.date),record.amount));
  const series=[...periods.values()].sort((a,b)=>a.label.localeCompare(b.label));
  const medicines=new Map();
  D.medicineSales.filter(row=>analyticsInRange(analyticsDate(row.date))).forEach(row=>{
    const name=String(row.name||'').trim();if(name)medicines.set(name,(medicines.get(name)||0)+(Number(row.qty)||0));
  });
  const services=new Map();
  D.ap.filter(row=>analyticsInRange(analyticsDate(row.date))&&String(row.st||'').toLowerCase()!='cancelled').forEach(row=>{
    const name=String(row.svc||'').trim();if(name)services.set(name,(services.get(name)||0)+1);
  });
  return {series,medicines:[...medicines].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).slice(0,6),services:[...services].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).slice(0,6)};
}
function analyticsFinancialChart(series){
  const width=900,height=300,left=70,right=20,top=18,bottom=48,chartWidth=width-left-right,chartHeight=height-top-bottom;
  if(!series.length)return `<div class="analytics-chart-empty">${T('No financial activity found for this date range.')}</div>`;
  const values=series.flatMap(row=>[row.income,row.expenses,row.income-row.expenses]),min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
  const x=index=>left+(series.length==1?chartWidth/2:index*chartWidth/(series.length-1)),y=value=>top+(max-value)*chartHeight/range;
  const colors={income:'#22c55e',expenses:'#f97316',profit:'#6366f1'};
  const line=(key,value)=>`<polyline fill="none" stroke="${colors[key]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${series.map((row,index)=>`${x(index)},${y(value(row))}`).join(' ')}"/>`;
  const grid=Array.from({length:5},(_,index)=>{const value=max-index*range/4,gy=y(value);return`<g><line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" stroke="var(--bd)" stroke-dasharray="3 4"/><text x="${left-10}" y="${gy+4}" text-anchor="end" class="analytics-axis-label">${Math.round(value).toLocaleString('en-US')}</text></g>`}).join('');
  const stride=Math.max(1,Math.ceil(series.length/7)),labels=series.map((row,index)=>index%stride==0||index==series.length-1?`<text x="${x(index)}" y="${height-17}" text-anchor="middle" class="analytics-axis-label">${esc(row.label)}</text>`:'').join('');
  const points=key=>series.map((row,index)=>{const value=key=='profit'?row.income-row.expenses:row[key];return`<circle cx="${x(index)}" cy="${y(value)}" r="3" fill="${colors[key]}"><title>${esc(row.label)} · ${T(key=='profit'?'Profit':key=='income'?'Income':'Expense')}: ${esc(K(value))}</title></circle>`}).join('');
  return `<div class="analytics-chart-scroll"><svg class="analytics-financial-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Income, expenses, and profit by ${analyticsPeriod}">${grid}<line x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}" stroke="var(--bd)"/>${labels}${line('income',row=>row.income)}${line('expenses',row=>row.expenses)}${line('profit',row=>row.income-row.expenses)}${points('income')}${points('expenses')}${points('profit')}</svg></div><div class="analytics-legend"><span><i style="background:${colors.income}"></i>${T('Income')}</span><span><i style="background:${colors.expenses}"></i>${T('Expense')}</span><span><i style="background:${colors.profit}"></i>${T('Profit')}</span></div>`;
}
function analyticsMedicineChart(items){
  const max=Math.max(1,...items.map(item=>item.value));
  return items.length?`<div class="analytics-bars">${items.map((item,index)=>`<div class="analytics-bar-row"><span title="${esc(item.name)}">${esc(item.name)}</span><div><i style="width:${item.value/max*100}%;background:${['#3b82f6','#14b8a6','#fbbf24','#f97316','#8b87d8','#ec4899'][index]}"></i></div><b>${item.value.toLocaleString('en-US')}</b></div>`).join('')}</div>`:`<div class="analytics-chart-empty">${T('No medicine sales found for this date range.')}</div>`;
}
function analyticsServiceChart(items){
  if(!items.length)return `<div class="analytics-chart-empty">${T('No non-cancelled services found for this date range.')}</div>`;
  const colors=['#1689f8','#00c49f','#ffbb28','#ff8042','#8884d8','#ec4899'],total=items.reduce((sum,item)=>sum+item.value,0);
  let angle=-Math.PI/2;
  const slices=items.map((item,index)=>{
    const start=angle,portion=item.value/total;angle+=portion*Math.PI*2;
    if(portion>=.9999)return`<circle cx="120" cy="105" r="76" fill="${colors[index]}"><title>${esc(item.name)}: ${item.value}</title></circle>`;
    const x1=120+76*Math.cos(start),y1=105+76*Math.sin(start),x2=120+76*Math.cos(angle),y2=105+76*Math.sin(angle),large=portion>.5?1:0,mid=start+portion*Math.PI;
    return`<path d="M 120 105 L ${x1} ${y1} A 76 76 0 ${large} 1 ${x2} ${y2} Z" fill="${colors[index]}"><title>${esc(item.name)}: ${item.value}</title></path><text x="${120+91*Math.cos(mid)}" y="${109+91*Math.sin(mid)}" text-anchor="middle" class="analytics-pie-label">${item.value}</text>`;
  }).join('');
  return `<svg class="analytics-pie-svg" viewBox="0 0 240 210" role="img" aria-label="Appointments by service">${slices}</svg><div class="analytics-service-legend">${items.map((item,index)=>`<span title="${esc(item.name)}"><i style="background:${colors[index]}"></i>${esc(item.name)} <b>${item.value}</b></span>`).join('')}</div>`;
}
function doctorAnalyticsRows(){
  const names=new Map(D.dr.map(doctor=>[String(doctor.name||'').trim().toLocaleLowerCase(),String(doctor.name||'').trim()]).filter(([key])=>key));
  D.ap.forEach(appointment=>{const name=String(appointment.doc||'').trim();if(name&&!names.has(name.toLocaleLowerCase()))names.set(name.toLocaleLowerCase(),name)});
  const doctors=[...names.values()].sort((a,b)=>a.localeCompare(b));
  const counts=new Map(doctors.map(name=>[name,new Set()]));
  D.ap.forEach(appointment=>{
    const date=analyticsDate(appointment.date),doctor=String(appointment.doc||'').trim(),key=doctor.toLocaleLowerCase();
    if(!doctor||String(appointment.st||'').toLowerCase()=='cancelled'||(doctorAnalyticsId&&key!=doctorAnalyticsId)||!analyticsInDateRange(date,doctorAnalyticsFrom,doctorAnalyticsTo))return;
    const canonical=names.get(key);if(!canonical)return;
    const patient=String(appointment.phone||'').replace(/\D/g,'')||String(appointment.name||'').trim().toLocaleLowerCase();
    if(patient)counts.get(canonical).add(patient);
  });
  return doctors.filter(name=>!doctorAnalyticsId||name.toLocaleLowerCase()==doctorAnalyticsId).map(name=>({name,count:counts.get(name).size}));
}
function analyticsInDateRange(date,from,to){return !!date&&(!from||date>=from)&&(!to||date<=to)}
function doctorAnalyticsChart(rows){
  if(!rows.length)return `<div class="doctor-analytics-empty">${T('No doctors found.')}</div>`;
  const step=Math.max(1,Math.ceil(Math.max(1,...rows.map(row=>row.count))/4)),max=step*4,width=Math.max(1100,rows.length*140),height=270,left=52,right=18,top=18,bottom=44,chartWidth=width-left-right,chartHeight=height-top-bottom,slot=chartWidth/rows.length,barWidth=Math.min(76,slot*.72),y=value=>top+(max-value)*chartHeight/max;
  const grid=Array.from({length:5},(_,index)=>{const value=max-index*step,gy=y(value);return`<g><line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" stroke="var(--bd)" stroke-dasharray="3 4"/><text x="${left-8}" y="${gy+4}" text-anchor="end" class="doctor-analytics-axis-label">${value}</text></g>`}).join('');
  const bars=rows.map((row,index)=>{const x=left+slot*index+(slot-barWidth)/2,barHeight=(row.count/max)*chartHeight;return`<g class="doctor-analytics-bar" tabindex="0" role="img" aria-label="${esc(row.name)}. ${T('Number of Patients')}: ${row.count}"><rect x="${x}" y="${y(row.count)}" width="${barWidth}" height="${barHeight}" rx="1" fill="#8884d8"/><rect class="doctor-analytics-hover-target" x="${left+slot*index}" y="${top}" width="${slot}" height="${chartHeight}" fill="transparent"/><g class="doctor-analytics-tooltip" transform="translate(${Math.max(left,Math.min(width-right-230,x+barWidth/2-94))} ${Math.max(top,y(row.count)-72)})"><rect width="218" height="62" rx="2"/><text x="10" y="23" class="doctor-analytics-tooltip-name">${esc(row.name)}</text><text x="10" y="49" class="doctor-analytics-tooltip-count">${T('Number of Patients')}: ${row.count}</text></g><text x="${x+barWidth/2}" y="${height-bottom+18}" text-anchor="middle" class="doctor-analytics-axis-label">${esc(row.name)}</text></g>`}).join('');
  return `<div class="doctor-analytics-chart-scroll"><svg class="doctor-analytics-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${T('Patients per Doctor')}">${grid}<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" stroke="var(--mu)"/>${bars}</svg></div><div class="doctor-analytics-legend"><i></i>${T('Number of Patients')}</div>`;
}
let rxSelected=new Map(),rxMedicineSearch='';
function rxTemplateMeds(value){
  try{
    const parsed=JSON.parse(value||'');
    if(Array.isArray(parsed))return parsed.map(item=>typeof item=='string'?{name:item}:item).filter(item=>item&&item.name);
  }catch(e){}
  return String(value||'').split(',').map(name=>name.trim()).filter(Boolean).map(name=>({name}));
}
function rxMedicineRows(){
  const query=rxMedicineSearch.trim().toLowerCase();
  return D.med.filter(m=>!query||`${m.name} ${m.composition||''}`.toLowerCase().includes(query)).map(m=>{
    const selected=rxSelected.has(String(m.id));
    return `<button type="button" class="rx-medicine-option ${selected?'selected':''}" data-a="rxmedicine:${m.id}" aria-pressed="${selected}"><span class="rx-medicine-check">${selected?'✓':''}</span><span class="rx-medicine-description"><b>${esc(m.name)}</b><small>${esc([m.composition,`Stock: ${Number(m.stock)||0}`].filter(Boolean).join(' · '))}</small></span><b class="rx-medicine-price">${K(m.price)}</b></button>`;
  }).join('')||`<p class="rx-empty">No medicines found.</p>`;
}
function rxTemplateRows(){
  return [...rxSelected.entries()].map(([id,medicine])=>`<tr><td class="rx-template-medicine">${esc(medicine.name)}</td>${[['morning','Morning'],['noon','Noon'],['evening','Evening'],['duration','Days'],['quantity','Qty'],['instruction','Instructions']].map(([key,label])=>`<td><input class="in rx-dose-input" data-rx-id="${esc(id)}" data-rx-field="${key}" aria-label="${label} for ${esc(medicine.name)}" value="${esc(medicine[key]??'')}" ${key=='duration'||key=='quantity'?'type="number" min="0" step="1"':''}></td>`).join('')}<td><button type="button" class="btn s r" data-a="rxmedicine:${esc(id)}" aria-label="Remove ${esc(medicine.name)}">×</button></td></tr>`).join('')||'<tr><td colspan="8" class="rx-table-empty">Select medicines above to build the prescription.</td></tr>';
}
function rxTemplateForm(index=null){
  const editing=index!=null,template=editing?D.rx[index]:null;
  if(editing&&!template)return toast('Prescription template not found');
  rxMedicineSearch='';
  rxSelected=new Map();
  if(template)rxTemplateMeds(template.meds).forEach((item,position)=>{
    const medicine=D.med.find(candidate=>(item.medicine_id&&String(candidate.id)==String(item.medicine_id))||candidate.name.toLowerCase()==String(item.name).toLowerCase());
    const id=String(medicine?medicine.id:item.medicine_id||`legacy-${position}`);
    rxSelected.set(id,{...item,id,name:medicine?medicine.name:String(item.name),medicine_id:medicine?medicine.id:item.medicine_id});
  });
  const form=$('#mf');
  form.className='rx-template-form';
  form.innerHTML=`<div class="rx-template-heading"><h3>${editing?'Edit Template':'Create Template'}</h3><button type="button" class="btn s" data-a="close" aria-label="Close">×</button></div><label class="rx-disease-field">Disease Name <span>*</span><input class="in" name="name" value="${esc(template?.name||'')}" placeholder="Enter disease name" required autofocus></label><div class="rx-medicines-field"><label for="rx-medicine-search">Medicines</label><div class="rx-search-wrap"><span>⌕</span><input class="in" id="rx-medicine-search" placeholder="ស្វែងរកថ្នាំ / Search Medicine..."></div><div id="rx-medicine-list" class="rx-medicine-list">${rxMedicineRows()}</div></div><div class="rx-prescription-table-wrap"><table class="rx-prescription-table"><thead><tr><th>ឈ្មោះថ្នាំ</th><th>ព្រឹក</th><th>ថ្ងៃ</th><th>ល្ងាច</th><th>រយៈពេល (ថ្ងៃ)</th><th>ចំនួន</th><th>ការណែនាំ</th><th></th></tr></thead><tbody id="rx-prescription-rows">${rxTemplateRows()}</tbody></table></div><div class="rx-template-actions"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn p">${editing?'Update Template':'Save Template'}</button></div>`;
  $('#md').classList.add('on');
  $('#rx-medicine-search').addEventListener('input',event=>{
    rxMedicineSearch=event.target.value;
    $('#rx-medicine-list').innerHTML=rxMedicineRows();
  });
  form.onsubmit=async event=>{
    event.preventDefault();
    const name=String(new FormData(form).get('name')||'').trim();
    if(!name)return toast('Disease name is required');
    const meds=[...rxSelected.values()].map(({id,...item})=>item);
    if(!meds.length)return toast('Select at least one medicine');
    try{
      await api(editing?'PUT':'POST',editing?'prescriptions/'+template.id:'prescriptions',{name,meds:JSON.stringify(meds)});
      await load();$('#md').classList.remove('on');render();toast('Saved');
    }catch(error){toast(error.message)}
  };
}
function toggleRxMedicine(id){
  id=String(id);
  if(rxSelected.has(id))rxSelected.delete(id);
  else{
    const medicine=D.med.find(item=>String(item.id)==id);
    if(!medicine)return;
    rxSelected.set(id,{medicine_id:medicine.id,name:medicine.name,morning:'',noon:'',evening:'',duration:'',quantity:'',instruction:''});
  }
  const list=$('#rx-medicine-list'),rows=$('#rx-prescription-rows');
  if(list)list.innerHTML=rxMedicineRows();
  if(rows)rows.innerHTML=rxTemplateRows();
}
function medicineDetailHtml(m){const units=medicineUnits(m),today=new Date().toISOString().slice(0,10);return`<section class="card medicine-detail"><div class="medicine-detail-head"><button class="btn" data-a="medback">← Back to Medicines</button>${medicineActions(m,false)}</div><div class="medicine-detail-hero">${m.photo?`<img class="medicine-detail-photo" src="${API_BASE}/uploads/${esc(m.photo)}" alt="${esc(m.name)}">`:'<div class="medicine-detail-photo medicine-thumb-empty">💊</div>'}<div><h2>${esc(m.name)}</h2><p class="mu">Medicine ID: ${esc(m.id)}</p><span class="bd ${Number(m.stock)>0?'':'x'}">${Number(m.stock)||0} in stock</span></div></div><div class="medicine-detail-grid"><section><h3>Composition</h3><p>${m.composition?esc(m.composition):'<span class="mu">No composition has been added.</span>'}</p></section><section><h3>Sales units and prices</h3>${units.length?`<div class="medicine-detail-units">${units.map(u=>`<div><span>${esc(u.name)} <small>× ${esc(u.qty)}</small></span><b>${K(u.price)}</b></div>`).join('')}</div>`:'<p class="mu">No sales units have been added.</p>'}</section><section><h3>Inventory dates</h3><p>Expiration: <b class="${m.expiration_date&&m.expiration_date<=today?'medicine-expired':''}">${m.expiration_date?esc(m.expiration_date):'—'}</b></p><p>Notification: <b class="${m.notification_date&&m.notification_date<=today?'medicine-expired':''}">${m.notification_date?esc(m.notification_date):'—'}</b></p></section></div></section>`}
function reportEntries(){
  const payments=D.billing.filter(record=>record.kind=='payment').map(record=>{
    const data=billingData(record),patient=D.pt.find(item=>String(item.id)==String(record.patient_id));
    return {id:record.id,kind:'payment',date:String(record.date||'').slice(0,10),person:patient?patient.name:'Patient',details:data.method||'Patient payment',amount:Number(data.amount)||0,canDelete:D.user.role=='admin'||record.created_by==D.user.id};
  });
  const sales=D.sales.map(sale=>({id:sale.id,kind:'sale',date:String(sale.created_at||'').slice(0,10),person:'POS',details:`Medicine sale · ${sale.method||'Cash'}`,amount:Number(sale.total)||0,canDelete:false}));
  const expenses=D.expenses.map(expense=>({id:expense.id,kind:'expense',date:expense.date,person:expense.category||'Expense',details:expense.name,amount:Number(expense.amount)||0,canDelete:D.user.role=='admin'}));
  const matches=entry=>{
    if(reportFrom&&entry.date<reportFrom)return false;
    if(reportTo&&entry.date>reportTo)return false;
    if(reportQuery){
      const patient=entry.kind=='payment'?D.pt.find(item=>String(item.id)==String(D.billing.find(record=>record.kind=='payment'&&record.id==entry.id)?.patient_id)):null;
      if(!`${entry.person} ${entry.details} ${patient?patient.name:''} ${entry.amount}`.toLowerCase().includes(reportQuery.toLowerCase()))return false;
    }
    return true;
  };
  return {income:[...payments,...sales].filter(matches).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id),expenses:expenses.filter(matches).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id)};
}
function reportExpenseForm(){
  const form=$('#mf');form.className='report-expense-form';
  const today=new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);
  form.innerHTML=`<div class="report-form-heading"><h3>${T('Add Expense')}</h3><button type="button" class="report-expense-close" data-a="close" aria-label="${T('Close')}">×</button></div><label class="report-expense-row"><span>${T('Date')}</span><input class="in" name="date" type="date" value="${today}" required></label><label class="report-expense-row"><span>${T('Item')}</span><input class="in" name="name" required autofocus></label><label class="report-expense-row"><span>${T('Category')}</span><input class="in" name="category"></label><label class="report-expense-row"><span>${T('Unit Price (KHR)')}</span><input class="in" name="unit_price" type="number" min="0" max="2000000000" step="1" required></label><label class="report-expense-row"><span>${T('Quantity')}</span><input class="in" name="quantity" type="number" min="1" max="2000000000" step="1" value="1" required></label><label class="report-expense-row"><span>${T('Total (KHR)')}</span><input class="in report-expense-total" name="total" value="0" readonly aria-readonly="true"></label><label class="report-expense-row report-expense-notes"><span>${T('Notes')}</span><textarea class="in" name="notes" rows="2"></textarea></label><div class="report-form-actions"><button type="submit" class="btn p">${T('Save Expense')}</button></div>`;
  $('#md').classList.add('on');
  const priceInput=form.querySelector('[name="unit_price"]'),quantityInput=form.querySelector('[name="quantity"]'),totalInput=form.querySelector('[name="total"]');
  const updateTotal=()=>{const price=Number(priceInput.value)||0,quantity=Number(quantityInput.value)||0;totalInput.value=(price*quantity).toLocaleString('en-US')};
  priceInput.addEventListener('input',updateTotal);quantityInput.addEventListener('input',updateTotal);
  form.onsubmit=async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form)),name=String(values.name||'').trim(),unit_price=Number(values.unit_price),quantity=Number(values.quantity),amount=unit_price*quantity;
    if(!name)return toast('Expense name is required');
    if(!Number.isInteger(unit_price)||unit_price<0||unit_price>2000000000||!Number.isInteger(quantity)||quantity<1||quantity>2000000000||!Number.isSafeInteger(amount)||amount<1||amount>2000000000)return toast('Enter a valid unit price and quantity; total must be between 1 and 2,000,000,000 KHR');
    try{await api('POST','expenses',{name,category:String(values.category||'').trim(),date:String(values.date||''),unit_price,quantity,amount,notes:String(values.notes||'').trim()});await load();$('#md').classList.remove('on');render();toast('Expense saved')}catch(error){toast(error.message)}
  };
}
function reportSetRange(range){
  const today=new Date(),date=value=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  reportRange=range;
  if(range=='today')reportFrom=reportTo=date(today);
  else if(range=='yesterday'){today.setDate(today.getDate()-1);reportFrom=reportTo=date(today)}
  else if(range=='month'){reportFrom=date(new Date(today.getFullYear(),today.getMonth(),1));reportTo=date(today)}
  render();
}
async function exportReport(){
  const {income,expenses}=reportEntries(),rows=[...income.map(item=>({type:'Income',date:item.date,source:item.person,details:item.details,amount:item.amount})),...expenses.map(item=>({type:'Expense',date:item.date,source:item.person,details:item.details,amount:item.amount}))];
  if(!rows.length)return toast('No report records to export');
  try{
    const response=await fetch(API_BASE+'/api/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({rows})});
    if(response.status==401&&tok)logout();
    if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result&&result.error||'Report export failed')}
    const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');anchor.href=url;anchor.download='financial-report.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast(error.message)}
}
function reportPrint(kind){
  const {income,expenses}=reportEntries(),sum=items=>items.reduce((total,item)=>total+item.amount,0);
  if(kind=='payroll'){
    const slips=D.payslips.filter(slip=>(!reportFrom||slip.date_start>=reportFrom)&&(!reportTo||slip.date_end<=reportTo));
    const rows=slips.map(slip=>{const doctor=D.dr.find(item=>item.id==slip.doctor_id);return`<tr><td>${esc(doctor?doctor.name:'')}</td><td>${esc(slip.date_start)} – ${esc(slip.date_end)}</td><td>${moneyCents(slip.basic_cents)}</td><td>${moneyCents(slip.deduction_cents)}</td><td>${moneyCents(slip.basic_cents+slip.position_allowance_cents+slip.overtime_cents+slip.benefits_cents-slip.deduction_cents)}</td></tr>`}).join('');
    return printDoc('Payroll Report',`<table><thead><tr><th>Employee</th><th>Period</th><th>Basic salary</th><th>Deduction</th><th>Net salary</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No payroll records found.</td></tr>'}</tbody></table>`);
  }
  const selected=kind=='cash'?income.filter(item=>item.kind=='payment'):income;
  const title=kind=='cash'?'Cash Payment Report':'Bill Summary';
  const rows=selected.map(item=>`<tr><td>${esc(item.date)}</td><td>${esc(item.person)}</td><td>${esc(item.details)}</td><td>${K(item.amount)}</td></tr>`).join('');
  printDoc(title,`<h2>${esc(title)}</h2><p>${esc(reportFrom||'All dates')} – ${esc(reportTo||'All dates')}</p><p>Total income: <b>${K(sum(income))}</b> | Expenses: <b>${K(sum(expenses))}</b> | Balance: <b>${K(sum(income)-sum(expenses))}</b></p><table><thead><tr><th>Date</th><th>Source</th><th>Details</th><th>Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No income records found.</td></tr>'}</tbody></table>`);
}
function medicineReportRows(){
  return D.medicineSales.filter(row=>(!medicineReportFrom||row.date>=medicineReportFrom)&&(!medicineReportTo||row.date<=medicineReportTo));
}
async function medicineReportApply(){
  const from=$('#medicine-report-from').value,to=$('#medicine-report-to').value;
  if(from&&to&&from>to)return toast(T('From date must not be after To date'));
  medicineReportFrom=from;medicineReportTo=to;
  try{D.medicineSales=await api('GET',`reports/medicine-sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5000`);render()}catch(error){toast(error.message)}
}
async function medicineReportExport(){
  const rows=medicineReportRows().map(row=>({medicine:row.name,date:row.date,quantity:row.qty,unit_price:row.price,total:row.total}));
  if(!rows.length)return toast(T('No medicine sales to export'));
  try{
    const response=await fetch(API_BASE+'/api/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({rows})});
    if(response.status==401&&tok)logout();
    if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result&&result.error||T('Medicine report export failed'))}
    const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');anchor.href=url;anchor.download='medicine-report.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast(error.message)}
}
const R={mr(){
  const rows=medicineReportRows(),quantity=rows.reduce((total,row)=>total+(Number(row.qty)||0),0),revenue=rows.reduce((total,row)=>total+(Number(row.total)||0),0);
  const date=(label,id,value)=>`<label class="medicine-report-date"><span>${T(label)}</span><input class="in" id="${id}" type="date" value="${esc(value)}"></label>`;
  const tableRows=rows.map(row=>`<tr><td><b>${esc(row.name)}</b></td><td>${new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US')}</td><td>${Number(row.qty)||0}</td><td class="medicine-report-total">${K(row.total)}</td><td>${D.user.role=='admin'?`<button class="btn medicine-report-delete" data-a="medreportdelete:${row.sale_id}:${row.item_id}" aria-label="${T('Delete')} ${esc(row.name)}" title="${T('Delete')}">▣</button>`:''}</td></tr>`).join('')||`<tr><td class="medicine-report-empty" colspan="5">${T('No medicine sales found for this date range.')}</td></tr>`;
  return `<header class="medicine-report-heading"><h2>${T('Medicine sales report')}</h2><p>${T('Track medicine quantities and sales revenue by date.')}</p></header><section class="card medicine-report-filters">${date('From date','medicine-report-from',medicineReportFrom)}${date('To date','medicine-report-to',medicineReportTo)}<button type="button" class="btn p" data-a="medreportapply">${T('Search')}</button><button type="button" class="btn medicine-report-export" data-a="medreportexport">${T('Export Excel')}</button></section><section class="medicine-report-summary"><article class="card"><span>${T('Quantity sold')}</span><strong>${quantity.toLocaleString('en-US')}</strong><i>▱</i></article><article class="card"><span>${T('Total revenue')}</span><strong>${K(revenue)}</strong><i>▥</i></article></section><section class="card medicine-report-table-wrap"><table class="medicine-report-table"><thead><tr><th>${T('Medicine name')}</th><th>${T('Date sold')}</th><th>${T('Quantity')}</th><th>${T('Total')}</th><th>${T('Actions')}</th></tr></thead><tbody>${tableRows}</tbody></table></section>`;
},
sf(){return sampleFilePage()},
bill(){
  const {income,expenses}=reportEntries(),sum=items=>items.reduce((total,item)=>total+item.amount,0),patientTotal=sum(income.filter(item=>item.kind=='payment')),salesTotal=sum(income.filter(item=>item.kind=='sale')),expenseTotal=sum(expenses),totalIncome=patientTotal+salesTotal;
  const quick=(label,key)=>`<button class="btn report-quick ${reportRange==key?'active':''}" data-a="reportrange:${key}">${T(label)}</button>`;
  const rows=(items,expense)=>items.map(item=>`<tr><td>${esc(item.date)}</td><td>${esc(item.person)}</td><td>${esc(item.details)}</td><td class="report-amount">${K(item.amount)}</td><td>${item.canDelete?`<button class="btn report-delete" data-a="reportdelete:${item.kind}:${item.id}" aria-label="Delete ${esc(item.details)}">▣</button>`:''}</td></tr>`).join('')||`<tr><td class="report-empty" colspan="5">No ${expense?'expenses':'income'} found for this period.</td></tr>`;
  const dateInput=(label,id,value)=>`<label class="report-date-field">${label}<input id="${id}" type="date" class="in" value="${esc(value)}"></label>`;
  const controls=`<div class="report-toolbar card"><div class="report-filter-line"><label class="report-search-field"><span>${T('Patient')}</span><input id="report-q" class="in" placeholder="${T('Search patient, details...')}" value="${esc(reportQuery)}"></label>${dateInput(T('From date'),'report-from',reportFrom)}${dateInput(T('To date'),'report-to',reportTo)}<button class="btn p" data-a="reportapply">⌕ ${T('Search')}</button><button class="btn p" data-a="reportexport">⇩ ${T('Export Excel')}</button><button class="btn p" data-a="reportexpense">＋ ${T('Add Expense')}</button></div><div class="report-action-line">${quick('Today','today')}${quick('Yesterday','yesterday')}${quick('This month','month')}<button class="btn" data-a="reportprint:summary">▣ ${T('Bill Summary')}</button><button class="btn" data-a="reportprint:cash">▣ ${T('CP')}</button><button class="btn" data-a="reportprint:payroll">▣ ${T('Payroll Report')}</button></div></div>`;
  const cards=[[T('Patient Payments'),patientTotal,''],[T('POS Sales'),salesTotal,''],[T('Total Income'),totalIncome,'income'],[T('Expenses'),expenseTotal,'expense']];
  const cashRows=`<section class="card report-ledger income-ledger"><h3><span>⊕</span> ${T('Income')}</h3><div class="report-ledger-scroll"><table><thead><tr><th>${T('Date')}</th><th>${T('Patient / Source')}</th><th>${T('Details')}</th><th>${T('Amount')}</th><th></th></tr></thead><tbody>${rows(income,false)}</tbody></table></div></section>`;
  const expenseRows=`<section class="card report-ledger expense-ledger"><h3><span>⊖</span> ${T('Expenses')}</h3><div class="report-ledger-scroll"><table><thead><tr><th>${T('Date')}</th><th>${T('Category')}</th><th>${T('Expense')}</th><th>${T('Amount')}</th><th></th></tr></thead><tbody>${rows(expenses,true)}</tbody></table></div></section>`;
  return hd(T('Financial Report'),'','')+controls+`<div class="report-summary">${cards.map(([label,amount,color])=>`<article class="card report-stat"><b>${label}</b><strong class="${color}">${K(amount)}</strong></article>`).join('')}</div><div class="report-ledgers">${cashRows}${expenseRows}</div>`;
},
med(){const rows=ft('med');return hd('Medicines','Manage your pharmacy list.',sr('Search medicines…')+`<button class="btn" data-a="medimport">Import Excel</button><input id="med-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>`+ex+`<button class="btn" title="Export QR Codes for listed medicines" data-a="medqrbulk">Export QR Codes</button><button class="btn" title="Export Barcodes for listed medicines" data-a="medbarcodebulk">Export Barcodes</button><button class="btn g" data-a="medadd">+ Add New Medicine</button>`)+
 (medicineFormOpen?medicineFormHtml():'')+
`<div class="card medicine-table-wrap"><table class="medicine-table"><thead><tr><th>Medicine</th><th>Sales units / Price</th><th>In stock</th><th>Expiration / Notification</th><th>Actions</th></tr></thead><tbody>${rows.map(([m,i])=>{const units=medicineUnits(m),today=new Date().toISOString().slice(0,10),alert=(m.expiration_date&&m.expiration_date<=today)||(m.notification_date&&m.notification_date<=today);return`<tr><td><div class="medicine-name">${m.photo?`<img class="medicine-thumb" src="${API_BASE}/uploads/${esc(m.photo)}" alt="">`:'<span class="medicine-thumb medicine-thumb-empty">💊</span>'}<div><b>${esc(m.name)}</b>${m.composition?`<small>${esc(m.composition)}</small>`:''}</div></div></td><td><div class="medicine-unit-list">${units.map(u=>`<span>${esc(u.name)}: <b>${K(u.price)}</b> <small>× ${u.qty}</small></span>`).join('')||'<span>—</span>'}</div></td><td><span class="bd ${m.stock>0?'':'x'}">${Number(m.stock)||0}</span></td><td><span class="${alert?'medicine-expired':''}">${m.expiration_date?`Expiry: ${esc(m.expiration_date)}`:'—'}</span>${m.notification_date?`<small class="medicine-notify ${m.notification_date<=today?'medicine-expired':''}">Notify: ${esc(m.notification_date)}</small>`:''}</td><td><div class="medicine-actions"><button class="btn s" title="Update Stock" aria-label="Update Stock" data-a="medstock:${i}">↻</button><button class="btn s" title="View Composition" aria-label="View Composition" data-a="medcomposition:${i}">▤</button><button class="btn s" title="Print QR Code" aria-label="Print QR Code" data-a="medqr:${i}">▦</button><button class="btn s" title="Print Barcode" aria-label="Print Barcode" data-a="medbarcode:${i}">▥</button><button class="btn s" title="Edit" aria-label="Edit" data-a="mededit:${i}">✎</button><button class="btn s r" title="Delete" aria-label="Delete" data-a="del:med:${i}">×</button></div></td></tr>`}).join('')||'<tr><td colspan="5" class="emp">Nothing here yet.</td></tr>'}</tbody></table></div>`},
dx(){const rows=ft('dx');return hd('Diagnosis','Diagnoses available when writing a visit.',`<button class="btn diagnosis-secondary" data-a="go:sy">☰ Symptoms List</button><button class="btn diagnosis-icon" data-a="dximport" title="Import diagnoses">⇪</button><button class="btn diagnosis-icon" data-a="dxexport" title="Export diagnoses">⇩</button><button class="btn diagnosis-primary" data-a="add:dx" title="${T('New Diagnosis')}">＋ ${T('New Diagnosis')}</button><input id="dx-import-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>`)+`<div class="diagnosis-shell"><div class="diagnosis-search"><span class="diagnosis-search-icon">⌕</span><input id="q" class="diagnosis-input" placeholder="Search diagnoses..." value="${esc(q)}"></div><div class="diagnosis-list">${rows.length?rows.map(([r,i])=>`<div class="diagnosis-row"><span class="diagnosis-name">${esc(r.name)}</span><div class="diagnosis-actions"><button class="btn diagnosis-edit" data-a="edit:dx:${i}">Edit</button><button class="btn diagnosis-delete" data-a="del:dx:${i}" aria-label="Delete ${esc(r.name)}">🗑</button></div></div>`).join(''):`<div class="diagnosis-empty">Nothing here yet.</div>`}</div></div>`;},
rx(){const rows=ft('rx');return hd('Prescription Template','',sr('Search by disease name...')+ex+`<button class="btn g" data-a="add:rx">＋ Add Template</button>`)+`<div class="card rx-template-list-wrap"><table class="rx-template-list"><thead><tr><th>Disease Name</th><th>Medicines</th><th>Actions</th></tr></thead><tbody>${rows.map(([template,index])=>`<tr><td><b>${esc(template.name)}</b></td><td>${esc(rxTemplateMeds(template.meds).map(medicine=>medicine.name).join(', '))}</td><td><button class="btn s" data-a="edit:rx:${index}" aria-label="Edit template">Edit</button> <button class="btn s r" data-a="del:rx:${index}" aria-label="Delete template">×</button></td></tr>`).join('')||'<tr><td colspan="3" class="emp">Nothing here yet.</td></tr>'}</tbody></table></div>`},
set(){
  const c=D.clinic||{},ck=(key,label,help)=>`<label class="clinic-settings-toggle"><input type="checkbox" name="${key}" ${c[key]?'checked':''}><span><b>${label}</b><small>${help}</small></span></label>`;
  const field=(label,key,icon='')=>`<label class="clinic-settings-field"><span>${icon?`<i aria-hidden="true">${icon}</i>`:''}${label}</span><input class="in" name="${key}" value="${esc(c[key]||'')}"></label>`;
  return `<section class="clinic-settings-page">
    <header class="clinic-settings-heading"><div><h1>ការកំណត់គ្លីនិក</h1><p>គ្រប់គ្រងព័ត៌មានមូលដ្ឋានរបស់គ្លីនិកអ្នក។</p></div>
      <div class="clinic-settings-actions"><button class="btn" data-a="pwd">♧ Change password</button><div class="tabs" translate="no"><button class="${lang=='en'?'on':''}" data-a="lang:en">English</button><button class="${lang=='km'?'on':''}" data-a="lang:km">ខ្មែរ</button></div><div class="tabs"><button data-a="th:light">Light</button><button data-a="th:dark">Dark</button></div></div>
    </header>
    <div class="card clinic-settings-card"><div id="cf">
      <div class="clinic-settings-assets">
        <section class="clinic-settings-asset"><b>Logo</b>${imgField('','logo',c.logo,'Delete image')}</section>
        <section class="clinic-settings-asset"><b>QRCODE Bank</b>${imgField('','qr',c.qr,'Delete image')}</section>
        <button class="btn clinic-settings-doctor" data-a="go:dr">♙ Doctor Settings</button>
      </div>
      <div class="clinic-settings-section-title"><span aria-hidden="true">▣</span><b>ការកំណត់ការបោះពុម្ព</b></div>
      <section class="clinic-settings-banner"><div class="clinic-settings-banner-heading"><b>Clinic Banner</b><span>Recommended: 1300×200px</span></div>${imgField('','banner',c.banner,'Delete image')}</section>
      <div class="clinic-settings-toggles">${ck('show_name','បង្ហាញឈ្មោះគ្លីនិក','Display clinic name on header')}${ck('show_address','បង្ហាញអាសយដ្ឋាន','Display address line')}${ck('show_phone','បង្ហាញលេខទូរស័ព្ទ','Display phone number')}</div>
      <section class="clinic-print-template-settings">
        <div><b>Print document template</b><p class="mu">These shared text fields are added to all printed documents and reports. Leave blank to omit either line.</p></div>
        <label class="clinic-settings-field"><span>Custom header text</span><textarea class="in" name="print_header" rows="2" placeholder="Additional clinic heading">${esc(c.print_header||'')}</textarea></label>
        <label class="clinic-settings-field"><span>Custom footer text</span><textarea class="in" name="print_footer" rows="2" placeholder="Address, contact details, or closing message">${esc(c.print_footer||'')}</textarea></label>
      </section>
      <div class="clinic-settings-fields">
        ${field('ឈ្មោះគ្លីនិក','name','▦')}
        ${field('Specialty','specialty','♧')}
        ${field('អាសយដ្ឋាន','address','⌖')}
        ${field('លេខទូរស័ព្ទ','phone','♧')}
        <label class="clinic-settings-field"><span><i aria-hidden="true">$</i>រូបិយប័ណ្ណ</span><select class="in" name="currency"><option value="KHR" ${c.currency!='USD'?'selected':''}>រៀល (KHR)</option><option value="USD" ${c.currency=='USD'?'selected':''}>ដុល្លារអាមេរិក (USD)</option></select></label>
        <label class="clinic-settings-field"><span><i aria-hidden="true">↻</i>អត្រាប្តូរប្រាក់ (៛ ក្នុង $1)</span><input class="in" name="rate" type="number" min="1" value="${c.rate||4000}"></label>
      </div>
      ${typeof cnfSettingsHtml=='function'?cnfSettingsHtml(c):''}
      <div class="clinic-settings-save"><button class="btn p" data-a="saveclinic">▣ រក្សាទុកការកំណត់</button></div>
    </div></div>
  </section>`;
},
dash(){const ip=D.ipd.filter(r=>!r.out).length,ad={},adPatients={},ag={'0-10':0,'11-20':0,'21-30':0,'31-40':0,'41-50':0,'51+':0},agePatients={},inR=p=>{const d=(p.reg_date||p.created_at||'').slice(0,10);return(!dFrom||d>=dFrom)&&(!dTo||d<=dTo)},P2=D.pt.filter(inR);
P2.forEach(p=>{const address=p.addr||'Unknown',age=ageYears(p),group=age>50?'51+':['0-10','11-20','21-30','31-40','41-50'][Math.min(4,Math.floor(Math.max(0,age-1)/10))];ad[address]=(ad[address]||0)+1;(adPatients[address]||(adPatients[address]=[])).push(p.name);ag[group]++;(agePatients[group]||(agePatients[group]=[])).push(p.name)});
const addressRows=Object.entries(ad).map(([name,count])=>[name,count,adPatients[name]]),ageRows=Object.entries(ag).map(([name,count])=>[name,count,agePatients[name]||[]]),cc=D.sy.map(s=>{const patients=P2.filter(p=>(p.complaints||'').toLowerCase().includes(String(s.name).toLowerCase()));return[s.name,patients.length,patients.map(p=>p.name)]}).sort((x,y)=>y[1]-x[1]).slice(0,8),td=new Date(Date.now()+7*36e5).toISOString().slice(0,10);
const sc=[['Total patients',D.pt.length,'#3b82f6','go:pt'],['Appointments today',D.ap.filter(a=>a.date==td).length,'#22c55e','dashap'],['Daily revenue',K(D.rev),'#eab308','go:bill'],['Admitted patients',ip,'#a855f7','go:cur'],['Total Appointments',D.ap.length,'#6366f1','go:ap']],lk=[['Analytics','#ef4444','go:an'],['Doctor Analytics','#14b8a6','go:da']];
return hd('Dashboard','Overview of your clinic')+`<div class="sts">${sc.map(s=>`<div class="st lnk" data-a="${s[3]}" tabindex="0" role="link"><b style="background:${s[2]}">${s[0]}</b><div>${s[1]}</div></div>`).join('')}${lk.map(s=>`<div class="st"><b style="background:${s[1]}">${s[0]}</b><div><button class="btn p" data-a="${s[2]}">View data</button></div></div>`).join('')}</div>
<div class="card" style="padding:16px;margin-top:6px"><div class="tools" style="justify-content:space-between"><b style="font-size:16px">Patient statistics</b><div class="tools"><label class="mu" style="font-size:12px">From date <input type="date" id="dfrom" class="in" style="min-width:0" value="${dFrom}"></label><label class="mu" style="font-size:12px">To date <input type="date" id="dto" class="in" style="min-width:0" value="${dTo}"></label><button class="btn p" data-a="dfilter">Apply</button>${dFrom||dTo?'<button class="btn" data-a="dclear">Clear</button>':''}</div></div></div>
<div class="cs">${bars('Patients by address',addressRows,'#8b87d8')}${bars('Patients by age group',ageRows,'#86d19a')}${bars('Common complaints',cc,'#fbbf24')}</div>`},
pt(){const L=ft('pt').filter(([r])=>tab=='Unpaid'?r.unpaid:r.type==tab),n=Math.max(1,Math.ceil(L.length/10));pg=Math.min(pg,n);
return hd('Patients','',sr('Search name, phone…')+'<button class="btn g" data-a="reg">+ Add Patient</button>'+`<div class="tabs">${['OPD','IPD','Unpaid'].map(t=>`<button class="${t==tab?'on':''}" data-a="tab:${t}">${t}</button>`).join('')}</div>`)+`<div class="card"><table><thead><tr>${['ID','Name','Age','Sex','Phone','Address','Status','Actions'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${L.slice(pg*10-10,pg*10).map(([r,i])=>`<tr><td>${r.id}</td><td><a href="#" data-a="open:${r.id}">${esc(r.name)}</a>${r.latin_name?`<br><span class="mu">${esc(r.latin_name)}</span>`:''}</td><td>${fmtAge(r)}</td><td>${fmtSex(r.sex)}</td><td>${esc(r.phone)}</td><td>${esc(r.addr)}</td><td>${r.unpaid?'<span class="bd x">Unpaid</span>':'<span class="bd">Paid</span>'}</td><td><button class="btn s" data-a="open:${r.id}">Open</button> <button class="btn s" data-a="regedit:${i}">Edit</button> <button class="btn s r" data-a="del:pt:${i}">✕</button></td></tr>`).join('')||'<tr><td colspan="8" class="emp">No patients.</td></tr>'}</tbody></table></div><div class="pg"><span>Showing ${L.length?pg*10-9:0}–${Math.min(L.length,pg*10)} of ${L.length}</span><div><button class="btn s" data-a="pg:${pg-1}">‹ Previous</button><button class="btn s p">${pg}</button><button class="btn s" data-a="pg:${pg+1}">Next ›</button></div></div>`},
dr(){if(doctorProfileId!=null)return doctorProfileHtml();return hd('Doctors List','',add('dr','Add Doctor'))+`<div class="gr doctor-grid">${D.dr.map((d,i)=>`<div class="card dc doctor-card"><button type="button" class="doctor-card-open" data-a="doctor:${d.id}" aria-label="Open ${esc(d.name)}"></button><div class="av">${d.photo?`<img src="${API_BASE}/uploads/${esc(d.photo)}" alt="">`:'👤'}</div><b><a class="doctor-card-link" href="#" data-a="doctor:${d.id}">${esc(d.name)}</a></b><br><span class="bd b">${esc(d.role)}</span><div class="doctor-card-info"><div>▣　ID: ${esc(d.code||'--')}</div><div>☎　${esc(d.phone||'--')}</div><div>▢　${esc(d.workdays||d.av||'Available')}</div></div><div class="doctor-card-actions"><button class="btn s" data-a="edit:dr:${i}">Edit</button><button type="button" class="doctor-history-button" data-a="doctorhistory:${d.id}" title="Doctor history" aria-label="Doctor history">◷</button><button class="btn s r" data-a="del:dr:${i}">✕</button></div></div>`).join('')||'<p class="emp">No doctors added yet.</p>'}</div>`},
echo(){return echoPage()},
pos(){const T=Object.entries(cart).reduce((s,[i,n])=>s+mi(i).price*n,0),L=ft('med');
return hd('POS','',sr('Search medicines…')+add('med','Add item'))+`<div class="pos"><div class="pr">${L.map(([m,i])=>`<div class="card pc" data-a="cart:${m.id}">${m.photo?`<img class="ph" src="${API_BASE}/uploads/${esc(m.photo)}" alt="">`:'<div class="ph"></div>'}<b>${esc(m.name)}</b><br><span style="color:#2563eb">${K(m.price)}</span><br><span style="color:${m.stock>0?'#16a34a':'#dc2626'}">Stock: ${m.stock}</span></div>`).join('')}</div><div class="card" style="padding:16px;align-self:start"><b>🛒 POS</b>${Object.keys(cart).length?Object.entries(cart).map(([i,n])=>`<div class="cl"><span>${esc(mi(i).name)} × ${n}</span><span>${K(mi(i).price*n)} <a href="#" data-a="rm:${i}">✕</a></span></div>`).join(''):'<p class="mu" style="padding:20px 0;text-align:center">Cart is empty</p>'}<hr><div class="cl"><b>Total</b><b>${K(T)}</b></div><div class="tools" style="margin:8px 0"><button class="btn ${pay=='Cash'?'p':''}" data-a="pay:Cash">Cash</button><button class="btn ${pay=='Bank'?'p':''}" data-a="pay:Bank">Bank</button></div><div class="pos-checkout-actions"><button class="btn p" data-a="co">Checkout</button><button type="button" class="btn s pos-print-button" data-a="posprint" aria-label="Print total" title="Print total">🖨</button></div></div></div>`},
posPrint(){
  const items=Object.entries(cart).filter(([,qty])=>Number(qty)>0);
  if(!items.length)return toast(T('Cart is empty'));
  const money=value=>D.clinic&&D.clinic.currency=='USD'?'$'+(Number(value)/(D.clinic.rate||4000)).toFixed(2):'KHR '+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const rows=items.map(([id,qty],index)=>`<tr style="border-bottom:1px solid #999"><td style="padding:4px 2px">${index+1}</td><td style="padding:4px 2px">${esc(mi(id).name)}</td><td style="padding:4px 2px;text-align:center">${Number(qty)}</td><td style="padding:4px 2px;text-align:right">${money(mi(id).price)}</td><td style="padding:4px 2px;text-align:right">${money(mi(id).price*Number(qty))}</td></tr>`).join('');
  const total=items.reduce((sum,[id,qty])=>sum+mi(id).price*Number(qty),0);
  const c=D.clinic||{},headerHtml=`<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding:0 0 8px;margin-bottom:10px;color:#111"><div style="display:flex;align-items:center;gap:10px">${c.logo?`<img src="/uploads/${esc(c.logo)}" alt="" style="width:46px;height:46px;object-fit:contain;border-radius:50%">`:'<span style="display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#2563eb;color:white;font-size:24px">◷</span>'}<div>${c.show_name&&c.name?`<b style="font-size:18px">${esc(c.name)}</b>`:''}${c.specialty?`<div style="font-size:11px">${esc(c.specialty)}</div>`:''}${c.show_address&&c.address?`<div style="font-size:10px">${esc(c.address)}</div>`:''}${c.show_phone&&c.phone?`<div style="font-size:10px">Tel: ${esc(c.phone)}</div>`:''}</div></div><b style="font-size:18px">វិក័យប័ត្រ</b></div>`;
  const html=`<div style="border-bottom:2px solid #111;padding-bottom:7px;margin-bottom:4px;font-size:11px"><div>Invoice #: PREVIEW</div><div>កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('en-GB')}</div></div><table style="width:100%;border-collapse:collapse;font-size:11px;color:#111"><thead><tr style="border-bottom:1px solid #111"><th style="text-align:left;padding:4px 2px">#</th><th style="text-align:left;padding:4px 2px">បរិយាយ</th><th style="text-align:center;padding:4px 2px">ចំនួន</th><th style="text-align:right;padding:4px 2px">តម្លៃឯកតា</th><th style="text-align:right;padding:4px 2px">សរុប</th></tr></thead><tbody>${rows}</tbody></table><div style="display:flex;flex-direction:column;align-items:flex-end;margin-top:8px;font-size:10px"><div style="display:flex;justify-content:space-between;gap:36px;min-width:180px"><span>សរុបរង:</span><span>${money(total)}</span></div><div style="display:flex;justify-content:space-between;gap:36px;min-width:180px;font-weight:bold"><span>សរុប:</span><span>${money(total)}</span></div></div><p style="text-align:center;font-size:10px;margin-top:24px">Thank You For Your Business</p>`;
  if(typeof printDoc=='function')printDoc('',html,{headerHtml,printImmediately:true});
},
ch(){return hd('Chat','Internal messages')+`<div class="card" style="padding:16px">${D.ch.map(m=>`<p translate="no">💬 ${esc(m)}</p>`).join('')||'<p class="mu">No messages yet.</p>'}<div class="tools" style="margin-top:12px"><input id="cm" class="in" style="flex:1" placeholder="Type a message"><button class="btn p" data-a="send">Send</button></div></div>`},
an(){
  const data=analyticsRecords(),periods=[['daily','Daily'],['monthly','Monthly'],['yearly','Yearly']];
  return `<div class="analytics-dashboard"><header class="analytics-heading"><h1>${T('Analytics Dashboard')}</h1><p>${T('Comprehensive overview of your clinic’s performance.')}</p></header><section class="card analytics-filters"><h2><span>▽</span> ${T('Data Filters')}</h2><div class="analytics-filter-controls"><label>${T('Start Date')}<input class="in" id="analytics-from" type="date" value="${esc(analyticsFrom)}"></label><label>${T('End Date')}<input class="in" id="analytics-to" type="date" value="${esc(analyticsTo)}"></label><div class="analytics-period-field"><span>${T('View By')}</span><div class="analytics-period-switch">${periods.map(([key,label])=>`<button type="button" class="${analyticsPeriod==key?'active':''}" data-a="analytics-period:${key}" aria-pressed="${analyticsPeriod==key}">${T(label)}</button>`).join('')}</div></div><button type="button" class="btn p analytics-clear" data-a="analytics-clear">${T('Clear Filters')}</button></div></section><section class="card analytics-financial"><h2>${T('Income vs. Expenses')}</h2>${analyticsFinancialChart(data.series)}</section><div class="analytics-chart-grid"><section class="card analytics-chart-card"><h2>${T('Top Selling Medicines')}</h2>${analyticsMedicineChart(data.medicines)}</section><section class="card analytics-chart-card"><h2>${T('Top Selling Services')}</h2>${analyticsServiceChart(data.services)}</section></div></div>`;
},
da(){
  const doctors=[...new Map([...D.dr.map(doctor=>String(doctor.name||'').trim()),...D.ap.map(appointment=>String(appointment.doc||'').trim())].filter(Boolean).map(name=>[name.toLocaleLowerCase(),name])).values()].sort((a,b)=>a.localeCompare(b));
  const rows=doctorAnalyticsRows();
  return `<div class="doctor-analytics-dashboard"><header class="doctor-analytics-heading"><h1>${T('Doctor Analytics')}</h1><p>${T('Overview of patient assignments per doctor.')}</p></header><section class="card doctor-analytics-filters"><h2><span>▽</span> ${T('Filters')}</h2><div class="doctor-analytics-filter-controls"><label>${T('Start Date')}<input class="in" id="doctor-analytics-from" type="date" value="${esc(doctorAnalyticsFrom)}"></label><label>${T('End Date')}<input class="in" id="doctor-analytics-to" type="date" value="${esc(doctorAnalyticsTo)}"></label><label>${T('Doctor')}<select class="in" id="doctor-analytics-doctor"><option value="">${T('All Doctors')}</option>${doctors.map(name=>`<option value="${esc(name.toLocaleLowerCase())}" ${doctorAnalyticsId==name.toLocaleLowerCase()?'selected':''}>${esc(name)}</option>`).join('')}</select></label><button type="button" class="btn p doctor-analytics-clear" data-a="doctor-analytics-clear">${T('Clear Filters')}</button></div></section><section class="card doctor-analytics-chart-card"><h2><span>♙</span> ${T('Patients per Doctor')}</h2>${doctorAnalyticsChart(rows)}</section></div>`;
},
sv(){const rows=ft('sv');return hd('Services','Manage all clinic services.',sr()+`<button class="btn" type="button" data-a="svimport">Import Excel</button><input id="sv-import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" title="Choose an Excel workbook or CSV with name, price, and description columns" hidden>`+ex+add('sv','Add Service'))+(rows.length?`<div class="service-grid">${rows.map(([s,i])=>`<article class="card service-card"><h3>${esc(s.name)}</h3><strong class="service-price">${K(s.price)}</strong>${s.description?`<p class="service-description">${esc(s.description)}</p>`:'<div class="service-description service-description-empty"></div>'}<div class="service-actions"><button class="btn s" data-a="edit:sv:${i}">Edit</button><button class="btn s r" data-a="del:sv:${i}">Delete</button></div></article>`).join('')}</div>`:'<div class="card"><p class="emp">Nothing here yet.</p></div>')}}
R.lab=()=>labPage();
R.med=function(){
  if(medicineEditIndex!=null){
    const medicine=D.med[medicineEditIndex];
    return medicine?hd('Edit Medicine','Update medicine details.','<button class="btn" data-a="medformclose">Back to Medicines</button>')+
      `<div class="medicine-edit-page">${medicineFormHtml()}</div>`:
      hd('Medicine not found','','<button class="btn" data-a="medformclose">Back to Medicines</button>');
  }
  if(medicineViewId!=null){
    const medicine=D.med.find(item=>String(item.id)==String(medicineViewId));
    return medicine?medicineDetailHtml(medicine):hd('Medicine not found','','<button class="btn" data-a="medback">Back to Medicines</button>');
  }
  if(medicineFormReturnPage&&medicineFormOpen)return `<div class="medicine-pos-add">${medicineFormHtml()}</div>`;
  const rows=ft('med'),controls=sr('Search medicines…')+
    `<button class="btn" data-a="medlayout" aria-label="Switch to ${medicineLayout=='table'?'cards':'table'} layout">Switch to ${medicineLayout=='table'?'Cards':'Table'} View</button>`+
    `<button class="btn" data-a="medimport">Import Excel</button><input id="med-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>`+
    ex+`<button class="btn" title="Export QR Codes for listed medicines" data-a="medqrbulk">Export QR Codes</button><button class="btn" title="Export Barcodes for listed medicines" data-a="medbarcodebulk">Export Barcodes</button><button class="btn g" data-a="medadd">+ Add New Medicine</button>`;
  if(medicineLayout=='cards'){
    return hd('Medicines','Manage your pharmacy list.',controls)+(medicineFormOpen?medicineFormHtml():'')+
      (rows.length?`<div class="medicine-card-grid">${rows.map(([m])=>`<article class="card medicine-card">${m.photo?`<img class="medicine-card-photo" src="${API_BASE}/uploads/${esc(m.photo)}" alt="${esc(m.name)}">`:'<div class="medicine-card-photo medicine-thumb-empty">💊</div>'}<div class="medicine-card-body"><h3>${esc(m.name)}</h3>${m.composition?`<p class="mu">${esc(m.composition)}</p>`:''}<div class="medicine-card-stock"><span>In stock</span><b class="bd ${m.stock>0?'':'x'}">${Number(m.stock)||0}</b></div><div class="medicine-unit-list">${medicineUnits(m).map(u=>`<span>${esc(u.name)}: <b>${K(u.price)}</b> <small>× ${u.qty}</small></span>`).join('')||'<span>—</span>'}</div><div class="medicine-card-dates">${m.expiration_date?`Expiry: ${esc(m.expiration_date)}`:'No expiry date'}${m.notification_date?`<small>Notify: ${esc(m.notification_date)}</small>`:''}</div>${medicineActions(m)}</div></article>`).join('')}</div>`:'<div class="card"><p class="emp">Nothing here yet.</p></div>');
  }
  return hd('Medicines','Manage your pharmacy list.',controls)+(medicineFormOpen?medicineFormHtml():'')+
    `<div class="card medicine-table-wrap"><table class="medicine-table"><thead><tr><th>Medicine</th><th>Sales units / Price</th><th>In stock</th><th>Expiration / Notification</th><th>Actions</th></tr></thead><tbody>${rows.map(([m])=>{const units=medicineUnits(m),today=new Date().toISOString().slice(0,10),alert=(m.expiration_date&&m.expiration_date<=today)||(m.notification_date&&m.notification_date<=today);return`<tr><td><div class="medicine-name">${m.photo?`<img class="medicine-thumb" src="${API_BASE}/uploads/${esc(m.photo)}" alt="">`:'<span class="medicine-thumb medicine-thumb-empty">💊</span>'}<div><b>${esc(m.name)}</b>${m.composition?`<small>${esc(m.composition)}</small>`:''}</div></div></td><td><div class="medicine-unit-list">${units.map(u=>`<span>${esc(u.name)}: <b>${K(u.price)}</b> <small>× ${u.qty}</small></span>`).join('')||'<span>—</span>'}</div></td><td><span class="bd ${m.stock>0?'':'x'}">${Number(m.stock)||0}</span></td><td><span class="${alert?'medicine-expired':''}">${m.expiration_date?`Expiry: ${esc(m.expiration_date)}`:'—'}</span>${m.notification_date?`<small class="medicine-notify ${m.notification_date<=today?'medicine-expired':''}">Notify: ${esc(m.notification_date)}</small>`:''}</td><td>${medicineActions(m)}</td></tr>`}).join('')||'<tr><td colspan="5" class="emp">Nothing here yet.</td></tr>'}</tbody></table></div>`;
};
const M={dash:'dash',pt:'pt',ap:'ap',fu:'fu',ipd:'ipd',cur:'cur',dr:'dr',ch:'ch',med:'med',sv:'sv',lab:'lab',echo:'echo',dx:'dx',rx:'rx',sy:'sy',pos:'pos',st:'st',ns:'ns',bill:'bill',mr:'mr',ad:'ad',sf:'sf',an:'an',da:'da'};
const validPage=page=>Object.hasOwn(M,page)||page=='set'||page=='patient';
function pageFromRoute(page){return page=='patient'?'pd':page}
function restorePageState(){
  try{
    const state=JSON.parse(sessionStorage.getItem('pageState')||'{}');
    if(typeof state.q=='string')q=state.q;
    if(Number.isInteger(state.pg)&&state.pg>0)pg=state.pg;
    if(['OPD','IPD','Unpaid','NSSF','Details','Follow Up'].includes(state.tab))tab=state.tab;
    if(state.doctorProfileId!=null&&Number.isInteger(Number(state.doctorProfileId)))doctorProfileId=Number(state.doctorProfileId);
    if(['payroll','timeline'].includes(state.doctorTab))doctorTab=state.doctorTab;
    if(state.medicineViewId!=null)medicineViewId=String(state.medicineViewId);
    if(['table','cards'].includes(state.medicineLayout))medicineLayout=state.medicineLayout;
    if(typeof state.reportFrom=='string')reportFrom=state.reportFrom;
    if(typeof state.reportTo=='string')reportTo=state.reportTo;
    if(typeof state.reportQuery=='string')reportQuery=state.reportQuery;
    if(typeof state.analyticsFrom=='string')analyticsFrom=state.analyticsFrom;
    if(typeof state.analyticsTo=='string')analyticsTo=state.analyticsTo;
    if(['daily','monthly','yearly'].includes(state.analyticsPeriod))analyticsPeriod=state.analyticsPeriod;
    if(typeof cal!='undefined'&&state.cal&&['month','week','day'].includes(state.cal.mode)&&state.cal.date){
      const d=new Date(state.cal.date);
      if(!Number.isNaN(d.getTime()))cal={mode:state.cal.mode,d,list:!!state.cal.list};
    }
  }catch(e){ /* use defaults when no saved page state is available */ }
}
function savePageState(){
  try{
    const state={page:rt=='pd'?'patient':rt,q,pg,tab,doctorProfileId,doctorTab,medicineViewId,medicineLayout,reportFrom,reportTo,reportQuery,analyticsFrom,analyticsTo,analyticsPeriod};
    if(typeof cal!='undefined')state.cal={mode:cal.mode,date:cal.d.toISOString(),list:cal.list};
    sessionStorage.setItem('pageState',JSON.stringify(state));
  }catch(e){ /* keep the current page usable when storage is unavailable */ }
}
function restorePage(){try{const hash=decodeURIComponent(window.location.hash.slice(1));if(validPage(hash)){rt=pageFromRoute(hash);return}const saved=sessionStorage.getItem('currentPage');if(validPage(saved))rt=pageFromRoute(saved)}catch(e){}}
function setPage(page){rt=page;const route=page=='pd'?'patient':page;try{sessionStorage.setItem('currentPage',route)}catch(e){}if(validPage(route)&&window.location.hash!='#'+route)window.location.hash='#'+route}
restorePage();
window.addEventListener('hashchange',()=>{try{const page=decodeURIComponent(window.location.hash.slice(1));if(validPage(page)){rt=pageFromRoute(page);sessionStorage.setItem('currentPage',page);if(rt=='pd'&&typeof restorePatientPage=='function')restorePatientPage().catch(e=>toast(e.message));else render()}}catch(e){}});
const NV=[['Patient Care',[['dash','Dashboard','▦'],['pt','Patients','👥'],['ap','Appointments','📅'],['fu','Follow Up','↻'],['ipd','IPD','🛏'],['cur','Current IPD','⏱'],['dr','Doctors','🩺'],['ch','Chat','💬']]],['Clinical',[['med','Medicines','💊'],['sv','Services','🩺'],['lab','Lab Templates','🧪'],['echo','Echo Templates','♡'],['dx','Diagnosis','📋'],['rx','Prescription Template','📄'],['sy','Symptoms','〰']]],['Finance & POS',[['pos','POS','🛒'],['st','Store','🏪'],['ns','NSSF','🛡'],['bill','Report','📊'],['mr','Medicine Report','📄']]],['Administration',[['ad','Address','📍'],['sf','Sample file','📎'],['an','Analytics','〰'],['da','Doctor Analytics','📊']]]],cl={};
function nav(){$('#nv').innerHTML=NV.map(([g,it])=>`<div class="gh" data-a="grp:${g}">${g}<span>${cl[g]?'›':'⌄'}</span></div>${cl[g]?'':it.map(([id,l,ic])=>`<div class="it ${id==(rt=='pd'?'pt':rt)?'on':''}" data-a="go:${id}"><i>${ic}</i>${l}</div>`).join('')}`).join('')}
function render(){if(validPage(rt)||rt=='pd')setPage(rt);const f=document.activeElement&&document.activeElement.id=='q';const cl=D.clinic||{};$('#tt').textContent=cl.name||'Sovanvitou';$('#lgo').innerHTML=cl.logo?`<img src="${API_BASE}/uploads/${esc(cl.logo)}" alt="" style="max-height:34px;max-width:100%">`:'CLINIC SOVANVITOU';$('#v').classList.toggle('tight',rt=='pt');$('#v').innerHTML=`<div class="w">${(R[rt]||(()=>tp(rt)))()}</div>`;nav();savePageState();if(f){const e=$('#q');e.focus();e.setSelectionRange(99,99)}}
function toast(m){const t=$('#ts');t.textContent=T(m);t.style.display='block';clearTimeout(nt);nt=setTimeout(()=>t.style.display='none',2200)}
function modal(t,F,V,cb,opts={}){$('#mf').className=opts.className||'';$('#mf').innerHTML=`<h3 style="margin:0">${t}</h3>${F.map(([l,k,ty,o4,placeholder])=>ty=='img'?imgField(l,k,V[k]):ty=='ta'?`<label class="fl">${l}<textarea class="in" name="${k}" placeholder="${esc(placeholder||'')}">${esc(V[k]??'')}</textarea></label>`:ty=='number'?`<label class="fl">${l}<input class="in" type="number" name="${k}" min="0" step="1" value="${esc(V[k]??'')}" placeholder="${esc(placeholder||'')}"></label>`:ty&&ty!='pw'?fld(l,k,ty,V[k],o4):ty=='pw'?`<label>${l}<input class="in" type="password" name="${k}" required></label>`:`<label>${l}<input class="in" name="${k}" value="${esc(V[k]??'')}" placeholder="${esc(placeholder||'')}" ${k=='name'?'required':''}></label>`).join('')}<div class="tools" style="justify-content:flex-end"><button type="button" class="btn" data-a="close">Cancel</button><button class="btn p">${opts.submit||'Save'}</button></div>`;$('#md').classList.add('on');$('#mf').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));F.forEach(([l,k])=>{if(!isNaN(V[k])&&V[k]!=='')o[k]=+o[k]});try{await cb(o);await load();$('#md').classList.remove('on');render()}catch(er){toast(er.message)}}}
function updateMedicineStock(index){const m=D.med[index];if(!m)return toast('Medicine not found');modal('Update Stock',[['In Stock','stock','number']],{stock:Number(m.stock)||0},async o=>{const stock=Number(o.stock);if(!Number.isInteger(stock)||stock<0)throw new Error('Stock must be a non-negative whole number');await api('PUT','medicines/'+m.id,{stock})},{submit:'Update Stock'});$('#mf [name="stock"]').required=true}
function viewMedicineComposition(index){const m=D.med[index];if(!m)return toast('Medicine not found');$('#mf').innerHTML=`<h3 style="margin:0 0 12px">${esc(m.name)} — Composition</h3><div class="medicine-composition-view">${m.composition?esc(m.composition):'<span class="mu">No composition has been added.</span>'}</div><div class="tools" style="justify-content:flex-end;margin-top:16px"><button type="button" class="btn p" data-a="close">Close</button></div>`;$('#md').classList.add('on')}
async function printMedicineCode(index,kind){const m=D.med[index];if(!m)return toast('Medicine not found');try{const result=await api('GET',`medicines/${m.id}/code/${kind}`);if(!result||typeof result.svg!='string'||!result.svg.startsWith('<svg'))throw new Error('Could not generate the medicine code');printDoc(kind=='qr'?'Medicine QR Code':'Medicine Barcode',`<div class="medicine-code-label"><h2>${esc(m.name)}</h2>${result.svg}<p>Medicine ID: ${m.id}</p></div>`)}catch(error){toast(error.message)}}
async function exportMedicineCodes(kind){const medicines=ft('med').map(([medicine])=>medicine);if(!medicines.length)return toast('No medicines to export');try{const response=await fetch(API_BASE+`/api/medicines/codes/${kind}`,{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({ids:medicines.map(m=>m.id)})});if(response.status==401&&tok)logout();if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error&&error.error||'Could not export medicine codes')}const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`medicine-${kind}-codes.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){toast(error.message)}}
const FM={pt:[['Name','name'],['Age','age'],['Sex','sex'],['Phone','phone'],['Address','addr']],dr:[['Name','name'],['Role','role'],['ID','code'],['Phone','phone'],['Photo','photo','img']],echo:[['Name','name'],['Price (KHR)','price']]};
let labFieldSequence=0;
function labFieldRow(value={}){
  if(typeof value=='string')value={name:value};
  const id=labFieldSequence++;
  return `<div class="lab-field-row"><input class="in" name="lab_field_name_${id}" value="${esc(value.name||'')}" placeholder="${esc(T('Field name'))}"><input class="in" name="lab_field_range_${id}" value="${esc(value.normal_range||'')}" placeholder="${esc(T('Normal Range'))}"><input class="in" name="lab_field_unit_${id}" value="${esc(value.unit||'')}" placeholder="${esc(T('Unit'))}"><button type="button" class="btn s r" data-a="labfielddel" aria-label="${esc(T('Remove field'))}" title="${esc(T('Remove field'))}">×</button></div>`;
}
function labFieldValues(template){
  try{const fields=JSON.parse(template.fields||'[]');return Array.isArray(fields)?fields.map(field=>typeof field=='string'?{name:field}:field&&typeof field=='object'?{name:String(field.name||''),normal_range:String(field.normal_range||field.normalRange||''),unit:String(field.unit||'')}:{name:''}).filter(field=>field.name):[]}catch(e){return[]}
}
function labPage(){
  const rows=ft('lab'),heading=hd(T('Lab Templates'),T('Manage lab test templates and prices.'),sr(T('Search lab templates…'))+`<button class="btn" data-a="labimport">↑ ${T('Upload Lab')}</button><input id="lab-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>`+ex+`<button class="btn" data-a="labcategoryadd">⊕ ${T('Add Type')}</button><button class="btn g" data-a="labadd">＋ ${T('Add Lab Template')}</button>`);
  return heading+`<div class="card lab-template-table-wrap"><table class="lab-template-table"><thead><tr><th>${T('Name')}</th><th>${T('Price')}</th><th>${T('Type')}</th><th>${T('Actions')}</th></tr></thead><tbody>${rows.map(([lab,i])=>`<tr><td><b>${esc(lab.name)}</b></td><td>${K(lab.price)}</td><td>${esc(lab.cat||'')}</td><td class="lab-template-actions"><button class="btn s" data-a="labedit:${i}" aria-label="${T('Edit')}" title="${T('Edit')}">✎</button><button class="btn s r" data-a="labdel:${i}" aria-label="${T('Delete')}" title="${T('Delete')}">♜</button></td></tr>`).join('')||`<tr><td colspan="4" class="emp">${T('Nothing here yet.')}</td></tr>`}</tbody></table></div>`;
}
function labForm(index=null){
  const editing=index!=null,lab=editing?D.lab[index]:{};
  if(editing&&!lab)return toast(T('Lab template not found'));
  const categories=[...new Set([...D.labcategories.map(category=>category.name),...D.lab.map(item=>item.cat)].filter(Boolean))];
  const fields=lab?labFieldValues(lab):[];
  if(!fields.length)fields.push({});
  labFieldSequence=0;
  const body=`<div class="lab-template-form-fields"><label>${T('Name')}<input class="in" name="name" value="${esc(lab?.name||'')}" required autofocus></label><label>${T('Price (KHR)')}<input class="in" name="price" type="number" min="0" step="1" value="${esc(lab?.price??0)}" required></label><label>${T('Type')}<input class="in" name="cat" list="lab-category-options" value="${esc(lab?.cat||'')}"><datalist id="lab-category-options">${categories.map(category=>`<option value="${esc(category)}">`).join('')}</datalist></label></div><section class="lab-fields-editor"><h4>${T('Fields')}</h4><div id="lab-fields-list">${fields.map(labFieldRow).join('')}</div><button type="button" class="btn lab-add-field" data-a="labfieldadd">＋ ${T('Add Field')}</button></section><div class="tools lab-form-actions"><button type="button" class="btn" data-a="close">${T('Cancel')}</button><button class="btn p">${T('Save')}</button></div>`;
  const form=$('#mf');form.className='lab-template-form';form.innerHTML=`<div class="lab-form-heading"><h3>${T(editing?'Edit Lab Template':'Add Lab Template')}</h3><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div>${body}`;$('#md').classList.add('on');
  form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form)),fieldIds=[...new Set(Object.keys(values).map(key=>key.match(/^lab_field_name_(\d+)$/)?.[1]).filter(id=>id!=null))],templateFields=fieldIds.map(id=>({name:String(values[`lab_field_name_${id}`]||'').trim(),normal_range:String(values[`lab_field_range_${id}`]||'').trim(),unit:String(values[`lab_field_unit_${id}`]||'').trim()})).filter(field=>field.name);const name=String(values.name||'').trim(),price=Number(values.price);if(!name)return toast(T('Name is required'));if(!Number.isInteger(price)||price<0)return toast(T('Price must be a non-negative whole number'));
    const body={name,price,cat:String(values.cat||'').trim(),fields:JSON.stringify(templateFields)};
    try{await api(editing?'PUT':'POST',editing?'labs/'+lab.id:'labs',body);await load();$('#md').classList.remove('on');render();toast(T('Saved'))}catch(error){toast(error.message)}
  };
}
function labCategoryForm(){
  modal(T('Add Type'),[[T('Type'),'name']],{},async values=>{const name=String(values.name||'').trim();if(!name)throw new Error(T('Type is required'));if(D.labcategories.some(category=>category.name.toLowerCase()==name.toLowerCase()))throw new Error(T('Type already exists'));await api('POST','labcategories',{name})},{submit:T('Add')});
}
async function importLabsFile(file){
  if(!file)return;
  try{
    if(!/\.xlsx$/i.test(file.name||''))throw new Error(T('Choose an Excel workbook'));
    if(file.size>1e6)throw new Error(T('Import file must be smaller than 1 MB'));
    const response=await fetch(API_BASE+'/api/labs/import-xlsx',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',...(tok?{Authorization:'Bearer '+tok}:{})},body:await file.arrayBuffer()});
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(result&&result.error||T('Lab import failed'));
    await load();render();toast(`${T('Imported')} ${result.imported} ${T('lab templates')}`);
  }catch(error){toast(error.message)}
}
let echoSectionSequence=0,echoFieldSequence=0,echoTableSectionId=null,echoTableSelection=null,echoToolbarSelection=null;
let sampleFileSelection=null;
function echoList(value){
  try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}
}
function echoSectionHtml(section={}){
  const id=echoSectionSequence++;
  const fields=Array.isArray(section.fields)&&section.fields.length?section.fields:[''];
  return `<section class="echo-section-card" data-echo-section="${id}"><div class="echo-section-top"><span class="echo-section-grip" aria-hidden="true">⠿</span><button type="button" class="btn s r" data-a="echosectiondel" aria-label="${T('Remove section')}">▣</button></div><label>${T('Section title')}<input class="in" name="echo_title_${id}" value="${esc(section.title||'')}" placeholder="${esc(T('Optional section title'))}"></label><div class="echo-editor-label">${T('Section Content (Title/Body)')}</div><div class="echo-rich-toolbar"><select class="in echo-font-select" data-echo-command="fontName" data-echo-section="${id}" aria-label="${T('Font')}"><option>Arial</option><option>Times New Roman</option><option>Khmer OS</option><option>Moul</option><option>Koulen</option></select><select class="in echo-size-select" data-echo-command="formatBlock" data-echo-section="${id}" aria-label="${T('Text style')}"><option value="p">${T('Normal')}</option><option value="h2">${T('Heading')}</option><option value="blockquote">${T('Quote')}</option></select>${[['bold','B'],['italic','I'],['underline','U'],['foreColor','A'],['hiliteColor','▨'],['insertUnorderedList','☷'],['insertOrderedList','1.'],['createLink','<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7m2.7 6.4a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'],['insertImage','<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor"/><path d="m21 15-5-5L5 20" fill="none" stroke="currentColor" stroke-width="2"/></svg>'],['justifyLeft','☰'],['removeFormat','Tx']].map(([command,label])=>command=='foreColor'||command=='hiliteColor'?`<label class="echo-color-tool" title="${command=='foreColor'?T('Text Color'):T('Highlight Color')}" aria-label="${command=='foreColor'?T('Text Color'):T('Highlight Color')}"><span class="echo-tool echo-tool-${command}">${label}</span><input type="color" data-echo-color="${command}" data-echo-section="${id}" value="${command=='foreColor'?'#000000':'#ffff00'}" aria-label="${command=='foreColor'?T('Text Color'):T('Highlight Color')}"></label>`:`<button type="button" class="btn s echo-tool echo-tool-${command}" data-a="echoformat:${id}:${command}" aria-label="${command=='insertImage'?T('Insert Image From Device'):esc(command)}" title="${command=='insertImage'?T('Insert Image From Device'):esc(command)}">${label}</button>`).join('')}<button type="button" class="btn s echo-tool" data-a="echoformat:${id}:insertTable" title="${T('Insert Table')}">▦ ${T('Insert Table')}</button></div><input id="echo-image-file-${id}" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="echo-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-echo-editor="${id}">${section.content||''}</div><input type="hidden" name="echo_content_${id}" data-echo-content value="${esc(section.content||'')}"><div class="echo-extra-fields"><label>${T('Additional Fields (Optional)')}</label><div class="echo-fields-list">${echoFieldRows(fields,id)}</div><button type="button" class="btn s" data-a="echofieldadd">${T('Add Field')}</button></div></section>`;
}
function echoFieldRows(fields=[],sectionId=0){
  return fields.map(value=>echoFieldRow(value,sectionId)).join('');
}
function echoFieldRow(value='',sectionId=0){
  const id=echoFieldSequence++;
  return `<div class="echo-field-row"><input class="in" name="echo_field_${sectionId}_${id}" value="${esc(value)}" placeholder="${esc(T('Field Name'))}"><button type="button" class="btn s" data-a="echofielddel" aria-label="${T('Remove field')}">×</button></div>`;
}
function echoPage(){
  const rows=ft('echo');
  const controls=sr(T('Search echo templates…'))+`<button class="btn g" data-a="echoadd">＋ ${T('Create Template')}</button><button class="btn" data-a="echoimport">↑ ${T('Upload')}</button><input id="echo-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="btn" data-a="echoexport">↓ ${T('Download')}</button>`;
  return hd(T('Echo Templates'),'',controls)+`<div class="echo-template-grid">${rows.map(([template,index])=>`<article class="card echo-template-card"><div class="echo-template-summary"><h3>${esc(template.name)}</h3><span class="echo-template-price">${K(template.price)}</span></div><p class="mu">Font: ${esc(template.font||'Moul')}</p><div class="echo-template-actions"><button type="button" class="btn s" data-a="echoedit:${index}" aria-label="${T('Edit')}" title="${T('Edit')}">✎</button><button type="button" class="btn s r" data-a="echodel:${index}" aria-label="${T('Delete')}" title="${T('Delete')}">▣</button></div></article>`).join('')||`<div class="card echo-template-empty">${T('Nothing here yet.')}</div>`}</div>`;
}
function echoForm(index=null){
  const editing=index!=null,template=editing?D.echo[index]:{};
  if(editing&&!template)return toast(T('Echo template not found'));
  const sections=template?echoList(template.sections):[];
  if(!sections.length)sections.push({title:'',content:'',fields:echoList(template&&template.fields)});
  echoSectionSequence=0;echoFieldSequence=0;
  const form=$('#mf');
  form.className='echo-template-form';
  form.innerHTML=`<div class="echo-form-heading"><h3>${T(editing?'Edit Echo Template':'Create Echo Template')}</h3><button type="button" class="btn s" data-a="close" aria-label="${T('Close')}">×</button></div><div class="echo-template-basic"><label>${T('Template Name')}<input class="in" name="name" value="${esc(template?.name||'')}" required autofocus></label><label>${T('Price')}<input class="in" name="price" type="number" min="0" step="1" value="${esc(template?.price??0)}" required></label><label>${T('Default Font')}<select class="in" name="font">${['Moul','Koulen','Battambang','Khmer OS'].map(font=>`<option value="${font}" ${template?.font==font?'selected':''}>${font}</option>`).join('')}</select></label></div><div id="echo-sections-list">${sections.map(echoSectionHtml).join('')}</div><button type="button" class="btn echo-add-section" data-a="echosectionadd">＋ ${T('Add New Section')}</button><div class="tools echo-form-actions"><button type="button" class="btn" data-a="close">${T('Cancel')}</button><button type="submit" class="btn p">▣ ${T('Save Template')}</button></div>`;
  $('#md').classList.add('on');
  form.onsubmit=async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form)),sectionsOut=Object.keys(values).filter(key=>key.startsWith('echo_title_')).map(key=>{const id=key.slice('echo_title_'.length);return{id,title:String(values[key]||'').trim(),content:String(values['echo_content_'+id]||''),fields:Object.entries(values).filter(([fieldKey,value])=>fieldKey.startsWith(`echo_field_${id}_`)&&String(value).trim()).map(([,value])=>String(value).trim())}});
    const name=String(values.name||'').trim(),price=Number(values.price);
    if(!name)return toast(T('Template name is required'));
    if(!Number.isInteger(price)||price<0)return toast(T('Price must be a non-negative whole number'));
    if(!sectionsOut.length)return toast(T('At least one section is required'));
    try{await api(editing?'PUT':'POST',editing?'echo/'+template.id:'echo',{name,price,font:String(values.font||'Moul'),sections:JSON.stringify(sectionsOut.map(({title,content,fields})=>({title,content,fields}))),fields:JSON.stringify(sectionsOut.flatMap(section=>section.fields))});await load();$('#md').classList.remove('on');render();toast(T('Saved'))}catch(error){toast(error.message)}
  };
}
function sampleFilePage(){
  const rows=ft('sf');
  return hd(T('Sample file'),'',`<button class="btn g" data-a="samplefileadd">＋ ${T('Add Template')}</button>`)+`<div class="card sample-file-list"><table><thead><tr><th>${T('Template Title')}</th><th>${T('Content')}</th><th>${T('Actions')}</th></tr></thead><tbody>${rows.map(([file,index])=>`<tr><td><b>${esc(file.name)}</b></td><td class="sample-file-preview">${esc(String(file.content||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,120))}</td><td><button class="btn s" data-a="samplefileedit:${index}" aria-label="${T('Edit')}">✎</button> <button class="btn s r" data-a="samplefiledel:${index}" aria-label="${T('Delete')}">▣</button></td></tr>`).join('')||`<tr><td colspan="3" class="emp">${T('Nothing here yet.')}</td></tr>`}</tbody></table></div>`;
}
function sampleFileForm(index=null){
  const editing=index!=null,file=editing?D.sf[index]:{};
  if(editing&&!file)return toast(T('Sample file template not found'));
  sampleFileSelection=null;
  const form=$('#mf');form.className='sample-file-form';
  const commands=[['bold','B'],['italic','I'],['underline','U'],['strikeThrough','S'],['formatBlock','❞'],['insertUnorderedList','☷'],['insertOrderedList','1.'],['outdent','⇤'],['indent','⇥'],['justifyLeft','⇤'],['justifyCenter','≡'],['justifyRight','⇥'],['createLink','↗'],['removeFormat','Tx']];
  form.innerHTML=`<div class="sample-file-heading"><h3>${T(editing?'Edit Template':'Create New Template')}</h3><button type="button" class="sample-file-close" data-a="close" aria-label="${T('Close')}">×</button></div><input class="in sample-file-title" name="name" value="${esc(file?.name||'')}" placeholder="${T('Template Title')}" required autofocus><div class="sample-file-editor"><div class="sample-file-toolbar"><select class="in" data-sample-command="fontName" aria-label="${T('Font')}"><option>Arial</option><option>Sans Serif</option><option>Serif</option><option>Monospace</option><option>Khmer OS</option></select><select class="in" data-sample-command="formatBlock" aria-label="${T('Text style')}"><option value="p">${T('Normal')}</option><option value="h1">${T('Heading 1')}</option><option value="h2">${T('Heading 2')}</option><option value="blockquote">${T('Quote')}</option></select>${commands.map(([command,label])=>`<button type="button" class="sample-file-tool ${['bold','italic','underline','strikeThrough'].includes(command)?'sample-file-tool-'+command:''}" data-a="${command=='createLink'?'samplefilelink':'sampleformat:'+command}" aria-label="${T(command)}" title="${T(command)}">${label}</button>`).join('')}<button type="button" class="sample-file-tool" data-a="samplefileinsertimage" aria-label="${T('Insert Image')}" title="${T('Insert Image')}">▧</button></div><input id="sample-file-image" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="sample-file-ocr-image" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="sample-file-editor-body" contenteditable="true" role="textbox" aria-label="${T('Template content')}" aria-multiline="true">${file?.content||''}</div></div><div class="sample-file-actions"><button type="button" class="btn" data-a="samplefileimage">▧ ${T('Upload Image (OCR)')}</button><button type="button" class="btn" data-a="close">${T('Cancel')}</button><button type="submit" class="btn p">▣ ${T('Save')}</button></div>`;
  $('#md').classList.add('on');
  form.onsubmit=async event=>{
    event.preventDefault();
    const name=String(new FormData(form).get('name')||'').trim(),content=form.querySelector('.sample-file-editor-body').innerHTML;
    if(!name)return toast(T('Template title is required'));
    try{await api(editing?'PUT':'POST',editing?'files/'+file.id:'files',{name,content});await load();$('#md').classList.remove('on');render();toast(T('Saved'))}catch(error){toast(error.message)}
  };
}
function sampleFileFormat(command,value=null){
  const editor=$('#mf .sample-file-editor-body');if(!editor)return;
  editor.focus();
  const selection=window.getSelection&&window.getSelection();
  if(sampleFileSelection&&selection){selection.removeAllRanges();selection.addRange(sampleFileSelection)}
  else if(selection&&selection.rangeCount&&!editor.contains(selection.anchorNode)){const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range)}
  if(command=='createLink'){const href=prompt(T('Enter a URL'));if(href&&/^https?:\/\//i.test(href))document.execCommand(command,false,href);return}
  if(command=='formatBlock'&&value=='blockquote')document.execCommand(command,false,value);
  else document.execCommand(command,false,value);
}
async function sampleFileUploadImage(file){
  if(!file)return;
  try{
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type||''))throw new Error(T('Use a JPG, PNG or WebP picture'));
    if(file.size>2e6)throw new Error(T('Picture is too large (max 2 MB)'));
    const response=await fetch(API_BASE+'/api/ocr',{method:'POST',headers:{'Content-Type':file.type,...(tok?{Authorization:'Bearer '+tok}:{})},body:file}),result=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(result&&result.error||T('Image OCR failed'));
    if(!result||!String(result.text||'').trim())throw new Error(T('No text was detected in the selected image'));
    sampleFileFormat('insertText',result.text);
    toast(T('Text extracted from image'));
  }catch(error){toast(error.message)}
}
async function sampleFileInsertImage(file){
  if(!file)return;
  try{
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type||''))throw new Error(T('Use a JPG, PNG or WebP picture'));
    if(file.size>2e6)throw new Error(T('Picture is too large (max 2 MB)'));
    const response=await fetch(API_BASE+'/api/uploads',{method:'POST',headers:{'Content-Type':file.type,...(tok?{Authorization:'Bearer '+tok}:{})},body:file}),result=await response.json().catch(()=>null);
    if(!response.ok||!result||!result.photo)throw new Error(result&&result.error||T('Image upload failed'));
    sampleFileFormat('insertImage',API_BASE+'/uploads/'+encodeURIComponent(result.photo));
  }catch(error){toast(error.message)}
}
function echoFormat(sectionId,command){
  const editor=$(`[data-echo-editor="${sectionId}"]`);if(!editor)return;
  if(command=='insertTable')return echoTableDialog(sectionId);
  editor.focus();
  echoRestoreSelection(editor);
  if(command=='createLink')return echoLink(editor);
  if(command=='insertImage')return echoImage(sectionId);
  if(typeof document.execCommand!='function')return;
  document.execCommand(command,false,null);
}
function echoRestoreSelection(editor){
  const selection=window.getSelection&&window.getSelection();
  if(echoToolbarSelection&&selection){selection.removeAllRanges();selection.addRange(echoToolbarSelection)}
  else if(selection&&selection.rangeCount&&!editor.contains(selection.anchorNode)){const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range)}
}
function echoLink(editor){
  if(typeof window.prompt!='function')return toast(T('Link prompt is unavailable'));
  const url=window.prompt(T('Enter link URL'));
  if(url==null||!url.trim())return;
  let parsed;try{parsed=new URL(url.trim())}catch{return toast(T('Enter a valid HTTP or HTTPS URL'))}
  if(!['http:','https:'].includes(parsed.protocol))return toast(T('Enter a valid HTTP or HTTPS URL'));
  echoRestoreSelection(editor);
  if(typeof document.execCommand=='function')document.execCommand('createLink',false,parsed.href);
  else editor.insertAdjacentHTML('beforeend',`<a href="${esc(parsed.href)}">${esc(parsed.href)}</a>`);
  echoToolbarSelection=null;
}
function echoImage(sectionId){
  const picker=$('#echo-image-file-'+sectionId);
  if(!picker)return toast(T('Image picker is unavailable'));
  picker.click();
}
async function echoUploadImage(sectionId,file){
  if(!file){echoToolbarSelection=null;return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){echoToolbarSelection=null;return toast(T('Use a JPG, PNG or WebP picture'))}
  if(file.size>2e6){echoToolbarSelection=null;return toast(T('Picture is too large (max 2 MB)'))}
  try{
    const response=await fetch(API_BASE+'/api/uploads',{method:'POST',headers:{'Content-Type':file.type,...(tok?{Authorization:'Bearer '+tok}:{})},body:file}),result=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(result&&result.error||T('Image upload failed'));
    if(!result||!result.photo)throw new Error(T('Image upload failed'));
    const editor=$(`[data-echo-editor="${sectionId}"]`);
    if(!editor)throw new Error(T('Echo editor not found'));
    editor.focus();echoRestoreSelection(editor);
    const src=API_BASE+'/uploads/'+encodeURIComponent(result.photo);
    if(typeof document.execCommand=='function')document.execCommand('insertImage',false,src);
    else editor.insertAdjacentHTML('beforeend',`<img src="${esc(src)}" alt="">`);
    const content=editor.closest('[data-echo-section]')?.querySelector('[data-echo-content]');
    if(content)content.value=editor.innerHTML;
    echoToolbarSelection=null;
  }catch(error){echoToolbarSelection=null;toast(error.message)}
}
function echoTableDialog(sectionId){
  echoTableSectionId=String(sectionId);echoTableSelection=null;
  const editor=$(`[data-echo-editor="${sectionId}"]`),selection=window.getSelection&&window.getSelection();
  if(editor&&selection&&selection.rangeCount&&editor.contains(selection.anchorNode))echoTableSelection=selection.getRangeAt(0).cloneRange();
  const existing=$('#echo-table-dialog');if(existing)existing.remove();
  $('#md').insertAdjacentHTML('beforeend',`<div id="echo-table-dialog" class="echo-table-dialog" role="dialog" aria-modal="true" aria-labelledby="echo-table-title"><div class="echo-table-dialog-card"><div class="echo-table-dialog-heading"><h3 id="echo-table-title">${T('Insert Table')}</h3><button type="button" class="btn s" data-a="echotablecancel" aria-label="${T('Close')}">×</button></div><label>${T('Rows')}<input class="in" id="echo-table-rows" type="number" min="1" max="30" value="2"></label><label>${T('Columns')}<input class="in" id="echo-table-columns" type="number" min="1" max="20" value="2"></label><label>${T('Header Color')}<span class="echo-color-control"><input id="echo-table-header-color" type="color" value="#ffffff"><input class="in" id="echo-table-header-hex" value="#ffffff" maxlength="7" aria-label="${T('Header Color')}"></span></label><label>${T('Border Color')}<span class="echo-color-control"><input id="echo-table-border-color" type="color" value="#d1d5db"><input class="in" id="echo-table-border-hex" value="#d1d5db" maxlength="7" aria-label="${T('Border Color')}"></span></label><label>${T('Border Style')}<select class="in" id="echo-table-border-style"><option value="solid">${T('Solid')}</option><option value="dashed">${T('Dashed')}</option><option value="dotted">${T('Dotted')}</option><option value="double">${T('Double')}</option></select></label><div class="echo-table-dialog-actions"><button type="button" class="btn" data-a="echotablecancel">${T('Cancel')}</button><button type="button" class="btn p" data-a="echotableinsert">${T('Insert')}</button></div></div></div>`);
}
function echoTableMarkup(rows,columns,headerColor,borderColor,borderStyle){
  const rowCount=Math.max(1,Math.min(30,Math.floor(Number(rows)||2))),columnCount=Math.max(1,Math.min(20,Math.floor(Number(columns)||2)));
  const color=value=>/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
  const header=color(headerColor)||'#ffffff',border=color(borderColor)||'#d1d5db',style=['solid','dashed','dotted','double'].includes(borderStyle)?borderStyle:'solid';
  const cells=(isHeader)=>Array.from({length:columnCount},()=>`<${isHeader?'th':'td'} style="border:1px ${style} ${border};padding:6px;${isHeader?`background-color:${header};`:''}">&nbsp;</${isHeader?'th':'td'}>`).join('');
  const tableRows=Array.from({length:rowCount},(_,index)=>`<tr>${cells(index===0)}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;border:1px ${style} ${border};"><tbody>${tableRows}</tbody></table><p><br></p>`;
}
function echoTableInsert(){
  const rows=$('#echo-table-rows').value,columns=$('#echo-table-columns').value,header=$('#echo-table-header-hex').value.trim(),border=$('#echo-table-border-hex').value.trim(),style=$('#echo-table-border-style').value;
  const editor=$(`[data-echo-editor="${echoTableSectionId}"]`);if(!editor)return toast(T('Echo editor not found'));
  if(!Number.isInteger(Number(rows))||Number(rows)<1||Number(rows)>30)return toast(T('Rows must be between 1 and 30'));
  if(!Number.isInteger(Number(columns))||Number(columns)<1||Number(columns)>20)return toast(T('Columns must be between 1 and 20'));
  if(!/^#[0-9a-f]{6}$/i.test(header)||!/^#[0-9a-f]{6}$/i.test(border))return toast(T('Enter valid hex colors'));
  const html=echoTableMarkup(rows,columns,header,border,style),selection=window.getSelection&&window.getSelection();
  editor.focus();
  if(echoTableSelection&&selection){selection.removeAllRanges();selection.addRange(echoTableSelection)}
  if(typeof document.execCommand=='function')document.execCommand('insertHTML',false,html);
  else editor.insertAdjacentHTML('beforeend',html);
  const section=editor.closest&&editor.closest('[data-echo-section]'),hidden=section&&section.querySelector('[data-echo-content]');if(hidden)hidden.value=editor.innerHTML;
  const dialog=$('#echo-table-dialog');if(dialog)dialog.remove();
  echoTableSelection=null;echoTableSectionId=null;
}
function echoApplyColor(input){
  const editor=$(`[data-echo-editor="${input.dataset.echoSection}"]`);if(!editor)return;
  editor.focus();echoRestoreSelection(editor);
  if(typeof document.execCommand=='function')document.execCommand(input.dataset.echoColor,false,input.value);
  echoToolbarSelection=null;
}
async function importEchoFile(file){
  if(!file)return;
  try{
    if(!/\.xlsx$/i.test(file.name||''))throw new Error(T('Choose an Excel workbook'));
    if(file.size>1e6)throw new Error(T('Import file must be smaller than 1 MB'));
    const response=await fetch(API_BASE+'/api/echo/import-xlsx',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',...(tok?{Authorization:'Bearer '+tok}:{})},body:await file.arrayBuffer()});
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(result&&result.error||T('Echo import failed'));
    await load();q='';render();toast(`${T('Imported')} ${result.imported} ${T('echo templates')}`);
  }catch(error){toast(error.message)}
}
async function exportEchoTemplates(){
  const rows=ft('echo').map(([template])=>({name:template.name,price:template.price,font:template.font||'Moul',sections:template.sections||'[]',fields:template.fields||'[]'}));
  if(!rows.length)return toast(T('No echo templates to download'));
  try{
    const response=await fetch(API_BASE+'/api/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({rows})});
    if(response.status==401&&tok)logout();
    if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error&&error.error||T('Echo export failed'))}
    const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');anchor.href=url;anchor.download='echo-templates.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast(error.message)}
}
FM.sv=[['Service name','name',null,null,'e.g. Facial treatment'],['Price (KHR)','price','number',null,'e.g. 60000'],['Description','description','ta',null,'Enter service details']];
function serviceForm(index=null){const editing=index!=null,r=editing?D.sv[index]:{};if(editing&&!r)return toast('Service not found');modal(editing?'Edit Service':'Add Service',FM.sv,r||{},o=>api(editing?'PUT':'POST',editing?'services/'+r.id:'services',o),{submit:editing?'Save':'Add',className:'service-form'})}
function parseServiceCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c=='"'&&text[i+1]=='"'){field+='"';i++}else if(c=='"')quoted=false;else field+=c}
    else if(c=='"'&&field=='')quoted=true;
    else if(c==','){row.push(field);field=''}
    else if(c=='\n'||c=='\r'){if(c=='\r'&&text[i+1]=='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unterminated quoted field');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw new Error('CSV must include a header and at least one service');
  const normalize=s=>s.replace(/^\ufeff/,'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const headers=rows[0].map(normalize),find=(...names)=>headers.findIndex(h=>names.includes(h));
  const nameIndex=find('name','servicename','service'),priceIndex=find('price','pricekhr','amount'),descriptionIndex=find('description','details');
  if(nameIndex<0||priceIndex<0)throw new Error('CSV needs name and price columns');
  return rows.slice(1).map((cells,i)=>{
    const name=(cells[nameIndex]||'').trim(),rawPrice=(cells[priceIndex]||'').trim().replace(/^(KHR|៛)\s*/i,'').replace(/,/g,'');
    if(!name)throw new Error(`Row ${i+2}: service name is required`);
    if(!/^\d+$/.test(rawPrice))throw new Error(`Row ${i+2}: price must be a whole number`);
    return {name,price:Number(rawPrice),description:descriptionIndex<0?'':(cells[descriptionIndex]||'').trim()};
  });
}
async function importServicesFile(file){
  if(!file)return;
  try{
    const isXlsx=/\.xlsx$/i.test(file.name||'');
    if(!isXlsx&&!/\.csv$/i.test(file.name||''))throw new Error('Choose an Excel workbook or CSV file');
    if(file.size>1e6)throw new Error('Import file must be smaller than 1 MB');
    let result;
    if(isXlsx){
      const response=await fetch(API_BASE+'/api/services/import-xlsx',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',...(tok?{Authorization:'Bearer '+tok}:{})},body:await file.arrayBuffer()});
      result=await response.json().catch(()=>null);
      if(response.status==401&&tok)logout();
      if(!response.ok)throw new Error(result&&result.error||'Request failed');
    }else{
      const rows=parseServiceCsv(await file.text());
      if(rows.length>1000)throw new Error('CSV can contain up to 1,000 services');
      result=await api('POST','services/import',{rows});
    }
    await load();q='';render();toast(`${result.imported} services imported`);
  }catch(e){toast(e.message)}
}
const df={pt:{type:'OPD',unpaid:0,age:0},dr:{av:'Available'},echo:{font:'Moul',price:25000}};
const doctorSigColors=['#ef4444','#ec4899','#a21caf','#7c3aed','#4f46e5','#2563eb','#0ea5e9','#06b6d4','#0d9488','#22c55e','#84cc16','#a3e635','#facc15','#f59e0b','#f97316','#f43f5e','#854d0e','#64748b'];
let doctorSignature={strokes:[]},doctorSigColor=doctorSigColors[0];
function doctorDrawSignature(){
  const canvas=$('#drsig');if(!canvas||!canvas.getContext)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(const stroke of doctorSignature.strokes){if(!stroke.points.length)continue;ctx.beginPath();ctx.strokeStyle=doctorSigColors.includes(stroke.color)?stroke.color:doctorSigColors[0];ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';stroke.points.forEach((p,i)=>{const x=p[0]*canvas.width,y=p[1]*canvas.height;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke()}
}
function doctorForm(index=null){
  const editing=index!=null,r=editing?D.dr[index]:{};if(editing&&!r)return;
  doctorSigColor=doctorSigColors[0];doctorSignature=r&&r.signature?JSON.parse(r.signature):{strokes:[]};
  const colors=doctorSigColors.map(c=>`<button type="button" class="dr-color ${c==doctorSigColor?'selected':''}" style="--sig-color:${c}" data-a="drcolor:${c}" aria-label="Signature color"></button>`).join('');
  const f=$('#mf');f.className='doctor-form';
  f.innerHTML=`<div class="doctor-form-head"><div><h2>${editing?'Edit Doctor':'Add Doctor'}</h2><p>Fill in the details for the doctor/staff member.</p></div><button type="button" class="doctor-close" data-a="close" aria-label="Close">×</button></div>
<div class="doctor-photo"><div class="doctor-avatar"><img id="pv_photo" src="${r&&r.photo?API_BASE+'/uploads/'+esc(r.photo):''}" alt="" ${r&&r.photo?'':'hidden'}><span id="doctor-photo-placeholder" ${r&&r.photo?'hidden':''}>👤</span></div><input type="file" id="pf_photo" accept="image/*"><input type="hidden" id="pk_photo" name="photo" value="${esc(r&&r.photo||'')}"><button type="button" class="btn doctor-upload" data-a="drphoto">Upload Photo</button></div>
<div class="doctor-fields"><label>Name<input class="in" name="name" value="${esc(r&&r.name||'')}" required></label><label>Staff ID (Required for Login)<input class="in" name="code" value="${esc(r&&r.code||'')}" placeholder="e.g. S001" required></label><label>Role<input class="in" name="role" value="${esc(r&&r.role||'')}"></label><label>Department<input class="in" name="department" value="${esc(r&&r.department||'')}" placeholder="e.g. OPD"></label><label>Specialist / Designation<input class="in" name="specialist" value="${esc(r&&r.specialist||'')}"></label><label>EPF No<input class="in" name="epf_no" value="${esc(r&&r.epf_no||'')}"></label><label>Phone Number<input class="in" name="phone" value="${esc(r&&r.phone||'')}" placeholder="Phone number"></label><label>Work Shift / Days<input class="in" name="workdays" value="${esc(r&&r.workdays||r&&r.av||'')}" placeholder="e.g. Monday-Friday"></label><label>Contract Type<input class="in" name="contract_type" value="${esc(r&&r.contract_type||'')}" placeholder="e.g. Permanent"></label><label>Work Location<input class="in" name="work_location" value="${esc(r&&r.work_location||'')}" placeholder="e.g. Main Clinic"></label><label>Basic Salary ($)<input class="in" name="basic_salary" type="number" min="0" step="0.01" value="${((Number(r&&r.basic_salary_cents)||0)/100).toFixed(2)}"></label><label>Date Of Joining<input class="in" name="date_joined" type="date" value="${esc(r&&r.date_joined||'')}"></label></div>
<label class="doctor-signature-label">Signature</label><div class="doctor-signature"><canvas id="drsig" width="760" height="190" aria-label="Draw signature"></canvas></div><div class="doctor-signature-tools"><div class="doctor-colors">${colors}</div><button type="button" class="btn" data-a="drsigclear">▤ Clear</button></div>
<div class="doctor-form-actions"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn p">Save</button></div>`;
  const canvas=$('#drsig');let activeStroke=null;
  const point=e=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))]};
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();activeStroke={color:doctorSigColor,points:[point(e)]};doctorSignature.strokes.push(activeStroke);if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);doctorDrawSignature()});
  canvas.addEventListener('pointermove',e=>{if(!activeStroke)return;activeStroke.points.push(point(e));doctorDrawSignature()});
  canvas.addEventListener('pointerup',()=>{activeStroke=null});canvas.addEventListener('pointercancel',()=>{activeStroke=null});
  doctorDrawSignature();
  $('#md').classList.add('on');
  f.onsubmit=async e=>{e.preventDefault();const m=new FormData(f),name=String(m.get('name')||'').trim(),code=String(m.get('code')||'').trim();if(!name||!code){toast('Name and Staff ID are required');return}
    const salary=Number(m.get('basic_salary')||0);if(!Number.isFinite(salary)||salary<0||salary>20000000){toast('Basic salary must be a valid non-negative amount');return}
    const body={name,code,role:String(m.get('role')||''),department:String(m.get('department')||''),specialist:String(m.get('specialist')||''),epf_no:String(m.get('epf_no')||''),basic_salary_cents:Math.round(salary*100),contract_type:String(m.get('contract_type')||''),work_location:String(m.get('work_location')||''),date_joined:String(m.get('date_joined')||''),phone:String(m.get('phone')||''),workdays:String(m.get('workdays')||''),photo:String(m.get('photo')||''),signature:JSON.stringify(doctorSignature)};
    try{if(editing)await api('PUT','doctors/'+r.id,body);else await api('POST','doctors',body);await load();$('#md').classList.remove('on');render()}catch(er){toast(er.message)}
  };
}
function openDoctorProfile(id){if(!D.dr.some(d=>d.id==id))return toast('Doctor not found');doctorProfileId=+id;doctorTab='payroll';render()}
function openDoctorHistory(id){if(!D.dr.some(d=>d.id==id))return toast('Doctor not found');doctorProfileId=+id;doctorTab='timeline';render()}
function payrollForm(doctorId,slipId=null){
  const d=D.dr.find(x=>x.id==doctorId),s=slipId==null?null:D.payslips.find(x=>x.id==slipId);if(!d)return toast('Doctor not found');if(s&&s.doctor_id!=d.id)return toast('Payslip not found');
  const now=new Date(),month=s?s.period_month:now.getMonth()+1,year=s?s.period_year:now.getFullYear(),dateStart=s?s.date_start:`${year}-${String(month).padStart(2,'0')}-01`,dateEnd=s?s.date_end:`${year}-${String(month).padStart(2,'0')}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`;
  const usdInput=(name,label,cents,red=false)=>`<label class="payslip-field ${red?'deduction':''}">${label}<input class="in payroll-money" name="${name}" type="number" min="0" step="0.01" value="${((Number(cents)||0)/100).toFixed(2)}" required></label>`;
  const f=$('#mf');f.className='payslip-form';
  f.innerHTML=`<div class="payslip-head"><div><h2>${s?'Edit Payslip':'Add New Payslip'}</h2><p>Fill in the salary details below.</p></div><button type="button" class="doctor-close" data-a="close" aria-label="Close">×</button></div>
<div class="payslip-person"><div><span>ID</span><b>${esc(d.code)}</b></div><div><span>Name</span><b>${esc(d.name)}</b></div><div><span>Role</span><b>${esc(d.role||'--')}</b></div></div>
<div class="payslip-fields"><label>Month<select class="in" name="period_month">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1==month?'selected':''}>${new Date(2000,i,1).toLocaleString('en-US',{month:'long'})}</option>`).join('')}</select></label><label>Year<input class="in" name="period_year" type="number" min="2000" max="2100" value="${year}" required></label><div class="payslip-date-label">Date Range</div><label><span class="visually-hidden">Start date</span><input class="in" name="date_start" type="date" value="${esc(dateStart)}" required></label><label><span class="visually-hidden">End date</span><input class="in" name="date_end" type="date" value="${esc(dateEnd)}" required></label>
${usdInput('basic_cents','Basic Salary ($)',s?s.basic_cents:d.basic_salary_cents)}${usdInput('position_allowance_cents','Position Allowance ($)',s&&s.position_allowance_cents)}
${usdInput('overtime_cents','Overtime / Extra ($)',s&&s.overtime_cents)}${usdInput('benefits_cents','Other Benefits ($)',s&&s.benefits_cents)}
${usdInput('deduction_cents','Deduction ($)',s&&s.deduction_cents,true)}<label class="payslip-note">Note<textarea class="in" name="note" rows="2" placeholder="Any additional notes...">${esc(s&&s.note||'')}</textarea></label></div>
<div class="payslip-net"><b>Calculated Net Salary:</b><strong id="payslip-net">$0.00</strong></div><div class="payslip-actions"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn p">${s?'Save Changes':'Save Payslip'}</button></div>`;
  $('#md').classList.add('on');
  f.onsubmit=async e=>{e.preventDefault();const m=new FormData(f),mth=Number(m.get('period_month')),yr=Number(m.get('period_year')),date_start=String(m.get('date_start')||''),date_end=String(m.get('date_end')||'');
    if(mth<1||mth>12||yr<2000||yr>2100||!date_start||!date_end||date_start>date_end){toast('Check the payslip month, year, and date range');return}
    const amounts={};for(const k of ['basic_cents','position_allowance_cents','overtime_cents','benefits_cents','deduction_cents']){const v=Number(m.get(k));if(!Number.isFinite(v)||v<0||v>20000000){toast('Salary amounts must be valid non-negative numbers');return}amounts[k]=Math.round(v*100)}
    if(D.payslips.some(q=>q.doctor_id==d.id&&q.period_month==mth&&q.period_year==yr&&q.id!=(s&&s.id))){toast('A payslip already exists for this month');return}
    if(amounts.deduction_cents>amounts.basic_cents+amounts.position_allowance_cents+amounts.overtime_cents+amounts.benefits_cents){toast('Deduction cannot exceed total earnings');return}
    const body={doctor_id:d.id,period_month:mth,period_year:yr,date_start,date_end,...amounts,note:String(m.get('note')||'')};
    try{if(s)await api('PUT','payslips/'+s.id,body);else await api('POST','payslips',body);await load();$('#md').classList.remove('on');doctorProfileId=d.id;doctorTab='payroll';render()}catch(er){toast(er.message)}
  };
  payrollRecalculate();
}
function payrollRecalculate(){
  const f=$('#mf'),out=$('#payslip-net');if(!f||!out)return;
  const values=['basic_cents','position_allowance_cents','overtime_cents','benefits_cents'].map(k=>Number(f.elements[k]&&f.elements[k].value)||0);
  const deduction=Number(f.elements.deduction_cents&&f.elements.deduction_cents.value)||0;
  out.textContent=moneyCents(Math.round(values.reduce((a,b)=>a+b,0)*100)-Math.round(deduction*100));
}
function payrollPrint(id){
  const s=D.payslips.find(x=>x.id==id),d=s&&D.dr.find(x=>x.id==s.doctor_id);if(!s||!d)return toast('Payslip not found');
  const earned=s.position_allowance_cents+s.overtime_cents+s.benefits_cents,net=s.basic_cents+earned-s.deduction_cents;
  const rows=[['Payslip No.','PAY-'+s.id],['Employee',d.name],['Staff ID',d.code],['Role',d.role],['Month / Year',slipPeriod(s)],['Date Range',s.date_start+' - '+s.date_end],['Basic Salary',moneyCents(s.basic_cents)],['Position Allowance',moneyCents(s.position_allowance_cents)],['Overtime / Extra',moneyCents(s.overtime_cents)],['Other Benefits',moneyCents(s.benefits_cents)],['Deduction',moneyCents(s.deduction_cents)],['Net Salary',moneyCents(net)],['Note',s.note]];
  if(typeof printDoc=='function')printDoc('Payslip',`<table class="pk">${rows.filter(([,v])=>v).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`);
}
let tok=null,needSetup=false;try{tok=localStorage.getItem('kt')}catch(e){}
const RS={pt:'patients',ap:'appointments',ipd:'ipd',dr:'doctors',payslips:'payslips',expenses:'expenses',med:'medicines',sv:'services',lab:'labs',labcategories:'labcategories',echo:'echo',dx:'diagnoses',rx:'prescriptions',sy:'symptoms',ad:'addresses',sf:'files',ch:'chat'};
async function api(m,u,b){const r=await fetch(API_BASE+'/api/'+u,{method:m,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});let j=null;try{j=await r.json()}catch(e){}if(r.status==401&&tok&&u!='auth/login')logout();if(!r.ok)throw new Error(j&&j.error||'Request failed');return j}
async function load(){const k=Object.keys(RS),[rows,dash,bill,cl,schedules,payments,investigations,sales,user,medicineSales]=await Promise.all([Promise.all(k.map(x=>api('GET',RS[x]+'?limit=5000'))),api('GET','dashboard'),api('GET','reports/daily?days=30'),api('GET','clinic'),api('GET','records?kind=schedule&limit=5000'),api('GET','records?kind=payment&limit=5000'),api('GET','records?kind=investigation&limit=5000'),api('GET','sales?limit=5000'),api('GET','auth/me'),api('GET','reports/medicine-sales?limit=5000')]);D.clinic=cl;D.user=user;k.forEach((x,i)=>D[x]=rows[i]);D.ch=D.ch.map(r=>r.msg);D.rev=dash.revenueToday;D.bill=bill;D.sales=sales;D.medicineSales=medicineSales;D.billing=[...schedules,...payments,...investigations];Object.keys(cart).forEach(i=>{if(!D.med.some(m=>m.id==i))delete cart[i]})}
function logout(){tok=null;try{localStorage.removeItem('kt')}catch(e){}$('#lg').style.display='grid'}
function setLoginLoading(loading){const overlay=$('#login-loading'),button=$('#login-submit');if(overlay)overlay.hidden=!loading;if(button)button.disabled=loading;const login=$('#lg');if(login)login.setAttribute('aria-busy',String(loading))}
async function doLogin(){const email=$('#em').value.trim(),password=$('#pw').value;setLoginLoading(true);try{if(needSetup){await api('POST','auth/setup',{email,password});needSetup=false}const r=await api('POST','auth/login',{email,password});tok=r.token;try{localStorage.setItem('kt',tok)}catch(e){}await load();$('#lg').style.display='none';render()}catch(e){toast(e.message)}finally{setLoginLoading(false)}}
const run=p=>p.then(()=>load()).then(render).catch(e=>toast(e.message));
document.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el)return;e.preventDefault();const[a,x,y]=el.dataset.a.split(':');
if(a=='login')doLogin();else if(a=='logout')logout();
else if(a=='reportrange')reportSetRange(x);
else if(a=='reportapply'){reportQuery=$('#report-q').value.trim();reportFrom=$('#report-from').value;reportTo=$('#report-to').value;reportRange='';if(reportFrom&&reportTo&&reportFrom>reportTo)return toast('From date must not be after To date');render()}
else if(a=='medreportapply')medicineReportApply();
else if(a=='medreportexport')medicineReportExport();
else if(a=='medreportdelete'){if(confirm(T('Delete this medicine sale item?')))run(api('DELETE',`sales/${x}/items/${y}`))}
else if(a=='reportexpense')reportExpenseForm();
else if(a=='reportexport')run(exportReport());
else if(a=='reportprint')reportPrint(x);
else if(a=='reportdelete'){if(confirm('Delete this report entry?'))run(api('DELETE',(x=='expense'?'expenses/':'records/')+y))}
else if(a=='analytics-period'){analyticsPeriod=x;render()}
else if(a=='analytics-clear'){analyticsFrom='';analyticsTo='';analyticsPeriod='daily';render()}
else if(a=='doctor-analytics-clear'){doctorAnalyticsFrom='';doctorAnalyticsTo='';doctorAnalyticsId='';render()}
else if(a=='go'){setPage(x);q='';pg=1;doctorProfileId=null;medicineViewId=null;$('#sd').classList.remove('on');render()}else if(a=='grp'){cl[x]=!cl[x];nav()}else if(a=='menu'){if((window.innerWidth||0)>820){const on=document.body.classList.toggle('sbc');try{localStorage.setItem('sbc',on?'1':'0')}catch(e){}}else $('#sd').classList.toggle('on')}
else if(a=='rmpic'){$('#pk_'+x).value='';$('#pv_'+x).hidden=true;$('#pf_'+x).value='';if(x=='photo'&&$('#doctor-photo-placeholder'))$('#doctor-photo-placeholder').hidden=false;if(x=='photo'&&$('#medicine-photo-placeholder'))$('#medicine-photo-placeholder').hidden=false}else if(a=='settings'){setPage('set');q='';$('#sd').classList.remove('on');render()}else if(a=='lang')setLang(x);else if(a=='th'){document.documentElement.dataset.theme=x;render()}else if(a=='pwd')modal('Change password',[['Current password','current','pw'],['New password','password','pw']],{},o=>api('POST','auth/password',o).then(()=>toast('Password changed')))
else if(a=='saveclinic'){const o={};document.querySelectorAll('#cf [name]').forEach(e=>{o[e.name]=e.type=='checkbox'?(e.checked?1:0):e.value});o.rate=+o.rate;const ct={};Object.keys(o).forEach(k=>{if(k.startsWith('cnf_')){ct[k.slice(4)]=o[k];delete o[k]}});if(Object.keys(ct).length)o.cnf_text=ct;api('PUT','clinic',o).then(c=>{D.clinic=c;toast('Saved');render()}).catch(er=>toast(er.message))}
else if(a=='theme'){const r=document.documentElement;r.dataset.theme=(r.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))=='dark'?'light':'dark'}
else if(a=='toast')toast(x);else if(a=='close')$('#md').classList.remove('on');else if(a=='tab'){tab=x;pg=1;render()}else if(a=='pg'){pg=Math.max(1,+x);render()}
else if(a=='doctor')openDoctorProfile(x);
else if(a=='doctorhistory')openDoctorHistory(x);
else if(a=='doctorback'){doctorProfileId=null;render()}
else if(a=='drtab'){doctorTab=x;render()}
else if(a=='payslipadd')payrollForm(doctorProfileId);
else if(a=='payslipedit'){const s=D.payslips.find(v=>v.id==x);if(s)payrollForm(s.doctor_id,s.id);else toast('Payslip not found')}
else if(a=='payslipprint')payrollPrint(+x);
else if(a=='payslipdel'){if(confirm('Delete this payslip?'))run(api('DELETE','payslips/'+x))}
else if(a=='del'){if(confirm(T('Delete this record?'))){const r=D[x][+y];run(api('DELETE',RS[x]+'/'+r.id).then(()=>x=='ipd'&&!r.out?syncOpd(r):0))}}
else if(a=='out'){const r=D.ipd[+x];run(api('PUT','ipd/'+r.id,{out:1}).then(()=>syncOpd(r)))}
else if(a=='add'){const k=x;if(k=='dr')return doctorForm();if(k=='sv')return serviceForm();if(k=='echo')return echoForm();if(k=='rx')return rxTemplateForm();if(k=='med'&&rt=='pos'){medicineEditIndex=null;medicineViewId=null;medicineFormOpen=true;medicineFormReturnPage='pos';rt='med';render();return}const F=FM[k]||P[k].f,d={...(df[k]||P[k]?.d||{})};modal('Add',F,d,o=>api('POST',RS[k],{...d,...o}))}
else if(a=='edit'){if(x=='dr')return doctorForm(+y);if(x=='sv')return serviceForm(+y);if(x=='echo')return echoForm(+y);if(x=='rx')return rxTemplateForm(+y);const F=FM[x]||P[x].f,r=D[x][+y];modal('Edit',F,r,o=>api('PUT',RS[x]+'/'+r.id,o))}
else if(a=='rxmedicine')toggleRxMedicine(x);
else if(a=='medadd'){medicineEditIndex=null;medicineFormOpen=true;render()}
else if(a=='mededit'){medicineViewId=null;medicineEditIndex=+x;medicineFormOpen=true;render()}
else if(a=='medview'){medicineViewId=x;medicineFormOpen=false;render()}
else if(a=='medback'){medicineViewId=null;render()}
else if(a=='medlayout'){medicineLayout=medicineLayout=='table'?'cards':'table';try{localStorage.setItem('medicineLayout',medicineLayout)}catch(e){}render()}
else if(a=='medstock')updateMedicineStock(+x)
else if(a=='medcomposition')viewMedicineComposition(+x)
else if(a=='medqr')run(printMedicineCode(+x,'qr'))
else if(a=='medbarcode')run(printMedicineCode(+x,'barcode'))
else if(a=='medqrbulk')run(exportMedicineCodes('qr'))
else if(a=='medbarcodebulk')run(exportMedicineCodes('barcode'))
else if(a=='medformclose'){medicineFormOpen=false;medicineEditIndex=null;if(medicineFormReturnPage){rt=medicineFormReturnPage;medicineFormReturnPage=null}render()}
else if(a=='medimport')$('#med-import-file').click();
else if(a=='medphoto')$('#pf_photo').click();
else if(a=='medunitadd')$('#medicine-units-list').insertAdjacentHTML('beforeend',medicineUnitRow());
else if(a=='medunitdel'){const rows=$('#medicine-units-list').querySelectorAll('.medicine-unit-row');if(rows.length<=1)return toast('At least one sales unit is required');el.closest('.medicine-unit-row').remove()}
else if(a=='svimport')$('#sv-import-file').click();
else if(a=='dximport')$('#dx-import-file').click();
else if(a=='dxexport')run(exportDiagnoses());
else if(a=='labimport')$('#lab-import-file').click();
else if(a=='labadd')labForm();
else if(a=='labedit')labForm(+x);
else if(a=='labdel'){const lab=D.lab[+x];if(lab&&confirm(T('Delete this lab template?')))run(api('DELETE','labs/'+lab.id))}
else if(a=='labcategoryadd')labCategoryForm();
else if(a=='labfieldadd')$('#lab-fields-list').insertAdjacentHTML('beforeend',labFieldRow());
else if(a=='labfielddel')el.closest('.lab-field-row').remove();
else if(a=='echoadd')echoForm();
else if(a=='samplefileadd')sampleFileForm();
else if(a=='samplefileedit')sampleFileForm(+x);
else if(a=='samplefileimage')$('#sample-file-ocr-image').click();
else if(a=='samplefileinsertimage')$('#sample-file-image').click();
else if(a=='samplefilelink')sampleFileFormat('createLink');
else if(a=='sampleformat')sampleFileFormat(x);
else if(a=='samplefiledel'){const file=D.sf[+x];if(file&&confirm(T('Delete this record?')))run(api('DELETE','files/'+file.id))}
else if(a=='echoedit')echoForm(+x);
else if(a=='echodel'){const template=D.echo[+x];if(template&&confirm(T('Delete this echo template?')))run(api('DELETE','echo/'+template.id))}
else if(a=='echoimport')$('#echo-import-file').click();
else if(a=='echoexport')run(exportEchoTemplates());
else if(a=='echosectionadd')$('#echo-sections-list').insertAdjacentHTML('beforeend',echoSectionHtml());
else if(a=='echosectiondel'){const section=el.closest('[data-echo-section]');if($('#echo-sections-list').querySelectorAll('[data-echo-section]').length<=1)return toast(T('At least one section is required'));section.remove()}
else if(a=='echofieldadd'){const section=el.closest('[data-echo-section]');section.querySelector('.echo-fields-list').insertAdjacentHTML('beforeend',echoFieldRow('',section.dataset.echoSection))}
else if(a=='echofielddel')el.closest('.echo-field-row').remove();
else if(a=='echoformat')echoFormat(x,y);
else if(a=='echotablecancel'){const dialog=$('#echo-table-dialog');if(dialog)dialog.remove();echoTableSelection=null;echoTableSectionId=null}
else if(a=='echotableinsert')echoTableInsert();
else if(a=='drphoto')$('#pf_photo').click();
else if(a=='drcolor'){doctorSigColor=x;document.querySelectorAll('.dr-color').forEach(b=>b.classList.toggle('selected',b.dataset.a=='drcolor:'+x))}
else if(a=='drsigclear'){doctorSignature={strokes:[]};doctorDrawSignature()}
else if(a=='cart'){const m=mi(x);if(m.stock<=(cart[x]||0))return toast('Not enough stock for '+m.name);cart[x]=(cart[x]||0)+1;render()}else if(a=='rm'){delete cart[x];render()}else if(a=='pay'){pay=x;render()}else if(a=='posprint')R.posPrint();
else if(a=='co'){const items=Object.entries(cart).map(([i,n])=>({medicine_id:+i,qty:n}));if(!items.length)return toast('Cart is empty');api('POST','sales',{items,method:pay}).then(s=>{cart={};toast('Paid '+K(s.total)+' by '+pay);return load()}).then(render).catch(er=>toast(er.message))}
else if(a=='send'){const v=$('#cm').value.trim();if(v)run(api('POST','chat',{msg:v}))}else if(typeof pAct=='function')pAct(a,x,y,el)});
async function pick(file,k){if(!file)return;if(!/^image\//.test(file.type))return toast('Use a JPG, PNG or WebP picture');toast('Uploading…');
try{const bmp=await createImageBitmap(file),sc=Math.min(1,(k=='banner'?1300:480)/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*sc));c.height=Math.max(1,Math.round(bmp.height*sc));const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);
const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.85)),r=await fetch(API_BASE+'/api/uploads',{method:'POST',headers:{'Content-Type':'image/jpeg',Authorization:'Bearer '+tok},body:blob}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Upload failed');
$('#pk_'+k).value=j.photo;$('#pv_'+k).src=API_BASE+'/uploads/'+j.photo;$('#pv_'+k).hidden=false;if(k=='photo'&&$('#doctor-photo-placeholder'))$('#doctor-photo-placeholder').hidden=true;if(k=='photo'&&$('#medicine-photo-placeholder'))$('#medicine-photo-placeholder').hidden=true;$('#ts').style.display='none'}catch(e){toast(e.message)}}
document.addEventListener('submit',e=>{if(e.target.id=='medicine-form')medicineSave(e)});
document.addEventListener('change',e=>{const match=/^echo-image-file-(\d+)$/.exec(e.target.id||'');if(match)echoUploadImage(match[1],e.target.files[0]).finally(()=>{e.target.value=''})});
document.addEventListener('change',e=>{const i=e.target.id||'';if(i=='sv-import-file')return importServicesFile(e.target.files[0]).finally(()=>{e.target.value=''});if(i=='dx-import-file')return importDiagnosesFile(e.target.files[0]).finally(()=>{e.target.value=''});if(i=='med-import-file')return importMedicinesFile(e.target.files[0]).finally(()=>{e.target.value=''});if(i=='lab-import-file')return importLabsFile(e.target.files[0]).finally(()=>{e.target.value=''});if(i=='echo-import-file')return importEchoFile(e.target.files[0]).finally(()=>{e.target.value=''});if(e.target.dataset&&e.target.dataset.echoColor)return echoApplyColor(e.target);if(i=='echo-table-header-color')$('#echo-table-header-hex').value=e.target.value;if(i=='echo-table-border-color')$('#echo-table-border-hex').value=e.target.value;if(e.target.dataset&&e.target.dataset.echoCommand){const editor=$(`[data-echo-editor="${e.target.dataset.echoSection}"]`);if(editor){editor.focus();echoRestoreSelection(editor);if(typeof document.execCommand=='function')document.execCommand(e.target.dataset.echoCommand,false,e.target.value)}}if(i.startsWith('pf_'))pick(e.target.files[0],i.slice(3))});
document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.echoEditor!=null){const hidden=e.target.closest('[data-echo-section]').querySelector('[data-echo-content]');hidden.value=e.target.innerHTML}else if(e.target.id=='echo-table-header-hex'&&/^#[0-9a-f]{6}$/i.test(e.target.value))$('#echo-table-header-color').value=e.target.value;else if(e.target.id=='echo-table-border-hex'&&/^#[0-9a-f]{6}$/i.test(e.target.value))$('#echo-table-border-color').value=e.target.value});
document.addEventListener('mousedown',e=>{const button=e.target.closest&&e.target.closest('[data-a^="echoformat:"]'),color=e.target.closest&&e.target.closest('[data-echo-color]');if(button||color){const sectionId=button?button.dataset.a.split(':')[1]:color.dataset.echoSection,editor=$(`[data-echo-editor="${sectionId}"]`),selection=window.getSelection&&window.getSelection();if(editor&&selection&&selection.rangeCount&&editor.contains(selection.anchorNode)){echoToolbarSelection=selection.getRangeAt(0).cloneRange();echoTableSelection=echoToolbarSelection.cloneRange()}if(button)e.preventDefault()}});
document.addEventListener('mousedown',e=>{const button=e.target.closest&&e.target.closest('[data-a^="sampleformat:"]'),control=e.target.closest&&e.target.closest('[data-sample-command]'),editor=$('#mf .sample-file-editor-body'),selection=window.getSelection&&window.getSelection();if((button||control)&&editor&&selection&&selection.rangeCount&&editor.contains(selection.anchorNode))sampleFileSelection=selection.getRangeAt(0).cloneRange();if(button)e.preventDefault()});
document.addEventListener('change',e=>{if(e.target.id=='sample-file-ocr-image')sampleFileUploadImage(e.target.files[0]).finally(()=>{e.target.value=''});else if(e.target.id=='sample-file-image')sampleFileInsertImage(e.target.files[0]).finally(()=>{e.target.value=''});else if(e.target.dataset&&e.target.dataset.sampleCommand)sampleFileFormat(e.target.dataset.sampleCommand,e.target.value)});
document.addEventListener('input',e=>{if(e.target.id=='q'){q=e.target.value;pg=1;render()}else if(e.target.classList&&e.target.classList.contains('rx-dose-input')){const medicine=rxSelected.get(String(e.target.dataset.rxId));if(medicine)medicine[e.target.dataset.rxField]=e.target.value}else if(e.target.classList&&e.target.classList.contains('payroll-money'))payrollRecalculate()});
document.addEventListener('change',e=>{if(e.target.name=='period_month'||e.target.name=='period_year'){const f=$('#mf'),month=Number(f.elements.period_month.value),year=Number(f.elements.period_year.value);if(month>=1&&month<=12&&year>=2000&&year<=2100){f.elements.date_start.value=`${year}-${String(month).padStart(2,'0')}-01`;f.elements.date_end.value=`${year}-${String(month).padStart(2,'0')}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`}}});
document.addEventListener('change',e=>{if(e.target.id=='doctor-analytics-from'||e.target.id=='doctor-analytics-to'){const from=e.target.id=='doctor-analytics-from'?e.target.value:doctorAnalyticsFrom,to=e.target.id=='doctor-analytics-to'?e.target.value:doctorAnalyticsTo;if(from&&to&&from>to){toast('Start Date must not be after End Date');e.target.value=e.target.id=='doctor-analytics-from'?doctorAnalyticsFrom:doctorAnalyticsTo;return}doctorAnalyticsFrom=from;doctorAnalyticsTo=to;render()}else if(e.target.id=='doctor-analytics-doctor'){doctorAnalyticsId=e.target.value;render()}else if(e.target.id=='analytics-from'||e.target.id=='analytics-to'){const from=e.target.id=='analytics-from'?e.target.value:analyticsFrom,to=e.target.id=='analytics-to'?e.target.value:analyticsTo;if(from&&to&&from>to){toast('Start Date must not be after End Date');return}analyticsFrom=from;analyticsTo=to;render()}});
/*I18N*/
let lang='en';try{lang=localStorage.getItem('kl')==='km'?'km':'en'}catch(e){}
const L={'Sign in':'ចូលគណនី','Please sign in to your account.':'សូមចូលគណនីរបស់អ្នក។','Email':'អ៊ីមែល','Password':'ពាក្យសម្ងាត់','Remember me':'ចងចាំខ្ញុំ','Sign in with your clinic account.':'ចូលដោយប្រើគណនីគ្លីនិករបស់អ្នក។','First run: choose the admin email and a password (8+ characters).':'ការប្រើលើកដំបូង៖ សូមជ្រើសរើសអ៊ីមែលអ្នកគ្រប់គ្រង និងពាក្យសម្ងាត់ (យ៉ាងតិច ៨ តួអក្សរ)។',
'Patient Care':'ការថែទាំអ្នកជំងឺ','Clinical':'គ្លីនិក','Finance & POS':'ហិរញ្ញវត្ថុ និង POS','Administration':'រដ្ឋបាល','Dashboard':'ផ្ទាំងគ្រប់គ្រង','Patients':'អ្នកជំងឺ','Appointments':'ការណាត់ជួប','Current IPD':'IPD បច្ចុប្បន្ន','Doctors':'គ្រូពេទ្យ','Chat':'ជជែក','Medicines':'ឱសថ','Services':'សេវាកម្ម','Lab Templates':'ទម្រង់ Lab','Echo Templates':'ទម្រង់អេកូ','Diagnosis':'រោគវិនិច្ឆ័យ','Prescription Template':'ទម្រង់វេជ្ជបញ្ជា','Prescription Templates':'ទម្រង់វេជ្ជបញ្ជា','Symptoms':'រោគសញ្ញា','Store':'ឃ្លាំង','NSSF':'ប.ស.ស','Report':'របាយការណ៍','Medicine Report':'របាយការណ៍ឱសថ','Address':'អាសយដ្ឋាន','Address Book':'សៀវភៅអាសយដ្ឋាន','Sample file':'ឯកសារគំរូ','Analytics':'ការវិភាគ','Doctor Analytics':'ការវិភាគគ្រូពេទ្យ','Settings':'ការកំណត់','Logout':'ចាកចេញ','Language':'ភាសា','Theme':'រូបរាង','Light':'ភ្លឺ','Dark':'ងងឹត','Close':'បិទ',
'Overview of your clinic':'ទិដ្ឋភាពទូទៅនៃគ្លីនិករបស់អ្នក','Total patients':'អ្នកជំងឺសរុប','Appointments today':'ការណាត់ជួបថ្ងៃនេះ','Daily revenue':'ចំណូលប្រចាំថ្ងៃ','Admitted patients':'អ្នកជំងឺសម្រាកពេទ្យ','Total Appointments':'ការណាត់ជួបសរុប','Patients by address':'អ្នកជំងឺតាមអាសយដ្ឋាន','Patients by age group':'អ្នកជំងឺតាមក្រុមអាយុ','Common complaints':'ពាក្យបណ្តឹងសុខភាពញឹកញាប់',
'Appointment list':'បញ្ជីណាត់ជួប','Manage all patient appointments.':'គ្រប់គ្រងការណាត់ជួបអ្នកជំងឺទាំងអស់។','Inpatients (IPD)':'ផ្នែកអ្នកជំងឺក្នុង (IPD)','Manage all admitted patients.':'គ្រប់គ្រងអ្នកជំងឺដែលកំពុងសម្រាកពេទ្យទាំងអស់។','Current IPD patients':'អ្នកជំងឺ IPD បច្ចុប្បន្ន','Patients not yet discharged':'បញ្ជីអ្នកជំងឺដែលមិនទាន់ចាកចេញ','Manage your pharmacy list.':'គ្រប់គ្រងបញ្ជីឱសថស្ថានរបស់អ្នក។','Manage all clinic services.':'គ្រប់គ្រងសេវាកម្មគ្លីនិកទាំងអស់។','Manage lab test templates and prices.':'គ្រប់គ្រងទម្រង់ និងតម្លៃនៃការធ្វើតេស្ត Lab។','Diagnoses available when writing a visit.':'រោគវិនិច្ឆ័យដែលអាចជ្រើសរើសពេលកត់ត្រាការពិនិត្យ។','Default medicines per disease.':'ឱសថលំនាំដើមសម្រាប់ជំងឺនីមួយៗ។','Manage symptoms list for patient complaints':'គ្រប់គ្រងបញ្ជីរោគសញ្ញាសម្រាប់ពាក្យបណ្តឹងរបស់អ្នកជំងឺ','Daily visits and revenue.':'ចំនួនអ្នកមកពិនិត្យ និងចំណូលប្រចាំថ្ងៃ។','Stock status.':'ស្ថានភាពស្តុក។','Inventory value.':'តម្លៃសរុបនៃស្តុក។','Patients covered by NSSF.':'អ្នកជំងឺដែលមាន ប.ស.ស។','Stock and revenue overview':'ទិដ្ឋភាពស្តុក និងចំណូល','Appointments per doctor':'ការណាត់ជួបតាមគ្រូពេទ្យ','Stock by medicine':'ស្តុកតាមឱសថ','Revenue by day (KHR 1,000)':'ចំណូលតាមថ្ងៃ (KHR 1,000)','Doctors List':'បញ្ជីគ្រូពេទ្យ','Internal messages':'សារផ្ទៃក្នុង',
'Add':'បន្ថែម','Add item':'បន្ថែមទំនិញ','Add Service':'បន្ថែមសេវាកម្ម','Edit Service':'កែប្រែសេវាកម្ម','Service name':'ឈ្មោះសេវាកម្ម','Description':'ការពិពណ៌នា','e.g. Facial treatment':'ឧ. សេវាថែរក្សាផ្ទៃមុខ','e.g. 60000':'ឧ. 60000','Enter service details':'បញ្ចូលព័ត៌មានលម្អិតអំពីសេវាកម្ម','Delete':'លុប','Service not found':'រកមិនឃើញសេវាកម្ម','Clinic Settings':'ការកំណត់គ្លីនិក','Manage your clinic information.':'គ្រប់គ្រងព័ត៌មានមូលដ្ឋានរបស់គ្លីនិកអ្នក។','Preferences':'ចំណូលចិត្ត','Logo':'និមិត្តសញ្ញា','Bank QR code':'កូដ QR ធនាគារ','Delete image':'លុបរូបភាព','Print settings':'ការកំណត់ការបោះពុម្ព','Clinic banner':'បដាគ្លីនិក','Recommended: 1300×200 px':'ទំហំណែនាំ៖ 1300×200 px','Show clinic name':'បង្ហាញឈ្មោះគ្លីនិក','Show address':'បង្ហាញអាសយដ្ឋាន','Show phone number':'បង្ហាញលេខទូរស័ព្ទ','Clinic name':'ឈ្មោះគ្លីនិក','Specialty':'ឯកទេស','Phone numbers':'លេខទូរស័ព្ទ','Currency':'រូបិយប័ណ្ណ','Exchange rate (KHR per $1)':'អត្រាប្តូរប្រាក់ (៛ ក្នុង $1)','Riel (KHR)':'រៀល (KHR)','US dollar (USD)':'ដុល្លារអាមេរិក (USD)','Doctor Settings':'ការកំណត់គ្រូពេទ្យ','Change password':'ប្តូរពាក្យសម្ងាត់','Current password':'ពាក្យសម្ងាត់បច្ចុប្បន្ន','New password':'ពាក្យសម្ងាត់ថ្មី','Saved':'បានរក្សាទុក','Password changed':'បានប្តូរពាក្យសម្ងាត់','Current password is wrong':'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ','Photo':'រូបភាព','Remove picture':'លុបរូបភាព','Uploading…':'កំពុងផ្ទុកឡើង…','Use a JPG, PNG or WebP picture':'សូមប្រើរូបភាព JPG, PNG ឬ WebP','Picture is too large (max 2 MB)':'រូបភាពធំពេក (អតិបរមា 2 MB)','File is not a valid picture':'ឯកសារនេះមិនមែនជារូបភាពត្រឹមត្រូវទេ','Upload failed':'ផ្ទុកឡើងមិនបានសម្រេច','Add items and manage stock and prices.':'បន្ថែមទំនិញ និងគ្រប់គ្រងស្តុក និងតម្លៃ។','Add Patient':'បន្ថែមអ្នកជំងឺ','Add Doctor':'បន្ថែមគ្រូពេទ្យ','Create Template':'បង្កើតទម្រង់','Edit':'កែប្រែ','Save':'រក្សាទុក','Cancel':'បោះបង់','Export Excel':'នាំចេញ Excel','Discharge':'ឱ្យចេញពីមន្ទីរពេទ្យ','Discharged':'បានចេញពីមន្ទីរពេទ្យ','Previous':'មុន','Next':'បន្ទាប់','Checkout':'គិតលុយ','Cash':'សាច់ប្រាក់','Bank':'ធនាគារ','Total':'សរុប','Send':'ផ្ញើ',
'Search…':'ស្វែងរក…','Search name, phone…':'ស្វែងរកតាមឈ្មោះ លេខទូរស័ព្ទ…','Search medicines…':'ស្វែងរកឱសថ…','Type a message':'វាយសារ',
'No.':'ល.រ','Name':'ឈ្មោះ','Service':'សេវាកម្ម','Date':'កាលបរិច្ឆេទ','Doctor':'គ្រូពេទ្យ','Phone':'ទូរស័ព្ទ','Status':'ស្ថានភាព','Actions':'សកម្មភាព','Room':'បន្ទប់','Payment':'ការទូទាត់','Price':'តម្លៃ','Price (KHR)':'តម្លៃ (KHR)','In stock':'ក្នុងស្តុក','Category':'ប្រភេទ','Disease name':'ឈ្មោះជំងឺ','Symptom':'រោគសញ្ញា','File name':'ឈ្មោះឯកសារ','Visits':'ចំនួនមកពិនិត្យ','Revenue':'ចំណូល','Stock':'ស្តុក','Item':'ទំនិញ','Unit price':'តម្លៃឯកតា','Value':'តម្លៃសរុប','ID':'លេខសម្គាល់','Treatment':'ការព្យាបាល','Age':'អាយុ','Sex':'ភេទ','Role':'តួនាទី','Unpaid':'មិនទាន់បង់','Paid':'បានបង់','NSSF ID':'លេខ ប.ស.ស','Medicines':'ឱសថ',
'Waiting':'កំពុងរង់ចាំ','Confirmed':'បានបញ្ជាក់','Out of stock':'អស់ស្តុក','Low':'ស្តុកតិច','OK':'ល្អ','Nurse':'គិលានុបដ្ឋាយិកា','Available':'ទំនេរ','Mon–Fri':'ច័ន្ទ–សុក្រ',
'Cart is empty':'កន្ត្រកទំនិញនៅទទេ','Nothing here yet.':'មិនទាន់មានទិន្នន័យទេ។','No patients.':'គ្មានអ្នកជំងឺទេ។','No messages yet.':'មិនទាន់មានសារទេ។','Delete this record?':'លុបកំណត់ត្រានេះមែនទេ?',
'Wrong email or password':'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ','Sign in required':'សូមចូលគណនីជាមុនសិន','Too many attempts. Try again later.':'ព្យាយាមច្រើនដងពេក។ សូមព្យាយាមម្តងទៀតពេលក្រោយ។','Enter a valid email':'សូមបញ្ចូលអ៊ីមែលឱ្យត្រឹមត្រូវ','Password must be at least 8 characters':'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ','Admin only':'សម្រាប់អ្នកគ្រប់គ្រងប៉ុណ្ណោះ','Request failed':'សំណើបរាជ័យ','Setup already completed':'ការដំឡើងបានបញ្ចប់រួចហើយ'};
L['Import Excel']='នាំចូល Excel';L['Choose an Excel workbook or CSV file']='សូមជ្រើសរើសសៀវភៅការងារ Excel ឬឯកសារ CSV';L['Import file must be smaller than 1 MB']='ឯកសារនាំចូលត្រូវតែមានទំហំតិចជាង 1 MB';L['CSV can contain up to 1,000 services']='ឯកសារ CSV អាចមានសេវាកម្មបានរហូតដល់ 1,000';L['CSV contains an unterminated quoted field']='CSV មានវាលសញ្ញាសម្រង់ដែលមិនបានបិទ';L['CSV must include a header and at least one service']='CSV ត្រូវមានចំណងជើងជួរឈរ និងសេវាកម្មយ៉ាងតិចមួយ';L['CSV needs name and price columns']='CSV ត្រូវមានជួរឈរឈ្មោះ និងតម្លៃ';L['Invalid Excel workbook']='សៀវភៅការងារ Excel មិនត្រឹមត្រូវ';L['Excel workbook must include a header and at least one service']='សៀវភៅការងារ Excel ត្រូវមានចំណងជើង និងសេវាកម្មយ៉ាងតិចមួយ';L['Excel workbook needs name and price columns']='សៀវភៅការងារ Excel ត្រូវមានជួរឈរឈ្មោះ និងតម្លៃ';L['Choose an Excel workbook or CSV with name, price, and description columns']='សូមជ្រើសរើសសៀវភៅការងារ Excel ឬ CSV ដែលមានជួរឈរឈ្មោះ តម្លៃ និងការពិពណ៌នា';L['Excel export API not found. Restart the backend server to load the latest changes.']='រកមិនឃើញ API នាំចេញ Excel ទេ។ សូមចាប់ផ្តើម server backend ឡើងវិញ ដើម្បីផ្ទុកការកែប្រែថ្មី។';
Object.assign(L,{'Upload Lab':'នាំចូល Lab','Add Type':'បន្ថែមប្រភេទ','Type':'ប្រភេទ','Type is required':'ត្រូវបញ្ចូលប្រភេទ','Type already exists':'ប្រភេទនេះមានរួចហើយ','Add Lab Template':'បន្ថែមទម្រង់ Lab','Manage lab test templates and prices.':'គ្រប់គ្រងទម្រង់ និងតម្លៃតេស្ត Lab។','Fields':'វាលទិន្នន័យ','Add Field':'បន្ថែមវាល','Field name':'ឈ្មោះវាល','Normal Range':'កម្រិតធម្មតា','Unit':'ឯកតា','Remove field':'លុបវាល','Lab template not found':'រកមិនឃើញទម្រង់ Lab','Delete this lab template?':'លុបទម្រង់ Lab នេះមែនទេ?','Choose an Excel workbook':'សូមជ្រើសរើសសៀវភៅការងារ Excel','Lab import failed':'ការនាំចូល Lab បរាជ័យ','Imported':'បាននាំចូល','lab templates':'ទម្រង់ Lab','rows must contain 1–1,000 lab templates':'ត្រូវមានទម្រង់ Lab ចន្លោះពី 1 ដល់ 1,000','Each lab template must be an object':'ទម្រង់ Lab នីមួយៗត្រូវជាវត្ថុ','Excel workbook must include a header and at least one lab template':'សៀវភៅការងារ Excel ត្រូវមានចំណងជើង និងទម្រង់ Lab យ៉ាងតិចមួយ','Excel workbook can contain up to 1,000 lab templates':'សៀវភៅការងារ Excel អាចមានទម្រង់ Lab បានរហូតដល់ 1,000','Excel workbook needs name and price columns':'សៀវភៅការងារ Excel ត្រូវមានជួរឈរឈ្មោះ និងតម្លៃ','fields must contain up to 50 entries':'វាលអាចមានធាតុបានរហូតដល់ 50'});
Object.assign(L,{'Create Template':'បង្កើតទម្រង់','Create Echo Template':'បង្កើតទម្រង់អេកូ','Edit Echo Template':'កែប្រែទម្រង់អេកូ','Template Name':'ឈ្មោះទម្រង់','Default Font':'ពុម្ពអក្សរលំនាំដើម','Section title':'ចំណងជើងផ្នែក','Optional section title':'ចំណងជើងផ្នែក (មិនចាំបាច់)','Section Content (Title/Body)':'មាតិកាផ្នែក (ចំណងជើង/ខ្លឹមសារ)','Additional Fields (Optional)':'វាលបន្ថែម (មិនចាំបាច់)','Field Name':'ឈ្មោះវាល','Remove field':'លុបវាល','Remove section':'លុបផ្នែក','Add New Section':'បន្ថែមផ្នែកថ្មី','Save Template':'រក្សាទុកទម្រង់','Upload':'នាំចូល','Download':'ទាញយក','Search echo templates…':'ស្វែងរកទម្រង់អេកូ…','Insert Table':'បញ្ចូលតារាង','Normal':'ធម្មតា','Heading':'ចំណងជើង','Quote':'សម្រង់','Text style':'រចនាប័ទ្មអត្ថបទ','Echo template not found':'រកមិនឃើញទម្រង់អេកូ','Delete this echo template?':'លុបទម្រង់អេកូនេះមែនទេ?','Template name is required':'ត្រូវបញ្ចូលឈ្មោះទម្រង់','At least one section is required':'ត្រូវមានយ៉ាងតិចមួយផ្នែក','Echo import failed':'ការនាំចូលទម្រង់អេកូបរាជ័យ','Echo export failed':'ការនាំចេញទម្រង់អេកូបរាជ័យ','No echo templates to download':'គ្មានទម្រង់អេកូសម្រាប់ទាញយក','echo templates':'ទម្រង់អេកូ'});
Object.assign(L,{'Insert Image From Device':'បញ្ចូលរូបភាពពីឧបករណ៍','Image picker is unavailable':'មិនអាចបើកឧបករណ៍ជ្រើសរើសរូបភាពបានទេ','Image upload failed':'ការផ្ទុករូបភាពបរាជ័យ','Echo editor not found':'រកមិនឃើញកម្មវិធីកែទម្រង់អេកូទេ','Use a JPG, PNG or WebP picture':'សូមប្រើរូបភាព JPG, PNG ឬ WebP','Picture is too large (max 2 MB)':'រូបភាពធំពេក (អតិបរមា 2 MB)'});
Object.assign(L,{'Financial Report':'របាយការណ៍ហិរញ្ញវត្ថុ','Patient Payments':'ការទូទាត់របស់អ្នកជំងឺ','POS Sales':'ការលក់ POS','Total Income':'ចំណូលសរុប','Expenses':'ចំណាយ','From date':'ចាប់ពីថ្ងៃ','To date':'ដល់ថ្ងៃ','Search patient, details...':'ស្វែងរកអ្នកជំងឺ ឬព័ត៌មានលម្អិត...','Search':'ស្វែងរក','Export Excel':'នាំចេញ Excel','Add Expense':'បន្ថែមចំណាយ','Today':'ថ្ងៃនេះ','Yesterday':'ម្សិលមិញ','This month':'ខែនេះ','Bill Summary':'សង្ខេបវិក្កយបត្រ','CP':'CP','Payroll Report':'របាយការណ៍ប្រាក់ខែ','Income':'ចំណូល','Date':'កាលបរិច្ឆេទ','Patient / Source':'អ្នកជំងឺ / ប្រភព','Details':'ព័ត៌មានលម្អិត','Amount':'ចំនួនទឹកប្រាក់','Category':'ប្រភេទ','Expense':'ចំណាយ','Expense Name':'ឈ្មោះចំណាយ','e.g. Supplies, Utilities':'ឧ. សម្ភារៈប្រើប្រាស់ ថ្លៃទឹកភ្លើង','Amount (KHR)':'ចំនួនទឹកប្រាក់ (រៀល)','Cancel':'បោះបង់','Save Expense':'រក្សាទុកចំណាយ','No income found for this period':'មិនមានចំណូលក្នុងរយៈពេលនេះទេ','No expenses found for this period':'មិនមានចំណាយក្នុងរយៈពេលនេះទេ'});
Object.assign(L,{'Item':'មុខទំនិញ','Unit Price (KHR)':'តម្លៃឯកតា (រៀល)','Quantity':'ចំនួន','Total (KHR)':'សរុប (រៀល)','Notes':'កំណត់ចំណាំ'});
Object.assign(L,{'Medicine sales report':'របាយការណ៍លក់ឱសថ','Track medicine quantities and sales revenue by date.':'តាមដានចំនួនឱសថ និងចំណូលពីការលក់តាមកាលបរិច្ឆេទ។','Quantity sold':'ចំនួនលក់','Total revenue':'ចំណូលសរុប','Medicine name':'ឈ្មោះឱសថ','Date sold':'ថ្ងៃលក់','Total':'សរុប','Actions':'សកម្មភាព','No medicine sales found for this date range.':'មិនមានការលក់ឱសថក្នុងចន្លោះកាលបរិច្ឆេទនេះទេ។','No medicine sales to export':'គ្មានទិន្នន័យលក់ឱសថសម្រាប់នាំចេញ','Medicine report export failed':'ការនាំចេញរបាយការណ៍ឱសថបរាជ័យ','Delete this medicine sale item?':'លុបមុខទំនិញលក់ឱសថនេះមែនទេ?'});
Object.assign(L,{'Add Template':'បន្ថែមទម្រង់','Create New Template':'បង្កើតទម្រង់ថ្មី','Edit Template':'កែប្រែទម្រង់','Template Title':'ចំណងជើងទម្រង់','Template content':'មាតិកាទម្រង់','Content':'មាតិកា','Font':'ពុម្ពអក្សរ','Text style':'រចនាប័ទ្មអត្ថបទ','Normal':'ធម្មតា','Heading 1':'ចំណងជើង ១','Heading 2':'ចំណងជើង ២','Quote':'សម្រង់','Insert Image':'បញ្ចូលរូបភាព','Upload Image (OCR)':'បញ្ចូលរូបភាព (OCR)','Template title is required':'ត្រូវបញ្ចូលចំណងជើងទម្រង់','Sample file template not found':'រកមិនឃើញទម្រង់ឯកសារគំរូ','Image OCR failed':'ការស្គាល់អក្សរពីរូបភាពបរាជ័យ','No text was detected in the selected image':'រកមិនឃើញអក្សរក្នុងរូបភាពដែលបានជ្រើសរើស','Text extracted from image':'បានស្គាល់អក្សរពីរូបភាព'});
const RX=[[/^(\d+) services imported$/,'បាននាំចូលសេវាកម្ម $1'],[/^Row (\d+): service name is required$/,'ជួរទី $1៖ ត្រូវបញ្ចូលឈ្មោះសេវាកម្ម'],[/^Row (\d+): price must be a whole number$/,'ជួរទី $1៖ តម្លៃត្រូវជាចំនួនគត់'],[/^rows must contain 1–1000 services$/,'ត្រូវមានសេវាកម្មចន្លោះពី 1 ដល់ 1,000'],[/^Each service must include a name and price$/,'សេវាកម្មនីមួយៗត្រូវមានឈ្មោះ និងតម្លៃ'],[/^Showing (\S+) of (\d+)$/,'បង្ហាញ $1 នៃ $2'],[/^Stock: (.+)$/,'ស្តុក៖ $1'],[/^Not enough stock for (.+)$/,'ស្តុក $1 មិនគ្រប់គ្រាន់'],[/^Paid (.+) by (Cash|Bank)$/,(m,a,b)=>`បានបង់ ${a} តាម${L[b]}`]];
function T(s){if(lang!='km'||typeof s!='string')return s;const k=s.trim();if(!k)return s;if(L[k])return s.replace(k,L[k]);for(const[r,v]of RX)if(r.test(k))return s.replace(k,k.replace(r,v));const m=/^([^A-Za-z]*)([\s\S]*)$/.exec(k);return m&&m[2]&&L[m[2]]?s.replace(k,m[1]+L[m[2]]):s}
Object.assign(L,{'Analytics Dashboard':'ផ្ទាំងវិភាគ','Comprehensive overview of your clinic’s performance.':'ទិដ្ឋភាពទូទៅអំពីដំណើរការរបស់គ្លីនិក។','Data Filters':'តម្រងទិន្នន័យ','Start Date':'កាលបរិច្ឆេទចាប់ផ្តើម','End Date':'កាលបរិច្ឆេទបញ្ចប់','View By':'មើលតាម','Daily':'ប្រចាំថ្ងៃ','Monthly':'ប្រចាំខែ','Yearly':'ប្រចាំឆ្នាំ','Clear Filters':'សម្អាតតម្រង','Income vs. Expenses':'ចំណូលធៀបនឹងចំណាយ','Income':'ចំណូល','Expense':'ចំណាយ','Profit':'ប្រាក់ចំណេញ','Top Selling Medicines':'ឱសថលក់ដាច់ជាងគេ','Top Selling Services':'សេវាកម្មលក់ដាច់ជាងគេ','No financial activity found for this date range.':'មិនមានសកម្មភាពហិរញ្ញវត្ថុក្នុងចន្លោះកាលបរិច្ឆេទនេះទេ។','No medicine sales found for this date range.':'មិនមានការលក់ឱសថក្នុងចន្លោះកាលបរិច្ឆេទនេះទេ។','No non-cancelled services found for this date range.':'មិនមានសេវាកម្មក្នុងចន្លោះកាលបរិច្ឆេទនេះទេ។'});
function tr(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&!n.parentElement.closest('[translate=no],script,style')?1:3}),ns=[];while(w.nextNode())ns.push(w.currentNode);
for(const n of ns){if(n._e===undefined||n.nodeValue!==n._t)n._e=n.nodeValue;const v=T(n._e);n._t=v;if(n.nodeValue!==v)n.nodeValue=v}
root.querySelectorAll('[placeholder],[title]').forEach(e=>{for(const a of['placeholder','title']){if(!e.hasAttribute(a))continue;if(e['_'+a]===undefined||e.getAttribute(a)!==e['_'+a+'t'])e['_'+a]=e.getAttribute(a);const v=T(e['_'+a]);e['_'+a+'t']=v;e.setAttribute(a,v)}})}
function setLang(l){lang=l;try{localStorage.setItem('kl',l)}catch(e){}document.documentElement.lang=l;if(tok)render();tr(document.body)}
let _q=0;new MutationObserver(()=>{if(lang=='km'&&!_q){_q=1;requestAnimationFrame(()=>{_q=0;tr(document.body)})}}).observe(document.body,{childList:true,subtree:true});
/*END*/
document.documentElement.lang=lang;tr(document.body);
(async()=>{try{const st=await fetch(API_BASE+'/api/auth/status').then(r=>r.json());needSetup=st.needsSetup;if(needSetup)$('#ln').textContent='First run: choose the admin email and a password (8+ characters).';if(tok&&!needSetup){
  await load();
  restorePageState();
  if(doctorProfileId!=null&&!D.dr.some(doctor=>doctor.id==doctorProfileId))doctorProfileId=null;
  if(medicineViewId!=null&&!D.med.some(medicine=>String(medicine.id)==medicineViewId))medicineViewId=null;
  $('#lg').style.display='none';
  if(rt=='pd'&&typeof restorePatientPage=='function')await restorePatientPage();
  else render();
}else{$('#lg').hidden=false;$('#lg').style.display='grid'}}catch(e){if(tok){$('#lg').style.display='none';render();toast(e.message)}else{$('#lg').hidden=false;$('#lg').style.display='grid'}}finally{$('#startup-loading').hidden=true}})();
