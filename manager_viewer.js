import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {renderPerformanceMatrix} from './performance_matrix.js?v=year-to-date-totals-20261113';
import {historicalActualSeats,historicValue} from './historical_seats.js?v=auto-person-rollup-20261113';
import {timedSignupRows} from './signup_date_utils.js';
import {rosterPerformancePeople} from './personal_roster.js';

const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
const divisions=['1본부','2본부','3본부','지사장','기타'];
const monthNumbers=Array.from({length:12},(_,i)=>i+1);
const normalizeDivision=value=>{const v=String(value||'').trim();const m=v.match(/^부산\s*[1-4]\s*지사\s+([123]본부)$/);return m?m[1]:v;};
let events=[],history=[],branchTargets=[],divisionTargets=[],orgNodes=[],signedRows=[];
let currentYear=new Date().getFullYear(),currentBranch='all',individualYear=currentYear,individualBranch='all',individualDivision='all';
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
 const matrix=renderPerformanceMatrix({branches:selected,year:currentYear,highlight:0,getGoal:goal,getActual:actual,escape:safe,divisionOptions:divisions});
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
 return [...map.values()].filter(r=>(individualBranch==='all'||r.branch===individualBranch)&&(individualDivision==='all'||r.division===individualDivision))
  .map(r=>({...r,total:r.months.reduce((a,b)=>a+b,0)}))
  .sort((a,b)=>b.total-a.total||a.branch.localeCompare(b.branch,'ko')||a.division.localeCompare(b.division,'ko')||a.manager.localeCompare(b.manager,'ko'));
}
function drawPersonal(){
 const years=allYears();if(!years.includes(individualYear))individualYear=years[0];
 choices(el('personalYear'),years.map(y=>[y,y+'년']),individualYear);
 choices(el('personalBranch'),[['all','전체 지사'],...branches.map(b=>[b,b])],individualBranch);
 choices(el('personalDivision'),[['all','전체 본부'],...divisions.map(d=>[d,d])],individualDivision);
 el('personalHead').innerHTML='<tr><th>No.</th><th>지사</th><th>본부</th><th>매니저</th><th>연간 합계</th>'+monthNumbers.map(m=>'<th>'+m+'월</th>').join('')+'</tr>';
 const people=managerData();
 el('personalBody').innerHTML=people.length?people.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+safe(r.branch)+'</td><td>'+safe(r.division)+'</td><td>'+safe(r.manager)+(r.status==='계약해지'?' <small style="color:#ac624a">(계약해지)</small>':'')+'</td><td style="font-weight:800;color:#235ddd">'+fmt(r.total)+'</td>'+r.months.map((v,m)=>'<td>'+(r.manual.has(m+1)?fmt(v)+'*':fmt(v))+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="17">조회 가능한 매니저 실적이 없습니다.</td></tr>';
 const sums=monthNumbers.map(m=>people.reduce((n,p)=>n+p.months[m-1],0));
 el('personalFoot').innerHTML='<tr><td colspan="4">합계</td><td>'+fmt(sums.reduce((a,b)=>a+b,0))+'</td>'+sums.map(fmt).map(n=>'<td>'+n+'</td>').join('')+'</tr>';
}
function drawOrg(){
 const people=rosterPerformancePeople(orgNodes).filter(p=>branches.includes(p.branch));
 const host=el('orgTree');el('orgCount').textContent='조직도 등록 인원 '+fmt(people.length)+'명';
 host.innerHTML=branches.map(b=>{
  const rows=people.filter(p=>p.branch===b);
  const ds=[...new Set([...divisions,...rows.map(p=>p.division)])];
  const cards=ds.map(d=>{
   const names=rows.filter(p=>p.division===d);
   if(!names.length)return '';
   return '<div class="org-division"><h4>'+safe(d)+' · '+names.length+'명</h4>'+
    names.map(p=>'<div class="org-person"><strong>'+safe(p.name)+'</strong></div>').join('')+'</div>';
  }).join('');
  return '<div class="org-branch"><h3>'+safe(b)+' <span class="org-count">('+rows.length+'명)</span></h3>'+
   '<div class="org-division-wrap">'+(cards||'<span class="org-count">등록된 구성원이 없습니다.</span>')+'</div></div>';
 }).join('');
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
el('personalYear').addEventListener('change',e=>{individualYear=Number(e.target.value);drawPersonal()});
el('personalBranch').addEventListener('change',e=>{individualBranch=e.target.value;drawPersonal()});
el('personalDivision').addEventListener('change',e=>{individualDivision=e.target.value;drawPersonal()});

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
