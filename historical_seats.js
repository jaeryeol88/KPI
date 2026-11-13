/* Historic seat-only figures: independent of event, signup and revenue records.
   A saved figure REPLACES the live value for the same scope and month, never adds to it. */
export const historicalKey=(branch,division='',manager='',year,month)=>JSON.stringify([String(branch||''),String(division||''),String(manager||''),Number(year),Number(month)]);
export const historicValue=(rows,branch,division,manager,year,month,field)=>{
 const row=rows.find(x=>historicalKey(x.branch,x.division,x.manager,x.goal_year,x.goal_month)===historicalKey(branch,division,manager,year,month));
 return row&&row[field]!==null&&row[field]!==undefined?Number(row[field]):null;
};
export const historicalPast=(year,month)=>{
 const now=new Date();return Number(year)<now.getFullYear()||(Number(year)===now.getFullYear()&&Number(month)<now.getMonth()+1);
};

/**
 * Aggregate past-month seat-only edits bottom-up:
 * person overrides the same person's dated signups; division and branch recalculate
 * from corrected children. A direct division/branch figure is used only until a
 * more detailed edited child exists. No event or revenue rows are altered.
 */
export function historicalActualSeats({history=[],events=[],branch,year,month,division='all',normalizeDivision=v=>String(v||'').trim(),timedSignupRows}){
 const y=Number(year),m=Number(month);
 const records=history.filter(h=>h.branch===branch&&Number(h.goal_year)===y&&Number(h.goal_month)===m&&h.actual_seats!==null&&h.actual_seats!==undefined);
 const direct=(d,manager='')=>{
  const h=records.find(x=>(x.division||'')===d&&(x.manager||'')===manager);
  return h?Number(h.actual_seats):null;
 };
 const liveByDivision=new Map(),liveByPerson=new Map();
 for(const event of events)for(const row of timedSignupRows(event,y,[m])){
  if((row.branch||event.branch)!==branch)continue;
  const d=normalizeDivision(row.division||event.division)||'';
  const name=String(row.manager||'').trim()||'담당자 미지정';
  liveByDivision.set(d,(liveByDivision.get(d)||0)+Number(row.seats||0));
  const key=JSON.stringify([d,name]);
  liveByPerson.set(key,(liveByPerson.get(key)||0)+Number(row.seats||0));
 }
 function divisionActual(d){
  const corrected=records.filter(h=>(h.division||'')===d&&h.manager);
  if(corrected.length){
   const correction=corrected.reduce((sum,h)=>sum+Number(h.actual_seats)-(liveByPerson.get(JSON.stringify([d,h.manager]))||0),0);
   return {value:(liveByDivision.get(d)||0)+correction,detailed:true};
  }
  const manual=direct(d);
  return {value:manual??(liveByDivision.get(d)||0),detailed:manual!==null};
 }
 if(division!=='all')return divisionActual(division).value;
 const divs=new Set([...liveByDivision.keys(),...records.map(h=>h.division||'').filter(Boolean)]);
 let sum=liveByDivision.get('')||0,hasDetailed=false;
 for(const d of divs){
  if(!d)continue;
  const result=divisionActual(d);
  sum+=result.value;
  if(result.detailed)hasDetailed=true;
 }
 // Person edits with no division still correct the branch-only live total.
 const directPerson=records.filter(h=>!h.division&&h.manager);
 if(directPerson.length){
  sum+=directPerson.reduce((n,h)=>n+Number(h.actual_seats)-(liveByPerson.get(JSON.stringify(['',h.manager]))||0),0);
  hasDetailed=true;
 }
 return hasDetailed?sum:(direct('')??sum);
}
