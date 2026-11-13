import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {startViewerGate,installViewerLogout} from './viewer_gate.js?v=pin-login-20261114';
import {renderPerformanceMatrix} from './performance_matrix.js?v=year-to-date-totals-20261113';
import {historicalActualSeats,historicValue} from './historical_seats.js?v=auto-person-rollup-20261113';
import {timedSignupRows} from './signup_date_utils.js';
import {rosterPerformancePeople} from './personal_roster.js';
import {drawOrgConnectorLines} from './org_connector_lines.js';
import {ORG_ROLE_LABELS,orgEffectiveRoleShared,countOrgHeadcount,isDualStaff} from './org_headcount.js?v=dual-visible-20261113g';

const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
const divisions=['1본부','2본부','3본부','지사장','기타'];
const monthNumbers=Array.from({length:12},(_,i)=>i+1);
const normalizeDivision=value=>{const v=String(value||'').trim();const m=v.match(/^부산\s*[1-4]\s*지사\s+([123]본부)$/);return m?m[1]:v;};
let events=[],history=[],branchTargets=[],divisionTargets=[],orgNodes=[],signedRows=[];
let currentYear=new Date().getFullYear(),currentBranch='all',yearHighlight=new Date().getMonth()+1,individualYear=currentYear,individualBranch='all',individualDivision='all',individualName='',individualSelectedMonths=new Set(),staffBranch='all',staffQuery='';
const cache=new Map();
let phoneDb=null,phoneAuthenticated=false;
let staffStatuses=new Map(),staffStatusAvailable=false;
let viewerDb=null,orgFingerprint='',orgSyncBusy=false,lastOrgSync=0;
let performanceSyncBusy=false,lastPerformanceSync=0;
const phoneCache=new Map(),revealedPhones=new Set();
const choices=(node,options,value)=>{node.innerHTML=options.map(([id,label])=>'<option value="'+safe(id)+'">'+safe(label)+'</option>').join('');node.value=String(value);};
const allYears=()=>[...new Set([new Date().getFullYear(),...signedRows.map(r=>Number(r.goal_year)),...history.map(r=>Number(r.goal_year)),...branchTargets.map(r=>Number(r.goal_year)),...divisionTargets.map(r=>Number(r.goal_year))])].filter(y=>y>=2020&&y<=2100).sort((a,b)=>b-a);
function goal(branch,year,month,division='all'){
 const direct=divisionTargets.find(t=>t.branch===branch&&t.division===division&&Number(t.goal_year)===year&&Number(t.goal_month)===month);
 if(division!=='all')return direct?Number(direct.target_seats):historicValue(history,branch,division,'',year,month,'target_seats');
 const vals=['1본부','2본부','3본부'].map(d=>divisionTargets.find(t=>t.branch===branch&&t.division===d&&Number(t.goal_year)===year&&Number(t.goal_month)===month));
 if(vals.some(Boolean))return vals.reduce((n,r)=>n+(r?Number(r.target_seats):0),0);
 const old=branchTargets.find(t=>t.branch===branch&&Number(t.goal_year)===year&&Number(t.goal_month)===month);
 return old?Number(old.target_seats):historicValue(history,branch,'','',year,month,'target_seats');
}
function actual(branch,year,month,division='all'){
 const key=JSON.stringify([branch,year,month,division]);
 if(!cache.has(key))cache.set(key,historicalActualSeats({history,events,branch,year,month,division,normalizeDivision,timedSignupRows}));
 return cache.get(key);
}
function drawYear(){
 const years=allYears();if(!years.includes(currentYear))currentYear=years[0];
 choices(el('yearSelect'),years.map(y=>[y,y+'년']),currentYear);
 choices(el('yearBranch'),[['all','전체 지사'],...branches.map(b=>[b,b])],currentBranch);
 const selected=currentBranch==='all'?branches:[currentBranch];
 el('yearMonthButtons').innerHTML='<button type="button" data-year-month="0" class="'+(yearHighlight===0?'active':'')+'">전체(1~12월)</button>'+monthNumbers.map(m=>'<button type="button" data-year-month="'+m+'" class="'+(yearHighlight===m?'active':'')+'">'+m+'월</button>').join('');
 const matrix=renderPerformanceMatrix({branches:selected,year:currentYear,highlight:yearHighlight,getGoal:goal,getActual:actual,escape:safe,divisionOptions:divisions});
 el('yearHead').innerHTML=matrix.heading;el('yearBody').innerHTML=matrix.body;
}
function managerData(){
 const map=new Map();
 const put=(b,d,name)=>{const key=JSON.stringify([b,d,name]);if(!map.has(key))map.set(key,{branch:b,division:d,manager:name,months:Array(12).fill(0),manual:new Set(),status:'재직'});return map.get(key);};
 for(const p of rosterPerformancePeople(orgNodes)){if(branches.includes(p.branch))put(p.branch,normalizeDivision(p.division),p.name);}
 for(const row of signedRows){
  const year=Number(row.goal_year),month=Number(row.goal_month),b=row.branch,d=normalizeDivision(row.division),name=row.manager||'담당자 미지정';
  if(year!==individualYear||!branches.includes(b)||month<1||month>12)continue;
  put(b,d,name).months[month-1]+=Number(row.seats)||0;
 }
 // Manual personal records replace, not add to, the person's own monthly signup total.
 for(const row of history){
  const year=Number(row.goal_year),month=Number(row.goal_month);
  if(year!==individualYear||!row.manager||!branches.includes(row.branch)||month<1||month>12)continue;
  const person=put(row.branch,normalizeDivision(row.division),row.manager);
  if(row.actual_seats!==null&&row.actual_seats!==undefined){person.months[month-1]=Number(row.actual_seats);person.manual.add(month);}
  person.status=row.employment_status==='계약해지'?'계약해지':'재직';
 }
 return [...map.values()].filter(r=>(individualBranch==='all'||r.branch===individualBranch)&&(individualDivision==='all'||r.division===individualDivision)&&(!individualName||r.manager.replace(/\s+/g,'').includes(individualName.replace(/\s+/g,''))))
  .map(r=>({...r,total:r.months.reduce((a,b)=>a+b,0)}))
  .sort((a,b)=>b.total-a.total||a.branch.localeCompare(b.branch,'ko')||a.division.localeCompare(b.division,'ko')||a.manager.localeCompare(b.manager,'ko'));
}
function drawPersonal(){
 const years=allYears();if(!years.includes(individualYear))individualYear=years[0];
 choices(el('personalYear'),years.map(y=>[y,y+'년']),individualYear);
 choices(el('personalBranch'),[['all','전체 지사'],...branches.map(b=>[b,b])],individualBranch);
 choices(el('personalDivision'),[['all','전체 본부'],...divisions.map(d=>[d,d])],individualDivision);
 const fullYear=individualSelectedMonths.size===0,shown=fullYear?monthNumbers:monthNumbers.filter(m=>individualSelectedMonths.has(m));
 const showTotal=shown.length>1;
 el('personalMonthButtons').innerHTML='<button type="button" data-personal-all class="'+(fullYear?'active':'')+'">전체(1~12월)</button>'+
  monthNumbers.map(m=>'<label style="display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #d9e3f0;border-radius:8px;background:'+(individualSelectedMonths.has(m)?'#e7efff':'#f6f8fc')+'"><input type="checkbox" data-personal-month="'+m+'" '+(individualSelectedMonths.has(m)?'checked ':'')+'>'+m+'월</label>').join('');
 const table=el('personalHead').closest('table');
 table.style.minWidth=(444+shown.length*80+(showTotal?88:0))+'px';
 el('personalCols').innerHTML='<col style="width:49px"><col style="width:151px"><col style="width:106px"><col style="width:126px">'+shown.map(()=>'<col style="width:80px">').join('')+(showTotal?'<col style="width:88px">':'');
 el('personalHead').innerHTML='<tr><th>No.</th><th>소속 지사</th><th>본부</th><th>성명</th>'+
  shown.map(m=>'<th>'+m+'월</th>').join('')+(showTotal?'<th>'+(fullYear?'연간 합계':'선택 월 합계')+'</th>':'')+'</tr>';
 const people=managerData().map(r=>({...r,displayTotal:shown.reduce((sum,m)=>sum+r.months[m-1],0)}))
  .sort((a,b)=>b.displayTotal-a.displayTotal||a.branch.localeCompare(b.branch,'ko')||a.manager.localeCompare(b.manager,'ko'));
 const span=4+shown.length+(showTotal?1:0);
 el('personalBody').innerHTML=people.length?people.map((r,i)=>
  '<tr><td>'+(i+1)+'</td><td class="personal-affiliation">'+safe(r.branch)+'</td><td>'+safe(r.division)+'</td><td class="personal-name">'+safe(r.manager)+(r.status==='계약해지'?' <small style="color:#ac624a">(계약해지)</small>':'')+'</td>'+
  shown.map(m=>'<td>'+(r.manual.has(m)?fmt(r.months[m-1])+'*':fmt(r.months[m-1]))+'</td>').join('')+
  (showTotal?'<td class="personal-annual">'+fmt(r.displayTotal)+'</td>':'')+'</tr>'
 ).join(''):'<tr><td colspan="'+span+'">조회 가능한 매니저 실적이 없습니다.</td></tr>';
 const sums=shown.map(m=>people.reduce((n,p)=>n+p.months[m-1],0));
 el('personalFoot').innerHTML='<tr><td colspan="4">합계</td>'+sums.map(n=>'<td>'+fmt(n)+'</td>').join('')+
  (showTotal?'<td>'+fmt(sums.reduce((a,b)=>a+b,0))+'</td>':'')+'</tr>';
}

