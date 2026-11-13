import { historicalPast } from './historical_seats.js';
/* Separate administrator-only, seat-only historical records editor. */
export function createHistoricalEditor({getDb,getRole,onRecords}){
 const el=id=>document.getElementById(id);
 const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역'];
 const divisions=['1본부','2본부','3본부','지사장','기타','권역대표'];
 let rows=[],ready=false;
 const section=document.createElement('section');
 section.id='historicalEditorPanel';section.className='perf-yearboard';section.hidden=true;
 section.style.cssText='margin:18px 0;padding:18px;border:1px solid #d5dfea;border-radius:12px';
 section.innerHTML=`<details><summary style="cursor:pointer;font-weight:800;font-size:17px">개인별 과거 실적구좌 직접 입력 · 수정</summary>
 <p style="font-size:13px;line-height:1.8">개인별 과거 실적만 입력합니다. 본부·지사 실적은 개인별 구좌에서 자동 합산됩니다. 목표는 지사별 / 본부별 화면에서 따로 입력합니다. 재직·계약해지 모두 실적에 포함됩니다.</p>
 <form id="histForm"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end">
 <label>연도 <input id="histYear" type="number" min="2020" max="2100" required style="width:92px"></label>
 <label>월 <select id="histMonth"></select></label>
 <label>지사 <select id="histBranch"></select></label>
 <label style="font-weight:700">재직 구분 <select id="histEmployment" aria-label="재직 또는 계약해지 선택"><option value="active">재직</option><option value="cancelled">계약해지</option></select></label>
 <label id="histDivisionWrap" hidden>본부 <select id="histDivision"></select></label>
 <label id="histManagerWrap" hidden>매니저 성명 <input id="histManager" maxlength="80" placeholder="성명 정확히 입력"></label>
 <label id="histActualWrap"><span id="histActualCaption">실적 구좌</span> <input id="histActual" type="number" min="0" max="1000000" step="0.5" placeholder="미입력" style="width:95px"></label>
 </div><p id="histRate" style="font-size:13px;margin:12px 0">개인 실적은 본부·지사에 자동 합산됩니다.</p>
 <div style="display:flex;flex-wrap:wrap;gap:8px"><button type="submit">저장</button><button id="histDelete" type="button">수동 기록 삭제</button><button id="histReload" type="button">새로고침</button></div>
 <p id="histStatus" role="status" style="font-size:13px;margin-top:9px"></p></form></details>`;
 el('personalYearBoard').append(section);
 const goalSection=document.createElement('section');
 goalSection.id='historicalGoalPanel';
 goalSection.style.cssText='margin:18px 0;padding:18px;border:1px solid #d5dfea;border-radius:12px';
 goalSection.innerHTML=`<details><summary style="cursor:pointer;font-weight:800;font-size:17px">지사별 / 본부별 과거 목표구좌 입력 · 수정</summary>
 <p style="font-size:13px;line-height:1.7">지사·본부는 목표구좌만 입력할 수 있습니다. 실적은 개인별 입력값에서 자동 합산됩니다.</p>
 <form id="histGoalForm"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end">
 <label>연도 <input id="histGoalYear" type="number" min="2020" max="2100" required style="width:92px"></label>
 <label>월 <select id="histGoalMonth"></select></label>
 <label>지사 <select id="histGoalBranch"></select></label>
 <label>구분 <select id="histGoalScope"><option value="branch">지사 목표</option><option value="division">본부 목표</option></select></label>
 <label id="histGoalDivisionWrap" hidden>본부 <select id="histGoalDivision"></select></label>
 <label>목표 구좌 <input id="histGoalTarget" type="number" min="0" max="1000000" step="1" required style="width:100px"></label>
 </div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
 <button type="submit">목표 저장</button><button id="histGoalDelete" type="button">목표 삭제</button><button id="histGoalReload" type="button">새로고침</button></div>
 <p id="histGoalStatus" role="status" style="font-size:13px;margin-top:9px"></p></form></details>`;
 el('perfYearBoard').append(goalSection);
 el('histYear').value=new Date().getFullYear();
 el('histMonth').innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'월</option>').join('');
 el('histMonth').value=String(Math.max(1,new Date().getMonth()));
 el('histGoalYear').value=el('histYear').value;
 el('histGoalMonth').innerHTML=el('histMonth').innerHTML;
 el('histGoalMonth').value=el('histMonth').value;
 el('histBranch').innerHTML=branches.map(b=>'<option>'+b+'</option>').join('');
 el('histDivision').innerHTML=divisions.map(d=>'<option>'+d+'</option>').join('');
 el('histGoalBranch').innerHTML=el('histBranch').innerHTML;
 el('histGoalDivision').innerHTML=el('histDivision').innerHTML;
 function selection(){
  return {branch:el('histBranch').value,division:el('histDivision').value,manager:el('histManager').value.trim(),goal_year:Number(el('histYear').value),goal_month:Number(el('histMonth').value)};
 }
 const matching=(r,k)=>Object.keys(k).every(x=>String(r[x])===String(k[x]));
 function rate(){el('histRate').textContent='개인 실적은 본부·지사에 자동 합산됩니다.';}
 function goalSelection(){return {branch:el('histGoalBranch').value,division:el('histGoalScope').value==='branch'?'':el('histGoalDivision').value,manager:'',goal_year:Number(el('histGoalYear').value),goal_month:Number(el('histGoalMonth').value)};}
 function fill(){
  const k=selection(),r=rows.find(x=>matching(x,k));
  el('histActual').value=r?.actual_seats??'';
  el('histEmployment').value=r?.employment_status==='계약해지'?'cancelled':'active';
  rate();
 }
 function fillGoal(){
  const r=rows.find(x=>matching(x,goalSelection()));
  el('histGoalTarget').value=r?.target_seats??'';
 }
 for(const id of ['histYear','histMonth','histBranch','histDivision','histManager'])el(id).addEventListener(id==='histManager'?'input':'change',fill);
 el('histEmployment').addEventListener('change',rate);
 el('histActual').addEventListener('input',rate);
 for(const id of ['histGoalYear','histGoalMonth','histGoalBranch','histGoalDivision'])el(id).addEventListener('change',fillGoal);
 el('histGoalScope').addEventListener('change',()=>{el('histGoalDivisionWrap').hidden=el('histGoalScope').value==='branch';fillGoal();});
 async function load(){
  const db=getDb();if(!db)return;
  try{
   const all=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await db.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats,employment_status').range(offset,offset+999);
    if(error)throw error;
    all.push(...(data||[]));if((data||[]).length<1000)break;
   }
   rows=all;ready=true;onRecords([...rows]);
   el('histStatus').textContent='DB 연결됨 · 수동 입력 '+rows.length+'개 · 수동값은 실적표에만 반영';
   fill();fillGoal();
  }catch(error){
   rows=[];ready=false;onRecords([]);
   el('histStatus').textContent='Supabase SQL Editor에서 historical_seats_setup.sql 실행 필요: '+(error.message||'연결 실패');
  }
 }
 async function save(event){
  event.preventDefault();
  if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=selection();
  if(!historicalPast(k.goal_year,k.goal_month)){alert('이미 지난 월만 입력할 수 있습니다.');return;}
  if(!k.manager){alert('매니저 성명을 입력해 주세요.');return;}
  const actual=el('histActual').value===''?null:Number(el('histActual').value);
  if(actual===null){alert('실적 구좌를 입력해 주세요.');return;}
  if(!Number.isFinite(actual)||Math.round(actual*2)!==actual*2||actual<0||actual>1000000){alert('0~1,000,000 사이의 0.5구좌 단위로 입력해 주세요.');return;}
  const button=event.submitter;if(button)button.disabled=true;
  try{
   const employment_status=el('histEmployment').value==='cancelled'?'계약해지':'재직';
   const existing=rows.find(x=>matching(x,k));
   const {error}=await getDb().from('kpi_historical_seats').upsert({...k,target_seats:existing?.target_seats??null,actual_seats:actual,employment_status,updated_at:new Date().toISOString()},{onConflict:'branch,division,manager,goal_year,goal_month'});
   if(error)throw error;
   await load();el('histStatus').textContent=k.goal_year+'년 '+k.goal_month+'월 '+k.branch+' '+k.manager+' 개인 실적 저장 완료 · 본부·지사 자동 반영';
  }catch(error){el('histStatus').textContent='저장 실패: '+error.message;}
  finally{if(button)button.disabled=false;}
 }
 async function remove(){
  if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=selection();
  if(!k.manager||!rows.some(x=>matching(x,k)))return;
  if(!confirm('선택한 과거 수동 기록을 삭제할까요? 자동 집계로 돌아갑니다.'))return;
  try{
   let request=getDb().from('kpi_historical_seats').delete();
   for(const [field,value] of Object.entries(k))request=request.eq(field,value);
   const {error}=await request;if(error)throw error;
   await load();el('histStatus').textContent='수동 기록 삭제 완료';
  }catch(error){el('histStatus').textContent='삭제 실패: '+error.message;}
 }
 async function saveGoal(event){
  event.preventDefault();if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=goalSelection(),raw=el('histGoalTarget').value;
  if(!historicalPast(k.goal_year,k.goal_month)){alert('이미 지난 월만 입력할 수 있습니다.');return;}
  if(raw===''||!Number.isSafeInteger(Number(raw))||Number(raw)<0||Number(raw)>1000000){alert('목표구좌는 0 이상 정수로 입력해 주세요.');return;}
  const button=event.submitter;if(button)button.disabled=true;
  try{
   const existing=rows.find(x=>matching(x,k));
   const {error}=await getDb().from('kpi_historical_seats').upsert({...k,target_seats:Number(raw),actual_seats:existing?.actual_seats??null,employment_status:'재직',updated_at:new Date().toISOString()},{onConflict:'branch,division,manager,goal_year,goal_month'});
   if(error)throw error;await load();el('histGoalStatus').textContent='목표 저장 완료 · 실적은 개인별 자동 합산';
  }catch(error){el('histGoalStatus').textContent='목표 저장 실패: '+error.message;}
  finally{if(button)button.disabled=false;}
 }
 async function removeGoal(){
  if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=goalSelection(),existing=rows.find(x=>matching(x,k));
  if(!existing||existing.target_seats===null)return;
  if(!confirm('선택한 목표구좌만 삭제할까요? 기존 실적은 유지됩니다.'))return;
  try{
   let query=getDb().from('kpi_historical_seats');
   if(existing.actual_seats===null||existing.actual_seats===undefined)query=query.delete();
   else query=query.update({target_seats:null,updated_at:new Date().toISOString()});
   for(const [field,value] of Object.entries(k))query=query.eq(field,value);
   const {error}=await query;if(error)throw error;
   await load();el('histGoalStatus').textContent='목표구좌 삭제 완료';
  }catch(error){el('histGoalStatus').textContent='목표 삭제 실패: '+error.message;}
 }
 el('histGoalForm').addEventListener('submit',saveGoal);
 el('histGoalDelete').addEventListener('click',removeGoal);
 el('histGoalReload').addEventListener('click',load);
 el('histForm').addEventListener('submit',save);
 el('histDelete').addEventListener('click',remove);
 el('histReload').addEventListener('click',load);
 return {load,show(){const allowed=['owner','shared'].includes(getRole());section.hidden=!allowed;goalSection.hidden=!allowed;}};
}
