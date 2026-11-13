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
 section.innerHTML=`<details><summary style="cursor:pointer;font-weight:800;font-size:17px">과거 실적 구좌 직접 입력 · 수정</summary>
 <p style="font-size:13px;line-height:1.8">지난 월의 목표·실적 구좌를 숫자로만 입력합니다. 입력한 범위와 월은 기존 자동 집계 대신 수동값이 표시됩니다. 행사 등록·입회 기록·매출 통계는 변경되지 않습니다. 지사·본부·개인별 숫자는 각각 별도 입력합니다.</p>
 <form id="histForm"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end">
 <label>연도 <input id="histYear" type="number" min="2020" max="2100" required style="width:92px"></label>
 <label>월 <select id="histMonth"></select></label>
 <label>지사 <select id="histBranch"></select></label>
 <label>구분 <select id="histScope"><option value="branch">지사 합계</option><option value="division">본부</option><option value="person">개인</option></select></label>
 <label id="histDivisionWrap" hidden>본부 <select id="histDivision"></select></label>
 <label id="histManagerWrap" hidden>매니저 성명 <input id="histManager" maxlength="80" placeholder="성명 정확히 입력"></label>
 <label id="histTargetWrap">목표 구좌 <input id="histTarget" type="number" min="0" max="1000000" step="1" placeholder="미입력" style="width:95px"></label>
 <label>실적 구좌 <input id="histActual" type="number" min="0" max="1000000" step="0.5" placeholder="미입력" style="width:95px"></label>
 </div><p id="histRate" style="font-size:13px;margin:12px 0">달성률: —</p>
 <div style="display:flex;flex-wrap:wrap;gap:8px"><button type="submit">저장</button><button id="histDelete" type="button">수동 기록 삭제</button><button id="histReload" type="button">새로고침</button></div>
 <p id="histStatus" role="status" style="font-size:13px;margin-top:9px"></p></form></details>`;
 el('personalYearBoard').insertAdjacentElement('afterend',section);
 el('histYear').value=new Date().getFullYear();
 el('histMonth').innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'월</option>').join('');
 el('histMonth').value=String(Math.max(1,new Date().getMonth()));
 el('histBranch').innerHTML=branches.map(b=>'<option>'+b+'</option>').join('');
 el('histDivision').innerHTML=divisions.map(d=>'<option>'+d+'</option>').join('');
 function selection(){
  const kind=el('histScope').value;
  return {branch:el('histBranch').value,division:kind==='branch'?'':el('histDivision').value,manager:kind==='person'?el('histManager').value.trim():'',goal_year:Number(el('histYear').value),goal_month:Number(el('histMonth').value)};
 }
 const matching=(r,k)=>Object.keys(k).every(x=>String(r[x])===String(k[x]));
 function rate(){
  const target=el('histScope').value==='person'?'':el('histTarget').value;
  const actual=el('histActual').value;
  el('histRate').textContent='달성률: '+(target!==''&&actual!==''&&Number(target)>0?(100*Number(actual)/Number(target)).toFixed(1)+'%':'—')+' (입력값 기준)';
 }
 function fill(){
  const r=rows.find(x=>matching(x,selection()));
  el('histTarget').value=r?.target_seats??'';
  el('histActual').value=r?.actual_seats??'';
  rate();
 }
 for(const id of ['histYear','histMonth','histBranch','histDivision','histManager'])el(id).addEventListener('change',fill);
 el('histScope').addEventListener('change',()=>{
  const kind=el('histScope').value;
  el('histDivisionWrap').hidden=kind==='branch';
  el('histManagerWrap').hidden=kind!=='person';
  el('histTargetWrap').hidden=kind==='person';
  fill();
 });
 for(const id of ['histTarget','histActual'])el(id).addEventListener('input',rate);
 async function load(){
  const db=getDb();if(!db)return;
  try{
   const all=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await db.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats').range(offset,offset+999);
    if(error)throw error;
    all.push(...(data||[]));if((data||[]).length<1000)break;
   }
   rows=all;ready=true;onRecords([...rows]);
   el('histStatus').textContent='DB 연결됨 · 수동 입력 '+rows.length+'개 · 수동값은 실적표에만 반영';
   fill();
  }catch(error){
   rows=[];ready=false;onRecords([]);
   el('histStatus').textContent='Supabase SQL Editor에서 historical_seats_setup.sql 실행 필요: '+(error.message||'연결 실패');
  }
 }
 async function save(event){
  event.preventDefault();
  if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=selection(),kind=el('histScope').value;
  if(!historicalPast(k.goal_year,k.goal_month)){alert('이미 지난 월만 입력할 수 있습니다.');return;}
  if(kind==='person'&&!k.manager){alert('매니저 성명을 입력해 주세요.');return;}
  const target=kind==='person'||el('histTarget').value===''?null:Number(el('histTarget').value);
  const actual=el('histActual').value===''?null:Number(el('histActual').value);
  if(target===null&&actual===null){alert('목표나 실적 중 하나 이상 입력해 주세요.');return;}
  if([target,actual].some(x=>x!==null&&(!Number.isFinite(x)||Math.round(x*2)!==x*2||x<0||x>1000000))){alert('0~1,000,000 사이의 정수만 입력해 주세요.');return;}
  const button=event.submitter;if(button)button.disabled=true;
  try{
   const {error}=await getDb().from('kpi_historical_seats').upsert({...k,target_seats:target,actual_seats:actual,updated_at:new Date().toISOString()},{onConflict:'branch,division,manager,goal_year,goal_month'});
   if(error)throw error;
   await load();el('histStatus').textContent=k.goal_year+'년 '+k.goal_month+'월 '+k.branch+' '+(k.manager||k.division||'지사 합계')+' 저장 완료';
  }catch(error){el('histStatus').textContent='저장 실패: '+error.message;}
  finally{if(button)button.disabled=false;}
 }
 async function remove(){
  if(!ready||!['owner','shared'].includes(getRole()))return;
  const k=selection();
  if(!rows.some(x=>matching(x,k)))return;
  if(!confirm('선택한 과거 수동 기록을 삭제할까요? 자동 집계로 돌아갑니다.'))return;
  try{
   let request=getDb().from('kpi_historical_seats').delete();
   for(const [field,value] of Object.entries(k))request=request.eq(field,value);
   const {error}=await request;if(error)throw error;
   await load();el('histStatus').textContent='수동 기록 삭제 완료';
  }catch(error){el('histStatus').textContent='삭제 실패: '+error.message;}
 }
 el('histForm').addEventListener('submit',save);
 el('histDelete').addEventListener('click',remove);
 el('histReload').addEventListener('click',load);
 return {load,show(){section.hidden=!['owner','shared'].includes(getRole());}};
}
