import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {renderPerformanceMatrix} from './performance_matrix.js?v=year-to-date-totals-20261113';
import {historicalActualSeats,historicValue} from './historical_seats.js?v=auto-person-rollup-20261113';
import {timedSignupRows} from './signup_date_utils.js';
import {rosterPerformancePeople} from './personal_roster.js';
import {drawOrgConnectorLines} from './org_connector_lines.js';

const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
const divisions=['1본부','2본부','3본부','지사장','기타'];
const monthNumbers=Array.from({length:12},(_,i)=>i+1);
const normalizeDivision=value=>{const v=String(value||'').trim();const m=v.match(/^부산\s*[1-4]\s*지사\s+([123]본부)$/);return m?m[1]:v;};
let events=[],history=[],branchTargets=[],divisionTargets=[],orgNodes=[],signedRows=[];
let currentYear=new Date().getFullYear(),currentBranch='all',yearHighlight=new Date().getMonth()+1,individualYear=currentYear,individualBranch='all',individualDivision='all',individualName='',individualSelectedMonths=new Set();
const cache=new Map();
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
function drawOrg(){
 const visible=orgNodes.filter(n=>n&&n.staffHidden!==true);
 const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'};
 const roleOf=n=>{
  if(Object.prototype.hasOwnProperty.call(n,'headcountRole'))return roles[n.headcountRole]?n.headcountRole:'';
  if(n.type!=='person')return '';
  const title=String(n.subtitle||'').replace(/\s+/g,'');
  return Object.keys(roles).find(role=>title.includes(roles[role]))||'';
 };
 const ignored=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력']);
 const counts={regional:0,branch:0,division:0,manager:0,dual:0};
 for(const n of visible){
  if(!['person','division'].includes(n.type)||n.type==='division'&&!Object.prototype.hasOwnProperty.call(n,'headcountRole'))continue;
  const name=String(n.label||'').trim(),role=roleOf(n);
  if(!name||ignored.has(name)||!role)continue;
  if(/\(\s*겸직\s*\)/.test(String(n.label||'')+' '+String(n.subtitle||'')))counts.dual++;
  else counts[role]++;
 }
 const countedTotal=Object.values(counts).reduce((a,b)=>a+b,0);
 el('orgCount').textContent='조직도 카드 기준 · 자동 집계';
 el('orgHeadcount').innerHTML=[...Object.entries(roles).map(([key,label])=>[label,counts[key]]),['겸직',counts.dual],['총인원',countedTotal]]
  .map(([label,n])=>'<div class="org-headcount-stat'+(label==='총인원'?' org-headcount-total':'')+'"><span>'+safe(label)+'</span><strong>'+fmt(n)+'명</strong></div>').join('');
 const children=new Map();
 for(const n of visible){const parent=n.parent==null?'':String(n.parent);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(n);}
 const kids=n=>children.get(n==null?'':String(n))||[];
 const card=n=>{
  const role=roles[roleOf(n)]||'';
  const subtitle=String(n.subtitle||'').trim();
  const roleTag=role?'<small class="org-card-role">'+safe(role)+'</small>':'';
  const sub=subtitle&&subtitle.replace(/\s+/g,'')!==role?'<small>'+safe(subtitle)+'</small>':'';
  const col=n.color&&n.color!=='default'?' color-'+safe(n.color):'';
  return '<div class="org-node org-node-'+safe(n.type)+col+'">'+roleTag+'<strong>'+safe(n.label||'이름 미입력')+'</strong>'+sub+'</div>';
 };
 const person=n=>'<div class="org-person">'+card(n)+'</div>';
 const division=n=>'<div class="org-unit-col">'+card(n)+'<div class="org-person-list">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div></div>';
 const branchName=n=>{const v=String(n.branchName||n.label||'').trim(),m=v.match(/부산\s*([1-4])\s*지사/);return m?'부산 '+m[1]+'지사':v;};
 const group=n=>'<div class="org-group-wrap"><div class="org-branch-heading">'+safe(branchName(n))+'</div>'+
   (kids(n.id).some(x=>x.type==='person')?'<div class="org-branch-direct-members">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+
   '<div class="org-unit-row">'+kids(n.id).filter(x=>x.type==='division').map(division).join('')+'</div></div>';
 const root=n=>'<div class="org-root-branch"><div class="org-root-row">'+card(n)+'</div>'+
  (kids(n.id).some(x=>x.type==='person')?'<div class="org-region-direct-members">'+kids(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+
  '<div class="org-group-row">'+kids(n.id).filter(x=>x.type==='group').map(group).join('')+'</div></div>';
 const roots=kids(null).filter(x=>x.type==='root');
 el('orgTree').innerHTML=roots.map(root).join('')||'<p class="org-empty">등록된 조직도가 없습니다.</p>';
 requestAnimationFrame(()=>drawOrgConnectorLines(el('orgTree'),'admin'));
}
function showPage(page){
 const titles={year:'지사별 / 본부별 실적현황',personal:'개인별 실적현황',org:'조직도 · 조직관리 조회'};
 for(const p of Object.keys(titles))el(p).classList.toggle('hidden',p!==page);
 document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
 el('pageTitle').textContent=titles[page];
 if(page==='year')drawYear();if(page==='personal')drawPersonal();if(page==='org')drawOrg();
}
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page);});
el('yearSelect').addEventListener('change',e=>{currentYear=Number(e.target.value);drawYear()});
el('yearBranch').addEventListener('change',e=>{currentBranch=e.target.value;drawYear()});
el('yearMonthButtons').addEventListener('click',e=>{const button=e.target.closest('button[data-year-month]');if(button){yearHighlight=Number(button.dataset.yearMonth);drawYear();}});
el('personalYear').addEventListener('change',e=>{individualYear=Number(e.target.value);drawPersonal()});
el('personalBranch').addEventListener('change',e=>{individualBranch=e.target.value;drawPersonal()});
el('personalDivision').addEventListener('change',e=>{individualDivision=e.target.value;drawPersonal()});
el('personalNameSearch').addEventListener('input',e=>{individualName=String(e.target.value||'').trim();drawPersonal()});
el('personalMonthButtons').addEventListener('click',e=>{if(e.target.closest('[data-personal-all]')){individualSelectedMonths.clear();drawPersonal();}});
el('personalMonthButtons').addEventListener('change',e=>{const input=e.target.closest('input[data-personal-month]');if(!input)return;const m=Number(input.dataset.personalMonth);if(input.checked)individualSelectedMonths.add(m);else individualSelectedMonths.delete(m);if(individualSelectedMonths.size===12)individualSelectedMonths.clear();drawPersonal();});
window.addEventListener('resize',()=>{if(!el('org').classList.contains('hidden'))requestAnimationFrame(()=>drawOrgConnectorLines(el('orgTree'),'admin'));});

