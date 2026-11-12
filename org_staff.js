/* Organization staff roster: connects existing org cards with private contact records. */
(function(){
'use strict';
const host=document.getElementById('orgStaffPage');
if(!host)return;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'};
const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
const placeholders=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀']);
let contacts=new Map(),loaded=false,available=false,loading=null,editingId=null,staffSaving=false;
const style=document.createElement('style');
style.textContent=`
 #orgStaffPage[hidden],#orgStaffDialog[hidden]{display:none!important}
 .staff-shell{border:1px solid #e2e9f3;border-radius:13px;background:#fff;padding:18px}
 .staff-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid #e7ecf3;padding-bottom:14px;margin-bottom:14px}
 .staff-header h2{margin:0;font-size:18px;color:#182d4d}
 .staff-header h2:before{content:'♧';color:#2361dd;margin-right:8px}
 .staff-header .staff-count{background:#e9f1ff;color:#215ddd;border-radius:7px;padding:6px 10px;font-size:13px;font-weight:850}
 .staff-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 12px}
 .staff-tools input,.staff-tools select{border:1px solid #d4deec;border-radius:9px;padding:9px 12px;min-height:39px;background:white;max-width:220px}
 .staff-scroll{overflow:auto;border:1px solid #e2e8f0;border-radius:11px}
 .staff-table{border-collapse:collapse;min-width:1150px;width:100%;font-size:12px}
 .staff-table th{background:#f7f9fc;color:#526179;font-size:12px;font-weight:800;padding:15px 8px;border-bottom:1px solid #dce5f2;text-align:center}
 .staff-table td{padding:13px 8px;text-align:center;border-bottom:1px solid #eef2f8;color:#364962}
 .staff-table tbody tr:hover{background:#f8fbff}
 .staff-table .staff-num{color:#8ea0bb}.staff-table .staff-name{font-size:13px;color:#14253f;font-weight:800}
 .staff-pill{display:inline-block;color:#235fe0;background:#edf4ff;border:1px solid #cfddf5;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:800}
 .staff-status{display:inline-block;color:#2158cc;background:#eff5ff;border:1px solid #cbdcff;border-radius:18px;font-weight:750;padding:2px 9px}
 .staff-status.leave{color:#9c6700;background:#fff7e2;border-color:#ffe0a0}
 .staff-status.left{color:#8691a0;background:#eff2f5;border-color:#dce2e9}
 .staff-actions{white-space:nowrap}.staff-actions button{border:0;background:transparent;color:#6d87ab;padding:5px 6px;cursor:pointer}
 .staff-actions button:hover{color:#195bd4}.staff-actions button.staff-delete:hover{color:#bb3542}
 .staff-tip{margin:12px 1px 0;color:#71819a;font-size:12px;line-height:1.7}
 .staff-message{font-size:12px;color:#57718c;margin:6px 0 10px}
 #orgStaffDialog{margin-top:16px;border:1px solid #cddcf0;border-radius:13px;padding:17px;background:#fafcff}
 #orgStaffDialog h3{margin:0 0 16px;font-size:17px;color:#18365f}
 .staff-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
 .staff-form-grid label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#435875;font-weight:700}
 .staff-form-grid input,.staff-form-grid select{width:100%;border-radius:8px;border:1px solid #cfdbea;padding:10px;background:#fff;min-width:0}
 .staff-form-actions{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}
 @media(max-width:780px){.staff-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:540px){.staff-form-grid{grid-template-columns:1fr}}
`;
document.head.appendChild(style);
host.innerHTML=`
<div class="staff-shell">
 <div class="staff-header"><h2>PACIFIC 호남권역 임직원 명단</h2><strong id="staffTotal" class="staff-count">총 0명</strong></div>
 <div class="staff-tools"><input id="staffSearch" type="search" placeholder="성명·직급·소속 검색" aria-label="조직원 검색">
  <select id="staffBranchFilter" aria-label="지사별 검색"><option value="all">전체 지사</option></select>
  <select id="staffStatusFilter" aria-label="재직상태"><option value="all">전체 재직상태</option><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option></select>
  <button class="btn primary" type="button" id="staffAdd">+ 조직원 추가</button>
 </div>
 <p id="staffMessage" class="staff-message" role="status"></p>
 <div class="staff-scroll"><table class="staff-table">
  <thead><tr><th>No.</th><th>성명</th><th>직급</th><th>소속 지사</th><th>소속 본부/부서</th><th>연락처</th><th>입사년월</th><th>재직상태</th><th>관리</th></tr></thead>
  <tbody id="staffTableBody"></tbody></table></div>
 <p class="staff-tip">조직도에서 등록한 구성원도 자동으로 목록에 표시됩니다. 성명·직급·소속·입사연월 변경은 조직도에도 반영됩니다. 연락처는 공개뷰어에 노출하지 않습니다.</p>
 <div id="orgStaffDialog" hidden>
  <h3 id="staffFormTitle">조직원 등록</h3>
  <form id="staffForm"><div class="staff-form-grid">
   <label>성명 *<input id="staffName" maxlength="60" required></label>
   <label>직급 *<select id="staffRole" required><option value="">선택</option><option value="regional">권역대표</option><option value="branch">지사장</option><option value="division">본부장</option><option value="manager">매니저</option></select></label>
   <label>소속 지사 *<select id="staffBranch" required></select></label>
   <label>소속 본부/부서 *<select id="staffDivision" required></select></label>
   <label>연락처<input id="staffPhone" type="tel" maxlength="30" placeholder="010-0000-0000"></label>
   <label>입사년월<input id="staffHired" type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{2}[.](0[1-9]|1[0-2])" title="26.09 형식" placeholder="26.09"></label>
   <label>재직상태<select id="staffStatus"><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option></select></label>
   <div class="staff-form-actions"><button class="btn primary" type="submit" id="staffSubmit">변경 적용 및 저장</button><button class="btn" type="button" id="staffCancel">취소</button></div>
  </div></form>
 </div>
</div>`;
host.querySelector('.staff-header h2').textContent='PACIFIC 부산권역 임직원 명단';
const $=id=>document.getElementById(id);
const message=(v,error=false)=>{$('staffMessage').textContent=v;$('staffMessage').style.color=error?'#bd3746':'#58738c'};
function branchOf(node){
 let p=node,branch='',division='',guard=0;
 while(p&&guard++<12){
  if(p.type==='group')branch=p.label||branch;
  if(p.type==='division')division=p.label||division;
  p=p.parent?orgNodes.find(n=>n.id===p.parent):null;
 }
 if(node.type==='group')branch=node.label;
 if(node.type==='division')division=node.label;
 return {branch,division};
}
function staffEntries(){
 return orgNodes.filter(n=>{
  if(!n||!['person','root','group','division'].includes(n.type))return false;
  const name=String(n.label||'').trim();
  if(!name||placeholders.has(name))return false;
  return n.type==='person'||Boolean(orgEffectiveRole(n));
 }).map(n=>{
  const hierarchy=branchOf(n),record=contacts.get(String(n.id))||{};
  const role=orgEffectiveRole(n);
  return {node:n,name:String(n.label||''),role,branch:hierarchy.branch,division:hierarchy.division,phone:record.phone||'',
   status:record.employment_status||'재직',hire:orgJoinYearMonth(n.joinDate)};
 }).sort((a,b)=>branches.indexOf(a.branch)-branches.indexOf(b.branch)||a.division.localeCompare(b.division,'ko')||a.name.localeCompare(b.name,'ko'));
}
function refreshTable(){
 const entries=staffEntries();
 $('staffTotal').textContent='총 '+entries.length+'명';
 const query=$('staffSearch').value.trim().toLocaleLowerCase('ko');
 const filter=$('staffBranchFilter').value,status=$('staffStatusFilter').value;
 const visible=entries.filter(r=>(filter==='all'||r.branch===filter)&&(status==='all'||status===r.status)&&(!query||[r.name,roles[r.role]||r.node.subtitle,r.branch,r.division].join(' ').toLocaleLowerCase('ko').includes(query)));
 const can=orgCanEdit();
 $('staffAdd').hidden=!can;
 $('staffTableBody').innerHTML=visible.map((r,i)=>{
  const id=safe(r.node.id),st=r.status==='휴직'?'leave':r.status==='퇴사'?'left':'';
  return '<tr><td class="staff-num">'+(i+1)+'</td><td class="staff-name">'+safe(r.name)+'</td><td><span class="staff-pill">'+safe(roles[r.role]||r.node.subtitle||'미지정')+'</span></td><td>'+safe(r.branch||'—')+'</td><td>'+safe(r.division||'—')+'</td><td>'+safe(can?r.phone||'—':'비공개')+'</td><td>'+safe(r.hire||'—')+'</td><td><span class="staff-status '+st+'">'+safe(r.status)+'</span></td><td class="staff-actions">'+(can?'<button type="button" data-staff-edit="'+id+'" aria-label="수정">✎</button><button class="staff-delete" type="button" data-staff-delete="'+id+'" aria-label="삭제">♧</button>':'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="9">등록된 조직원이 없습니다. 조직도에 구성원을 등록하거나 조직원을 추가하세요.</td></tr>';
 if(!loaded)message('조직원 연락처 데이터를 불러오는 중…');
 else if(!available&&can)message('연락처 저장 DB 설정이 필요합니다. Supabase SQL Editor에서 org_staff_setup.sql을 실행하세요.',true);
 else message('조직도와 연동된 조직원 정보입니다. '+(can?'추가·수정·삭제 후 온라인에 바로 저장합니다.':'조회 전용'));
}
function options(){
 const select=$('staffBranchFilter'),current=select.value;
 select.innerHTML='<option value="all">전체 지사</option>'+branches.map(b=>'<option value="'+safe(b)+'">'+safe(b)+'</option>').join('');
 select.value=branches.includes(current)?current:'all';
}
async function loadContacts(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(!db||!currentUser)return;
   if(!orgCanEdit()){available=false;loaded=true;refreshTable();return;}
   const {data,error}=await db.from('kpi_org_staff_contacts').select('node_id,phone,employment_status');
   if(error)throw error;
   contacts=new Map((data||[]).map(row=>[String(row.node_id),row]));
   available=true;
  }catch(e){available=false;console.warn('Private staff records unavailable',e);}
  finally{loaded=true;refreshTable();loading=null;}
 })();
 return loading;
}
function divisionOptions(branch,value){
 const branchGroups=orgNodes.filter(n=>n.type==='group'&&n.label===branch);
 const divs=branchGroups.flatMap(g=>orgChildren(g.id).filter(n=>n.type==='division'));
 $('staffDivision').innerHTML=divs.map(d=>'<option value="'+safe(d.id)+'">'+safe(d.label)+'</option>').join('');
 if(value&&divs.some(d=>d.id===value))$('staffDivision').value=value;
}
function openForm(id=null){
 if(!orgCanEdit())return;
 const node=id?orgNodes.find(x=>String(x.id)===String(id)):null;
 editingId=node?String(node.id):null;
 $('orgStaffDialog').hidden=false;
 $('staffFormTitle').textContent=node?'조직원 정보 수정':'조직원 추가';
 $('staffName').value=node?node.label:'';
 $('staffRole').value=node?orgEffectiveRole(node):'manager';
 $('staffPhone').value=node?(contacts.get(String(node.id))?.phone||''):'';
 $('staffHired').value=node?orgJoinYearMonth(node.joinDate):'';
 $('staffStatus').value=node?(contacts.get(String(node.id))?.employment_status||'재직'):'재직';
 const grp=node?branchOf(node):{branch:'부산 1지사'};
 $('staffBranch').innerHTML=branches.map(b=>'<option value="'+safe(b)+'">'+safe(b)+'</option>').join('');
 $('staffBranch').value=branches.includes(grp.branch)?grp.branch:branches[0];
 divisionOptions($('staffBranch').value,node?.type==='person'?node.parent:null);
 $('staffDivision').disabled=Boolean(node&&node.type!=='person');
 $('staffBranch').disabled=Boolean(node&&node.type!=='person');
 $('staffName').focus();
 $('orgStaffDialog').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function saveNodeAndContact(node,record){
 if(!orgDbReady)throw new Error('조직도 저장 DB를 연결할 수 없습니다. org_chart_setup.sql 설정을 확인하세요.');
 if(!available)throw new Error('연락처 저장 DB를 연결할 수 없습니다. org_staff_setup.sql을 먼저 실행하세요.');
 const {error}=await db.from('kpi_org_chart').upsert({id:1,nodes:orgNodes,updated_at:new Date().toISOString()},{onConflict:'id'});
 if(error)throw error;
 orgDirty=false;
 const {error:contactError}=await db.from('kpi_org_staff_contacts').upsert({node_id:String(node.id),phone:record.phone,employment_status:record.employment_status,updated_at:new Date().toISOString()},{onConflict:'node_id'});
 if(contactError)throw contactError;
 contacts.set(String(node.id),{node_id:String(node.id),...record});
}
$('staffForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(staffSaving||!orgCanEdit())return;
 const name=$('staffName').value.trim(),role=$('staffRole').value,division=$('staffDivision').value;
 if(!name||!role){message('성명과 직급을 입력하세요.',true);return;}
 const parent=orgNodes.find(n=>n.id===division&&n.type==='division');
 if(!editingId&&!parent){message('추가할 지사와 본부를 선택하세요.',true);return;}
 const date=$('staffHired').value.trim();
 if(date&&!/^[0-9]{2}[.](0[1-9]|1[0-2])$/.test(date)){message('입사년월은 26.09 형식으로 입력하세요.',true);return;}
 const oldNodes=JSON.stringify(orgNodes);
 let node=editingId?orgNodes.find(n=>String(n.id)===editingId):null;
 if(editingId&&!node){message('해당 구성원을 찾을 수 없습니다.',true);return;}
 if(!node){node={id:orgNewId(),parent:parent.id,type:'person',order:orgNodes.length+1,color:'default',label:name,subtitle:'',headcountRole:role,joinDate:date};orgNodes.push(node);}
 else{node.label=name;node.headcountRole=role;node.joinDate=date;if(node.type==='person')node.parent=parent?.id||node.parent;}
 staffSaving=true;$('staffSubmit').disabled=true;
 try{
  await saveNodeAndContact(node,{phone:$('staffPhone').value.trim(),employment_status:$('staffStatus').value});
  $('orgStaffDialog').hidden=true;editingId=null;
  orgDraw();refreshTable();message('조직원 정보가 온라인에 저장되었습니다.');
 }catch(err){
  // Avoid deleting an organization node that was saved but whose contact update failed.
  if(!String(err.message||'').includes('연락처')){orgNodes=JSON.parse(oldNodes);}
  refreshTable();message('저장에 실패했습니다: '+(err.message||String(err)),true);
 }finally{staffSaving=false;$('staffSubmit').disabled=false;}
});
$('staffTableBody').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-staff-edit]'),del=e.target.closest('[data-staff-delete]');
 if(edit){openForm(edit.dataset.staffEdit);return;}
 if(!del||!orgCanEdit())return;
 const node=orgNodes.find(x=>String(x.id)===del.dataset.staffDelete);
 if(!node)return;
 if(node.type!=='person'){message('상위 조직 카드는 조직도 화면에서 삭제해 주세요.',true);return;}
 if(!confirm(node.label+' 조직원을 삭제할까요? 조직도에서도 삭제됩니다.'))return;
 if(!available||!orgDbReady){message('먼저 조직도/조직원 DB 설정을 완료해 주세요.',true);return;}
 const previous=orgNodes.slice();orgNodes=orgNodes.filter(n=>n.id!==node.id);
 try{
  const {error}=await db.from('kpi_org_chart').upsert({id:1,nodes:orgNodes,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
  orgDirty=false;
  const {error:contactError}=await db.from('kpi_org_staff_contacts').delete().eq('node_id',String(node.id));
  if(contactError)throw contactError;
  contacts.delete(String(node.id));orgDraw();refreshTable();message('조직원을 삭제했습니다.');
 }catch(err){orgNodes=previous;orgDraw();message('삭제 실패: '+(err.message||String(err)),true);}
});
$('staffAdd').onclick=()=>openForm();
$('staffCancel').onclick=()=>{$('orgStaffDialog').hidden=true;editingId=null};
$('staffBranch').onchange=()=>divisionOptions($('staffBranch').value,null);
for(const id of ['staffSearch','staffBranchFilter','staffStatusFilter'])$(id).addEventListener(id==='staffSearch'?'input':'change',refreshTable);
options();
window.renderOrgStaff=function(){
 if(!orgLoaded){orgLoad().then(()=>{if(!loaded)loadContacts();refreshTable()});}
 else if(!loaded)loadContacts();
 else refreshTable();
};
})();
