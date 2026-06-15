/* ============================================================================
 * app.js — planner UI: state, persistence, rendering, and bootstrap.
 * Imports the pure engine/event/tax modules. Loaded by planner.html as
 *   <script type="module" src="js/app.js">
 * ========================================================================== */
import { simulate } from "./engine.js";
import { EV, describe } from "./events.js";
import { fmt, fmtS, fmtPct } from "./tax.js";

const $ = id => document.getElementById(id);
const NOW = new Date().getFullYear();

/* ══════════════════ EVENT SCHEMA ══════════════════
 * Each type: icon, label, recurring flag, and editable fields.            */


/* ══════════════════ STATE ══════════════════ */
let S, active='A', scrubAge, editing=null;

function demoState(){
  return {
    global:{
      age:48, status:'single', horizon:95,
      taxable:300000, taxableBasis:150000, trad:600000, roth:150000, cash:60000, hsa:20000,
      home:{value:0, balance:0, rate:6.5, term:25, propTaxPct:1.1, insure:3000, maint:6000},
      rentals:[],
      wages:180000, ss:40000, ssAge:67, spending:90000,
      gr:{taxable:6, trad:6, roth:6, cash:3, re:4, infl:3}
    },
    library:[],
    scenarios:[
      {id:'demoA', name:'Work to 65', events:[
        {id:id(), type:'retire', age:65, p:{}, on:true},
        {id:id(), type:'withdraw', age:65, p:{account:'trad', amount:140000}, on:true},
      ]},
      {id:'demoB', name:'Retire at 58', events:[
        {id:id(), type:'retire', age:58, p:{}, on:true},
        {id:id(), type:'withdraw', age:58, p:{account:'taxable', amount:50000}, on:true},
        {id:id(), type:'withdraw', age:60, p:{account:'trad', amount:60000}, on:true},
      ]},
    ],
    compare:['demoA','demoB'], active:'demoA',
  };
}
function id(){ return 'e'+Math.random().toString(36).slice(2,9); }
function sid(){ return 's'+Math.random().toString(36).slice(2,8); }
function SC(scid){ return S.scenarios.find(s=>s.id===scid); }
function AC(){ return SC(active) || S.scenarios[0]; }

function load(){
  try{ S = JSON.parse(localStorage.getItem('caTaxPlanner')); }catch(e){ S=null; }
  if(!S || !S.global) S = demoState();
  // migrate legacy {A,B} layout → scenarios array
  if(S.A && !S.scenarios){
    const a={id:sid(),name:S.A.name,events:S.A.events||[]};
    const b={id:sid(),name:S.B.name,events:S.B.events||[]};
    S.scenarios=[a,b]; S.compare=[a.id,b.id]; S.active=a.id; delete S.A; delete S.B;
  }
  if(!S.scenarios || !S.scenarios.length) S.scenarios=[{id:sid(),name:'Scenario 1',events:[]}];
  if(!S.global.rentals) S.global.rentals=[];
  if(!S.library) S.library=[];
  if(!S.compare || !S.compare.length) S.compare=[S.scenarios[0].id, (S.scenarios[1]||S.scenarios[0]).id];
  if(!S.active || !SC(S.active)) S.active=S.scenarios[0].id;
  active=S.active;
  scrubAge = Math.min(S.global.horizon, S.global.age + 15);
}
function save(){ S.active=active; localStorage.setItem('caTaxPlanner', JSON.stringify(S)); }
function resetDemo(){ if(confirm('Reset everything to the demo scenarios?')){ S=demoState(); active=S.active; scrubAge=S.global.age+15; pushGlobalToInputs(); render(); save(); } }

/* ══════════════════ SIMULATION ENGINE ══════════════════ */







/* ══════════════════ RENDERING ══════════════════ */
let simA, simB;
function render(){
  pullGlobalFromInputs();
  const [lid,rid]=S.compare;
  simA = simulate(S, lid, NOW); simB = simulate(S, rid, NOW);
  $('leg_A').textContent = SC(lid)?SC(lid).name:'—';
  $('leg_B').textContent = SC(rid)?SC(rid).name:'—';
  $('addingTo').textContent = AC().name;
  $('evScenName').textContent = AC().name;
  renderScenBar(); renderCompare(); renderPalette(); renderTimeline(); renderEvList(); renderLibrary(); renderChart(); renderState();
  save();
}