/* Read the very same saved document as admin and run its legacy-card normalization
   in memory. This projection never writes to the database. */
function projectAdminOrgChart(original){
 const nodes=Array.isArray(original)?original.map(n=>({...n})):[];
 const roleOf=n=>{
  const roles=['regional','branch','division','manager'];
  if(Object.prototype.hasOwnProperty.call(n,'headcountRole'))return roles.includes(n.headcountRole)?n.headcountRole:'';
  if(n.type!=='person')return '';
  const title=String(n.subtitle||'').replace(/\s+/g,'');
  if(title.includes('권역대표'))return 'regional';
  if(title.includes('지사장'))return 'branch';
  if(title.includes('본부장'))return 'division';
  if(title.includes('매니저'))return 'manager';
  return '';
 };
 const siblings=(id)=>nodes.filter(n=>String(n.parent??'')===String(id??'')).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
 const branchOf=group=>{
  const explicit=String(group.branchName||'').trim();
  if(explicit)return explicit;
  const existing=String(group.label||'').match(/부산\s*[1-4]\s*지사/);
  if(existing)return existing[0].replace(/\s+/g,' ').replace(/부산 ([1-4]) 지사/,'부산 $1지사').replace(/부산([1-4])지사/,'부산 $1지사');
  const peers=siblings(group.parent).filter(n=>n.type==='group');
  const index=peers.findIndex(n=>String(n.id)===String(group.id));
  return index>=0&&index<4?'부산 '+(index+1)+'지사':'지사 / 부서';
 };
 for(const root of nodes.filter(n=>n.type==='root')){
  const direct=nodes.filter(n=>n.type==='person'&&String(n.parent)===String(root.id));
  if(!direct.length){
   const role=roleOf(root),subtitle=String(root.subtitle||'').trim(),label=String(root.label||'').trim();
   const hasName=label&&!/권역|지역|최상위 조직/.test(label);
   const name=hasName?label:(role==='regional'?subtitle.replace(/권역대표|대표/g,'').trim():'');
   const person={id:'viewer-root-person-'+String(root.id),parent:root.id,type:'person',label:name||'구성원',
    subtitle:hasName?subtitle:'',headcountRole:'regional',color:'white',order:-1,
    joinDate:root.joinDate||'',staffHidden:root.staffHidden===true};
   if(name)person.staffContactId=String(root.id);
   nodes.push(person);
   if(hasName)root.label=String(root.regionName||'부산권역');
  }
  if(root.headcountRole==='regional'&&root.label==='부산권역')delete root.headcountRole;
 }
 for(const group of [...nodes]){
  if(group.type!=='group')continue;
  const branch=branchOf(group),name=String(group.label||'').trim();
  const isPerson=name&&name!=='지사장 / 담당자 입력'&&name!=='새 지사 / 부서'&&
   name.replace(/\s+/g,'')!==branch.replace(/\s+/g,'');
  const role=roleOf(group),subtitleName=String(group.subtitle||'').replace(/지사장|본부장|권역대표|매니저/g,'').trim();
  const clean=isPerson?(name.replace(/부산\s*[1-4]\s*지사/g,'').replace(/지사장/g,'').trim()||name):(role?subtitleName:'');
  if(clean){
   nodes.push({id:'viewer-group-person-'+String(group.id),parent:group.id,type:'person',label:clean,
    subtitle:isPerson?(group.subtitle||''):'',headcountRole:role||'branch',
    joinDate:group.joinDate||'',color:group.color==='default'?'white':(group.color||'white'),
    order:-1,staffHidden:group.staffHidden===true,staffContactId:String(group.id)});
  }
  group.label=branch;group.branchName=branch;
  if(clean)for(const prop of ['subtitle','headcountRole','joinDate','staffHidden'])delete group[prop];
 }
 return nodes;
}
async function loadSavedAdminOrg(db){
 // org_chart_setup.sql already exposes this saved document read-only to anonymous viewers.
 // Private staff contact records are stored in another table and are NEVER selected here.
 const {data,error}=await db.from('kpi_org_chart').select('nodes').eq('id',1).maybeSingle();
 if(error)throw error;
 return projectAdminOrgChart(data?.nodes);
}

