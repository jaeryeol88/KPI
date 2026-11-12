/* Shared personal KPI sales breakdown (read-only). */
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export const emptyRevenue=()=>({sale:0,fee:0,missingSale:0,missingFee:0});
export function recordRevenue(row){
 return {sale:valid(row?.revenue)?row.revenue:0,fee:valid(row?.annualFee)?row.annualFee:0,
 missingSale:valid(row?.revenue)?0:1,missingFee:valid(row?.annualFee)?0:1};
}
export function oldRevenue(event){
 return {sale:(valid(event.corporateRevenue)?event.corporateRevenue:0)+(valid(event.individualRevenue)?event.individualRevenue:0),
 fee:valid(event.annualFee)?event.annualFee:0,
 missingSale:(valid(event.corporateRevenue)?0:1)+(valid(event.individualRevenue)?0:1),
 missingFee:valid(event.annualFee)?0:1};
}
export function addRevenue(a,b){
 return {sale:a.sale+b.sale,fee:a.fee+b.fee,missingSale:a.missingSale+b.missingSale,missingFee:a.missingFee+b.missingFee};
}
export const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
export function revenueLabel(value,missing){
 return (missing?'확인 필요'+(value?' · ':''):'')+(value||!missing?money(value):'');
}
export function clickableSeats(seats,id){
 return '<button type="button" class="personal-revenue-button" data-personal-revenue="'+id+'" title="가입구좌 매출, 연회비 매출, 총매출 확인">'+Number(seats||0).toLocaleString('ko-KR')+'구좌</button>';
}
let activeDialog=null;
function init(){
 if(document.getElementById('personalRevenueDialog'))return document.getElementById('personalRevenueDialog');
 const sheet=document.createElement('style');
 sheet.textContent='.personal-revenue-button{font:inherit;font-weight:800;color:#205bbb;cursor:pointer;border:0;background:transparent;padding:5px 3px;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;white-space:nowrap}.personal-revenue-button:hover,.personal-revenue-button:focus-visible{background:#e7f0ff;border-radius:5px;outline:2px solid #91b1e5}.personal-revenue-dialog{border:0;border-radius:16px;padding:0;max-width:calc(100vw - 30px);width:410px;background:white;color:#172b49;box-shadow:0 20px 65px #122b4a44}.personal-revenue-dialog::backdrop{background:#172b4a70}.personal-revenue-dialog .pr-heading{display:flex;align-items:center;justify-content:space-between;padding:19px 21px;border-bottom:1px solid #e1e9f5}.personal-revenue-dialog h3{font-size:18px;margin:0;color:#183c79}.personal-revenue-dialog .pr-close{background:#f5f7fb;border:1px solid #d2dfef;border-radius:8px;padding:7px 10px;cursor:pointer}.personal-revenue-dialog .pr-body{padding:15px 21px}.personal-revenue-dialog .pr-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #eaf0f6;font-size:13px}.personal-revenue-dialog .pr-row strong{font-size:16px;text-align:right;color:#2457ae;overflow-wrap:anywhere}.personal-revenue-dialog .pr-row.pr-total{background:#edf4ff;padding:12px;margin:8px -6px 0;border-radius:8px;font-weight:800}.personal-revenue-dialog .pr-row.pr-total strong{font-size:19px}.personal-revenue-dialog .pr-foot{font-size:12px;color:#7b6a5c;line-height:1.6;margin:13px 0 2px}.personal-revenue-single{font-weight:800;color:#2457ae;font-variant-numeric:tabular-nums;white-space:nowrap}.personal-revenue-single small{font-size:10px;display:block;color:#a77736}';
 document.head.appendChild(sheet);
 const dialog=document.createElement('dialog');dialog.id='personalRevenueDialog';dialog.className='personal-revenue-dialog';
 dialog.innerHTML='<div class="pr-heading"><h3 id="prTitle"></h3><button type="button" class="pr-close">닫기</button></div><div class="pr-body"><p id="prSubtitle"></p><div id="prRows"></div><p class="pr-foot" id="prFoot"></p></div>';
 dialog.querySelector('.pr-close').onclick=()=>dialog.close();
 dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
 document.body.appendChild(dialog);return dialog;
}
init();
export function showRevenueDetail(name,period,seats,r){
 const d=init(),data=r||emptyRevenue(),totalMissing=data.missingSale+data.missingFee;
 d.querySelector('#prTitle').textContent=name+' · '+period;
 d.querySelector('#prSubtitle').textContent=Number(seats||0).toLocaleString('ko-KR')+'구좌 기준';
 const target=d.querySelector('#prRows');
 target.innerHTML='<div class="pr-row"><span>가입구좌 매출</span><strong></strong></div><div class="pr-row"><span>연회비 매출</span><strong></strong></div><div class="pr-row pr-total"><span>총매출</span><strong></strong></div>';
 const amounts=target.querySelectorAll('strong');
 amounts[0].textContent=revenueLabel(data.sale,data.missingSale);
 amounts[1].textContent=revenueLabel(data.fee,data.missingFee);
 amounts[2].textContent=revenueLabel(data.sale+data.fee,totalMissing);
 d.querySelector('#prFoot').textContent=totalMissing?'※ 미입력 금액이 포함되어 있습니다. 표시된 금액은 확인 가능한 매출이며 전체 금액은 확정되지 않았습니다.':'※ 분납 건은 등록된 완납 기준 예상매출로 집계합니다.';
 if(d.open)d.close();
 d.showModal();
}
