/* The same branch/division KPI matrix is used in administrator and all public viewers.
   All values are supplied by the caller; this module never accesses credentials or saves data. */
export function renderPerformanceMatrix({branches,year,highlight=0,getGoal,getActual,escape,divisionOptions=['1본부','2본부','3본부','지사장','기타']}){
 const months=Array.from({length:12},(_,i)=>i+1);
 const formatNumber=n=>Number(n||0).toLocaleString('ko-KR');
 const formatRate=(goal,actual,defined)=>!defined||goal===0?'—':(actual/goal*100).toFixed(1)+'%';
 // Full-year totals include January–December. The year-to-date column is
 // limited to the current calendar month for this year (all 12 for past years).
 const now=new Date(),yearNumber=Number(year);
 const throughMonth=yearNumber<now.getFullYear()?12:yearNumber===now.getFullYear()?now.getMonth()+1:0;
 const heading='<tr><th colspan="3">구분</th><th title="1월~12월 전체 기간">합계(평균)<small style="display:block;font-size:10px;font-weight:500">1~12월</small></th><th title="조회 연도의 현재 월까지 집계">현재 월까지<br>합계(평균)<small style="display:block;font-size:10px;font-weight:500">1~'+(throughMonth?throughMonth+'월':'미도래')+'</small></th>'+months.map(m=>'<th class="'+(highlight===m?'perf-active-month':'')+'">'+m+'월</th>').join('')+'</tr>';
  const cols=(goals,actuals,kind)=>{
  const defined=goals.some(v=>v!==null);
  const sumGoal=goals.reduce((n,v)=>n+(v===null?0:v),0);
  const sumActual=actuals.reduce((n,v)=>n+v,0);
  const ytdGoal=goals.slice(0,throughMonth);
  const ytdActual=actuals.slice(0,throughMonth);
  const ytdDefined=ytdGoal.some(v=>v!==null);
  const ytdSumGoal=ytdGoal.reduce((n,v)=>n+(v??0),0);
  const ytdSumActual=ytdActual.reduce((n,v)=>n+v,0);
  const format=(g,a,has)=>{
   if(kind==='목표')return has?formatNumber(g):'—';
   if(kind==='실적')return formatNumber(a);
   return formatRate(g,a,has);
  };
  const className=(g,a,has)=>{
   if(kind==='실적')return a?'perf-actual':'perf-zero';
   if(kind==='달성률')return has&&g>0&&a>=g?'perf-good':(!has?'perf-missing':'');
   return !has?'perf-missing':'perf-goal';
  };
  const totalText=format(sumGoal,sumActual,defined);
  const totalCls=className(sumGoal,sumActual,defined);
  const ytdText=throughMonth?format(ytdSumGoal,ytdSumActual,ytdDefined):'—';
  const ytdCls=throughMonth?className(ytdSumGoal,ytdSumActual,ytdDefined):'perf-missing';
  return '<td class="'+totalCls+'">'+totalText+'</td><td class="'+ytdCls+'">'+ytdText+'</td>'+months.map((m,i)=>{
   const exists=goals[i]!==null;
   const value=format(goals[i]??0,actuals[i],exists);
   return '<td class="'+className(goals[i]??0,actuals[i],exists)+(highlight===m?' perf-active-month':'')+'">'+value+'</td>';
  }).join('');
 };
 const makeRows=(branch,division,label,rowClass,isFirst,span,goals,actuals)=>{
  return ['목표','실적','달성률'].map((kind,i)=>{
   return '<tr class="'+rowClass+'">'+(i===0&&isFirst?'<td class="perf-branch" rowspan="'+span+'">'+escape(branch)+'</td>':'')+
    (i===0?'<td class="perf-division" rowspan="3">'+escape(label)+'</td>':'')+
    '<td class="perf-kind">'+kind+'</td>'+cols(goals,actuals,kind)+'</tr>';
  }).join('');
 };
 let html='',regionGoals=months.map(()=>0),regionActuals=months.map(()=>0),regionDefined=months.map(()=>false);
 for(const branch of branches){
  // Only divisions carrying goals or actual seats appear; no example or invented teams.
  const divisions=divisionOptions.filter(d=>months.some(m=>getGoal(branch,year,m,d)!==null||getActual(branch,year,m,d)!==0));
  const divisionTotals=months.map(m=>divisions.reduce((n,d)=>n+getActual(branch,year,m,d),0));
  const branchGoals=months.map(m=>getGoal(branch,year,m,'all'));
  const branchActuals=months.map(m=>getActual(branch,year,m,'all'));
  const unknown=months.map((m,i)=>Math.max(0,branchActuals[i]-divisionTotals[i]));
  const showUnknown=unknown.some(v=>v>0);
  const groups=[...divisions.map(d=>({name:d,goals:months.map(m=>getGoal(branch,year,m,d)),actuals:months.map(m=>getActual(branch,year,m,d))}))];
  if(showUnknown)groups.push({name:'본부 미지정',goals:months.map(()=>null),actuals:unknown});
  const rowspan=3*(groups.length+1);
  groups.forEach((g,i)=>{html+=makeRows(branch,g.name,g.name,'',i===0,rowspan,g.goals,g.actuals);});
  html+=makeRows(branch,'all','지사 합계','perf-total',groups.length===0,rowspan,branchGoals,branchActuals);
  months.forEach((m,i)=>{regionGoals[i]+=branchGoals[i]??0;regionActuals[i]+=branchActuals[i];if(branchGoals[i]!==null)regionDefined[i]=true;});
 }
 if(branches.length>1){
  const goals=regionGoals.map((v,i)=>regionDefined[i]?v:null);
  html+=makeRows('권역','all','권역 합계','perf-region',true,3,goals,regionActuals);
 }

 return {heading,body:html||'<tr><td colspan="17">조회 가능한 지사 데이터가 없습니다.</td></tr>',throughMonth};
}