function drawOrg(){
 const visible=orgNodes.filter(Boolean);
 const roles=ORG_ROLE_LABELS;
 const roleOf=orgEffectiveRoleShared;
 const counts=countOrgHeadcount(orgNodes);
 const dualHelp=el('orgDualViewerHelp');if(dualHelp)dualHelp.hidden=true;
 el('orgCount').textContent='조직도 카드 기준 · 자동 집계';
 el('orgHeadcount').innerHTML=[...['regional','branch','division','manager'].map(k=>[roles[k],counts[k]]),['총인원',counts.total]]
  .map(([label,n])=>'<div class="org-headcount-stat'+(label==='총인원'?' org-headcount-total':'')+'"><span>'+safe(label)+'</span><strong>'+fmt(n)+'명</strong></div>').join('');
 const children=new Map();
 for(const n of visible){const parent=n.parent==null?'':String(n.parent);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(n);}
 for(const list of children.values())list.sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
 const kids=n=>children.get(n==null?'':String(n))||[];
 const card=n=>{
  const role=roles[isDualStaff(n)?'dual':roleOf(n)]||'';
  const subtitle=String(n.subtitle||'').trim();
  const roleTag=role?'<small class="org-card-role">'+safe(role)+'</small>':'';
  const sub=subtitle&&subtitle.replace(/\s+/g,'')!==role?'<small>'+safe(subtitle)+'</small>':'';
  const permittedColors=new Set(['default','white','navy','blue','mint','sky','teal','green','purple','lavender','pink','coral','orange','yellow','gray']);
  const col=permittedColors.has(n.color)&&n.color!=='default'?' color-'+n.color:'';
  const date=String(n.joinDate||'').trim();
  const m=/^([0-9]{2})[.](0[1-9]|1[0-2])$/.exec(date)||/^([0-9]{4})-(0[1-9]|1[0-2])/.exec(date);
  const joined=m?m[1].slice(-2)+'.'+m[2]:'';
  const join=['group','person'].includes(n.type)&&joined?'<small class="org-join-date">입사 '+safe(joined)+'</small>':'';
  const rawName=String(n.label||'').trim();
  const branchLeader=roleOf(n)==='branch'&&['박영우','안선경'].includes(rawName.replace(/[（(]\s*겸\s*직\s*[)）]/g,'').trim());
  const shownName=branchLeader?rawName.replace(/[（(]\s*겸\s*직\s*[)）]/g,'').trim():rawName;
  return '<button type="button" disabled class="org-node org-node-'+safe(n.type)+col+'">'+roleTag+'<strong>'+safe(shownName||'이름 미입력')+'</strong>'+sub+join+'</button>';
 };
 const person=n=>'<div class="org-person">'+card(n)+'</div>';
 const division=n=>'<div class="org-unit-col">'+card(n)+'<div class="org-person-list">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div></div>';
 const branchName=n=>{const v=String(n.branchName||n.label||'').trim(),m=v.match(/부산\s*([1-4])\s*지사/);return m?'부산 '+m[1]+'지사':v;};
 const group=n=>'<div class="org-group-wrap"><button type="button" disabled class="org-branch-heading">'+safe(branchName(n))+'</button>'+
   (kids(n.id).some(x=>x.type==='person')?'<div class="org-branch-direct-members">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+
   '<div class="org-unit-row">'+kids(n.id).filter(x=>x.type==='division').map(division).join('')+'</div></div>';
 const root=n=>'<div class="org-root-branch"><div class="org-root-row">'+card(n)+'</div>'+
  (kids(n.id).some(x=>x.type==='person')?'<div class="org-region-direct-members">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+
  '<div class="org-group-row">'+kids(n.id).filter(x=>x.type==='group').map(group).join('')+'</div></div>';
 const roots=kids(null).filter(x=>x.type==='root');
 el('orgTree').innerHTML=roots.map(root).join('')||'<p class="org-empty">등록된 조직도가 없습니다.</p>';
 requestAnimationFrame(()=>drawOrgConnectorLines(el('orgTree'),'admin'));
}
function staffRows(){
 const list=orgNodes.filter(n=>n&&n.staffHidden!==true);
 const byId=new Map(list.map(n=>[String(n.id),n]));
 const roles=ORG_ROLE_LABELS;
 const placeholders=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력']);
 const roleOf=n=>{
  if(Object.prototype.hasOwnProperty.call(n,'headcountRole'))return roles[n.headcountRole]?n.headcountRole:'';
  if(n.type!=='person')return '';
  const v=String(n.subtitle||'').replace(/\s+/g,'');
  return Object.keys(roles).find(k=>v.includes(roles[k]))||'';
 };
 const hired=value=>{
  const v=String(value||'').trim(),current=/^([0-9]{2})[.](0[1-9]|1[0-2])$/.exec(v);
  if(current)return current[1]+'.'+current[2];
  const legacy=/^([0-9]{4})-(0[1-9]|1[0-2])/.exec(v);
  return legacy?legacy[1].slice(-2)+'.'+legacy[2]:'';
 };
 const orgBranch=n=>{
  const v=String(n.branchName||n.label||'').trim(),m=v.match(/부산\s*([1-4])\s*지사/);
  return m?'부산 '+m[1]+'지사':v;
 };
 return list.filter(n=>{
  if(!['person','division','root','group'].includes(n.type))return false;
  const label=String(n.label||'').trim();
  return label&&!placeholders.has(label)&&n.type!=='group'&&(n.type==='person'||Boolean(roleOf(n)));
 }).map(n=>{
  let current=n,branch='',division='',depth=0;
  while(current&&depth++<16){
   if(current.type==='division')division=String(current.label||division);
   if(current.type==='group')branch=orgBranch(current);
   if(current.type==='root'&&!branch)branch='부산권역';
   current=current.parent==null?null:byId.get(String(current.parent));
  }
  const role=roleOf(n);
  const key=String(n.staffContactId||n.id);
  const status=staffStatuses.get(key)||(staffStatusAvailable?'재직':'—');
  return {id:String(n.id),name:String(n.label||''),role:roles[role]||n.subtitle||'미지정',branch,division,
   hire:hired(n.joinDate),status};
 }).sort((a,b)=>(['부산권역',...branches].indexOf(a.branch)-['부산권역',...branches].indexOf(b.branch))||
   a.division.localeCompare(b.division,'ko')||a.name.localeCompare(b.name,'ko'));
}
function drawStaff(){
 choices(el('staffBranch'),[['all','전체 지사'],['부산권역','부산권역'],...branches.map(b=>[b,b])],staffBranch);
 const all=staffRows();
 const query=staffQuery.toLocaleLowerCase('ko');
 const statusFilter=el('staffStatusFilter').value;
 const filtered=all.filter(r=>(staffBranch==='all'||r.branch===staffBranch)&&
  (statusFilter==='all'||r.status===statusFilter)&&
  (!query||[r.name,r.role,r.branch,r.division].join(' ').toLocaleLowerCase('ko').includes(query)));
 el('staffCount').textContent='총 '+fmt(all.length)+'명';
 el('staffMessage').textContent=phoneAuthenticated?
  '기존 관리자 로그인 권한이 확인되었습니다. 연락처를 더블클릭하거나 드래그하면 바로 표시됩니다.':
  '연락처는 비공개입니다. 관리자 홈페이지에 로그인된 권한이 있는 사용자만 번호를 더블클릭하여 조회할 수 있습니다.';
 el('staffBody').innerHTML=filtered.length?filtered.map((r,i)=>{
  const st=r.status==='휴직'?' leave':r.status==='퇴사'?' left':'';
  const number=phoneCache.get(r.id)||'';
  const show=phoneAuthenticated&&revealedPhones.has(r.id)&&Boolean(number);
  const phoneHtml=phoneAuthenticated&&phoneCache.has(r.id)?
   '<span tabindex="0" class="staff-phone '+(show?'visible':'concealed')+'" title="더블클릭하거나 드래그하여 번호 표시" data-phone-id="'+safe(r.id)+'">'+safe(number||'—')+'</span>':
   '<span tabindex="0" class="staff-phone locked" title="더블클릭하여 연락처 열람 인증" data-phone-id="'+safe(r.id)+'">•••-••••-••••</span>';
  return '<tr><td class="staff-num">'+(i+1)+'</td><td class="staff-name">'+safe(r.name)+'</td>'+
   '<td><span class="staff-pill">'+safe(r.role)+'</span></td><td>'+safe(r.branch||'—')+'</td>'+
   '<td>'+safe(r.division||'—')+'</td><td>'+phoneHtml+'</td><td>'+safe(r.hire||'—')+'</td>'+
   '<td><span class="staff-status'+st+'">'+safe(r.status)+'</span></td><td>—</td></tr>';
 }).join(''):'<tr><td colspan="9">조회 가능한 조직원이 없습니다.</td></tr>';
}
async function refreshPhoneAccess(){
 if(!phoneDb){phoneAuthenticated=false;return false;}
 try{
  const {data:{session},error:sessionError}=await phoneDb.auth.getSession();
  if(sessionError||!session?.access_token){phoneAuthenticated=false;phoneCache.clear();revealedPhones.clear();return false;}
  // Check role on the server: session alone never grants contact access.
  const {data,error}=await phoneDb.rpc('kpi_my_access');
  const allowed=!error&&['owner','shared','branch'].includes(data?.role);
  if(!allowed){phoneCache.clear();revealedPhones.clear();}
  phoneAuthenticated=allowed;
  return allowed;
 }catch{
  phoneAuthenticated=false;phoneCache.clear();revealedPhones.clear();return false;
 }
}
async function requestPhone(nodeId){
 if(!await refreshPhoneAccess()){
  drawStaff();
  el('staffMessage').textContent='연락처 열람 권한이 확인되지 않았습니다. 관리자 홈페이지에서 로그인하면 여기에서도 별도 로그인창 없이 확인할 수 있습니다.';
  return;
 }
 if(!phoneCache.has(nodeId)){
  const {data,error}=await phoneDb.rpc('kpi_manager_staff_phone',{p_node_id:nodeId});
  if(error)throw error;
  phoneCache.set(nodeId,typeof data==='string'?data:'');
 }
 revealedPhones.add(nodeId);
 drawStaff();
 const span=[...el('staffBody').querySelectorAll('[data-phone-id]')].find(n=>n.dataset.phoneId===nodeId);
 if(span)span.focus({preventScroll:true});
}
el('staffBody').addEventListener('dblclick',async e=>{
 const span=e.target.closest('[data-phone-id]');if(!span)return;
 try{await requestPhone(span.dataset.phoneId);}catch(error){
  el('staffMessage').textContent='연락처 조회 실패: '+(error.message||'조회 권한 확인 필요');
 }
});
el('staffBody').addEventListener('mouseup',async e=>{
 const span=e.target.closest('[data-phone-id]');if(!span)return;
 if(!window.getSelection()?.toString().trim())return;
 try{await requestPhone(span.dataset.phoneId);}catch(error){
  el('staffMessage').textContent='연락처 조회 실패: '+(error.message||'조회 권한 확인 필요');
 }
});
// The manager viewer shares the saved Supabase organization with admin.
 // Polling works without requiring a Realtime publication for the organization table.
async function syncOrganization(force=false){
 if(!viewerDb||orgSyncBusy||(!force&&document.hidden))return;
 if(!force&&Date.now()-lastOrgSync<5000)return;
 orgSyncBusy=true;
 try{
  const next=await loadSavedAdminOrg(viewerDb);
  const fingerprint=JSON.stringify(next);
  lastOrgSync=Date.now();
  if(fingerprint!==orgFingerprint){
   orgNodes=next;orgFingerprint=fingerprint;
   if(!el('org').classList.contains('hidden'))drawOrg();
   if(!el('orgstaff').classList.contains('hidden'))drawStaff();
   if(!el('personal').classList.contains('hidden'))drawPersonal();
  }
  const indicator=el('orgSyncInfo');
  if(indicator){indicator.textContent='온라인 조직도 자동 동기화 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' 확인';indicator.classList.remove('err');}
 }catch(error){
  const indicator=el('orgSyncInfo');
  if(indicator){indicator.textContent='조직도 갱신 실패 · 재시도 예정: '+(error.message||'연결 오류');indicator.classList.add('err');}
 }finally{orgSyncBusy=false;}
}
function showPage(page){
 const titles={year:'지사별 / 본부별 실적현황',personal:'개인별 실적현황',org:'조직도',orgstaff:'조직원 정보'};
 for(const p of Object.keys(titles))el(p).classList.toggle('hidden',p!==page);
 document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
 el('pageTitle').textContent=titles[page];
 if(page==='year')drawYear();if(page==='personal')drawPersonal();if(page==='org')drawOrg();if(page==='orgstaff')drawStaff();
 if(page==='org'||page==='orgstaff')void syncOrganization(true);
}
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page);});
el('yearSelect').addEventListener('change',e=>{currentYear=Number(e.target.value);drawYear()});
el('yearBranch').addEventListener('change',e=>{currentBranch=e.target.value;drawYear()});
el('yearMonthButtons').addEventListener('click',e=>{const button=e.target.closest('button[data-year-month]');if(button){yearHighlight=Number(button.dataset.yearMonth);drawYear();}});
el('personalYear').addEventListener('change',e=>{individualYear=Number(e.target.value);drawPersonal()});
el('personalBranch').addEventListener('change',e=>{individualBranch=e.target.value;drawPersonal()});
el('personalDivision').addEventListener('change',e=>{individualDivision=e.target.value;drawPersonal()});
el('staffBranch').addEventListener('change',e=>{staffBranch=e.target.value;drawStaff();});
el('staffSearch').addEventListener('input',e=>{staffQuery=e.target.value.trim();drawStaff();});
el('staffStatusFilter').addEventListener('change',drawStaff);
el('personalNameSearch').addEventListener('input',e=>{individualName=String(e.target.value||'').trim();drawPersonal()});
el('personalMonthButtons').addEventListener('click',e=>{if(e.target.closest('[data-personal-all]')){individualSelectedMonths.clear();drawPersonal();}});
el('personalMonthButtons').addEventListener('change',e=>{const input=e.target.closest('input[data-personal-month]');if(!input)return;const m=Number(input.dataset.personalMonth);if(input.checked)individualSelectedMonths.add(m);else individualSelectedMonths.delete(m);if(individualSelectedMonths.size===12)individualSelectedMonths.clear();drawPersonal();});
window.addEventListener('resize',()=>{if(!el('org').classList.contains('hidden'))requestAnimationFrame(()=>drawOrgConnectorLines(el('orgTree'),'admin'));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncOrganization(true);});
window.addEventListener('focus',()=>{void syncOrganization();void syncPerformance();});

