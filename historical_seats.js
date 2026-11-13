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
