/* Shared organization headcount rules for administrator and all-manager viewer.
 * Persist dual duty in node.headcountRole = 'dual' (or use a literal 겸직
 * annotation in the name/title for legacy records). Never infer a dual duty
 * assignment merely from an employee name.
 */
export const ORG_ROLE_LABELS=Object.freeze({regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저',dual:'겸직'});
const PLACEHOLDERS=new Set(['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력']);
const DUAL_MARK=/[（(]?\s*겸\s*직\s*[)）]?/;
export function orgEffectiveRoleShared(node){
 if(Object.prototype.hasOwnProperty.call(node,'headcountRole'))
  return Object.prototype.hasOwnProperty.call(ORG_ROLE_LABELS,node.headcountRole)?node.headcountRole:'';
 if(node.type!=='person')return '';
 const title=String(node.subtitle||'').replace(/\s+/g,'');
 if(/겸직/.test(title))return 'dual';
 for(const role of ['regional','branch','division','manager']){
  if(title.includes(ORG_ROLE_LABELS[role]))return role;
 }
 return '';
}
export function orgIdentityName(value){
 return String(value||'').replace(/[（(]\s*겸\s*직\s*[)）]/g,'')
  .replace(/부산\s*[1-4]\s*지사|권역대표|지사장|본부장|매니저/g,'')
  .replace(/[^가-힣a-zA-Z]/g,'').trim();
}
export function isDualStaff(node){
 const name=orgIdentityName(node.label);
 if(!name||PLACEHOLDERS.has(String(node.label||'').trim()))return false;
 // Both confirmed branch managers remain branch managers, not dual staff.
 if(orgEffectiveRoleShared(node)==='branch'&&['박영우','안선경'].includes(name))return false;
 return node.headcountRole==='dual'||DUAL_MARK.test(String(node.label||'')+' '+String(node.subtitle||''));
}
export function countOrgHeadcount(nodes){
 const counts={regional:0,branch:0,division:0,manager:0,dual:0};
 const names=new Set(),ids=new Set();
 for(const n of nodes){
  if(!n||n.staffHidden===true||!isDualStaff(n))continue;
  const name=orgIdentityName(n.label);
  // An organizational group label or a placeholder is not a person.
  if(!name||['group','root'].includes(n.type)||/^(구성원|새구성원|이름미입력|새본부팀)$/.test(name))continue;
  names.add(name);ids.add(String(n.id));
 }
 counts.dual=names.size;
 for(const n of nodes){
  if(!n||n.staffHidden===true)continue;
  const raw=String(n.label||'').trim();
  if(!raw||PLACEHOLDERS.has(raw)||['group','root'].includes(n.type))continue;
  if(n.type!=='person'&&!Object.prototype.hasOwnProperty.call(n,'headcountRole'))continue;
  const name=orgIdentityName(n.label);
  if(ids.has(String(n.id))||(name&&names.has(name)))continue;
  const role=orgEffectiveRoleShared(n);
  if(role!=='dual'&&Object.prototype.hasOwnProperty.call(counts,role))counts[role]++;
 }
 return {...counts,total:counts.regional+counts.branch+counts.division+counts.manager};
}