function renderPalette(){
  const pal=$('palette'); pal.innerHTML='';
  for(const t in EV){
    const b=document.createElement('span'); b.className='ptag';
    b.innerHTML='＋ '+EV[t].icon+' '+EV[t].label;
    b.onclick=()=>openModal(t,null);
    pal.appendChild(b);
  }
}

function ageToPct(a){ const g=S.global; return (a-g.age)/(g.horizon-g.age)*100; }
function pctToAge(pct){ const g=S.global; return Math.round(g.age + pct/100*(g.horizon-g.age)); }

function renderTimeline(){
  const tl=$('timeline'); tl.innerHTML='';
  const g=S.global;
  // axis labels every ~10 yrs
  for(let a=g.age; a<=g.horizon; a+=Math.ceil((g.horizon-g.age)/8/5)*5||5){
    const lab=document.createElement('div'); lab.className='axislabel'; lab.style.left=ageToPct(a)+'%';
    lab.textContent=a; tl.appendChild(lab);
  }
  // chips for active scenario, stacked into 2 rows to reduce overlap
  const MON=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const evs=AC().events.slice().sort((a,b)=>(a.age+((a.month||1)-1)/12)-(b.age+((b.month||1)-1)/12));
  evs.forEach((ev,i)=>{
    const c=document.createElement('div'); c.className='chip'+(ev.on?'':' disabled');
    c.style.left=ageToPct(ev.age+((ev.month||1)-1)/12)+'%'; c.style.top=(i%2===0?6:34)+'px';
    c.innerHTML=EV[ev.type].icon+'<span>'+ev.age+'</span>';
    c.title=EV[ev.type].label+' @ age '+ev.age+', '+MON[ev.month||1];
    c.onclick=(e)=>{ if(!c.dataset.dragged) openModal(ev.type, ev.id); };
    makeDraggable(c, ev);
    tl.appendChild(c);
  });
  // scrubber
  const sc=document.createElement('div'); sc.className='scrubline'; sc.style.left=ageToPct(scrubAge)+'%';
  const bd=document.createElement('div'); bd.className='scrubbadge'; bd.textContent='Age '+scrubAge; sc.appendChild(bd);
  makeScrubDraggable(sc); tl.appendChild(sc);
}

function makeDraggable(chip, ev){
  let startX, startAge;
  chip.addEventListener('pointerdown', e=>{
    e.preventDefault(); chip.setPointerCapture(e.pointerId);
    startX=e.clientX; startAge=ev.age; chip.dataset.dragged='';
    const rect=$('timeline').getBoundingClientRect();
    const move= me=>{
      const pct=(me.clientX-rect.left)/rect.width*100;
      const a=Math.max(S.global.age, Math.min(S.global.horizon, pctToAge(pct)));
      if(Math.abs(me.clientX-startX)>3) chip.dataset.dragged='1';
      ev.age=a; chip.style.left=ageToPct(a)+'%'; chip.querySelector('span').textContent=a;
    };
    const up=()=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up);
      render(); setTimeout(()=>{delete chip.dataset.dragged;},50); };
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up);
  });
}
function makeScrubDraggable(sc){
  sc.addEventListener('pointerdown', e=>{
    e.preventDefault(); sc.setPointerCapture(e.pointerId);
    const rect=$('timeline').getBoundingClientRect();
    const move=me=>{ const pct=(me.clientX-rect.left)/rect.width*100;
      scrubAge=Math.max(S.global.age,Math.min(S.global.horizon,pctToAge(pct)));
      sc.style.left=ageToPct(scrubAge)+'%'; sc.querySelector('.scrubbadge').textContent='Age '+scrubAge; renderChart(); renderState(); };
    const up=()=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); };
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up);
  });
}

