/* Signup attribution: event day is NOT signup day.
   Old entries without signupDate remain undated until an administrator supplies it. */
export function validSignupDate(value){
 const date=String(value||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
 const [year,month,day]=date.split('-').map(Number);
 if(year<2020||year>2100||month<1||month>12||day<1||day>31)return '';
 const actual=new Date(Date.UTC(year,month-1,day));
 return actual.getUTCFullYear()===year&&actual.getUTCMonth()===month-1&&actual.getUTCDate()===day?date:'';
}
export function timedSignupRows(event,year=null,months=null){
 if(!Array.isArray(event?.signupEntries))return [];
 const allowedMonths=months==null?null:new Set((Array.isArray(months)?months:[months]).map(Number));
 return event.signupEntries.filter(row=>{
  if(!row||row.withdrawn||!['corporate','individual'].includes(row.group)||!Number.isSafeInteger(row.seats)||row.seats<0)return false;
  const date=validSignupDate(row.signupDate);
  return Boolean(date)&&(year==null||Number(date.slice(0,4))===Number(year))&&(!allowedMonths||allowedMonths.has(Number(date.slice(5,7))));
 });
}
export function signupSeatsForPeriod(events,{years=null,months=null,branches=null,divisions=null,normalizeDivision=v=>String(v||'').trim()}={}){
 const allowedYears=years==null?null:new Set((Array.isArray(years)?years:[years]).map(Number));
 const allowedMonths=months==null?null:new Set((Array.isArray(months)?months:[months]).map(Number));
 const allowedBranches=branches==null?null:new Set(branches);
 const allowedDivisions=divisions==null?null:new Set(divisions.map(normalizeDivision));
 let total=0;
 for(const event of events){
  for(const row of timedSignupRows(event)){
   const date=row.signupDate;
   if(allowedYears&&!allowedYears.has(Number(date.slice(0,4))))continue;
   if(allowedMonths&&!allowedMonths.has(Number(date.slice(5,7))))continue;
   const branch=row.branch||event.branch,division=normalizeDivision(row.division||event.division);
   if(allowedBranches&&!allowedBranches.has(branch))continue;
   if(allowedDivisions&&!allowedDivisions.has(division))continue;
   total+=row.seats;
  }
 }
 return total;
}
export function undatedSignupStats(events){
 let records=0,seats=0,legacyEvents=0;
 for(const event of events){
  if(Array.isArray(event.signupEntries)){
   for(const row of event.signupEntries){
    if(row&&['corporate','individual'].includes(row.group)&&Number.isSafeInteger(row.seats)&&row.seats>=0&&!validSignupDate(row.signupDate)){
     records++;seats+=row.seats;
    }
   }
  }else if(Number(event.done)>0){legacyEvents++;}
 }
 return {records,seats,legacyEvents};
}

/* Revenue is recognized by scheduled installment month, not all on signup day.
   Month 1 = signup month; following installments = subsequent calendar months.
   Withdrawn contracts contribute neither seats nor future installment revenue. */
export function installmentRevenueForMonth(row,year,month){
 if(!row||row.withdrawn)return 0;
 const date=validSignupDate(row.signupDate);
 if(!date)return 0;
 const offset=(Number(year)-Number(date.slice(0,4)))*12+Number(month)-Number(date.slice(5,7));
 if(offset<0)return 0;
 if(row.paymentType==='installment'&&Array.isArray(row.installmentAmounts)&&row.installmentAmounts.length){
  const amount=row.installmentAmounts[offset];
  return Number.isSafeInteger(amount)&&amount>=0?amount:0;
 }
 return offset===0?(Number.isSafeInteger(row.revenue)&&row.revenue>=0?row.revenue:0):0;
}
export function monthlyRecognizedRevenue(events,{year,month,branches=null,divisions=null,normalizeDivision=v=>String(v||'').trim()}={}){
 let total=0;
 for(const event of events){
  for(const row of Array.isArray(event.signupEntries)?event.signupEntries:[]){
   if(!row||!['corporate','individual'].includes(row.group))continue;
   if(branches&&!branches.includes(row.branch||event.branch))continue;
   if(divisions&&!divisions.map(normalizeDivision).includes(normalizeDivision(row.division||event.division)))continue;
   total+=installmentRevenueForMonth(row,year,month);
  }
 }
 return total;
}
