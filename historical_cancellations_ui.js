/* Contract cancellations are shown separately and never included in active-seat totals. */
export function cancellationPanel(host,opts={}){
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');
 panel.style.cssText='margin-top:16px;padding:14px;border:1px solid #e1e7ef;border-radius:10px;background:#fff';
 panel.innerHTML='<h3 style="font-size:15px;margin:0 0 8px">계약해지 · 별도 현황</h3><p style="margin:0 0 10px;font-size:12px;color:#68788b">정상 실적·매출·달성률에 합산하지 않습니다. 엑셀에 지사/본부 정보가 없는 계약해지자는 별도로 구분합니다.</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="padding:8px;background:#f3f6fb">성명</th><th style="padding:8px;background:#f3f6fb">월</th><th style="padding:8px;background:#f3f6fb">계약해지 구좌</th><th style="padding:8px;background:#f3f6fb">구분</th></tr></thead><tbody></tbody></table></div>';
 host.append(panel);
 const tbody=panel.querySelector('tbody');
 let rows=[];
 function render(year,months=null){
  const set=months?new Set(months.map(Number)):null;
  const data=rows.filter(x=>Number(x.goal_year)===Number(year)&&(!set||set.has(Number(x.goal_month)))).sort((a,b)=>Number(a.goal_month)-Number(b.goal_month)||a.manager.localeCompare(b.manager,'ko'));
  panel.hidden=opts.hiddenWhenEmpty?data.length===0:false;
  tbody.innerHTML=data.length?data.map(r=>'<tr style="border-top:1px solid #ecf0f5"><td style="padding:8px;text-align:center">'+safe(r.manager)+'</td><td style="padding:8px;text-align:center">'+Number(r.goal_month)+'월</td><td style="padding:8px;text-align:center;font-weight:800">'+Number(r.cancelled_seats).toLocaleString('ko-KR')+'구좌</td><td style="padding:8px;text-align:center">계약해지</td></tr>').join(''):'<tr><td colspan="4" style="padding:10px;text-align:center;color:#758194">선택한 기간의 계약해지 기록이 없습니다.</td></tr>';
 }
 return {setRows(data){rows=Array.isArray(data)?data:[]},render};
}
