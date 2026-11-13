/* Shared roster seed for admin and all read-only individual performance screens. */
export const PERSONAL_EMPTY_NAMES=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력']);
export function rosterPerformancePeople(nodes){
 if(!Array.isArray(nodes))return [];
 const byId=new Map(nodes.filter(Boolean).map(n=>[String(n.id),n]));
 const result=[],unique=new Set();
 const normalize=v=>String(v||'').trim();
 for(const node of nodes){
  if(!node||node.staffHidden===true||!['person','division'].includes(node.type))continue;
  if(node.headcountRole==='regional'||/권역대표/.test(String(node.subtitle||'')))continue;
  const name=normalize(node.label);
  if(!name||PERSONAL_EMPTY_NAMES.has(name)||/^(?:부산\s*[1-4]\s*지사|[123]본부)$/.test(name))continue;
  // Division labels can be personnel only if explicitly assigned a job role.
  if(node.type==='division'&&!['regional','branch','division','manager'].includes(node.headcountRole))continue;
  let branch='',division='',parent=node,depth=0;
  while(parent&&depth++<16){
   if(parent.type==='division'&&parent!==node)division=normalize(parent.label);
   if(parent.type==='group'){
    branch=normalize(parent.branchName)||normalize(parent.label);
    const match=branch.match(/부산\s*([1-4])\s*지사/);
    if(match)branch='부산 '+match[1]+'지사';
   }
   if(parent.type==='root'&&!branch)branch='부산권역';
   parent=parent.parent!=null?byId.get(String(parent.parent)):null;
  }
  if(!branch)continue;
  if(node.type==='division')division=normalize(node.subtitle)||'';
  if(!division){
   if(branch==='부산권역')division='권역대표';
   else if(node.headcountRole==='branch'||/지사장/.test(String(node.subtitle||'')))division='지사장';
   else division='지사장'; // A direct branch member has no division.
  }
  const key=JSON.stringify([branch,division,name]);
  if(unique.has(key))continue;
  unique.add(key);result.push({branch,division,name});
 }
 return result;
}

// Exclude the regional representative from individual sales even when a matching signup exists.
export function regionalRepresentativeNames(nodes){
 return new Set((Array.isArray(nodes)?nodes:[]).filter(n=>n&&n.type==='person'&&n.staffHidden!==true&&
  (n.headcountRole==='regional'||(!Object.prototype.hasOwnProperty.call(n,'headcountRole')&&/권역대표/.test(String(n.subtitle||'')))))
  .map(n=>String(n.label||'').trim()).filter(Boolean));
}
