import { HISTORICAL_EXCEL_PEOPLE } from './historical_excel_data.js';
import { rosterPerformancePeople } from './personal_roster.js';

/* Administrator-reviewed bulk import of the uploaded 1–10 month seat-only spreadsheet.
   Missing affiliations are never guessed. The user approves all assignments before writing. */
export function createHistoricalBulkImport({section,getDb,getRole,afterSave}){
 const branchNames=['부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역'];
 const divisions=['1본부','2본부','3본부','지사장','기타','권역대표'];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('details');
 panel.style.cssText='margin-top:18px;padding:14px;border:1px solid #ccd9e9;border-radius:9px';
 panel.innerHTML=`<summary style="font-weight:800;cursor:pointer">업로드한 실적.xlsx 일괄 등록 (41명 · 1~10월)</summary>
 <p style="font-size:13px;line-height:1.7">엑셀에는 지사/본부 소속 정보가 없습니다. 현재 조직도와 일치하는 성명은 자동 제안하고, 미확인 또는 동명이인은 선택 후 저장합니다. 입력 연도를 반드시 확인하세요. 기존 월별 숫자를 대체하며 매출이나 행사 KPI는 바꾸지 않습니다. 계약해지자는 별도 구분하고 정상 실적 합계에서 제외합니다.</p>
 <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end"><label>적용 연도 <input id="histBulkYear" type="number" min="2020" max="2100" value="2026" style="width:100px"></label><button type="button" id="histBulkMatch">조직도에서 소속 확인</button><button type="button" id="histBulkSave">검토한 실적 일괄 등록</button></div>
 <p id="histBulkStatus" role="status" style="font-size:12px;margin:10px 0"></p>
 <div style="overflow:auto;max-height:430px"><table style="border-collapse:collapse;min-width:800px;width:100%;font-size:12px">
 <thead><tr style="background:#edf3fc"><th style="padding:9px">성명</th><th>소속 지사</th><th>본부</th><th>정상 구좌</th><th>계약해지 구좌</th><th>확인 상태</th></tr></thead><tbody id="histBulkRows"></tbody></table></div>`;
 section.append(panel);
 const el=id=>document.getElementById(id);
 const persons=HISTORICAL_EXCEL_PEOPLE.map(p=>({...p,branch:'',division:'',match:''}));
 const option=(values,placeholder)=>'<option value="">'+placeholder+'</option>'+values.map(v=>'<option value="'+escape(v)+'">'+escape(v)+'</option>').join('');
 const seatSum=p=>p.months.reduce((sum,n)=>sum+(Number(n)||0),0);
 function render(){
  el('histBulkRows').innerHTML=persons.map((p,i)=>'<tr style="border-bottom:1px solid #e9eef5"><td style="padding:7px 9px;font-weight:700">'+escape(p.name)+'</td>'+
   '<td><select data-idx="'+i+'" data-field="branch" '+(p.cancelled?'disabled ':'')+'style="width:150px">'+option(branchNames,'지사 선택')+'</select></td>'+
   '<td><select data-idx="'+i+'" data-field="division" '+(p.cancelled?'disabled ':'')+'style="width:120px">'+option(divisions,'본부 선택')+'</select></td>'+
   '<td style="text-align:center">'+(p.cancelled?'—':seatSum(p).toLocaleString('ko-KR'))+'</td><td style="text-align:center">'+(p.cancelled?seatSum(p).toLocaleString('ko-KR'):'—')+'</td>'+
   '<td data-note="'+i+'" style="text-align:center">'+escape(p.cancelled?'계약해지 별도':'소속 미확인')+'</td></tr>').join('');
  persons.forEach((p,i)=>{
   for(const fld of ['branch','division']){
    const item=el('histBulkRows').querySelector('[data-idx="'+i+'"][data-field="'+fld+'"]');if(item)item.value=p[fld];
   }
   updateNote(i);
  });
 }
 function updateNote(i){
  const p=persons[i],node=el('histBulkRows').querySelector('[data-note="'+i+'"]');
  if(!node)return;
  node.textContent=p.cancelled?'계약해지 별도':!seatSum(p)?'실적 없음 · 제외':p.branch&&p.division?(p.match==='auto'?'조직도 일치':'수동 지정'):'소속 확인 필요';
 }
 el('histBulkRows').addEventListener('change',event=>{
  const t=event.target;if(!t.dataset.field)return;
  const i=Number(t.dataset.idx),p=persons[i];p[t.dataset.field]=t.value;p.match='manual';updateNote(i);
 });
 async function matchOrg(){
  const db=getDb();if(!db)return;
  try{
   const {data,error}=await db.from('kpi_org_chart').select('nodes').eq('id',1).maybeSingle();
   if(error)throw error;
   const roster=rosterPerformancePeople(Array.isArray(data?.nodes)?data.nodes:[]);
   let matched=0,ambiguous=0,missing=0;
   for(const p of persons){
    if(p.cancelled||seatSum(p)===0)continue;
    const matches=roster.filter(x=>x.name===p.name);
    if(matches.length===1){p.branch=matches[0].branch;p.division=matches[0].division;p.match='auto';matched++;}
    else{p.branch='';p.division='';p.match='';if(matches.length>1)ambiguous++;else missing++;}
   }
   render();
   el('histBulkStatus').textContent='조직도 자동 매칭 '+matched+'명 · 동명이인 '+ambiguous+'명 · 미등록 '+missing+'명. 확인이 필요한 성명은 직접 지사·본부를 지정하세요. 과거 소속이 현재와 다르면 반드시 수정해야 합니다.';
  }catch(error){el('histBulkStatus').textContent='조직도 조회 실패: '+error.message+' · 지사와 본부를 직접 선택해 주세요.';}
 }
 el('histBulkMatch').addEventListener('click',matchOrg);
 async function save(){
  const db=getDb();if(!db||!['owner','shared'].includes(getRole()))return;
  const year=Number(el('histBulkYear').value);
  if(!Number.isInteger(year)||year<2020||year>2100){alert('적용 연도를 확인하세요.');return;}
  const now=new Date(),limit=year<now.getFullYear()?12:year===now.getFullYear()?now.getMonth():0;
  const active=persons.filter(p=>!p.cancelled&&seatSum(p)>0);
  const unresolved=active.filter(p=>!p.branch||!p.division);
  if(unresolved.length){alert('소속 미확인 '+unresolved.length+'명: '+unresolved.map(p=>p.name).join(', ')+'\\n먼저 소속 지사와 본부를 지정해 주세요.');return;}
  if(active.some(p=>p.months.some((v,i)=>v!==null&&i+1>limit))){alert('선택 연도에 아직 지나지 않은 달의 수치가 있습니다. 연도를 확인하세요.');return;}
  const count=active.reduce((n,p)=>n+p.months.filter(v=>v!==null).length,0);
  const cancelled=persons.filter(p=>p.cancelled);
  if(!confirm(year+'년 개인 '+count+'건과 지사·본부 월 합계 및 계약해지 '+cancelled.length+'명을 저장할까요?\\n해당 월의 기존 수동 구좌 수치를 대체합니다.'))return;
  const button=el('histBulkSave');button.disabled=true;
  try{
   const {data:previous,error:oldError}=await db.from('kpi_historical_seats').select('branch,division,manager,goal_year,goal_month,target_seats,actual_seats').eq('goal_year',year);
   if(oldError)throw oldError;
   const prior=new Map((previous||[]).map(x=>[JSON.stringify([x.branch,x.division,x.manager,x.goal_month]),x]));
   const rows=[],branchTotals=new Map(),divisionTotals=new Map();
   for(const p of active)for(let i=0;i<p.months.length;i++){
    const v=p.months[i];if(v===null)continue;
    const month=i+1;
    rows.push({branch:p.branch,division:p.division,manager:p.name,goal_year:year,goal_month:month,actual_seats:v,
     target_seats:prior.get(JSON.stringify([p.branch,p.division,p.name,month]))?.target_seats??null});
    const bk=JSON.stringify([p.branch,month]),dk=JSON.stringify([p.branch,p.division,month]);
    branchTotals.set(bk,(branchTotals.get(bk)||0)+v);
    divisionTotals.set(dk,(divisionTotals.get(dk)||0)+v);
   }
   // Complete derived totals only for months where all input rows have known affiliation.
   for(const [key,sum] of branchTotals){
    const [branch,month]=JSON.parse(key),k=JSON.stringify([branch,'','',month]);
    rows.push({branch,division:'',manager:'',goal_year:year,goal_month:month,actual_seats:sum,target_seats:prior.get(k)?.target_seats??null});
   }
   for(const [key,sum] of divisionTotals){
    const [branch,division,month]=JSON.parse(key),k=JSON.stringify([branch,division,'',month]);
    rows.push({branch,division,manager:'',goal_year:year,goal_month:month,actual_seats:sum,target_seats:prior.get(k)?.target_seats??null});
   }
   // Validate cancellation table before first historical write, to avoid partial imports.
   const {error:cancelTest}=await db.from('kpi_historical_cancellations').select('manager').limit(1);
   if(cancelTest)throw cancelTest;
   for(let i=0;i<rows.length;i+=200){
    const {error}=await db.from('kpi_historical_seats').upsert(rows.slice(i,i+200),{onConflict:'branch,division,manager,goal_year,goal_month'});
    if(error)throw error;
   }
   const cancelRows=cancelled.flatMap(p=>p.months.flatMap((v,i)=>v===null?[]:[{manager:p.name,goal_year:year,goal_month:i+1,cancelled_seats:v}]));
   if(cancelRows.length){const {error}=await db.from('kpi_historical_cancellations').upsert(cancelRows,{onConflict:'manager,goal_year,goal_month'});if(error)throw error;}
   await afterSave();
   el('histBulkStatus').textContent='등록 완료 · '+year+'년 개인 '+count+'건 · 지사/본부 월 합계 '+(rows.length-count)+'건 · 계약해지 '+cancelRows.length+'건. 정상 실적과 해지 실적은 분리됩니다.';
  }catch(error){el('histBulkStatus').textContent='등록 중 오류: '+error.message+' (일부 데이터가 저장됐을 수 있습니다. 확인 후 다시 실행하세요.)';}
  finally{button.disabled=false;}
 }
 el('histBulkSave').addEventListener('click',save);
 render();
 return {matchOrg};
}
