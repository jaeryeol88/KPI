/* Read-only supplemental KPI views, shared by all public viewers. */
export function installViewerExtras({assignedBranch,getAllEvents,getYears,getTarget,countSeats,normalizeDivision,loadOrganization}) {
 const el=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>Number(x||0).toLocaleString('ko-KR');
 const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
 const divisions=['1본부','2본부','3본부','지사장','기타'];
 const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'};
 let active='dashboard',year=new Date().getFullYear(),pyear=year,pmonth=0,pbranch='all',pdivision='all',orgNodes=[],orgLoaded=false,orgMessage='';
 const css=`
 .v-nav{display:flex;flex-direction:column;gap:4px}
 .v-nav button{border:0;border-radius:8px;background:transparent;color:#d1dff2;text-align:left;font:inherit;font-size:13px;padding:10px 12px;cursor:pointer}
 .v-nav button:hover{background:#193860}.v-nav button.active{background:#235aa5;color:#fff;font-weight:800}
 .v-nav .v-parent{font-size:13px;font-weight:800;color:#e8f1ff;padding:11px 12px 4px}
 .v-nav .v-child{padding-left:25px;font-size:12px}
 .v-extra[hidden],.v-original[hidden]{display:none!important}
 .v-extra{margin-top:20px}
 .v-extra-head{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
 .v-extra-head h2{margin:0 0 6px;font-size:23px;color:#183758}
 .v-extra-head p{margin:0;color:#728198;font-size:12px}
 .v-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 .v-filters label{font-size:12px;font-weight:750;color:#49627d}
 .v-filters select{padding:9px;border:1px solid #cad8ea;border-radius:8px;background:white;color:#172840}
 .v-months{display:flex;gap:5px;flex-wrap:wrap;margin:14px 0}
 .v-months button{padding:8px 11px;border:1px solid #d3dfed;border-radius:7px;background:#fff;font-size:12px;color:#4e678a;cursor:pointer}
 .v-months button.active{background:#1656ba;border-color:#1656ba;color:white;font-weight:800}
 .v-table-scroll{overflow-x:auto;border:1px solid #dce6f1;border-radius:12px;background:#fff}
 .v-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}
 .v-table th,.v-table td{padding:11px 6px;border-right:1px solid #e8edf5;border-bottom:1px solid #e8edf5;text-align:center!important;vertical-align:middle}
 .v-table th{background:#eaf0fa;font-weight:800;color:#294364}
 .v-table td{color:#254260}.v-table .v-branch{background:#f0f5fd;font-weight:800}
 .v-table .v-total{background:#e4edfd;font-weight:800}
 .v-table .v-number{font-weight:800;color:#245bbb}
 .v-table small{font-size:10px;color:#6c809a;font-weight:500;display:block;margin-top:4px}
 .v-note{font-size:12px;line-height:1.7;color:#71819a;margin:11px 1px}
 .v-org-scroll{background:#fbfcff;border:1px solid #dce6f1;border-radius:12px;overflow-x:auto;padding:22px 15px}
 .v-org-canvas{width:max-content;min-width:100%;display:flex;flex-direction:column;align-items:center;gap:32px}
 .v-org-root{display:flex;flex-direction:column;align-items:center;gap:24px}
 .v-org-groups{display:flex;gap:20px;justify-content:center;align-items:flex-start}
 .v-org-group{min-width:230px;display:flex;flex-direction:column;align-items:center;gap:20px}
 .v-org-divisions{display:flex;gap:9px;align-items:flex-start}
 .v-org-division{width:110px;display:flex;flex-direction:column;gap:7px}
 .v-org-members{display:flex;flex-direction:column;gap:7px}
 .v-org-card{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:100px;min-height:55px;gap:5px;border:1px solid #d5dfef;border-radius:10px;box-shadow:0 2px 6px #17293a0c;padding:11px 8px;text-align:center;background:#fff;white-space:normal}
 .v-org-card strong{font-size:13px;line-height:1.4;overflow-wrap:anywhere}.v-org-card small{font-size:13px;font-weight:650;line-height:1.4;overflow-wrap:anywhere}
 .v-org-card.root{min-width:270px;min-height:80px}.v-org-card.root strong{font-size:19px}
 .v-org-card.group{min-width:210px;min-height:66px}.v-org-card.group strong{font-size:15px}
 .v-headcount{margin-top:19px;padding:18px;background:#fff;border:1px solid #dce6f1;border-radius:12px}
 .v-headcount h3{margin:0 0 13px;font-size:17px}
 .v-headcount-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}
 .v-hc{padding:15px 8px;text-align:center;border-radius:10px;background:#f0f5fc}
 .v-hc:last-child{background:#e1ecff}
 .v-hc span{font-size:12px;color:#536e8a;display:block}.v-hc strong{display:block;font-size:26px;color:#225bbc;margin-top:5px}
 @media(max-width:1050px){.v-nav{flex-direction:row;flex-wrap:wrap}.v-headcount-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:650px){.v-headcount-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v-hc:last-child{grid-column:1/-1}}
 `;
 const stylesheet=document.createElement('style');stylesheet.textContent=css;document.head.appendChild(stylesheet);
 const main=document.querySelector('main.main'),side=document.querySelector('.sidebar');
 const nav=document.createElement('nav');nav.className='v-nav';nav.setAttribute('aria-label','실적 조회 메뉴');
 nav.innerHTML='<button type="button" data-vpage="dashboard" class="active">▦ &nbsp; 실적관리</button><div class="v-parent">▤ &nbsp; 실적현황</div><button type="button" data-vpage="yearboard" class="v-child">지사별 / 본부별 실적현황</button><button type="button" data-vpage="personal" class="v-child">개인별 실적현황</button><button type="button" data-vpage="org">♧ &nbsp; 조직관리</button>';
 const oldNav=side.querySelector('.nav-item');if(oldNav)oldNav.replaceWith(nav);else side.insertBefore(nav,side.querySelector('.aside-note'));
 const originals=[...main.children].filter(n=>n.tagName!=='HEADER'&&n.id!=='status');
 originals.forEach(n=>n.classList.add('v-original'));
 const wrapper=document.createElement('div');wrapper.id='v-extra';wrapper.innerHTML=`
 <section id="v-yearboard" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>지사별 / 본부별 실적현황</h2><p>부산 1~4지사 전체 목표·실적·달성률을 월별로 확인합니다.</p></div><div class="v-filters"><label>조회 연도 <select id="v-year"></select></label></div></div>
  <div class="v-table-scroll"><table class="v-table" style="min-width:1400px"><thead id="v-year-head"></thead><tbody id="v-year-body"></tbody></table></div>
  <p class="v-note" id="v-year-note"></p>
 </section>
 <section id="v-personal" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>개인별 실적현황</h2><p>부산 1~4지사 매니저별 가입 구좌와 순위를 확인합니다.</p></div><div class="v-filters"><label>조회 연도 <select id="v-pyear"></select></label><label>지사 <select id="v-pbranch"></select></label><label>본부 <select id="v-pdivision"></select></label></div></div>
  <div id="v-months" class="v-months"></div><div class="v-table-scroll"><table class="v-table" id="v-person-table"><thead id="v-person-head"></thead><tbody id="v-person-body"></tbody></table></div>
  <p class="v-note" id="v-person-note"></p>
 </section>
 <section id="v-org" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>조직관리 <span style="font-size:12px;color:#7b8ca4">조회 전용</span></h2><p>부산권역 조직도와 직책별 인원 현황입니다.</p></div></div>
  <p class="v-note" id="v-org-note">조직도를 불러오는 중…</p>
  <div class="v-org-scroll"><div id="v-org-canvas" class="v-org-canvas"></div></div>
  <div class="v-headcount"><h3>조직 인원 현황</h3><div id="v-headcount-grid" class="v-headcount-grid"></div><p class="v-note">이름과 집계 직책이 등록된 카드만 포함합니다.</p></div>
 </section>`;
 main.appendChild(wrapper);
 const pages={yearboard:el('v-yearboard'),personal:el('v-personal'),org:el('v-org')};
 const labels={dashboard:'KPI · 실적관리',yearboard:'지사별 / 본부별 실적현황',personal:'개인별 실적현황',org:'조직관리'};
 function show(page){
  if(!['dashboard','yearboard','personal','org'].includes(page))return;
  active=page;
  originals.forEach(n=>n.hidden=page!=='dashboard');
  Object.entries(pages).forEach(([key,element])=>element.hidden=page!==key);
  nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.vpage===page)});
  document.querySelector('.top .h1').textContent=labels[page];
  document.querySelector('.top .sub').textContent=page==='dashboard'?(assignedBranch?assignedBranch+' 전용 · 로그인 없이 조회':'행사 투입 비용과 실적을 한곳에서 관리하세요.'):'부산 1~4지사 전체 · 조회 전용';
  if(page==='yearboard')renderYear();
  if(page==='personal')renderPersonal();
  if(page==='org')renderOrg();
 }
 nav.addEventListener('click',event=>{const b=event.target.closest('button[data-vpage]');if(b)show(b.dataset.vpage)});
 const selectOptions=(node,opts,value)=>{node.innerHTML=opts.map(([v,t])=>'<option value="'+safe(v)+'">'+safe(t)+'</option>').join('');node.value=String(value)};
 const years=()=>[...new Set([...getYears(),...getAllEvents().map(e=>Number(String(e.date||'').slice(0,4))),new Date().getFullYear()])].filter(y=>Number.isInteger(y)&&y>=2020&&y<=2100).sort((a,b)=>b-a);
 const actual=(branch,y,m,div='all')=>getAllEvents().reduce((sum,e)=>Number(String(e.date||'').slice(0,4))===y&&Number(String(e.date||'').slice(5,7))===m?sum+countSeats(e,[branch],div==='all'?null:[div]):sum,0);
 const months=Array.from({length:12},(_,i)=>i+1);
 function renderYear(){
  if(!years().includes(year))year=years()[0]||new Date().getFullYear();
  selectOptions(el('v-year'),years().map(y=>[y,y+'년']),year);
  el('v-year-head').innerHTML='<tr><th style="width:95px">구분</th><th style="width:130px">지사</th><th style="width:100px">본부</th><th style="width:110px">연간 합계</th>'+months.map(m=>'<th>'+m+'월</th>').join('')+'</tr>';
  const metric=(goal,done)=>'<td><span class="v-number">'+fmt(done)+'구좌</span><small>목표 '+(goal===null?'—':fmt(goal))+'구좌</small><small>달성률 '+(goal===null||!goal?'—':(done/goal*100).toFixed(1)+'%')+'</small></td>';
  let rows='',allTotal=0;
  for(const b of branches){
   const vals=months.map(m=>({goal:getTarget(b,year,m,'all'),done:actual(b,year,m)}));
   const g=vals.reduce((s,v)=>s+(v.goal||0),0),d=vals.reduce((s,v)=>s+v.done,0);allTotal+=d;
   rows+='<tr class="v-branch"><td>지사 전체</td><td>'+safe(b)+'</td><td>전체</td>'+metric(g,d)+vals.map(v=>metric(v.goal,v.done)).join('')+'</tr>';
   for(const div of divisions){
    const subv=months.map(m=>({goal:getTarget(b,year,m,div),done:actual(b,year,m,div)}));
    if(!subv.some(v=>v.goal!==null||v.done))continue;
    const sg=subv.reduce((s,v)=>s+(v.goal||0),0),sd=subv.reduce((s,v)=>s+v.done,0);
    rows+='<tr><td>본부</td><td>'+safe(b)+'</td><td>'+safe(div)+'</td>'+metric(sg,sd)+subv.map(v=>metric(v.goal,v.done)).join('')+'</tr>';
   }
  }
  el('v-year-body').innerHTML=rows||'<tr><td colspan="16">조회할 실적이 없습니다.</td></tr>';
  el('v-year-note').textContent=year+'년 · 부산 1~4지사 전체 · '+fmt(allTotal)+'구좌 · 현재 등록된 자료를 기준으로 집계합니다.';
 }
 el('v-year').addEventListener('change',e=>{year=Number(e.target.value);renderYear()});
 function renderPersonal(){
  if(!years().includes(pyear))pyear=years()[0]||new Date().getFullYear();
  selectOptions(el('v-pyear'),years().map(y=>[y,y+'년']),pyear);
  selectOptions(el('v-pbranch'),[['all','전체 지사'],...branches.map(b=>[b,b])],pbranch);
  selectOptions(el('v-pdivision'),[['all','전체 본부'],...divisions.map(d=>[d,d])],pdivision);
  el('v-months').innerHTML='<button type="button" data-month="0" class="'+(pmonth===0?'active':'')+'">전체(1~12월)</button>'+months.map(m=>'<button type="button" data-month="'+m+'" class="'+(pmonth===m?'active':'')+'">'+m+'월</button>').join('');
  const shown=pmonth===0?months:[pmonth],byKey=new Map();
  const add=(b,d,name,m,seats)=>{
   if(!branches.includes(b)||pbranch!=='all'&&pbranch!==b||pdivision!=='all'&&pdivision!==d)return;
   const key=JSON.stringify([b,d,name]);if(!byKey.has(key))byKey.set(key,{b,d,name,months:Array(12).fill(0)});
   byKey.get(key).months[m-1]+=seats;
  };
  for(const event of getAllEvents()){
   const dat=String(event.date||''),y=Number(dat.slice(0,4)),m=Number(dat.slice(5,7));
   if(y!==pyear||m<1||m>12||pmonth!==0&&pmonth!==m)continue;
   const valid=Array.isArray(event.signupEntries)?event.signupEntries.filter(row=>row&&['corporate','individual'].includes(row.group)&&Number.isSafeInteger(row.seats)&&row.seats>=0):[];
   if(valid.length){
    for(const r of valid)add(r.branch||event.branch,normalizeDivision(r.division||event.division),String(r.manager||'').trim()||'담당자 미지정',m,r.seats);
   }else{
    const seats=Number(event.done);if(Number.isSafeInteger(seats)&&seats>0)add(event.branch,normalizeDivision(event.division),'담당자 미지정',m,seats);
   }
  }
  const rows=[...byKey.values()].map(x=>({...x,total:shown.reduce((sum,m)=>sum+x.months[m-1],0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total||a.b.localeCompare(b.b,'ko')||a.d.localeCompare(b.d,'ko')||a.name.localeCompare(b.name,'ko'));
  const t=Array(12).fill(0);for(const row of rows)row.months.forEach((v,i)=>t[i]+=v);
  const full=pmonth===0;
  el('v-person-table').style.minWidth=full?'1350px':'540px';
  el('v-person-head').innerHTML='<tr><th>No.</th><th>소속 지사</th><th>본부</th><th>성명</th>'+shown.map(m=>'<th>'+m+'월</th>').join('')+(full?'<th>연간 합계</th>':'')+'</tr>';
  let body=rows.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+safe(x.b)+'</td><td>'+safe(x.d||'본부 미지정')+'</td><td style="font-weight:750">'+safe(x.name)+'</td>'+shown.map(m=>'<td class="v-number">'+fmt(x.months[m-1])+'구좌</td>').join('')+(full?'<td class="v-number">'+fmt(x.total)+'구좌</td>':'')+'</tr>').join('');
  const total=shown.reduce((sum,m)=>sum+t[m-1],0);
  if(rows.length)body+='<tr class="v-total"><td colspan="4">합계</td>'+shown.map(m=>'<td>'+fmt(t[m-1])+'구좌</td>').join('')+(full?'<td>'+fmt(total)+'구좌</td>':'')+'</tr>';
  else body='<tr><td colspan="'+(shown.length+4+(full?1:0))+'">선택한 기간의 등록된 가입 실적이 없습니다.</td></tr>';
  el('v-person-body').innerHTML=body;
  el('v-person-note').textContent=pyear+'년 '+(full?'전체(1~12월)':pmonth+'월')+' · 부산 1~4지사 · '+rows.length+'명/소속 · '+fmt(total)+'구좌 · 동일 성명이라도 지사 또는 본부가 다르면 별도 집계합니다.';
 }
 el('v-pyear').addEventListener('change',e=>{pyear=Number(e.target.value);renderPersonal()});
 el('v-pbranch').addEventListener('change',e=>{pbranch=e.target.value;renderPersonal()});
 el('v-pdivision').addEventListener('change',e=>{pdivision=e.target.value;renderPersonal()});
 el('v-months').addEventListener('click',e=>{const b=e.target.closest('[data-month]');if(b){pmonth=Number(b.dataset.month);renderPersonal()}});
 const children=id=>orgNodes.filter(n=>n.parent===id).sort((a,b)=>(a.order||0)-(b.order||0));
 const effectiveRole=n=>{
  if(Object.prototype.hasOwnProperty.call(n,'headcountRole'))return roles[n.headcountRole]?n.headcountRole:'';
  if(n.type!=='person')return '';
  const v=String(n.subtitle||'').replace(/\s+/g,'');
  return Object.keys(roles).find(k=>v.includes(roles[k]))||'';
 };
 const join=n=>{
  const v=String(n.joinDate||'');if(/^[0-9]{2}[.](0[1-9]|1[0-2])$/.test(v))return v;
  const match=v.match(/^([0-9]{4})-(0[1-9]|1[0-2])(?:-[0-9]{2})?$/);return match?match[1].slice(-2)+'.'+match[2]:'';
 };
 const palette={
  default:['#fff','#172840','#dce5f3'],white:['#fff','#172840','#d4dfec'],navy:['#111d36','#fff','#263859'],blue:['#2457c6','#fff','#2457c6'],
  mint:['#e9fbf4','#084d40','#73dfb5'],sky:['#e0f2fe','#075985','#7dd3fc'],teal:['#ccfbf1','#115e59','#5eead4'],
  green:['#dcfce7','#166534','#86efac'],purple:['#6d28d9','#fff','#7c3aed'],lavender:['#ede9fe','#5b21b6','#c4b5fd'],
  pink:['#fce7f3','#9d174d','#f9a8d4'],coral:['#ffe4e6','#9f1239','#fda4af'],orange:['#ffedd5','#9a3412','#fdba74'],
  yellow:['#fef9c3','#854d0e','#fde047'],gray:['#e5e7eb','#374151','#cbd5e1']
 };
 function card(n){
  let colors=palette[n.color]||palette.default;
  if(!n.color||n.color==='default'){if(n.type==='root'||n.type==='division')colors=palette.blue;else if(n.type==='group')colors=palette.navy}
  const role=roles[effectiveRole(n)]||'',subtitle=String(n.subtitle||'').trim();
  const sub=subtitle&&subtitle.replace(/\s+/g,'')!==role?'<small>'+safe(subtitle)+'</small>':'';
  const date=join(n);
  return '<div class="v-org-card '+safe(n.type||'')+'" style="background:'+colors[0]+';color:'+colors[1]+';border-color:'+colors[2]+'"><strong>'+safe(n.label||'이름 미입력')+'</strong>'+(role?'<small>'+safe(role)+'</small>':'')+sub+(date?'<small>입사 '+safe(date)+'</small>':'')+'</div>';
 }
 function renderOrg(){
  if(!orgLoaded){el('v-org-note').textContent='조직도 데이터를 불러오는 중…';return;}
  el('v-org-note').textContent=orgMessage||'부산권역 전체 조직도 · 읽기 전용';
  const person=n=>card(n);
  const division=n=>'<div class="v-org-division">'+card(n)+'<div class="v-org-members">'+children(n.id).map(person).join('')+'</div></div>';
  const group=n=>'<div class="v-org-group">'+card(n)+'<div class="v-org-divisions">'+children(n.id).map(division).join('')+'</div></div>';
  const root=n=>'<div class="v-org-root">'+card(n)+'<div class="v-org-groups">'+children(n.id).map(group).join('')+'</div></div>';
  el('v-org-canvas').innerHTML=children(null).map(root).join('')||'<p class="v-note">등록된 조직도가 없습니다.</p>';
  const counts={regional:0,branch:0,division:0,manager:0};
  for(const n of orgNodes){
   const name=String(n.label||'').trim();
   if(!name||['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀'].includes(name))continue;
   if(n.type!=='person'&&!Object.prototype.hasOwnProperty.call(n,'headcountRole'))continue;
   const r=effectiveRole(n);if(Object.prototype.hasOwnProperty.call(counts,r))counts[r]++;
  }
  const total=Object.values(counts).reduce((sum,v)=>sum+v,0);
  el('v-headcount-grid').innerHTML=[...Object.entries(counts).map(([r,n])=>[roles[r],n]),['총인원',total]].map(([label,n])=>'<div class="v-hc"><span>'+label+'</span><strong>'+fmt(n)+'명</strong></div>').join('');
 }
 async function refreshOrganization(){
  try{const rows=await loadOrganization();orgNodes=Array.isArray(rows)?rows:[];orgMessage='부산권역 전체 조직도 · 읽기 전용';}
  catch(error){orgNodes=[];orgMessage='조직도를 표시할 수 없습니다. 관리자에게 공개 조회 설정 확인을 요청하세요. ('+(error.message||'오류')+')';}
  orgLoaded=true;if(active==='org')renderOrg();
 }
 function refresh(){if(active==='yearboard')renderYear();if(active==='personal')renderPersonal();}
 return {refresh,refreshOrganization};
}
