/* Organization staff roster: connects existing org cards with private contact records. */
(function(){
'use strict';
const host=document.getElementById('orgStaffPage');
if(!host)return;
const orgApi=window.PLK_ORG;
if(!orgApi)throw new Error('조직관리 연결을 초기화하지 못했습니다.');
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저',dual:'본부장 겸직'};
const branches=['부산권역','부산 1지사','부산 2지사','부산 3지사','부산 4지사'];
const placeholders=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력']);
let contacts=new Map(),loaded=false,available=false,loading=null,editingId=null,staffSaving=false,showExcluded=false,importPending=[];
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
 .staff-actions button.staff-force-remove{color:#ba3549;font-weight:750}
 .staff-actions button.staff-force-remove:hover{color:#8f1d31}
 .staff-table tr.staff-excluded td{background:#fff7f7;color:#8a6c76}
 .staff-table tr.staff-excluded .staff-name{text-decoration:line-through;color:#98747c}
 .staff-tools .staff-excluded-toggle{border:1px solid #cfd9e8;color:#385372;background:#f5f8fc;border-radius:9px;padding:9px 11px;cursor:pointer;font-size:12px}
 .staff-tools .staff-excluded-toggle.active{background:#e9f1ff;border-color:#8baee8;color:#2054a4;font-weight:800}
 .staff-import-trigger{border:1px solid #bfcfea;color:#1c52ad;background:#eff5ff;border-radius:9px;padding:9px 13px;cursor:pointer;font-size:12px;font-weight:800}
 .staff-import-preview{border:1px solid #b9cde9;background:#f5f9ff;border-radius:10px;padding:13px;margin-bottom:14px;font-size:12px;line-height:1.8}
 .staff-import-preview[hidden]{display:none!important}
 .staff-import-preview button{margin:8px 8px 0 0;border:1px solid #adc4e7;background:#fff;border-radius:8px;color:#164b9b;padding:7px 11px;cursor:pointer}
 .staff-import-preview .staff-import-missing{color:#96552a;max-height:110px;overflow:auto;margin-top:7px}
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
 <div class="staff-header"><h2>PACIFIC 부산권역 임직원 명단</h2><strong id="staffTotal" class="staff-count">총 0명</strong></div>
 <div class="staff-tools"><input id="staffSearch" type="search" placeholder="성명·직급·소속 검색" aria-label="조직원 검색">
  <select id="staffBranchFilter" aria-label="지사별 검색"><option value="all">전체 지사</option></select>
  <select id="staffStatusFilter" aria-label="재직상태"><option value="all">전체 재직상태</option><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option></select>
  <button class="btn primary" type="button" id="staffAdd">+ 조직원 추가</button><button type="button" id="staffShowExcluded" class="staff-excluded-toggle">제외된 조직원 보기 (0)</button><label class="staff-import-trigger">연락처 CSV 가져오기<input id="staffImportFile" type="file" accept=".csv,text/csv" hidden></label>
 </div>
 <p id="staffMessage" class="staff-message" role="status"></p><div id="staffImportPreview" class="staff-import-preview" hidden></div>
 <div class="staff-scroll"><table class="staff-table">
  <thead><tr><th>No.</th><th>성명</th><th>직급</th><th>소속 지사</th><th>소속 본부/부서</th><th>연락처</th><th>입사년월</th><th>재직상태</th><th>관리</th></tr></thead>
  <tbody id="staffTableBody"></tbody></table></div>
 <p class="staff-tip">조직도에서 등록한 구성원도 자동으로 목록에 표시됩니다. <strong>명단 강제 삭제</strong>는 조직도 카드를 유지한 채 조직원 명단에서만 제외합니다. 제외된 조직원 보기에서 복원할 수 있습니다. 연락처는 공개뷰어에 노출하지 않습니다.</p>
 <div id="orgStaffDialog" hidden>
  <h3 id="staffFormTitle">조직원 등록</h3>
  <form id="staffForm"><div class="staff-form-grid">
   <label>성명 *<input id="staffName" maxlength="60" required></label>
   <label>직급 *<select id="staffRole" required><option value="">선택</option><option value="regional">권역대표</option><option value="branch">지사장</option><option value="division">본부장</option><option value="manager">매니저</option><option value="dual">본부장 겸직 (총인원 제외)</option></select></label>
   <label>소속 지사 *<select id="staffBranch" required></select></label>
   <label>소속 본부/부서 *<select id="staffDivision" required></select></label>
   <label>연락처<input id="staffPhone" type="tel" maxlength="30" placeholder="010-0000-0000"></label>
   <label>입사년월<input id="staffHired" type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{2}[.](0[1-9]|1[0-2])" title="26.09 형식" placeholder="26.09"></label>
   <label>재직상태<select id="staffStatus"><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option></select></label>
   <div class="staff-form-actions"><button class="btn primary" type="submit" id="staffSubmit">변경 적용 및 저장</button><button class="btn" type="button" id="staffCancel">취소</button></div>
  </div></form>
 </div>
</div>`;
const $=id=>document.getElementById(id);
const message=(v,error=false)=>{$('staffMessage').textContent=v;$('staffMessage').style.color=error?'#bd3746':'#58738c'};
function branchOf(node){
 let p=node,branch='',division='',guard=0;
 while(p&&guard++<12){
  if(p.type==='group')branch=orgApi.branchHeading(p)||branch;
  if(p.type==='root'&&!branch)branch=p.label||'부산권역';
  if(p.type==='division')division=p.label||division;
  p=p.parent?orgApi.nodes.find(n=>n.id===p.parent):null;
 }
 if(node.type==='group')branch=orgApi.branchHeading(node);
 if(node.type==='division')division=node.label;
 return {branch,division};
}
function staffEntries(includeExcluded=false){
 return orgApi.nodes.filter(n=>{
  if(!n||!['person','root','group','division'].includes(n.type))return false;
  if(n.staffHidden===true&&!includeExcluded)return false;
  const name=String(n.label||'').trim();
  if(!name||placeholders.has(name))return false;
  return n.type!=='group'&&(n.type==='person'||Boolean(orgApi.effectiveRole(n)));
 }).map(n=>{
  const hierarchy=branchOf(n),record=contacts.get(String(n.staffContactId||n.id))||{};
  const role=orgApi.effectiveRole(n);
  return {node:n,name:String(n.label||''),role,branch:hierarchy.branch,division:hierarchy.division,excluded:n.staffHidden===true,phone:record.phone||'',
   status:record.employment_status||'재직',hire:orgApi.joinYearMonth(n.joinDate)};
 }).sort((a,b)=>branches.indexOf(a.branch)-branches.indexOf(b.branch)||a.division.localeCompare(b.division,'ko')||a.name.localeCompare(b.name,'ko'));
}
function refreshTable(){
 const entries=staffEntries();
 const excluded=staffEntries(true).filter(x=>x.excluded);
 const list=showExcluded?excluded:entries;
 $('staffTotal').textContent='총 '+entries.length+'명';
 $('staffShowExcluded').textContent=showExcluded?'전체 조직원 보기':'제외된 조직원 보기 ('+excluded.length+')';
 $('staffShowExcluded').classList.toggle('active',showExcluded);
 const query=$('staffSearch').value.trim().toLocaleLowerCase('ko');
 const filter=$('staffBranchFilter').value,status=$('staffStatusFilter').value;
 const visible=list.filter(r=>(filter==='all'||r.branch===filter)&&(status==='all'||status===r.status)&&(!query||[r.name,roles[r.role]||r.node.subtitle,r.branch,r.division].join(' ').toLocaleLowerCase('ko').includes(query)));
 const can=orgApi.canEdit();
 $('staffAdd').hidden=!can;
 $('staffTableBody').innerHTML=visible.map((r,i)=>{
  const id=safe(r.node.id),st=r.status==='휴직'?'leave':r.status==='퇴사'?'left':'';
  return '<tr'+(r.excluded?' class="staff-excluded"':'')+'><td class="staff-num">'+(i+1)+'</td><td class="staff-name">'+safe(r.name)+'</td><td><span class="staff-pill">'+safe(roles[r.role]||r.node.subtitle||'미지정')+'</span></td><td>'+safe(r.branch||'—')+'</td><td>'+safe(r.division||'—')+'</td><td>'+safe(can?r.phone||'—':'비공개')+'</td><td>'+safe(r.hire||'—')+'</td><td><span class="staff-status '+st+'">'+safe(r.status)+'</span></td><td class="staff-actions">'+(can?(r.excluded?'<button type="button" data-staff-restore="'+id+'" aria-label="명단 복원">↩ 명단 복원</button>':'<button type="button" data-staff-edit="'+id+'" aria-label="수정">✎</button><button class="staff-force-remove" type="button" data-staff-exclude="'+id+'" aria-label="명단 강제 삭제">명단 강제 삭제</button><button class="staff-delete" type="button" data-staff-delete="'+id+'" aria-label="조직도 포함 삭제">♧</button>'):'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="9">'+(showExcluded?'명단에서 제외된 조직원이 없습니다.':'등록된 조직원이 없습니다. 조직도에 구성원을 등록하거나 조직원을 추가하세요.')+'</td></tr>';
 if(!loaded)message('조직원 연락처 데이터를 불러오는 중…');
 else if(!available&&can)message('연락처 저장 DB 설정이 필요합니다. Supabase SQL Editor에서 org_staff_setup.sql을 실행하세요.',true);
 else message('조직도와 연동된 조직원 정보입니다. '+(can?'명단 강제 삭제는 조직도 카드를 유지합니다.':'조회 전용'));
 $('staffShowExcluded').hidden=!can;
 const importTrigger=document.querySelector('.staff-import-trigger');if(importTrigger)importTrigger.hidden=!can;
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
   if(!orgApi.db||!orgApi.currentUser)return;
   if(!orgApi.canEdit()){available=false;loaded=true;refreshTable();return;}
   const {data,error}=await orgApi.db.from('kpi_org_staff_contacts').select('node_id,phone,employment_status');
   if(error)throw error;
   contacts=new Map((data||[]).map(row=>[String(row.node_id),row]));
   available=true;
  }catch(e){available=false;console.warn('Private staff records unavailable',e);}
  finally{loaded=true;refreshTable();loading=null;}
 })();
 return loading;
}
function divisionOptions(branch,value){
 const divs=branch==='부산권역'?orgApi.nodes.filter(n=>n.type==='root'):orgApi.nodes.filter(n=>n.type==='group'&&orgApi.branchHeading(n)===branch).flatMap(g=>[g,...orgApi.children(g.id).filter(n=>n.type==='division')]);
 $('staffDivision').innerHTML=divs.map(d=>'<option value="'+safe(d.id)+'">'+safe(d.type==='root'?'권역 직속 (권역대표 등)':d.type==='group'?'지사 직속 (지사장 등)':d.label)+'</option>').join('');
 if(value&&divs.some(d=>d.id===value))$('staffDivision').value=value;
}
function openForm(id=null){
 if(!orgApi.canEdit())return;
 const node=id?orgApi.nodes.find(x=>String(x.id)===String(id)):null;
 editingId=node?String(node.id):null;
 $('orgStaffDialog').hidden=false;
 $('staffFormTitle').textContent=node?'조직원 정보 수정':'조직원 추가';
 $('staffName').value=node?node.label:'';
 $('staffRole').value=node?orgApi.effectiveRole(node):'manager';
 $('staffPhone').value=node?(contacts.get(String(node.staffContactId||node.id))?.phone||''):'';
 $('staffHired').value=node?orgApi.joinYearMonth(node.joinDate):'';
 $('staffStatus').value=node?(contacts.get(String(node.staffContactId||node.id))?.employment_status||'재직'):'재직';
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
 if(!orgApi.dbReady)throw new Error('조직도 저장 DB를 연결할 수 없습니다. org_chart_setup.sql 설정을 확인하세요.');
 if(!available)throw new Error('연락처 저장 DB를 연결할 수 없습니다. org_staff_setup.sql을 먼저 실행하세요.');
 const {error}=await orgApi.db.from('kpi_org_chart').upsert({id:1,nodes:orgApi.nodes,updated_at:new Date().toISOString()},{onConflict:'id'});
 if(error)throw error;
 orgApi.dirty=false;
 const {error:contactError}=await orgApi.db.from('kpi_org_staff_contacts').upsert({node_id:String(node.staffContactId||node.id),phone:record.phone,employment_status:record.employment_status,updated_at:new Date().toISOString()},{onConflict:'node_id'});
 if(contactError)throw new Error('조직도는 저장되었지만 연락처/재직상태 저장에 실패했습니다: '+contactError.message);
 contacts.set(String(node.staffContactId||node.id),{node_id:String(node.staffContactId||node.id),...record});
}
$('staffForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(staffSaving||!orgApi.canEdit())return;
 const name=$('staffName').value.trim(),role=$('staffRole').value,division=$('staffDivision').value;
 if(!name||!role){message('성명과 직급을 입력하세요.',true);return;}
 const parent=orgApi.nodes.find(n=>n.id===division&&['root','group','division'].includes(n.type));
 if(!editingId&&!parent){message('추가할 지사와 본부를 선택하세요.',true);return;}
 const date=$('staffHired').value.trim();
 if(date&&!/^[0-9]{2}[.](0[1-9]|1[0-2])$/.test(date)){message('입사년월은 26.09 형식으로 입력하세요.',true);return;}
 const oldNodes=JSON.stringify(orgApi.nodes);
 let node=editingId?orgApi.nodes.find(n=>String(n.id)===editingId):null;
 if(editingId&&!node){message('해당 구성원을 찾을 수 없습니다.',true);return;}
 if(!node){node={id:orgApi.newId(),parent:parent.id,type:'person',order:orgApi.nodes.length+1,color:'default',label:name,subtitle:'',headcountRole:role,joinDate:date};orgApi.nodes.push(node);}
 else{node.label=name;node.headcountRole=role;node.joinDate=date;if(node.type==='person')node.parent=parent?.id||node.parent;}
 staffSaving=true;$('staffSubmit').disabled=true;
 try{
  await saveNodeAndContact(node,{phone:$('staffPhone').value.trim(),employment_status:$('staffStatus').value});
  $('orgStaffDialog').hidden=true;editingId=null;
  orgApi.draw();refreshTable();message('조직원 정보가 온라인에 저장되었습니다.');
 }catch(err){
  // Avoid deleting an organization node that was saved but whose contact update failed.
  if(!String(err.message||'').includes('조직도는 저장되었지만'))orgApi.nodes=JSON.parse(oldNodes);
  orgApi.draw();refreshTable();message('저장에 실패했습니다: '+(err.message||String(err)),true);
 }finally{staffSaving=false;$('staffSubmit').disabled=false;}
});
$('staffTableBody').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-staff-edit]'),del=e.target.closest('[data-staff-delete]');
 const excludeButton=e.target.closest('[data-staff-exclude]'),restoreButton=e.target.closest('[data-staff-restore]');
 if(excludeButton||restoreButton){
  if(!orgApi.canEdit()||!orgApi.dbReady){message('조직도를 저장할 수 있는 관리자 권한과 DB 연결이 필요합니다.',true);return;}
  const button=excludeButton||restoreButton;
  const id=excludeButton?excludeButton.dataset.staffExclude:restoreButton.dataset.staffRestore;
  const node=orgApi.nodes.find(n=>String(n.id)===id);
  if(!node)return;
  const remove=Boolean(excludeButton);
  if(remove&&!confirm(node.label+' 조직원을 명단에서 강제 삭제할까요?\n\n조직도 카드는 그대로 유지되며, 제외된 조직원 보기에서 복원할 수 있습니다.'))return;
  button.disabled=true;
  const previous=node.staffHidden;
  node.staffHidden=remove;
  try{
   const {error}=await orgApi.db.from('kpi_org_chart').upsert({id:1,nodes:orgApi.nodes,updated_at:new Date().toISOString()},{onConflict:'id'});
   if(error)throw error;
   orgApi.dirty=false;orgApi.draw();refreshTable();
   message(remove?'조직도 카드는 유지하고 조직원 명단에서 제외했습니다.':'조직원을 명단에 복원했습니다.');
  }catch(err){node.staffHidden=previous;refreshTable();message('명단 변경 실패: '+(err.message||String(err)),true);}
  finally{button.disabled=false;}
  return;
 }
 if(edit){openForm(edit.dataset.staffEdit);return;}
 if(!del||!orgApi.canEdit())return;
 const node=orgApi.nodes.find(x=>String(x.id)===del.dataset.staffDelete);
 if(!node)return;
 if(node.type!=='person'){message('상위 조직 카드는 조직도 화면에서 삭제해 주세요.',true);return;}
 if(!confirm(node.label+' 조직원을 삭제할까요? 조직도에서도 삭제됩니다.'))return;
 if(!available||!orgApi.dbReady){message('먼저 조직도/조직원 DB 설정을 완료해 주세요.',true);return;}
 const previous=orgApi.nodes.slice();orgApi.nodes=orgApi.nodes.filter(n=>n.id!==node.id);
 try{
  const {error}=await orgApi.db.from('kpi_org_chart').upsert({id:1,nodes:orgApi.nodes,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
  orgApi.dirty=false;
  const {error:contactError}=await orgApi.db.from('kpi_org_staff_contacts').delete().eq('node_id',String(node.staffContactId||node.id));
  if(contactError)throw contactError;
  contacts.delete(String(node.staffContactId||node.id));orgApi.draw();refreshTable();message('조직원을 삭제했습니다.');
 }catch(err){orgApi.nodes=previous;orgApi.draw();message('삭제 실패: '+(err.message||String(err)),true);}
});

// Private CSV import: contacts never enter the public organization chart JSON or GitHub.
function normalized(s){return String(s||'').trim().replace(/\s+/g,'');}
function parseCSV(content){
 const result=[];let row=[],field='',quoted=false;
 const src=String(content||'').replace(/^\uFEFF/,'');
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(c==='"'){
   if(quoted&&src[i+1]==='"'){field+='"';i++;}
   else quoted=!quoted;
  }else if(c===','&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&src[i+1]==='\n')i++;
   row.push(field);field='';
   if(row.some(v=>v.trim()))result.push(row);
   row=[];
  }else field+=c;
 }
 if(quoted)throw Error('CSV 파일의 따옴표가 올바르게 닫히지 않았습니다.');
 row.push(field);if(row.some(v=>v.trim()))result.push(row);
 if(result.length<2)throw Error('CSV에 연락처 데이터가 없습니다.');
 const headers=result.shift().map(normalized);
 const nameColumn=headers.includes('성명(예명)')?'성명(예명)':headers.includes('성명')?'성명':headers.includes('이름')?'이름':'';
 if(!nameColumn||!headers.includes('연락처'))throw Error('CSV에 성명(예명) 또는 이름, 연락처 열이 필요합니다.');
 return result.map(cells=>{
  const row=Object.fromEntries(headers.map((name,j)=>[name,(cells[j]||'').trim()]));
  row['성명(예명)']=row[nameColumn];
  return row;
 }).filter(r=>r['성명(예명)']||r['연락처']);
}
function findImportMatches(rows){
 const entries=staffEntries(true);
 const updates=[],missing=[],ambiguous=[],seen=new Set();
 for(const row of rows){
  const name=normalized(row['성명(예명)']),branch=normalized(row['권역별']),division=normalized(row['권역내소속']);
  const phone=String(row['연락처']||'').trim();
  const role=normalized(row['호칭']);
  if(!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone)){missing.push(name+' (연락처 형식 확인 필요)');continue;}
  const found=entries.filter(entry=>{
   if(normalized(entry.name)!==name)return false;
   // A two-column name/phone file is accepted only if the name uniquely matches.
   // With a detailed file, also validate branch and division to avoid ambiguous merges.
   if(branch&&normalized(entry.branch)!==branch)return false;
   const entryDivision=normalized(entry.division);
   if(division==='지사'){if(entryDivision)return false;}
   else if(division&&entryDivision!==division)return false;
   const job={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'}[entry.role]||'';
   return !role||!job||role===job;
  });
  if(found.length===1){
   const person=found[0],id=String(person.node.staffContactId||person.node.id);
   if(seen.has(id)){ambiguous.push(name+' ('+(branch||'소속 미기재')+' / 중복 입력)');continue;}
   seen.add(id);updates.push({id,name:person.name,branch:person.branch,phone,employment_status:person.status});
  }else if(found.length===0)missing.push(name+' ('+(branch||'소속 미기재')+' / '+(division||'소속 미기재')+' · 조직도에 일치 인원 없음)');
  else ambiguous.push(name+' ('+(branch||'소속 미기재')+' / 중복 조직원 '+found.length+'명)');
 }
 return {updates,missing,ambiguous};
}
function renderImportPreview(result){
 importPending=result.updates;
 const p=$('staffImportPreview');p.hidden=false;
 p.innerHTML='<strong>연락처 일괄 등록 미리보기</strong><div>일치 '+result.updates.length+'명 · 미일치 '+result.missing.length+'명 · 중복 '+result.ambiguous.length+'명</div>'+
 (result.missing.length||result.ambiguous.length?'<div class="staff-import-missing">'+[...result.missing,...result.ambiguous].map(safe).join(' / ')+'</div>':'')+
 '<button type="button" id="staffImportApply"'+(!result.updates.length?' disabled':'')+'>일치한 '+result.updates.length+'명 연락처 저장</button><button type="button" id="staffImportCancel">취소</button>'+
 '<div>일치하지 않는 이름은 자동 생성하지 않습니다. 기존 전화번호 외 조직도와 재직 상태는 변경하지 않습니다.</div>';
 $('staffImportCancel').onclick=()=>{importPending=[];p.hidden=true;p.replaceChildren()};
 $('staffImportApply').onclick=async e=>{
  if(!orgApi.canEdit()||!available){message('관리자 로그인 또는 조직원 정보 DB 연결이 필요합니다. org_staff_setup.sql 설정을 확인하세요.',true);return;}
  if(!importPending.length)return;
  if(!confirm('일치하는 '+importPending.length+'명의 연락처를 비공개 조직원 DB에 저장할까요?'))return;
  const btn=e.currentTarget;btn.disabled=true;
  try{
   const save=importPending.map(x=>({node_id:x.id,phone:x.phone,employment_status:x.employment_status,updated_at:new Date().toISOString()}));
   const {error}=await orgApi.db.from('kpi_org_staff_contacts').upsert(save,{onConflict:'node_id'});
   if(error)throw error;
   for(const row of save)contacts.set(row.node_id,row);
   const count=save.length;importPending=[];p.hidden=true;p.replaceChildren();refreshTable();
   message('연락처 '+count+'명 저장 완료. 연락처는 관리자 전용 DB에만 보관됩니다.');
  }catch(error){message('연락처 일괄 저장 실패: '+(error.message||String(error)),true);btn.disabled=false;}
 };
}
$('staffImportFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(!orgApi.canEdit())throw Error('관리자 권한이 필요합니다.');
  if(!orgApi.loaded)await orgApi.load();
  if(!loaded)await loadContacts();
  if(!available)throw Error('org_staff_setup.sql을 실행해 연락처 저장 DB를 먼저 연결해 주세요.');
  const rows=parseCSV(await file.text());
  if(rows.length>1000)throw Error('최대 1,000명까지 일괄 등록할 수 있습니다.');
  renderImportPreview(findImportMatches(rows));
 }catch(error){message('CSV 확인 실패: '+(error.message||String(error)),true);}
 finally{e.target.value='';}
});

$('staffAdd').onclick=()=>openForm();
$('staffShowExcluded').onclick=()=>{showExcluded=!showExcluded;refreshTable();};
$('staffCancel').onclick=()=>{$('orgStaffDialog').hidden=true;editingId=null};
$('staffBranch').onchange=()=>divisionOptions($('staffBranch').value,null);
for(const id of ['staffSearch','staffBranchFilter','staffStatusFilter'])$(id).addEventListener(id==='staffSearch'?'input':'change',refreshTable);
options();
window.resetOrgStaff=function(){contacts.clear();loaded=false;available=false;loading=null;editingId=null;showExcluded=false;importPending=[];$('staffImportPreview').hidden=true;$('orgStaffDialog').hidden=true;};
window.renderOrgStaff=function(){
 if(!orgApi.loaded){orgApi.load().then(()=>{if(!loaded)loadContacts();refreshTable()});}
 else if(!loaded)loadContacts();
 else refreshTable();
};
})();
