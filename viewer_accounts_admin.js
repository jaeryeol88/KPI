// Admin-only viewer account management. Passwords are never fetched or displayed.
const $=id=>document.getElementById(id);
const db=()=>window.PLK_ORG?.db;
const overlay=$('viewerAccountsOverlay');
const msg=(s,error=false)=>{const e=$('vaMessage');e.textContent=s;e.style.color=error?'#b42318':'#43566f';};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let accounts=[];
const roleLabels={all:'전체 뷰어',branch:'지사별 뷰어',manager:'매니저 뷰어'};
function reset(){ $('viewerAccountsForm').reset();$('vaId').value='';$('vaBranch').disabled=true;$('vaPassword').required=true;msg('');}
function edit(id){const a=accounts.find(x=>x.id===id);if(!a)return;$('vaId').value=a.id;$('vaUsername').value=a.username;$('vaPassword').value='';$('vaPassword').required=false;$('vaRole').value=a.role;$('vaBranch').disabled=a.role!=='branch';$('vaBranch').value=a.branch||'';$('vaEnabled').checked=a.enabled;msg('수정 중: '+a.username+' (비밀번호를 바꾸지 않으려면 공란으로 유지)');}
async function reload(){const client=db();if(!client)return;const {data,error}=await client.rpc('kpi_admin_list_viewer_accounts');if(error)throw error;accounts=data||[];$('vaRows').innerHTML=accounts.map(a=>'<tr style="border-top:1px solid #e4e9f1"><td style="padding:12px">'+safe(a.username)+'</td><td>'+safe(roleLabels[a.role]||a.role)+'</td><td>'+safe(a.branch||'—')+'</td><td>'+(a.enabled?'활성':'정지')+'</td><td><button class="btn" type="button" data-edit="'+safe(a.id)+'">수정</button> <button class="btn" type="button" data-delete="'+safe(a.id)+'">삭제</button></td></tr>').join('')||'<tr><td colspan="5" style="padding:15px">등록된 계정이 없습니다.</td></tr>';}
$('viewerAccountsButton').addEventListener('click',async()=>{overlay.hidden=false;overlay.style.display='block';reset();try{await reload()}catch(e){msg('계정 조회 실패: '+e.message,true)}});
$('viewerAccountsClose').addEventListener('click',()=>{overlay.hidden=true;overlay.style.display='none'});
overlay.hidden=true;overlay.style.display='none';
$('vaRole').addEventListener('change',()=>{$('vaBranch').disabled=$('vaRole').value!=='branch';if($('vaBranch').disabled)$('vaBranch').value='';});
$('vaReset').addEventListener('click',reset);
$('viewerAccountsForm').addEventListener('submit',async e=>{e.preventDefault();const client=db();if(!client)return msg('관리자 로그인이 필요합니다.',true);if($('vaPassword').value&&!/^[0-9]{4}$/.test($('vaPassword').value))return msg('비밀번호는 숫자 4자리로 입력하세요.',true);const params={p_id:$('vaId').value||null,p_username:$('vaUsername').value.trim(),p_password:$('vaPassword').value||null,p_role:$('vaRole').value,p_branch:$('vaRole').value==='branch'?$('vaBranch').value:null,p_enabled:$('vaEnabled').checked};if(params.p_role==='branch'&&!params.p_branch)return msg('지사를 선택하세요.',true);try{msg('저장 중…');const {error}=await client.rpc('kpi_admin_save_viewer_account',params);if(error)throw error;reset();await reload();msg('계정이 저장되었습니다.')}catch(error){msg('저장 실패: '+error.message,true)}});
$('vaRows').addEventListener('click',async e=>{const editBtn=e.target.closest('[data-edit]');if(editBtn){edit(editBtn.dataset.edit);return;}const del=e.target.closest('[data-delete]');if(!del)return;const a=accounts.find(x=>x.id===del.dataset.delete);if(!a||!confirm(a.username+' 계정을 삭제하시겠습니까?'))return;try{const {error}=await db().rpc('kpi_admin_delete_viewer_account',{p_id:a.id});if(error)throw error;reset();await reload();msg('계정을 삭제했습니다.')}catch(error){msg('삭제 실패: '+error.message,true)}});
async function showForOwner(){const client=db();if(!client||!window.PLK_ORG?.currentUser)return;try{const {data,error}=await client.rpc('kpi_is_admin');$('viewerAccountsButton').hidden=!!error||data!==true;}catch{$('viewerAccountsButton').hidden=true;}}
setInterval(showForOwner,2000);