function renderEvList(){
  const box=$('evlist'); box.innerHTML='';
  const MON=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const evs=AC().events.slice().sort((a,b)=>(a.age+((a.month||1)-1)/12)-(b.age+((b.month||1)-1)/12));
  if(!evs.length){ box.innerHTML='<p class="note">No events yet — click a button above to add one.</p>'; return; }
  evs.forEach(ev=>{
    const row=document.createElement('div'); row.className='evrow'+(ev.on?'':' off');
    const desc=describe(ev);
    row.innerHTML=`<span class="age">${MON[ev.month||1]} · ${ev.age}</span><span class="lbl">${EV[ev.type].icon} ${desc}</span>`;
    const tog=document.createElement('span'); tog.className='x'; tog.textContent=ev.on?'👁':'🚫'; tog.title='show/hide in projection';
    tog.onclick=()=>{ ev.on=!ev.on; render(); };
    const dup=document.createElement('span'); dup.className='x'; dup.textContent='⧉'; dup.title='duplicate';
    dup.onclick=()=>{ AC().events.push({...JSON.parse(JSON.stringify(ev)), id:id(), age:ev.age+1}); render(); };
    const star=document.createElement('span'); star.className='x'; star.textContent='★'; star.title='save as reusable template';
    star.onclick=()=>saveAsTemplate(ev);
    const edit=document.createElement('span'); edit.className='x'; edit.textContent='✏️'; edit.title='edit';
    edit.onclick=()=>openModal(ev.type,ev.id);
    const x=document.createElement('span'); x.className='x'; x.textContent='✕'; x.title='delete';
    x.onclick=()=>{ AC().events=AC().events.filter(e=>e.id!==ev.id); render(); };
    row.appendChild(tog); row.appendChild(dup); row.appendChild(star); row.appendChild(edit); row.appendChild(x);
    box.appendChild(row);
  });
}


