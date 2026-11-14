import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.PLK_CONFIG||{};
const api=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const sessionKey='plk_viewer_pin_session';
let token='';
const logout=async()=>{if(token)await api.rpc('kpi_viewer_logout',{p_token:token});sessionStorage.removeItem(sessionKey);location.reload();};
function mountLogin(){
 const style=document.createElement('style');style.textContent='#plkLoginGate{position:fixed;inset:0;z-index:2147483647;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Pretendard,"Malgun Gothic",sans-serif;color:#172840}#plkLoginGate .login-card{width:min(100%,400px);padding:35px 28px;background:white;border:1px solid #dce5f0;border-radius:16px}#plkLoginGate h1{font-size:25px;margin:0 0 10px;color:#0b2040}#plkLoginGate p{font-size:13px;color:#65768e;margin:0 0 22px}#plkLoginGate label{display:block;font-size:13px;font-weight:650;margin:14px 0 5px}#plkLoginGate input{width:100%;padding:13px;border:1px solid #dce5f0;border-radius:8px;font:inherit}#plkLoginGate button{width:100%;padding:13px;border:0;border-radius:8px;background:#145dc5;color:#fff;font-weight:700;margin-top:20px;cursor:pointer}#plkLoginGate .login-error{color:#c03434;margin-top:12px;font-size:13px}';
 document.head.append(style);
 const root=document.createElement('div');root.id='plkLoginGate';
 root.innerHTML='<div class="login-card"><h1>PLK KPI</h1><p>뷰어 전용 로그인 · 발급받은 아이디와 비밀번호를 입력하세요.</p><form id="plkLoginForm"><label for="plkViewerUsername">아이디</label><input id="plkViewerUsername" autocomplete="username" required><label for="plkViewerPin">비밀번호 (숫자 4자리)</label><input id="plkViewerPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required><button type="submit">로그인</button><div id="plkLoginError" class="login-error" role="status"></div></form></div>';
 document.body.append(root);return root;
}
function adapter(){
 function builder(source){
  const q={filters:[],single:false,start:0,end:null};
  const chain={
   select(){return chain},order(){return chain},eq(k,v){q.filters.push([k,v]);return chain},
   limit(n){q.end=n-1;return chain},range(a,b){q.start=a;q.end=b;return chain},
   maybeSingle(){q.single=true;return chain},
   then(resolve,reject){return api.rpc('kpi_viewer_read',{p_token:token,p_source:source}).then(({data,error})=>{
     if(error){if(/만료|로그인/.test(error.message||'')){sessionStorage.removeItem(sessionKey);location.reload();}return {data:null,error};}
     let rows=Array.isArray(data)?data:[];
     for(const [k,v] of q.filters)rows=rows.filter(r=>String(r[k])===String(v));
     if(q.end!==null)rows=rows.slice(q.start,q.end+1);else if(q.start)rows=rows.slice(q.start);
     return {data:q.single?(rows[0]||null):rows,error:null};
    }).then(resolve,reject);}
  };return chain;
 }
 return {from:builder,rpc:(name,args={})=>{
  if(name==='kpi_manager_performance_signups')return builder(name);
  if(name==='kpi_viewer_branch_staff_phones')return api.rpc(name,{...args,p_token:token});
  return api.rpc(name,args);
 }};
}
export async function startViewerGate(kind,branch=null){
 const root=mountLogin();
 const key=kind==='manager'?'manager':branch?'branch:'+branch:'all';
 function allowed(user){return !!user&&(kind==='manager'?user.role==='manager':branch?user.role==='branch'&&user.branch===branch:user.role==='all');}
 const stored=sessionStorage.getItem(sessionKey);
 if(stored){try{const parsed=JSON.parse(stored);token=parsed.token||'';const {data,error}=await api.rpc('kpi_viewer_whoami',{p_token:token});if(!error&&allowed(data)){root.remove();return adapter();}}catch{}sessionStorage.removeItem(sessionKey);token='';}
 return new Promise(resolve=>{
  root.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();const btn=root.querySelector('button'),errorBox=root.querySelector('#plkLoginError');btn.disabled=true;errorBox.textContent='';
   try{
    const username=root.querySelector('#plkViewerUsername').value.trim();
    const password=root.querySelector('#plkViewerPin').value;
    const {data,error}=await api.rpc('kpi_viewer_login',{p_username:username,p_password:password});
    if(error)throw error;
    if(data?.error)throw Error(data.error);
    if(!allowed(data)){await api.rpc('kpi_viewer_logout',{p_token:data.token});throw Error('이 뷰어에 접근할 권한이 없습니다.');}
    token=data.token;sessionStorage.setItem(sessionKey,JSON.stringify({token,key}));root.remove();resolve(adapter());
   }catch(e){errorBox.textContent=e.message||'로그인에 실패했습니다.';}finally{btn.disabled=false;}
  });
 });
}
export function installViewerLogout(){
 const btn=document.createElement('button');btn.type='button';btn.textContent='뷰어 로그아웃';btn.className='btn';btn.style.cssText='position:fixed;bottom:14px;right:14px;z-index:999;background:#fff;color:#145dc5;border:1px solid #cbd7e7;border-radius:8px;padding:9px 13px;cursor:pointer';
 btn.addEventListener('click',logout);document.body.append(btn);
}