async function readPages(query,fields){
 const all=[];
 for(let offset=0;offset<100000;offset+=1000){
  const {data,error}=await query(offset,offset+999);
  if(error)throw error;
  all.push(...(data||[]));if((data||[]).length<1000)break;
 }
 return all;
}
async function syncPerformance(){
 if(!viewerDb||performanceSyncBusy||document.hidden||Date.now()-lastPerformanceSync<25000)return;
 performanceSyncBusy=true;
 lastPerformanceSync=Date.now();
 try{
  const [signups,historic,targets,divisionGoals]=await Promise.all([
   readPages((from,to)=>viewerDb.rpc('kpi_manager_performance_signups').range(from,to)),
   readPages((from,to)=>viewerDb.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats,employment_status').range(from,to)),
   readPages((from,to)=>viewerDb.from('kpi_monthly_targets').select('branch,goal_year,goal_month,target_seats').range(from,to)),
   readPages((from,to)=>viewerDb.from('kpi_monthly_division_targets').select('branch,division,goal_year,goal_month,target_seats').range(from,to))
  ]);
  signedRows=signups;history=historic;branchTargets=targets;divisionTargets=divisionGoals;
  events=signedRows.map(r=>({branch:r.branch,division:normalizeDivision(r.division),signupEntries:[{
   group:'individual',manager:r.manager,seats:Number(r.seats),branch:r.branch,division:normalizeDivision(r.division),
   signupDate:String(r.goal_year)+'-'+String(r.goal_month).padStart(2,'0')+'-01'
  }]}));
  cache.clear();
  if(!el('year').classList.contains('hidden'))drawYear();
  if(!el('personal').classList.contains('hidden'))drawPersonal();
 }catch(error){console.warn('실적 자동 갱신 실패 · 다음 주기에 재시도',error);}
 finally{performanceSyncBusy=false;}
}
async function main(){
 try{
  const cfg=window.PLK_CONFIG||{};
  if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'')||!cfg.supabaseAnonKey)throw Error('Supabase 공개 연결 설정이 없습니다.');
  const db=await startViewerGate('manager');
  installViewerLogout();
  viewerDb=db;
  phoneDb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  await refreshPhoneAccess();
  phoneDb.auth.onAuthStateChange((event)=>{
   if(event==='SIGNED_OUT'){phoneAuthenticated=false;phoneCache.clear();revealedPhones.clear();if(!el('orgstaff').classList.contains('hidden'))drawStaff();}
   if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
    // Avoid calling auth/database methods directly inside the auth event callback.
    queueMicrotask(()=>refreshPhoneAccess().then(()=>{if(!el('orgstaff').classList.contains('hidden'))drawStaff();}));
   }
  });
  const [signups,historic,targets,divisionGoals,organization]=await Promise.all([
   readPages((from,to)=>db.rpc('kpi_manager_performance_signups').range(from,to)),
   readPages((from,to)=>db.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats,employment_status').range(from,to)),
   readPages((from,to)=>db.from('kpi_monthly_targets').select('branch,goal_year,goal_month,target_seats').range(from,to)),
   readPages((from,to)=>db.from('kpi_monthly_division_targets').select('branch,division,goal_year,goal_month,target_seats').range(from,to)),
   loadSavedAdminOrg(db)
  ]);
  if(!Array.isArray(organization))throw Error('조직도 데이터 형식 오류');
  signedRows=signups;history=historic;branchTargets=targets;divisionTargets=divisionGoals;
  orgNodes=organization;
  orgFingerprint=JSON.stringify(orgNodes);lastOrgSync=Date.now();lastPerformanceSync=Date.now();
  // Re-check the saved organization regularly while this viewer is open.
  window.setInterval(()=>void syncOrganization(),15000);
  window.setInterval(()=>{if(!document.hidden)void syncPerformance();},20000);
  // Reconstitute only non-financial signup attribution fields for shared seat aggregation.
  events=signedRows.map(r=>({branch:r.branch,division:normalizeDivision(r.division),signupEntries:[{
   group:'individual',manager:r.manager,seats:Number(r.seats),branch:r.branch,division:normalizeDivision(r.division),
   signupDate:String(r.goal_year)+'-'+String(r.goal_month).padStart(2,'0')+'-01'
  }]}));
  cache.clear();showPage('year');
  el('status').textContent='온라인 실적 연동 완료 · 읽기 전용 · 매출·비용 비공개 · 연락처는 권한 인증 후 개별 조회';
  try{
   const {data,error}=await db.from('kpi_org_staff_public_status').select('node_id,employment_status').limit(1000);
   if(error)throw error;
   staffStatuses=new Map((data||[]).filter(r=>r.node_id&&['재직','휴직','퇴사'].includes(r.employment_status))
    .map(r=>[String(r.node_id),r.employment_status]));
   staffStatusAvailable=true;
  }catch(error){staffStatusAvailable=false;console.warn('공개 재직상태 조회 설정 확인 필요',error);}
  if(!el('orgstaff').classList.contains('hidden'))drawStaff();
 }catch(error){
  el('status').classList.add('err');
  el('status').textContent='조회 설정 확인이 필요합니다: '+(error.message||'연결 오류')+' · Supabase SQL Editor에서 manager_viewer_setup.sql을 실행했는지 확인해 주세요.';
 }
}
main();