async function readPages(query,fields){
 const all=[];
 for(let offset=0;offset<100000;offset+=1000){
  const {data,error}=await query(offset,offset+999);
  if(error)throw error;
  all.push(...(data||[]));if((data||[]).length<1000)break;
 }
 return all;
}
async function main(){
 try{
  const cfg=window.PLK_CONFIG||{};
  if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'')||!cfg.supabaseAnonKey)throw Error('Supabase 공개 연결 설정이 없습니다.');
  const db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const [signups,historic,targets,divisionGoals,organization]=await Promise.all([
   readPages((from,to)=>db.rpc('kpi_manager_performance_signups').range(from,to)),
   readPages((from,to)=>db.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats,employment_status').range(from,to)),
   readPages((from,to)=>db.from('kpi_monthly_targets').select('branch,goal_year,goal_month,target_seats').range(from,to)),
   readPages((from,to)=>db.from('kpi_monthly_division_targets').select('branch,division,goal_year,goal_month,target_seats').range(from,to)),
   db.rpc('kpi_manager_org_nodes')
  ]);
  if(organization.error)throw organization.error;
  signedRows=signups;history=historic;branchTargets=targets;divisionTargets=divisionGoals;
  orgNodes=Array.isArray(organization.data?.[0]?.nodes)?organization.data[0].nodes:[];
  // Reconstitute only non-financial signup attribution fields for shared seat aggregation.
  events=signedRows.map(r=>({branch:r.branch,division:normalizeDivision(r.division),signupEntries:[{
   group:'individual',manager:r.manager,seats:Number(r.seats),branch:r.branch,division:normalizeDivision(r.division),
   signupDate:String(r.goal_year)+'-'+String(r.goal_month).padStart(2,'0')+'-01'
  }]}));
  cache.clear();showPage('year');
  el('status').textContent='온라인 실적 연동 완료 · 읽기 전용 · 매출/비용/연락처 데이터를 요청하지 않습니다.';
 }catch(error){
  el('status').classList.add('err');
  el('status').textContent='조회 설정 확인이 필요합니다: '+(error.message||'연결 오류')+' · Supabase SQL Editor에서 manager_viewer_setup.sql을 실행했는지 확인해 주세요.';
 }
}
main();