/* ── CHART ── */
function renderChart(){
  const svg=$('chart'); const W=1000,H=300,padL=8,padR=8,padT=14,padB=22;
  const g=S.global; const a0=g.age, a1=g.horizon;
  let max=0,min=0;
  for(let a=a0;a<=a1;a++){ if(simA[a]) {max=Math.max(max,simA[a].netWorth); min=Math.min(min,simA[a].netWorth);} if(simB[a]){max=Math.max(max,simB[a].netWorth); min=Math.min(min,simB[a].netWorth);} }
  max=max*1.08||100000; if(min>0)min=0; min=min*1.08;
  const x=a=>padL+(a-a0)/(a1-a0)*(W-padL-padR);
  const y=v=>padT+(1-(v-min)/(max-min))*(H-padT-padB);
  const line=(sim,col)=>{
    let d='';
    for(let a=a0;a<=a1;a++){ if(!sim[a])continue; d+=(d?'L':'M')+x(a).toFixed(1)+' '+y(sim[a].netWorth).toFixed(1)+' '; }
    return `<polyline points="${d.replace(/[ML]/g,'')}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
  };
  // gridlines + y labels
  let grid='';
  for(let i=0;i<=4;i++){ const v=min+(max-min)*i/4; const yy=y(v).toFixed(1);
    grid+=`<line x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}" stroke="#eef0f4"/>`;
    grid+=`<text x="${padL+2}" y="${yy-3}" font-size="10" fill="#aaa">${fmt(v)}</text>`; }
  // zero line
  if(min<0) grid+=`<line x1="${padL}" y1="${y(0)}" x2="${W-padR}" y2="${y(0)}" stroke="#cbd5e1" stroke-dasharray="3 3"/>`;
  // x labels
  let xl=''; const step=Math.max(5,Math.ceil((a1-a0)/8/5)*5);
  for(let a=a0;a<=a1;a+=step){ xl+=`<text x="${x(a)}" y="${H-6}" font-size="10" fill="#999" text-anchor="middle">${a} · '${String(NOW+(a-a0)).slice(2)}</text>`; }
  // shortfall dots
  const dots=sim=>{ let s=''; for(let a=a0;a<=a1;a++){ if(sim[a]&&sim[a].shortfall) s+=`<circle cx="${x(a)}" cy="${y(sim[a].netWorth)}" r="3.5" fill="#dc2626"/>`; } return s; };
  // scrubber
  const sx=x(scrubAge).toFixed(1);
  const scrub=`<line x1="${sx}" y1="${padT}" x2="${sx}" y2="${H-padB}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  svg.innerHTML=grid+xl+line(simB,'#ea7317')+line(simA,'#4f46e5')+dots(simB)+dots(simA)+scrub;
  svg.onclick=e=>{ const r=svg.getBoundingClientRect(); const px=(e.clientX-r.left)/r.width*W;
    const a=Math.round(a0+(px-padL)/(W-padL-padR)*(a1-a0)); scrubAge=Math.max(a0,Math.min(a1,a)); renderChart(); renderTimeline(); renderState(); };
}

/* ── STATE PANEL ── */
function renderState(){
  $('scrubAgeLabel').textContent=scrubAge;
  $('scrubYearLabel').textContent=NOW+(scrubAge-S.global.age);
  const cols=$('statecols'); cols.innerHTML='';
  cols.appendChild(stateBox(S.compare[0],'A',simA[scrubAge]));
  cols.appendChild(stateBox(S.compare[1],'B',simB[scrubAge]));
}
function stateBox(scid,slot,row){
  const name = SC(scid)?SC(scid).name:'—';
  const div=document.createElement('div'); div.className='statebox '+slot;
  if(!row){ div.innerHTML=`<h3>${name}</h3><p class="note">No data.</p>`; return div; }
  const inc=row.income;
  const incRows=[
    ['Wages',inc.wages],['Pension',inc.pension],['Social Security',inc.ss],
    ['401k/IRA withdrawals',inc.wdTrad],['RMD (forced)',inc.rmd],['Roth withdrawals',inc.wdRoth],
    ['Brokerage sales',inc.wdTaxable],['Roth conversion',inc.convert],['Net rental income',inc.rental],
  ].filter(r=>Math.abs(r[1])>0.5).map(r=>`<div class="srow"><span>${r[0]}</span><span class="${r[1]<0?'neg':''}">${fmtS(r[1])}</span></div>`).join('');
  const cf=row.cashFlow;
  div.innerHTML=`
    <h3>${name}</h3>
    <div class="nw">${fmtS(row.netWorth)} <span style="font-size:.7rem;font-weight:600;color:#888">net worth</span></div>
    <div class="sec">Balances</div>
    <div class="srow"><span>Cash</span><span class="${row.bal.cash<0?'neg':''}">${fmtS(row.bal.cash)}</span></div>
    <div class="srow"><span>Taxable brokerage</span><span>${fmt(row.bal.taxable)}</span></div>
    <div class="srow"><span>Traditional 401k/IRA</span><span>${fmt(row.bal.trad)}</span></div>
    <div class="srow"><span>Roth</span><span>${fmt(row.bal.roth)}</span></div>
    <div class="srow"><span>HSA</span><span>${fmt(row.bal.hsa)}</span></div>
    ${row.homeEquity>0?`<div class="srow"><span>Home equity</span><span>${fmt(row.homeEquity)}</span></div>`:''}
    ${row.rentalEquity>0?`<div class="srow"><span>Rental property equity</span><span>${fmt(row.rentalEquity)}</span></div>`:''}
    ${row.marginDebt>0?`<div class="srow"><span>Margin loan (−, ${fmtS(-row.marginInterest)} int. deducted)</span><span class="neg">${fmtS(-row.marginDebt)}</span></div>`:''}
    <div class="sec">This year's cash flow</div>
    ${incRows||'<div class="srow"><span>No taxable income</span><span>—</span></div>'}
    <div class="srow"><span>Federal tax</span><span class="neg">${fmtS(-row.fedTax)}</span></div>
    <div class="srow"><span>CA tax</span><span class="neg">${row.stateTaxOn?fmtS(-row.caTax):'$0 (out of CA)'}</span></div>
    <div class="srow"><span>Living + housing + other</span><span class="neg">${fmtS(-row.expenses)}</span></div>
    <div class="srow tot"><span>Net cash flow</span><span class="${cf<0?'neg':'pos'}">${fmtS(cf)}</span></div>
    ${row.shortfall
      ? `<div class="err">🔴 Shortfall — cash is ${fmtS(row.bal.cash)}. Add a "sell brokerage" or "withdraw" event to cover it.</div>`
      : `<div class="ok">✅ Funded — positive cash through this year.</div>`}
  `;
  return div;
}

/* ══════════════════ MODAL ══════════════════ */
function openModal(type, evId, prefill){
  editing={type, evId};
  const def=EV[type];
  $('modalTitle').textContent=(evId?'Edit: ':'Add: ')+def.icon+' '+def.label;
  $('modalDelete').style.display=evId?'':'none';
  const ev=evId? AC().events.find(e=>e.id===evId):null;
  const p=ev?ev.p:(prefill?prefill.p:{});
  const startAge=ev?ev.age:(prefill&&prefill.age?prefill.age:scrubAge);
  const startMonth=ev?(ev.month||1):(prefill&&prefill.month?prefill.month:1);
  let html=`<div class="ir"><label>At age</label><input type="number" id="m_age" value="${startAge}" min="${S.global.age}" max="${S.global.horizon}"></div>`;
  html+=`<div class="ir"><label>Month</label><select id="m_month">`+
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      .map((mn,idx)=>`<option value="${idx+1}" ${startMonth===idx+1?'selected':''}>${mn}</option>`).join('')+`</select></div>`;
  for(const f of def.fields){
    const [key,label,dflt]=f;
    if(label.includes('|')){
      const [lbl,opts]=label.split('|');
      html+=`<div class="ir"><label>${lbl}</label><select id="m_${key}">`+
        opts.split(',').map(o=>`<option value="${o}" ${p[key]===o?'selected':''}>${o}</option>`).join('')+`</select></div>`;
    } else {
      html+=`<div class="ir"><label>${label}</label><input type="number" id="m_${key}" value="${p[key]!==undefined?p[key]:dflt}"></div>`;
    }
  }
  $('modalFields').innerHTML=html;
  $('modalBg').classList.add('show');
}
function closeModal(){ $('modalBg').classList.remove('show'); editing=null; }
function saveEvent(){
  const {type,evId}=editing; const def=EV[type];
  const age=+$('m_age').value;
  const month=+$('m_month').value||1;
  const p={};
  for(const f of def.fields){ const key=f[0]; const elx=$('m_'+key); p[key]= elx.tagName==='SELECT'?elx.value:(+elx.value||0); }
  if(evId){ const ev=AC().events.find(e=>e.id===evId); ev.age=age; ev.month=month; ev.p=p; }
  else AC().events.push({id:id(), type, age, month, p, on:true});
  closeModal(); render();
}
function deleteEvent(){ if(editing.evId){ AC().events=AC().events.filter(e=>e.id!==editing.evId); } closeModal(); render(); }

/* ══════════════════ SCENARIO (TIMELINE) CONTROLS ══════════════════ */
function setActive(scid){ active=scid;
  // make sure what you're editing is visible on the chart
  if(!S.compare.includes(scid)) S.compare[0]=scid;
  render();
}
function newScenario(){ const n=prompt('Name the new timeline:', 'Timeline '+(S.scenarios.length+1));
  if(n===null) return; const s={id:sid(), name:n||('Timeline '+(S.scenarios.length+1)), events:[]};
  S.scenarios.push(s); active=s.id; if(!S.compare[1]) S.compare[1]=s.id; render();
}
function dupScenario(){ const src=AC(); const s={id:sid(), name:src.name+' (copy)',
  events:JSON.parse(JSON.stringify(src.events)).map(e=>({...e,id:id()}))};
  S.scenarios.push(s); active=s.id; render();
}
function renameScenario(){ const n=prompt('Rename timeline:', AC().name); if(n){ AC().name=n; render(); } }
function delScenario(){ if(S.scenarios.length<=1){ alert('Keep at least one timeline.'); return; }
  if(!confirm('Delete timeline "'+AC().name+'"?')) return;
  const delId=active; S.scenarios=S.scenarios.filter(s=>s.id!==delId);
  active=S.scenarios[0].id;
  S.compare=S.compare.map(c=>c===delId?S.scenarios[0].id:c);
  render();
}
function setCompare(slot,scid){ S.compare[slot]=scid; render(); }

function renderScenBar(){
  const bar=$('scenBar'); bar.innerHTML='';
  S.scenarios.forEach(s=>{
    const t=document.createElement('div'); t.className='scentab'+(s.id===active?' active':'');
    let tag=''; if(S.compare[0]===s.id) tag=' <span class="cmptag" style="background:#4f46e5">L</span>';
    else if(S.compare[1]===s.id) tag=' <span class="cmptag" style="background:#ea7317">R</span>';
    t.innerHTML=s.name+tag+' <span style="opacity:.5;font-weight:400">· '+s.events.length+'</span>';
    t.onclick=()=>setActive(s.id);
    bar.appendChild(t);
  });
}
function renderCompare(){
  const mk=(selId,slot)=>{ const sel=$(selId); sel.innerHTML='';
    S.scenarios.forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=s.name;
      if(S.compare[slot]===s.id) o.selected=true; sel.appendChild(o); }); };
  mk('cmpL',0); mk('cmpR',1);
}

/* ══════════════════ REUSABLE EVENT LIBRARY ══════════════════ */
function saveAsTemplate(ev){
  const nm=prompt('Save this event as a reusable template named:', describe(ev));
  if(nm===null) return;
  S.library.push({id:id(), name:nm||describe(ev), type:ev.type, p:JSON.parse(JSON.stringify(ev.p||{}))});
  render();
}
function renderLibrary(){
  const box=$('liblist'); box.innerHTML='';
  if(!S.library.length){ box.innerHTML='<p class="note">No saved templates yet. Click ★ on any event to save it here, then reuse it in any timeline.</p>'; return; }
  S.library.forEach(t=>{
    const row=document.createElement('div'); row.className='evrow';
    row.innerHTML=`<span class="lbl">${EV[t.type].icon} <b>${t.name}</b> <span style="color:#999">— ${describe({type:t.type,p:t.p,age:0})}</span></span>`;
    const add=document.createElement('button'); add.className='btn sm'; add.textContent='＋ Add to “'+AC().name+'”';
    add.onclick=()=>openModal(t.type, null, {p:JSON.parse(JSON.stringify(t.p)), age:scrubAge}); // clone w/ editable params
    const x=document.createElement('span'); x.className='x'; x.textContent='✕'; x.title='delete template';
    x.onclick=()=>{ S.library=S.library.filter(l=>l.id!==t.id); render(); };
    row.appendChild(add); row.appendChild(x);
    box.appendChild(row);
  });
}

/* ══════════════════ GLOBAL INPUTS BINDING ══════════════════ */
const GMAP=[['g_age','age'],['g_horizon','horizon'],['g_taxable','taxable'],['g_taxableBasis','taxableBasis'],
  ['g_trad','trad'],['g_roth','roth'],['g_cash','cash'],['g_hsa','hsa'],['g_wages','wages'],
  ['g_ss','ss'],['g_ssAge','ssAge'],['g_spending','spending']];
const GRMAP=[['gr_taxable','taxable'],['gr_trad','trad'],['gr_roth','roth'],['gr_cash','cash'],['gr_re','re'],['gr_infl','infl']];
const HOMEMAP=[['g_homeValue','value'],['g_homeBal','balance'],['g_homeRate','rate'],['g_homeTerm','term'],['g_homePropTax','propTaxPct'],['g_homeInsure','insure'],['g_homeMaint','maint']];
function pushGlobalToInputs(){
  GMAP.forEach(([el,k])=>$(el).value=S.global[k]);
  GRMAP.forEach(([el,k])=>$(el).value=S.global.gr[k]);
  if(!S.global.home) S.global.home={value:0,balance:0,rate:6.5,term:25,propTaxPct:1.1,insure:3000,maint:6000};
  HOMEMAP.forEach(([el,k])=>$(el).value=S.global.home[k]);
  $('g_status').value=S.global.status;
  renderRentals();
}

/* ── Rental properties (dynamic list; not rebuilt on every render, to keep input focus) ── */
function renderRentals(){
  const box=$('rentalList'); box.innerHTML='';
  if(!S.global.rentals) S.global.rentals=[];
  if(!S.global.rentals.length){ box.innerHTML='<p class="note" style="margin:2px 0 4px">No rental properties yet.</p>'; return; }
  // backfill depreciation fields for rentals saved before this feature
  S.global.rentals.forEach(r=>{ if(r.costBasis===undefined)r.costBasis=r.value; if(r.landPct===undefined)r.landPct=20; if(r.yearsOwned===undefined)r.yearsOwned=0; });
  S.global.rentals.forEach((r,i)=>{
    const d=document.createElement('div'); d.className='rentalcard';
    d.innerHTML=`<div class="rentalhdr"><span>🏘️ Rental #${i+1}</span><span class="x" onclick="removeRental(${i})" title="remove">✕</span></div>`
      + rentalField(i,'value','Value today ($)')
      + rentalField(i,'balance','Mortgage balance ($)')
      + rentalField(i,'rate','Mortgage rate (%)','0.1')
      + rentalField(i,'term','Years left on mortgage')
      + rentalField(i,'rent','Rent collected ($/mo)')
      + rentalField(i,'esc','Rent increase (%/yr)','0.1')
      + rentalField(i,'propTaxPct','Property tax (%/yr)','0.1')
      + rentalField(i,'insure','Insurance + HOA ($/yr)')
      + rentalField(i,'maint','Maintenance ($/yr)')
      + `<div class="sec" style="margin:6px 0 3px">For depreciation</div>`
      + rentalField(i,'costBasis','Original cost basis ($)')
      + rentalField(i,'landPct','Land % (not depreciable)','1')
      + rentalField(i,'yearsOwned','Years already owned');
    box.appendChild(d);
  });
}
function rentalField(i,key,label,step){
  const v=S.global.rentals[i][key];
  return `<div class="ir"><label>${label}</label><input type="number" ${step?`step="${step}"`:''} value="${v}" oninput="updateRental(${i},'${key}',this.value)"></div>`;
}
function updateRental(i,key,val){ S.global.rentals[i][key]=+val||0; render(); }   // render() does NOT rebuild rental inputs, so focus is kept
function addRental(){
  if(!S.global.rentals) S.global.rentals=[];
  S.global.rentals.push({value:700000, balance:300000, rate:5, term:25, rent:3500, esc:3, propTaxPct:1.1, insure:1500, maint:3000, costBasis:600000, landPct:20, yearsOwned:5});
  renderRentals(); render();
}
function removeRental(i){ S.global.rentals.splice(i,1); renderRentals(); render(); }
function pullGlobalFromInputs(){
  GMAP.forEach(([el,k])=>S.global[k]=+$(el).value||0);
  GRMAP.forEach(([el,k])=>S.global.gr[k]=+$(el).value||0);
  if(!S.global.home) S.global.home={};
  HOMEMAP.forEach(([el,k])=>S.global.home[k]=+$(el).value||0);
  S.global.status=$('g_status').value;
  if(scrubAge<S.global.age) scrubAge=S.global.age;
  if(scrubAge>S.global.horizon) scrubAge=S.global.horizon;
}

/* ===== INIT ===== */
if (typeof document !== "undefined") {
// Inline on* handlers in planner.html resolve against window; module-scope
// functions aren't global, so expose the ones the markup/innerHTML reference.
Object.assign(window, {
  resetDemo, newScenario, dupScenario, renameScenario, delScenario, setCompare,
  addRental, removeRental, updateRental, closeModal, saveEvent, deleteEvent,
});
load();
pushGlobalToInputs();
[...GMAP,...GRMAP,...HOMEMAP].forEach(([el])=>$(el).addEventListener('input', render));
$('g_status').addEventListener('change', render);
$('modalBg').addEventListener('click', e=>{ if(e.target===$('modalBg')) closeModal(); });
render();
}

