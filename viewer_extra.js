import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {countOrgHeadcount,orgEffectiveRoleShared,isDualStaff} from './org_headcount.js?v=unified-20261113';
import { drawOrgConnectorLines } from './org_connector_lines.js';
import { emptyRevenue,recordRevenue,oldRevenue,addRevenue,clickableSeats,revenueLabel,showRevenueDetail } from './personal_revenue_ui.js';
import { rosterPerformancePeople,regionalRepresentativeNames } from './personal_roster.js';
import { renderPerformanceMatrix } from './performance_matrix.js?v=year-to-date-totals-20261113';
import { historicValue,historicalActualSeats } from './historical_seats.js?v=auto-person-rollup-20261113';
import { cancellationPanel } from './historical_cancellations_ui.js';
import { timedSignupRows,signupSeatsForPeriod,undatedSignupStats } from './signup_date_utils.js';
function projectAdminOrgChart(original){
 const nodes=Array.isArray(original)?original.map(n=>({...n})):[];
 const roleOf=n=>{
  const roles=['regional','branch','division','manager'];
  if(Object.prototype.hasOwnProperty.call(n,'headcountRole'))return roles.includes(n.headcountRole)?n.headcountRole:'';
  if(n.type!=='person')return '';
  const title=String(n.subtitle||'').replace(/\s+/g,'');
  if(title.includes('권역대표'))return 'regional';
  if(title.includes('지사장'))return 'branch';
  if(title.includes('본부장'))return 'division';
  if(title.includes('매니저'))return 'manager';
  return '';
 };
 const siblings=(id)=>nodes.filter(n=>String(n.parent??'')===String(id??'')).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
 const branchOf=group=>{
  const explicit=String(group.branchName||'').trim();
  if(explicit)return explicit;
  const existing=String(group.label||'').match(/부산\s*[1-4]\s*지사/);
  if(existing)return existing[0].replace(/\s+/g,' ').replace(/부산 ([1-4]) 지사/,'부산 $1지사').replace(/부산([1-4])지사/,'부산 $1지사');
  const peers=siblings(group.parent).filter(n=>n.type==='group');
  const index=peers.findIndex(n=>String(n.id)===String(group.id));
  return index>=0&&index<4?'부산 '+(index+1)+'지사':'지사 / 부서';
 };
 for(const root of nodes.filter(n=>n.type==='root')){
  const direct=nodes.filter(n=>n.type==='person'&&String(n.parent)===String(root.id));
  if(!direct.length){
   const role=roleOf(root),subtitle=String(root.subtitle||'').trim(),label=String(root.label||'').trim();
   const hasName=label&&!/권역|지역|최상위 조직/.test(label);
   const name=hasName?label:(role==='regional'?subtitle.replace(/권역대표|대표/g,'').trim():'');
   const person={id:'viewer-root-person-'+String(root.id),parent:root.id,type:'person',label:name||'구성원',
    subtitle:hasName?subtitle:'',headcountRole:'regional',color:'white',order:-1,
    joinDate:root.joinDate||'',staffHidden:root.staffHidden===true};
   if(name)person.staffContactId=String(root.id);
   nodes.push(person);
   if(hasName)root.label=String(root.regionName||'부산권역');
  }
  if(root.headcountRole==='regional'&&root.label==='부산권역')delete root.headcountRole;
 }
 for(const group of [...nodes]){
  if(group.type!=='group')continue;
  const branch=branchOf(group),name=String(group.label||'').trim();
  const isPerson=name&&name!=='지사장 / 담당자 입력'&&name!=='새 지사 / 부서'&&
   name.replace(/\s+/g,'')!==branch.replace(/\s+/g,'');
  const role=roleOf(group),subtitleName=String(group.subtitle||'').replace(/지사장|본부장|권역대표|매니저/g,'').trim();
  const clean=isPerson?(name.replace(/부산\s*[1-4]\s*지사/g,'').replace(/지사장/g,'').trim()||name):(role?subtitleName:'');
  if(clean){
   nodes.push({id:'viewer-group-person-'+String(group.id),parent:group.id,type:'person',label:clean,
    subtitle:isPerson?(group.subtitle||''):'',headcountRole:role||'branch',
    joinDate:group.joinDate||'',color:group.color==='default'?'white':(group.color||'white'),
    order:-1,staffHidden:group.staffHidden===true,staffContactId:String(group.id)});
  }
  group.label=branch;group.branchName=branch;
  if(clean)for(const prop of ['subtitle','headcountRole','joinDate','staffHidden'])delete group[prop];
 }
 return nodes;
}
/* Read-only supplemental KPI views, shared by all public viewers. */
export function installViewerExtras({assignedBranch,getAllEvents,getYears,getTarget,countSeats,normalizeDivision,loadOrganization}) {
 const el=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>Number(x||0).toLocaleString('ko-KR');
 const won=x=>fmt(Math.round(Number(x)||0))+'원';
 const branches=['부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역'];
 const divisions=['1본부','2본부','3본부','지사장','기타','권역대표'];
 const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'};
 // Only district-specific viewers hide other branches' personal revenue.
 const revenueBranch=assignedBranch&&assignedBranch!=='부산권역'?assignedBranch:null;
 let staffPhoneDb=null,staffPhoneAllowed=false;
 const staffPhoneCache=new Map(),staffPhoneShown=new Set();
 let historicalSeats=[];
 let active='dashboard',year=new Date().getFullYear(),yearBranch='all',highlightedYearMonth=0,pyear=year,pmonths=new Set(),pbranch='all',pdivision='all',orgNodes=[],orgLoaded=false,orgMessage='',staffStatuses=new Map(),staffStatusLoaded=false,staffStatusError='';
 const css=`
.v-multi-slot{display:inline-block;vertical-align:middle}.v-signup-filter{display:inline-flex;align-items:center;gap:6px;font-size:12px!important;font-weight:600;color:#385477;white-space:nowrap}.v-multi-slot{font-size:12px!important}.v-signup-multi{position:relative;min-width:92px;font-size:12px!important}.v-signup-multi>summary{list-style:none;cursor:pointer;border:1px solid #dce6f2;border-radius:8px;padding:7px 10px;background:#fff;color:#172840;font-size:12px!important;line-height:1.35;font-weight:600;white-space:nowrap}.v-signup-multi>summary::-webkit-details-marker{display:none}.v-signup-multi>summary:after{content:'⌄';margin-left:9px;color:#64748b}.v-signup-multi-menu{position:absolute;top:calc(100% + 5px);right:0;z-index:90;min-width:150px;max-height:280px;overflow:auto;padding:6px;background:#fff;border:1px solid #dce6f2;border-radius:10px;box-shadow:0 8px 22px #0b204022}.v-signup-multi-menu label{display:flex!important;align-items:center;gap:7px;white-space:nowrap;padding:8px 10px;cursor:pointer;font-size:12px}.v-signup-multi-menu label:hover{background:#f1f6ff}.v-signup-multi-menu input{accent-color:#145dc5}.v-signup-locked{pointer-events:none;opacity:.85}

 .v-nav{display:flex;flex-direction:column;gap:8px}
 .v-nav button{border:0;border-radius:11px;background:transparent;color:#dce9ff;text-align:left;font:inherit;font-size:13px;padding:12px 12px;cursor:pointer;line-height:1.5}
 .v-nav button:hover{background:#17345d}.v-nav button.active{background:#1c3b68;color:#fff;font-weight:800}
 .v-nav .v-parent{font-size:13px;font-weight:800;color:#e8f1ff;padding:11px 12px 4px}
 .v-nav .v-child{padding:12px 9px 12px 24px;font-size:12px;color:#c7d8f1}
 .v-extra[hidden],.v-original[hidden]{display:none!important}
 .v-extra{margin:20px 0;padding:18px;border:1px solid #e4e9f1;border-radius:12px;background:#fff}
 .v-extra-head{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
 .v-extra-head h2{margin:0 0 7px;font-size:19px;color:#0b2040}
 .v-extra-head p{margin:3px 0 12px;color:#718098;font-size:12px;line-height:1.6}
 .v-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 .v-filters label{font-size:12px;font-weight:750;color:#49627d}
 .v-filters select{padding:8px;border:1px solid #e4e9f1;border-radius:8px;background:white;color:#172840;max-width:155px}
 .v-months{display:flex;gap:5px;flex-wrap:wrap;margin:14px 0}
 .v-months button{padding:6px 9px;border:1px solid #d9e3f0;border-radius:8px;background:#f6f8fc;font-size:12px;color:#637187;cursor:pointer}
 .v-months button.active{background:#2e63c5;border-color:#2e63c5;color:white;font-weight:800}
 .v-months .v-month-check{display:inline-flex;align-items:center;gap:5px;border:1px solid #d9e3f0;background:#f6f8fc;border-radius:8px;padding:6px 9px;color:#637187;cursor:pointer;font-size:12px;user-select:none;white-space:nowrap}
 .v-months .v-month-check.checked{background:#eaf1ff;border-color:#2e63c5;color:#2152a9;font-weight:800}
 .v-months .v-month-check input{width:14px;height:14px;margin:0;accent-color:#2e63c5;cursor:pointer}
 .v-table-scroll{overflow-x:auto;border:1px solid #cfdaea;border-radius:10px;background:#fff}
 .v-table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;font-size:11px}
 .v-table th,.v-table td{padding:6px 6px;border-right:1px solid #d1dbea;border-bottom:1px solid #d1dbea;text-align:center!important;vertical-align:middle;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
 .v-table th{background:#fbe5d8;font-weight:750;color:#29384b}.v-table thead th:nth-child(2){background:#f9deda}#v-person-table thead th{background:#edf2f8!important}
 .v-table td{color:#254260}.v-table .v-branch td{background:#f4f7fb;font-weight:800}.v-table .v-branch td:first-child{background:#dfe8fa}
 .v-table .v-total td{background:#dfe8fa;font-weight:850}
 .v-table .v-number{font-weight:800;color:#285ce4}
 .v-table small{font-size:10px;color:#6c809a;font-weight:500;display:block;margin-top:4px}
 .v-note{font-size:12px;line-height:1.7;color:#71819a;margin:11px 1px}
 .v-org-scroll{background:#fafcff;border:1px solid #dce5f2;border-radius:14px;overflow-x:auto;padding:22px 14px}
 .v-org-canvas{width:max-content;min-width:100%;display:flex;flex-direction:column;align-items:center;gap:30px;padding:12px 0 28px}
 .v-org-root{display:flex;flex-direction:column;align-items:center;gap:30px}
 .v-org-region-members{display:flex;flex-direction:column;align-items:center;gap:8px;position:relative}
 .v-org-region-members:before{content:'';position:absolute;top:-30px;left:50%;height:30px;border-left:2px solid #cad6e8}
 .v-org-region-members .v-org-card.person{min-width:180px;min-height:67px}
 .v-org-groups{display:flex;gap:24px;justify-content:center;align-items:flex-start;position:relative;--org-line-left:50%;--org-line-right:50%}
 .v-org-group{min-width:240px;display:flex;flex-direction:column;align-items:center;gap:26px;position:relative}
 .v-org-branch-heading{display:flex;align-items:center;justify-content:center;min-width:210px;min-height:74px;padding:12px 9px;border:1px solid #263859;border-radius:11px;background:#111d36;color:white;font-size:16px;font-weight:800;text-align:center;box-shadow:0 2px 6px rgba(21,39,64,.06)}
 .v-org-branch-leader{position:relative;min-width:210px;display:flex;justify-content:center}
 .v-org-branch-leader:before{content:'';position:absolute;top:-26px;left:50%;height:26px;border-left:2px solid #cad6e8}
 .v-org-branch-leader .v-org-card.group{min-width:175px;min-height:64px}
 .v-org-branch-leader .v-org-card.group strong{font-size:14px}
 .v-org-direct-members{display:flex;flex-direction:column;gap:8px;align-items:center}
 .v-org-direct-members:before{content:'';height:16px;border-left:2px solid #cad6e8}
 .v-org-branch-units{position:relative}
 .v-org-branch-units:not(:empty):before{content:'';position:absolute;top:-21px;left:50%;height:21px;border-left:2px solid #cad6e8}
 .v-org-group:before{content:'';position:absolute;top:-15px;left:50%;height:15px;border-left:2px solid #cad6e8;transform:translateX(-1px)}
 .v-org-groups:before{content:'';position:absolute;top:-15px;left:var(--org-line-left);right:var(--org-line-right);border-top:2px solid #cad6e8}
 .v-org-groups:after{content:'';position:absolute;top:-30px;left:50%;height:15px;border-left:2px solid #cad6e8;transform:translateX(-1px)}
 .v-org-groups.v-org-single:before{display:none}
 .v-org-divisions{display:flex;gap:9px;align-items:flex-start}
 .v-org-division{min-width:104px;display:flex;flex-direction:column;align-items:center;gap:8px}
 .v-org-members{display:flex;flex-direction:column;gap:8px;width:100%}
 .v-org-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:105px;min-height:50px;border:1px solid #e0e8f4;border-radius:11px;box-shadow:0 2px 6px rgba(21,39,64,.06);padding:12px 9px;text-align:center;background:#fff;white-space:normal}
 .v-org-card strong{font-size:13px;line-height:1.45;overflow-wrap:anywhere}.v-org-card small{font-size:14px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}
 .v-org-card.root{min-width:260px;min-height:85px}.v-org-card.root strong{font-size:20px}
 .v-org-card.group{min-width:210px;min-height:74px}.v-org-card.group strong{font-size:16px}.v-org-card.division{min-width:103px}.v-org-card.person{min-height:64px}.v-org-card.person strong{font-size:17px;font-weight:850;line-height:1.4;letter-spacing:.1px}.v-org-card .v-org-date{font-size:12px;font-weight:650;opacity:.92}.v-org-card .v-org-role{font-size:12px;font-weight:750;opacity:.86}
 .v-headcount{margin-top:20px;padding:19px 20px 15px;background:#fff;border:1px solid #dce5f2;border-radius:14px}
 .v-headcount h3{margin:0 0 14px;font-size:18px;color:#172c4b}
 .v-headcount-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
 .v-hc{padding:12px 6px 10px;text-align:center;border:1px solid #e2eaf5;border-radius:11px;background:#f3f7fd}
 .v-hc:last-child{background:#e7efff;border-color:#b8d0ff}
 .v-hc span{font-size:13px;color:#526782;font-weight:700;display:block;margin-bottom:5px}.v-hc strong{display:block;font-size:23px;line-height:1.3;font-weight:850;color:#1c4d9a;font-variant-numeric:tabular-nums}.v-hc:last-child strong{color:#1449b4}


 @media(max-width:760px){.v-headcount-grid{grid-template-columns:repeat(5,minmax(90px,1fr));overflow-x:auto}.v-hc{padding:10px 4px}.v-hc strong{font-size:19px}}
 /* Identical annual branch/division KPI matrix geometry, color and interactions as admin. */
 .v-year-months{display:flex;gap:5px;overflow-x:auto;white-space:nowrap;padding:5px 0 12px}
 .v-year-months button{border:1px solid #d9e3f0;background:#f6f8fc;border-radius:8px;color:#637187;padding:6px 9px;cursor:pointer;font-size:12px}
 .v-year-months button.active{background:#2e63c5;color:#fff;border-color:#2e63c5}
 .v-linked{font-size:11px;background:#e1f7e9;border-radius:15px;color:#087a50;padding:4px 9px;vertical-align:middle;white-space:nowrap}
 .v-year-matrix{min-width:1468px;width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:12px}
 .v-year-matrix th,.v-year-matrix td{padding:5px 6px;border-right:1px solid #d1dbea;border-bottom:1px solid #d1dbea;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis}
 .v-year-matrix th{background:#fbe5d8!important;color:#29384b;text-align:center!important;font-weight:750}
 .v-year-matrix thead th:nth-child(2){background:#f9deda!important}
 .v-year-matrix .perf-branch{background:#f4f7fb;font-weight:800;text-align:center!important;white-space:normal}
 .v-year-matrix .perf-division{text-align:center!important;font-weight:700;background:#fcfcff}
 .v-year-matrix .perf-kind{text-align:center!important;background:#fafcff}
 .v-year-matrix .perf-goal{color:#374357}
 .v-year-matrix .perf-actual{color:#285ce4;font-weight:800}
 .v-year-matrix .perf-good{color:#009b65;font-weight:800}
 .v-year-matrix .perf-zero{color:#95a4bb}
 .v-year-matrix .perf-missing{color:#9aa5b5}
 .v-year-matrix .perf-total td{background:#edf3ff;font-weight:800}
 .v-year-matrix .perf-region td{background:#dfe8fa;font-weight:850}
 .v-year-matrix .perf-active-month{background:#fff7d7!important}
 .v-year-matrix tr:last-child td{border-bottom:0}

.v-staff-status{display:inline-block;color:#2158cc;background:#eff5ff;border:1px solid #cbdcff;border-radius:18px;font-weight:750;padding:2px 9px}
 .v-staff-status.leave{color:#9c6700;background:#fff7e2;border-color:#ffe0a0}
 .v-staff-status.left{color:#8691a0;background:#eff2f5;border-color:#dce3eb}
  /* Match administrator layouts while keeping all public data strictly read-only. */
 .v-extra{margin:20px 0;padding:18px;border:1px solid #dce5f2;border-radius:12px;background:#fff}
 .v-extra-head h2{font-size:19px;color:#142b4c}
 .v-filters label{font-size:12px;font-weight:700}
 .v-filters select{border:1px solid #d6e0ec;padding:8px;border-radius:8px}
 .v-table{border-spacing:0;border-collapse:separate;table-layout:fixed;font-size:11px}
 .v-table th,.v-table td{padding:5px 6px;border-right:1px solid #d1dbea;border-bottom:1px solid #d1dbea;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
 .v-table th{background:#fbe5d8;color:#29384b;text-align:center;font-weight:750}
 .v-table td{color:#254260}
 .v-table .v-total td{background:#dfe8fa;font-weight:850}
 .v-table .v-number{color:#285ce4;font-weight:800}
 #v-person-table{font-size:12px}
 #v-person-table thead th{background:#edf2f8!important}
 #v-person-table td{text-align:center;white-space:nowrap}
 #v-person-table td:nth-child(4){font-weight:800;color:#203551}
 .v-org-scroll{overflow-x:auto;padding:22px 14px;background:#fafcff;border:1px solid #dce5f2;border-radius:14px}
 .v-org-card{font-family:inherit}
 .v-org-branch-heading{box-sizing:border-box}
 .v-org-card.root{min-width:260px;min-height:85px}
 .v-org-card.division{min-width:103px}
 .v-org-card.person{min-height:64px}
 .v-staff-filters{margin:8px 0 12px;gap:8px}
 .v-staff-filters input,.v-staff-filters select{border:1px solid #d4deec;border-radius:9px;padding:9px 12px;min-height:39px;background:white;max-width:220px;font:inherit;font-size:12px}
 .v-staff-table{border-collapse:collapse;min-width:1150px;width:100%;font-size:12px}
 .v-staff-table th{background:#f7f9fc!important;color:#526179;font-size:12px;font-weight:800;padding:15px 8px;border-bottom:1px solid #dce5f2;text-align:center}
 .v-staff-table td{padding:13px 8px;text-align:center!important;border-bottom:1px solid #eef2f8;color:#364962}
 .v-staff-table tbody tr:hover{background:#f8fbff}
 .v-staff-table .v-staff-name{font-size:13px;color:#14253f;font-weight:800}
 .v-staff-table .v-staff-pill{display:inline-block;color:#235fe0;background:#edf4ff;border:1px solid #cfddf5;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:800}

 @media(max-width:1050px){.v-nav{flex-direction:row;flex-wrap:wrap}.v-headcount-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:650px){.v-headcount-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v-hc:last-child{grid-column:1/-1}}
 `;
 const stylesheet=document.createElement('style');stylesheet.textContent=css;document.head.appendChild(stylesheet);
 const monthlyStyle=document.createElement('style');monthlyStyle.textContent="\n.v-signup-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.v-signup-summary>div{border:1px solid #e2e8f0;border-radius:10px;padding:15px;background:#fff;display:flex;flex-direction:column;gap:7px}.v-signup-summary span{font-size:12px;color:#718098}.v-signup-summary strong{font-size:20px;color:#172840}.v-signup-table{min-width:1220px;width:100%;border-collapse:collapse;font-size:12px}.v-signup-table th{background:#eaf2ff;color:#24466e;padding:13px 11px;text-align:left;white-space:nowrap}.v-signup-table td{padding:12px 11px;border-bottom:1px solid #edf1f6;white-space:nowrap}.v-signup-table tbody tr:nth-child(even){background:#f8fbff}.v-signup-table th:nth-child(6),.v-signup-table td:nth-child(6){text-align:center!important;width:76px}.v-signup-table th:nth-child(7),.v-signup-table th:nth-child(8),.v-signup-table th:nth-child(9),.v-signup-table td:nth-child(7),.v-signup-table td:nth-child(8),.v-signup-table td:nth-child(9){text-align:right!important}.v-signup-table td:nth-child(9){font-weight:800}.v-payment-label{display:block;margin-top:4px;color:#2563eb;font-size:11px}.v-signup-prior{display:flex;align-items:center;justify-content:space-between;margin:30px 0 12px;gap:12px}.v-signup-prior h3{margin:0;font-size:17px}.v-signup-prior strong{color:#145dc5;font-size:16px}@media(max-width:750px){.v-signup-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}\n";document.head.appendChild(monthlyStyle);
 const main=document.querySelector('main.main'),side=document.querySelector('.sidebar');
 const nav=document.createElement('nav');nav.className='v-nav';nav.setAttribute('aria-label','실적 조회 메뉴');
 nav.innerHTML='<button type="button" data-vpage="dashboard" class="active">▦ &nbsp; 실적관리</button><div class="v-parent">▤ &nbsp; 실적현황</div><button type="button" data-vpage="yearboard" class="v-child">지사별 / 본부별 실적현황</button><button type="button" data-vpage="personal" class="v-child">개인별 실적현황</button><button type="button" data-vpage="monthlysignups" class="v-child">월별 입회 현황</button><div class="v-parent">♧ &nbsp; 조직관리</div><button type="button" data-vpage="org" class="v-child">조직도</button><button type="button" data-vpage="orgstaff" class="v-child">조직원 정보</button>';
 const oldNav=side.querySelector('.viewer-sidebar-fallback')||side.querySelector('.nav-item');if(oldNav)oldNav.replaceWith(nav);else side.insertBefore(nav,side.querySelector('.aside-note'));
 const originals=[...main.children].filter(n=>n.tagName!=='HEADER'&&n.id!=='status');
 originals.forEach(n=>n.classList.add('v-original'));
 const wrapper=document.createElement('div');wrapper.id='v-extra';wrapper.innerHTML=`
 <section id="v-yearboard" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>▦ 지사별 / 본부별 실적 현황 <span class="v-linked">실적 내역 연동</span></h2><p>회사 배정 월별 목표와 등록된 가입 실적을 1~12월 기준으로 자동 집계합니다. 실적은 가입 건별 담당 지사·본부를 기준으로 계산합니다.</p></div><div class="v-filters"><label>조회 연도 <select id="v-year"></select></label><label>지사 <select id="v-year-branch"></select></label></div></div>
  <div id="v-year-months" class="v-year-months" aria-label="강조할 월 선택"></div>
  <div class="v-table-scroll"><table class="v-table v-year-matrix" style="min-width:1468px"><colgroup><col style="width:118px"><col style="width:116px"><col style="width:70px"><col style="width:92px"><col style="width:112px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:80px"></colgroup><thead id="v-year-head"></thead><tbody id="v-year-body"></tbody></table></div>
  <p class="v-note" id="v-year-note"></p>
 </section>
 <section id="v-personal" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>개인별 실적현황</h2><p>부산 1~4지사 매니저별 가입 구좌와 순위를 확인합니다.</p></div><div class="v-filters"><label>조회 연도 <select id="v-pyear"></select></label><label>지사 <select id="v-pbranch"></select></label><label>본부 <select id="v-pdivision"></select></label></div></div>
  <div id="v-months" class="v-months"></div><div class="v-table-scroll"><table class="v-table" id="v-person-table"><thead id="v-person-head"></thead><tbody id="v-person-body"></tbody></table></div>
  <p class="v-note" id="v-person-note"></p>
 </section>
 <section id="v-monthlysignups" class="v-extra" hidden>
 <div class="v-extra-head"><div><h2>월별 입회 현황 <span class="v-linked">가입 건별 등록 연동</span></h2><p>실제 가입일 기준 신규 입회만 표시하며, 이전 가입자의 해당 월 분납금은 아래 별도 표에 표시합니다.</p></div><div class="v-filters"><span class="v-signup-filter">조회 연도 <span id="v-syear" class="v-multi-slot"></span></span><span class="v-signup-filter">조회 월 <span id="v-smonth" class="v-multi-slot"></span></span><span class="v-signup-filter">소속지사 <span id="v-sbranch" class="v-multi-slot"></span></span><span class="v-signup-filter">소속본부 <span id="v-sdivision" class="v-multi-slot"></span></span></div></div>
 <div id="v-ssummary" class="v-signup-summary"></div>
 <div class="v-table-scroll"><table class="v-table v-signup-table"><thead><tr><th>가입 일자</th><th>소속지사</th><th>소속본부</th><th>가입 담당 매니저</th><th>가입상품</th><th>구좌</th><th>입회금</th><th>연회비</th><th>총 매출</th><th>입회자 성함</th></tr></thead><tbody id="v-snew"></tbody></table></div><p class="v-note" id="v-snewnote"></p>
 <div class="v-signup-prior"><h3>전월 이전 가입자 분납금</h3><strong id="v-spriortotal"></strong></div>
 <div class="v-table-scroll"><table class="v-table v-signup-table"><thead><tr><th>가입 일자</th><th>소속지사</th><th>소속본부</th><th>가입 담당 매니저</th><th>가입상품</th><th>구좌</th><th>입회금</th><th>연회비</th><th>총 매출</th><th>입회자 성함</th></tr></thead><tbody id="v-sprior"></tbody></table></div><p class="v-note" id="v-spriornote"></p>
 </section>
 <section id="v-org" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>조직도 <span style="font-size:12px;color:#7b8ca4">조회 전용</span></h2><p>부산권역 조직도와 직책별 인원 현황입니다.</p></div></div>
  <p class="v-note" id="v-org-note">조직도를 불러오는 중…</p>
  <div class="v-org-scroll"><div id="v-org-canvas" class="v-org-canvas"></div></div>
  <div class="v-headcount"><h3>조직 인원 현황</h3><div id="v-headcount-grid" class="v-headcount-grid"></div><p class="v-note">이름과 집계 직책이 등록된 카드만 포함합니다.</p></div>
 </section>
 <section id="v-orgstaff" class="v-extra" hidden>
  <div class="v-extra-head"><div><h2>PACIFIC 부산권역 임직원 명단</h2><p>조직도에 등록된 전체 조직원 목록입니다. 연락처는 권한이 확인된 사용자만 더블클릭하여 조회할 수 있습니다.</p></div>
  <strong id="v-staff-count" style="background:#e9f1ff;color:#215ddd;border-radius:7px;padding:6px 10px;font-size:13px">총 0명</strong></div>
  <div class="v-filters v-staff-filters"><input id="v-staff-search" placeholder="성명·직급·소속 검색" aria-label="조직원 검색" type="search"><select id="v-staff-branch" aria-label="지사별 검색"><option value="all">전체 지사</option></select><select id="v-staff-status" aria-label="재직상태"><option value="all">전체 재직상태</option><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option></select></div>
  <div class="v-table-scroll"><table class="v-table v-staff-table" style="min-width:1150px"><thead><tr><th>No.</th><th>성명</th><th>직급</th><th>소속 지사</th><th>소속 본부/부서</th><th>연락처</th><th>입사년월</th><th>재직상태</th><th>관리</th></tr></thead><tbody id="v-staff-body"></tbody></table></div>
  <p class="v-note">재직상태는 관리자 등록 정보를 조회 전용으로 표시합니다. 연락처는 기존 관리자 로그인 권한이 확인된 경우에만 더블클릭하여 표시됩니다.</p><p class="v-note" id="v-staff-status-note" role="status"></p>
 </section>`;
 main.appendChild(wrapper);
 // The source spreadsheet has no branch for cancellations; do not disclose unassigned names in individual district viewers.
 const cancelPanel=assignedBranch&&assignedBranch!=='부산권역'?{setRows(){},render(){}}:cancellationPanel(el('v-personal'));
 const pages={yearboard:el('v-yearboard'),personal:el('v-personal'),monthlysignups:el('v-monthlysignups'),org:el('v-org'),orgstaff:el('v-orgstaff')};
 const labels={dashboard:'KPI · 실적관리',yearboard:'지사별 / 본부별 실적현황',personal:'개인별 실적현황',monthlysignups:'월별 입회 현황',org:'조직도',orgstaff:'조직원 정보'};
 function show(page){
  if(!['dashboard','yearboard','personal','monthlysignups','org','orgstaff'].includes(page))return;
  active=page;
  originals.forEach(n=>n.hidden=page!=='dashboard');
  Object.entries(pages).forEach(([key,element])=>element.hidden=page!==key);
  nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.vpage===page)});
  document.querySelector('.top .h1').textContent=labels[page];
  document.querySelector('.top .sub').textContent=page==='dashboard'?(assignedBranch?assignedBranch+' 전용 · 로그인 없이 조회':'행사 투입 비용과 실적을 한곳에서 관리하세요.'):'부산 1~4지사 전체 · 조회 전용';
  if(page==='yearboard')renderYear();
  if(page==='personal')renderPersonal();
  if(page==='monthlysignups')renderSignupReport();
  if(page==='org')renderOrg();
  if(page==='orgstaff')renderStaff();
 }
 nav.addEventListener('click',event=>{const b=event.target.closest('button[data-vpage]');if(b)show(b.dataset.vpage)});
 const signupSelections={year:new Set([String(new Date().getFullYear())]),month:new Set([String(new Date().getMonth()+1)]),branch:new Set(),division:new Set()};
 const signupFilterDefs={year:'전체 연도',month:'전체 월',branch:'전체 지사',division:'전체 본부'};
 function renderSignupMulti(key,opts){
  const root=el('v-s'+key),selected=signupSelections[key];
  if(!root)return;
  const valid=new Set(opts.map(x=>String(x[0])));
  for(const value of [...selected])if(!valid.has(value))selected.delete(value);
  if(key==='branch'&&assignedBranch){selected.clear();selected.add(assignedBranch);}
  const prev=root.querySelector('details'),open=!!prev?.open;
  const scrollTop=prev?.querySelector('.v-signup-multi-menu')?.scrollTop||0;
  const all=!selected.size;
  const names=opts.filter(([value])=>selected.has(String(value))).map(([,label])=>label);
  const title=all?signupFilterDefs[key]:names.length===1?names[0]:names.length+'개 선택';
  root.innerHTML='<details class="v-signup-multi"'+(open?' open':'')+'><summary>'+safe(title)+'</summary><div class="v-signup-multi-menu"><label><input type="checkbox" data-all="1" '+(all?'checked':'')+'> '+signupFilterDefs[key]+'</label>'+opts.map(([value,label])=>'<label><input type="checkbox" data-value="'+safe(value)+'" '+(selected.has(String(value))?'checked':'')+'> '+safe(label)+'</label>').join('')+'</div></details>';
  if(key==='branch'&&assignedBranch)root.querySelector('details').classList.add('v-signup-locked');
  const menu=root.querySelector('.v-signup-multi-menu');if(menu)menu.scrollTop=scrollTop;
 }
 document.addEventListener('change',e=>{
  const input=e.target.closest('.v-signup-multi input');if(!input)return;
  const root=input.closest('.v-multi-slot');if(!root)return;
  const key=root.id.slice(3),selected=signupSelections[key];
  if(key==='branch'&&assignedBranch)return;
  if(input.dataset.all){selected.clear();}
  else{const v=input.dataset.value;if(input.checked)selected.add(v);else selected.delete(v);}
  if(key==='branch')signupSelections.division.clear();
  const pageY=window.scrollY;
  renderSignupReport();
  window.scrollTo({top:pageY,behavior:'instant'});
 });
 document.addEventListener('click',e=>{if(e.target.closest('.v-signup-multi'))return;document.querySelectorAll('.v-signup-multi[open]').forEach(d=>d.open=false)});
 function renderSignupReport(){
  const all=[],prior=[];
  for(const event of getAllEvents()){
   for(const row of Array.isArray(event.signupEntries)?event.signupEntries:[]){
    if(!row||row.withdrawn||!['corporate','individual'].includes(row.group))continue;
    const date=String(row.signupDate||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const branch=row.branch||event.branch||'',division=normalizeDivision(row.division||event.division)||'';
    if(assignedBranch&&branch!==assignedBranch)continue;
    const y=Number(date.slice(0,4)),m=Number(date.slice(5,7));
    if(m<1||m>12)continue;
    const amounts=row.paymentType==='installment'&&Array.isArray(row.installmentAmounts)&&row.installmentAmounts.length?row.installmentAmounts:[Number(row.revenue)||0];
    const base={date,branch,division,manager:row.manager||'',product:row.product||'',member:row.memberName||'',installment:row.paymentType==='installment',months:Number(row.installmentMonths)||amounts.length};
    all.push({...base,y,m,seats:Number(row.seats)||0,fee:Number(row.annualFee)||0,revenue:Number(amounts[0])||0,sequence:1});
    if(row.paymentType==='installment')amounts.slice(1).forEach((amount,i)=>{const offset=i+1;prior.push({...base,y:y+Math.floor((m-1+offset)/12),m:(m-1+offset)%12+1,seats:0,fee:0,revenue:Number(amount)||0,sequence:offset+1});});
   }
  }
  const ys=[...new Set([new Date().getFullYear(),...all.map(r=>r.y),...prior.map(r=>r.y)])].sort((a,b)=>b-a);
  renderSignupMulti('year',ys.map(y=>[String(y),y+'년']));
  renderSignupMulti('month',Array.from({length:12},(_,i)=>[String(i+1),(i+1)+'월']));
  const branches=[...new Set([...all,...prior].map(x=>x.branch).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  renderSignupMulti('branch',assignedBranch?[[assignedBranch,assignedBranch]]:branches.map(b=>[b,b]));
  const selectedBranches=signupSelections.branch;
  const divs=[...new Set([...all,...prior].filter(x=>!selectedBranches.size||selectedBranches.has(x.branch)).map(x=>x.division).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  renderSignupMulti('division',divs.map(d=>[d,d]));
  const matching=x=>(!signupSelections.year.size||signupSelections.year.has(String(x.y)))&&(!signupSelections.month.size||signupSelections.month.has(String(x.m)))&&(!signupSelections.branch.size||signupSelections.branch.has(x.branch))&&(!signupSelections.division.size||signupSelections.division.has(x.division));
  const news=all.filter(matching).sort((a,b)=>b.date.localeCompare(a.date));
  const prev=prior.filter(matching).sort((a,b)=>b.date.localeCompare(a.date));
  const sum=(arr,key)=>arr.reduce((n,x)=>n+x[key],0);
  el('v-ssummary').innerHTML=[['해당 월 구좌',fmt(sum(news,'seats'))+'구좌'],['입회금',won(sum(news,'revenue'))],['연회비',won(sum(news,'fee'))],['총 매출',won(sum(news,'revenue')+sum(news,'fee'))]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
  const rowHtml=(x,isPrior)=>'<tr><td>'+safe(x.date)+'</td><td>'+safe(x.branch||'—')+'</td><td>'+safe(x.division||'—')+'</td><td>'+safe(x.manager||'—')+'</td><td>'+safe(x.product||'—')+'<small class="v-payment-label">'+(isPrior?x.sequence+'회차 분납':x.installment?fmt(x.months)+'개월 분납':'완납')+'</small></td><td>'+fmt(x.seats)+'</td><td>'+won(x.revenue)+'</td><td>'+won(x.fee)+'</td><td>'+won(x.revenue+x.fee)+'</td><td>'+safe(x.member||'—')+'</td></tr>';
  el('v-snew').innerHTML=news.map(x=>rowHtml(x,false)).join('')||'<tr><td colspan="10">선택한 월의 신규 입회 내역이 없습니다.</td></tr>';
  el('v-sprior').innerHTML=prev.map(x=>rowHtml(x,true)).join('')||'<tr><td colspan="10">해당 월의 이전 가입자 분납금이 없습니다.</td></tr>';
  el('v-spriortotal').textContent='분납금 합계 '+won(sum(prev,'revenue'));
  el('v-snewnote').textContent='총 '+fmt(news.length)+'건 · 해당 월 실제 가입일 기준';
  el('v-spriornote').textContent='총 '+fmt(prev.length)+'건 · 신규 구좌 및 연회비와 중복 집계하지 않습니다.';
 }
 const selectOptions=(node,opts,value)=>{node.innerHTML=opts.map(([v,t])=>'<option value="'+safe(v)+'">'+safe(t)+'</option>').join('');node.value=String(value)};
 const years=()=>[...new Set([...getYears(),...historicalSeats.map(x=>Number(x.goal_year)),...getAllEvents().map(e=>Number(String(e.date||'').slice(0,4))),new Date().getFullYear()])].filter(y=>Number.isInteger(y)&&y>=2020&&y<=2100).sort((a,b)=>b-a);
 const actual=(branch,y,m,div='all')=>historicalActualSeats({history:historicalSeats,events:getAllEvents(),branch,year:y,month:m,division:div,normalizeDivision,timedSignupRows});
 const goal=(branch,y,m,div='all')=>getTarget(branch,y,m,div)??historicValue(historicalSeats,branch,div==='all'?'':div,'',y,m,'target_seats');
 const months=Array.from({length:12},(_,i)=>i+1);
 function renderYear(){
  if(!years().includes(year))year=years()[0]||new Date().getFullYear();
  selectOptions(el('v-year'),years().map(y=>[y,y+'년']),year);
  const allowed=branches.filter(b=>['부산 1지사','부산 2지사','부산 3지사','부산 4지사'].includes(b)&&(!assignedBranch||assignedBranch===b));
  if(!allowed.includes(yearBranch))yearBranch='all';
  if(allowed.length===1)yearBranch=allowed[0];
  selectOptions(el('v-year-branch'),[...(allowed.length>1?[['all','전체 지사']]:[]),...allowed.map(b=>[b,b])],yearBranch);
  const selected=yearBranch==='all'?allowed:[yearBranch];
  el('v-year-months').innerHTML='<button type="button" data-v-year-month="0" class="'+(highlightedYearMonth===0?'active':'')+'">전체(1~12월)</button>'+
   months.map(m=>'<button type="button" data-v-year-month="'+m+'" class="'+(highlightedYearMonth===m?'active':'')+'">'+m+'월</button>').join('');
  const matrix=renderPerformanceMatrix({branches:selected,year,highlight:highlightedYearMonth,getGoal:goal,getActual:actual,escape:safe,divisionOptions:divisions.filter(d=>d!=='권역대표')});
  el('v-year-head').innerHTML=matrix.heading;
  el('v-year-body').innerHTML=matrix.body;
  const total=selected.reduce((sum,b)=>sum+months.reduce((subtotal,m)=>subtotal+actual(b,year,m),0),0);
  el('v-year-note').textContent=year+'년 · '+(yearBranch==='all'?'전체 지사':yearBranch)+
   ' · 개인별 과거 수동 구좌가 본부·지사에 자동 합산 · 미입력 월은 온라인 집계 · 미배정 목표는 — 표시 · 실제 가입일자 기준 · 합계 달성률은 연간 실적 ÷ 연간 배정 목표입니다. · 전체 '+fmt(total)+'구좌'+
   (undatedSignupStats(getAllEvents()).records?' · 가입일 미입력 '+undatedSignupStats(getAllEvents()).records+'건 ('+fmt(undatedSignupStats(getAllEvents()).seats)+'구좌) 제외':'');
 }
 el('v-year').addEventListener('change',e=>{year=Number(e.target.value);renderYear()});
 el('v-year-branch').addEventListener('change',e=>{yearBranch=e.target.value;renderYear()});
 el('v-year-months').addEventListener('click',e=>{const button=e.target.closest('[data-v-year-month]');if(!button)return;highlightedYearMonth=Number(button.dataset.vYearMonth);renderYear()});
 function renderPersonal(){
  cancelPanel.render(pyear,pmonths.size?[...pmonths]:null);
  if(!years().includes(pyear))pyear=years()[0]||new Date().getFullYear();
  selectOptions(el('v-pyear'),years().map(y=>[y,y+'년']),pyear);
  selectOptions(el('v-pbranch'),[['all','전체 지사'],...branches.map(b=>[b,b])],pbranch);
  selectOptions(el('v-pdivision'),[['all','전체 본부'],...divisions.map(d=>[d,d])],pdivision);
  el('v-months').innerHTML='<button type="button" data-all-months class="'+(pmonths.size===0?'active':'')+'">전체(1~12월)</button>'+months.map(m=>'<label class="v-month-check'+(pmonths.has(m)?' checked':'')+'"><input type="checkbox" data-v-month="'+m+'" value="'+m+'" '+(pmonths.has(m)?'checked ':'')+'aria-label="'+m+'월 선택">'+m+'월</label>').join('');
  const shown=pmonths.size?months.filter(m=>pmonths.has(m)):months,byKey=new Map();
  const revenueActions=new Map(),oneMonth=shown.length===1;
  const regionalReps=regionalRepresentativeNames(orgLoaded?orgNodes:[]);
  for(const person of rosterPerformancePeople(orgLoaded?orgNodes:[])){
   if(!branches.includes(person.branch)||pbranch!=='all'&&pbranch!==person.branch||pdivision!=='all'&&pdivision!==person.division)continue;
   const key=JSON.stringify([person.branch,person.division,person.name]);
   if(!byKey.has(key))byKey.set(key,{b:person.branch,d:person.division,name:person.name,months:Array(12).fill(0),revenues:Array.from({length:12},emptyRevenue)});
  }
  const action=(name,period,seats,revenue,canSee=true,manual=false)=>{if(manual)return '<span title="수동 입력 구좌 · 매출 미등록">'+fmt(seats)+'구좌*</span>';if(!canSee)return '<span title="타 지사 매출 비공개">'+fmt(seats)+'구좌</span>';const id=String(revenueActions.size+1);revenueActions.set(id,{name,period,seats,revenue});return clickableSeats(seats,id)};
  const totalRevenueFor=(row,monthList)=>monthList.reduce((r,m)=>addRevenue(r,row.revenues[m-1]),emptyRevenue());
  const inline=(amount,missing,canSee=true)=>'<td class="personal-revenue-single">'+(canSee?safe(revenueLabel(amount,missing)):'<span title="타 지사 매출 비공개">비공개</span>')+'</td>';
  const add=(b,d,name,m,seats,revenue)=>{
   if(b==='부산권역'&&regionalReps.has(name))return;
   if(!branches.includes(b)||pbranch!=='all'&&pbranch!==b||pdivision!=='all'&&pdivision!==d)return;
   const key=JSON.stringify([b,d,name]);if(!byKey.has(key))byKey.set(key,{b,d,name,months:Array(12).fill(0),revenues:Array.from({length:12},emptyRevenue)});
   byKey.get(key).months[m-1]+=seats;
   byKey.get(key).revenues[m-1]=addRevenue(byKey.get(key).revenues[m-1],revenue);
  };
  for(const event of getAllEvents()){
   const valid=timedSignupRows(event,pyear,shown);
   if(valid.length){
    for(const r of valid)add(r.branch||event.branch,normalizeDivision(r.division||event.division),String(r.manager||'').trim()||'담당자 미지정',Number(r.signupDate.slice(5,7)),r.seats,recordRevenue(r));
   } // Entries without a confirmed signup date are not counted in a reporting month.
  }
  for(const h of historicalSeats){
   if(!h.manager||Number(h.goal_year)!==pyear||!shown.includes(Number(h.goal_month)))continue;
   if(!branches.includes(h.branch)||pbranch!=='all'&&pbranch!==h.branch||pdivision!=='all'&&pdivision!==h.division)continue;
   const key=JSON.stringify([h.branch,h.division,h.manager]);
   if(!byKey.has(key))byKey.set(key,{b:h.branch,d:h.division,name:h.manager,months:Array(12).fill(0),revenues:Array.from({length:12},emptyRevenue)});
   if(h.actual_seats!==null&&h.actual_seats!==undefined){
    const row=byKey.get(key);row.months[Number(h.goal_month)-1]=Number(h.actual_seats);
    row.employmentStatus=h.employment_status==='계약해지'?'계약해지':'재직';
    (row.manualMonths??=new Set()).add(Number(h.goal_month));
   }
  }
  const rows=[...byKey.values()].map(x=>({...x,total:shown.reduce((sum,m)=>sum+x.months[m-1],0)})).sort((a,b)=>b.total-a.total||a.b.localeCompare(b.b,'ko')||a.d.localeCompare(b.d,'ko')||a.name.localeCompare(b.name,'ko'));
  const t=Array(12).fill(0),revenueTotals=Array.from({length:12},emptyRevenue);
  for(const row of rows)row.months.forEach((v,i)=>{t[i]+=v;revenueTotals[i]=addRevenue(revenueTotals[i],row.revenues[i])});
  const full=pmonths.size===0,showTotal=shown.length>1;
  el('v-person-table').style.minWidth=(444+shown.length*80+(showTotal?88:0)+(oneMonth?450:0))+'px';
  el('v-person-head').innerHTML='<tr><th>No.</th><th>소속 지사</th><th>본부</th><th>성명</th>'+shown.map(m=>'<th>'+m+'월</th>').join('')+(showTotal?'<th>'+(full?'연간 합계':'선택 월 합계')+'</th>':'')+(oneMonth?'<th>가입구좌 매출</th><th>연회비 매출</th><th>총매출</th>':'')+'</tr>';
  let body=rows.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+safe(x.b)+'</td><td>'+safe(x.d||'본부 미지정')+'</td><td style="font-weight:750">'+safe(x.name)+(x.employmentStatus==='계약해지'?' <small style="color:#a65035">(계약해지)</small>':'')+'</td>'+shown.map(m=>'<td class="v-number">'+action(x.name,m+'월',x.months[m-1],x.revenues[m-1],!revenueBranch||x.b===revenueBranch,x.manualMonths?.has(m))+'</td>').join('')+(showTotal?'<td class="v-number">'+action(x.name,full?'연간 합계':'선택 월 합계',x.total,totalRevenueFor(x,shown),!revenueBranch||x.b===revenueBranch,shown.some(m=>x.manualMonths?.has(m)))+'</td>':'')+(oneMonth?(()=>{const r=x.revenues[shown[0]-1];return x.manualMonths?.has(shown[0])?'<td>미등록</td><td>미등록</td><td>미등록</td>':inline(r.sale,r.missingSale,!revenueBranch||x.b===revenueBranch)+inline(r.fee,r.missingFee,!revenueBranch||x.b===revenueBranch)+inline(r.sale+r.fee,r.missingSale+r.missingFee,!revenueBranch||x.b===revenueBranch)})():'')+'</tr>').join('');
  const total=shown.reduce((sum,m)=>sum+t[m-1],0),allRevenue=shown.reduce((r,m)=>addRevenue(r,revenueTotals[m-1]),emptyRevenue());
  const manualInSelection=rows.some(x=>shown.some(m=>x.manualMonths?.has(m)));
  const canSeeTotal=(!revenueBranch||rows.every(x=>x.b===revenueBranch))&&!manualInSelection;
  if(rows.length)body+='<tr class="v-total"><td colspan="4">합계</td>'+shown.map(m=>'<td>'+action('전체 합계',m+'월',t[m-1],revenueTotals[m-1],canSeeTotal)+'</td>').join('')+(showTotal?'<td>'+action('전체 합계',full?'연간 합계':'선택 월 합계',total,allRevenue,canSeeTotal)+'</td>':'')+(oneMonth?inline(allRevenue.sale,allRevenue.missingSale,canSeeTotal)+inline(allRevenue.fee,allRevenue.missingFee,canSeeTotal)+inline(allRevenue.sale+allRevenue.fee,allRevenue.missingSale+allRevenue.missingFee,canSeeTotal):'')+'</tr>';
  else body='<tr><td colspan="'+(shown.length+4+(showTotal?1:0)+(oneMonth?3:0))+'">선택한 기간의 등록된 가입 실적이 없습니다.</td></tr>';
  el('v-person-body').innerHTML=body;
  el('v-person-body').onclick=e=>{const button=e.target.closest('[data-personal-revenue]');if(!button)return;const info=revenueActions.get(button.dataset.personalRevenue);if(info)showRevenueDetail(info.name,info.period,info.seats,info.revenue)};
  el('v-person-note').textContent=pyear+'년 '+(full?'전체(1~12월)':shown.map(m=>m+'월').join('·'))+' · 부산 1~4지사 · '+rows.length+'명/소속 · '+fmt(total)+'구좌 · * 과거 수동 입력 구좌 (매출 미등록) · 입력 월은 자동 집계 대체 · 동일 성명이라도 지사 또는 본부가 다르면 별도 집계합니다.'+
  (undatedSignupStats(getAllEvents()).records?' · 가입일 미입력 '+undatedSignupStats(getAllEvents()).records+'건 ('+fmt(undatedSignupStats(getAllEvents()).seats)+'구좌) 집계 제외':'');
 }
 el('v-pyear').addEventListener('change',e=>{pyear=Number(e.target.value);renderPersonal()});
 el('v-pbranch').addEventListener('change',e=>{pbranch=e.target.value;renderPersonal()});
 el('v-pdivision').addEventListener('change',e=>{pdivision=e.target.value;renderPersonal()});
 el('v-months').addEventListener('click',e=>{
 if(!e.target.closest('[data-all-months]'))return;
 pmonths.clear();renderPersonal();
});
el('v-months').addEventListener('change',e=>{
 const input=e.target.closest('input[data-v-month]');if(!input)return;
 const month=Number(input.value);
 if(input.checked)pmonths.add(month);else pmonths.delete(month);
 if(pmonths.size===12)pmonths.clear();
 renderPersonal();
});
 const children=id=>orgNodes.filter(n=>n.parent===id).sort((a,b)=>(a.order||0)-(b.order||0));
 const effectiveRole=orgEffectiveRoleShared;
 const join=n=>{
  const v=String(n.joinDate||'');if(/^[0-9]{2}[.](0[1-9]|1[0-2])$/.test(v))return v;
  const match=v.match(/^([0-9]{4})-(0[1-9]|1[0-2])(?:-[0-9]{2})?$/);return match?match[1].slice(-2)+'.'+match[2]:'';
 };
 const palette={
  default:['#fff','#172840','#dce5f3'],white:['#fff','#172840','#d4dfec'],navy:['#111d36','#fff','#263859'],blue:['#2457c6','#fff','#2457c6'],
  mint:['#e9fbf4','#084d40','#73dfb5'],sky:['#e0f2fe','#075985','#7dd3fc'],teal:['#ccfbf1','#115e59','#5eead4'],
  green:['#dcfce7','#166534','#86efac'],purple:['#6d28d9','#fff','#7c3aed'],lavender:['#ede9fe','#5b21b6','#c4b5fd'],
  pink:['#fce7f3','#9d174d','#f9a8d4'],coral:['#ffe4e6','#9f1239','#fda4af'],orange:['#ffedd5','#9a3412','#fdba74'],
  yellow:['#fef9c3','#854d0e','#fde047'],gray:['#e5e7eb','#374151','#cbd5e1']
 };
 function branchHeading(n){
  const explicit=String(n.branchName||'').trim();if(explicit)return explicit;
  const match=String(n.label||'').match(/부산\s*[1-4]\s*지사/);
  if(match)return match[0].replace(/\s+/g,' ').replace(/부산 ([1-4]) 지사/,'부산 $1지사').replace(/부산([1-4])지사/,'부산 $1지사');
  const siblings=children(n.parent).filter(x=>x.type==='group'),index=siblings.findIndex(x=>x.id===n.id);
  return index>=0&&index<4?'부산 '+(index+1)+'지사':'지사 / 부서';
 }
 function branchLeaderName(n){
  const name=String(n.label||'').trim();
  return !name||name.replace(/\\s+/g,'')===branchHeading(n).replace(/\\s+/g,'')||name==='새 지사 / 부서'?'지사장 / 담당자 입력':name;
 }
 function card(n){
  let colors=palette[n.color]||palette.default;
  if(n.type==='group'&&(!n.color||n.color==='default'))colors=palette.default;
  if(!n.color||n.color==='default'){if(n.type==='root'||n.type==='division')colors=palette.blue;else if(n.type==='group')colors=palette.default}
  const rawName=String(n.label||'').trim();
  const isDual=isDualStaff(n)||effectiveRole(n)==='dual';
  const role=isDual?'본부장 겸직':(roles[effectiveRole(n)]||'');
  const subtitle=String(n.subtitle||'').trim();
  const sub=subtitle&&subtitle.replace(/\s+/g,'')!==role?'<small>'+safe(subtitle)+'</small>':'';
  const date=join(n);
  return '<div class="v-org-card '+safe(n.type||'')+'" style="background:'+colors[0]+';color:'+colors[1]+';border-color:'+colors[2]+'">'+(role?'<small class="v-org-role">'+safe(role)+'</small>':'')+'<strong>'+safe(n.type==='group'?branchLeaderName(n):(effectiveRole(n)==='branch'?rawName.replace(/[（(]\s*겸\s*직\s*[)）]/g,'').trim():(n.label||'이름 미입력')))+'</strong>'+sub+(date?'<small class="v-org-date">입사 '+safe(date)+'</small>':'')+'</div>';
 }
 function alignOrgConnectors(){
  const canvas=el('v-org-canvas');
  if(!canvas)return;
  requestAnimationFrame(()=>drawOrgConnectorLines(canvas,'viewer'));
 }
 window.addEventListener('resize',()=>{if(active==='org')alignOrgConnectors()});
 function renderOrg(){
  if(!orgLoaded){el('v-org-note').textContent='조직도 데이터를 불러오는 중…';return;}
  el('v-org-note').textContent=orgMessage||'부산권역 전체 조직도 · 읽기 전용';
  const person=n=>card(n);
  const division=n=>'<div class="v-org-division">'+card(n)+'<div class="v-org-members">'+children(n.id).map(person).join('')+'</div></div>';
  const group=n=>'<div class="v-org-group"><div class="v-org-branch-heading">'+safe(branchHeading(n))+'</div>'+(children(n.id).some(x=>x.type==='person')?'<div class="v-org-direct-members">'+children(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+'<div class="v-org-divisions v-org-branch-units">'+children(n.id).filter(x=>x.type==='division').map(division).join('')+'</div></div>';
  const root=n=>'<div class="v-org-root">'+card(n)+(children(n.id).some(x=>x.type==='person')?'<div class="v-org-region-members">'+children(n.id).filter(x=>x.type==='person').map(person).join('')+'</div>':'')+'<div class="v-org-groups">'+children(n.id).filter(x=>x.type==='group').map(group).join('')+'</div></div>';
  el('v-org-canvas').innerHTML=children(null).map(root).join('')||'<p class="v-note">등록된 조직도가 없습니다.</p>';
  alignOrgConnectors();
  const counts=countOrgHeadcount(orgNodes);
  el('v-headcount-grid').innerHTML=[...['regional','branch','division','manager'].map(r=>[roles[r],counts[r]]),['총인원',counts.total]].map(([label,n])=>'<div class="v-hc"><span>'+label+'</span><strong>'+fmt(n)+'명</strong></div>').join('');
 }
 async function refreshOrganization(){
  if(new URLSearchParams(window.location.search).has('ppt-preview')&&window.PLK_RENDER_PPT_ORG_PREVIEW)return;
  try{const rows=await loadOrganization();orgNodes=projectAdminOrgChart(rows);orgMessage='부산권역 전체 조직도 · 읽기 전용';}
  catch(error){orgNodes=[];orgMessage='조직도를 표시할 수 없습니다. 관리자에게 공개 조회 설정 확인을 요청하세요. ('+(error.message||'오류')+')';}
  // Anonymous viewers can read ONLY the safe status projection; phone numbers remain protected.
  staffStatuses=new Map();staffStatusLoaded=false;staffStatusError='';
  try{
   const settings=window.PLK_CONFIG||{};
   if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(settings.supabaseUrl||'')||!settings.supabaseAnonKey)throw new Error('공개 조회 연결이 설정되지 않았습니다.');
   const address=settings.supabaseUrl.replace(/\/$/,'')+'/rest/v1/kpi_org_staff_public_status?select=node_id,employment_status';
   const response=await fetch(address,{headers:{apikey:settings.supabaseAnonKey,Authorization:'Bearer '+settings.supabaseAnonKey},cache:'no-store'});
   if(!response.ok)throw new Error('공개 재직상태 DB 설정이 필요합니다. ('+response.status+')');
   const data=await response.json();
   if(!Array.isArray(data))throw new Error('재직상태 응답 형식 오류');
   staffStatuses=new Map(data.filter(row=>row&&row.node_id&&['재직','휴직','퇴사'].includes(row.employment_status))
    .map(row=>[String(row.node_id),row.employment_status]));
   staffStatusLoaded=true;
  }catch(error){staffStatusError=error.message||'재직상태를 불러오지 못했습니다.';console.warn('Public staff status unavailable',error);}
  orgLoaded=true;if(active==='org')renderOrg();if(active==='orgstaff')renderStaff();if(active==='personal')renderPersonal();
 }
 // Same-origin PowerPoint preview: render the EXACT read-only viewer organization markup
 // using the currently logged-in administrator's in-memory nodes. Never uploads data.
 if(new URLSearchParams(window.location.search).has('ppt-preview')){
  window.PLK_RENDER_PPT_ORG_PREVIEW=nodes=>{
   if(!Array.isArray(nodes))throw new Error('조직도 데이터가 올바르지 않습니다.');
   orgNodes=nodes;orgLoaded=true;orgMessage='부산권역 전체 조직도 · PPT 미리보기';
   show('org');renderOrg();
   return document.getElementById('v-org-canvas');
  };
 }
 function renderStaff(){
  if(!orgLoaded){el('v-staff-body').innerHTML='<tr><td colspan="9">조직원 정보를 불러오는 중…</td></tr>';return;}
  const placeholder=['구성원','새 구성원','이름 미입력','최상위 조직','새 지사 / 부서','새 본부 / 팀','지사장 / 담당자 입력'];
  const tree=n=>{
   let b='',d='',p=n,depth=0;
   while(p&&depth++<12){
    if(p.type==='group')b=branchHeading(p);
    if(p.type==='root'&&!b)b=p.label||'부산권역';
    if(p.type==='division')d=p.label;
    p=p.parent?orgNodes.find(x=>x.id===p.parent):null;
   }return {b,d};
  };
  const data=orgNodes.filter(n=>n&&n.staffHidden!==true&&['person','root','group','division'].includes(n.type)&&String(n.label||'').trim()&&!placeholder.includes(n.label)&&(n.type==='person'||(n.type!=='group'&&n.type!=='root'&&effectiveRole(n)))).map(n=>{
   const loc=tree(n);const status=staffStatuses.get(String(n.staffContactId||n.id))|| (staffStatusLoaded?'재직':'—');
   return {id:String(n.id),name:n.label,role:effectiveRole(n)==='dual'?'본부장 겸직':(roles[effectiveRole(n)]||n.subtitle||'미지정'),branch:loc.b,division:loc.d,hire:join(n),status};
  }).sort((a,b)=>a.branch.localeCompare(b.branch,'ko')||a.division.localeCompare(b.division,'ko')||a.name.localeCompare(b.name,'ko'));
  el('v-staff-count').textContent='총 '+data.length+'명';
  const query=el('v-staff-search').value.trim().toLocaleLowerCase('ko');
  const selectedBranch=el('v-staff-branch').value,selectedStatus=el('v-staff-status').value;
  const filtered=data.filter(r=>(selectedBranch==='all'||r.branch===selectedBranch)&&(selectedStatus==='all'||r.status===selectedStatus)&&(!query||[r.name,r.role,r.branch,r.division].join(' ').toLocaleLowerCase('ko').includes(query)));
  el('v-staff-status-note').textContent=staffStatusError?'재직상태 표시를 위해 Supabase에서 org_staff_status_public.sql을 실행해야 합니다. '+staffStatusError:staffStatusLoaded?'재직상태는 관리자 등록 DB와 연동됩니다.':'';
  el('v-staff-body').innerHTML=filtered.map((r,i)=>'<tr><td>'+(i+1)+'</td><td class="v-staff-name">'+safe(r.name)+'</td><td><span class="v-staff-pill">'+safe(r.role)+'</span></td><td>'+safe(r.branch||'—')+'</td><td>'+safe(r.division||'—')+'</td><td class="v-staff-phone" data-v-staff-phone="'+safe(r.id)+'" title="더블클릭하면 연락처가 표시됩니다" style="cursor:pointer;user-select:none">'+(staffPhoneShown.has(r.id)?safe(staffPhoneCache.get(r.id)||'등록된 번호 없음'):'•••-••••-••••')+'</td><td>'+safe(r.hire||'—')+'</td><td><span class="v-staff-status '+(r.status==='휴직'?'leave':r.status==='퇴사'?'left':'')+'">'+safe(r.status)+'</span></td><td>조회 전용</td></tr>').join('')||'<tr><td colspan="9">조직원 정보가 없습니다.</td></tr>';
 }
 async function checkStaffPhoneAccess(){
  const cfg=window.PLK_CONFIG||{};
  if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'')||!cfg.supabaseAnonKey)return false;
  if(!staffPhoneDb)staffPhoneDb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data:{session},error:sessionError}=await staffPhoneDb.auth.getSession();
  if(sessionError||!session?.access_token){staffPhoneAllowed=false;staffPhoneCache.clear();staffPhoneShown.clear();return false;}
  const {data,error}=await staffPhoneDb.rpc('kpi_my_access');
  staffPhoneAllowed=!error&&['owner','shared','branch'].includes(data?.role);
  if(!staffPhoneAllowed){staffPhoneCache.clear();staffPhoneShown.clear();}
  return staffPhoneAllowed;
 }
 async function showStaffPhone(nodeId){
  const note=el('v-staff-status-note');
  const isBranchPublic=['부산 1지사','부산 2지사','부산 3지사','부산 4지사'].includes(assignedBranch);
  if(isBranchPublic){
   try{
    const cfg=window.PLK_CONFIG||{};
    if(!cfg.supabaseUrl||!cfg.supabaseAnonKey)throw new Error('Supabase 공개 조회 연결 정보가 없습니다.');
    const db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await db.rpc('kpi_public_branch_staff_phones',{p_branch:assignedBranch});
    if(error)throw error;
    staffPhoneCache.clear();
    for(const row of data||[])staffPhoneCache.set(String(row.node_id),String(row.phone||''));
    staffPhoneShown.add(nodeId);
    renderStaff();
    if(!staffPhoneCache.has(nodeId)){
     note.textContent='이 조직원의 연락처가 공개 조회 결과에 없습니다. 서버 조회 '+(data||[]).length+'건 · 관리자 연락처 등록 및 지사 소속을 확인해 주세요.';
    }else{
     note.textContent='지사 연락처 조회 완료 · 해당 지사 공개 연락처 '+(data||[]).length+'건';
    }
   }catch(error){
    note.textContent='지사 연락처 조회 오류: '+(error.message||'알 수 없는 오류');
   }
   return;
  }
  if(!await checkStaffPhoneAccess()){
   note.textContent='전체 뷰어의 연락처는 관리자 홈페이지에 권한 있는 계정으로 로그인한 경우에만 조회할 수 있습니다.';
   return;
  }
  if(!staffPhoneCache.has(nodeId)){
   const {data,error}=await staffPhoneDb.rpc('kpi_manager_staff_phone',{p_node_id:nodeId});
   if(error)throw error;
   staffPhoneCache.set(nodeId,typeof data==='string'?data:'');
  }
  staffPhoneShown.add(nodeId);
  renderStaff();
 }
 el('v-staff-body').addEventListener('dblclick',async event=>{
  const cell=event.target.closest('[data-v-staff-phone]');if(!cell)return;
  try{await showStaffPhone(cell.dataset.vStaffPhone);}catch(error){el('v-staff-status-note').textContent='연락처 조회 실패: '+(error.message||'권한 확인 필요');}
 });
 el('v-staff-body').addEventListener('mouseup',async event=>{
  const cell=event.target.closest('[data-v-staff-phone]');if(!cell||!window.getSelection()?.toString().trim())return;
  try{await showStaffPhone(cell.dataset.vStaffPhone);}catch(error){el('v-staff-status-note').textContent='연락처 조회 실패: '+(error.message||'권한 확인 필요');}
 });
 checkStaffPhoneAccess().then(()=>{if(active==='orgstaff')renderStaff();}).catch(()=>{});
 el('v-staff-search').addEventListener('input',renderStaff);
 const branchSelector=el('v-staff-branch');
 branchSelector.innerHTML='<option value="all">전체 지사</option>'+['부산권역',...branches].map(b=>'<option value="'+safe(b)+'">'+safe(b)+'</option>').join('');
 if(assignedBranch&&branches.includes(assignedBranch))branchSelector.value=assignedBranch;
 branchSelector.addEventListener('change',renderStaff);
 el('v-staff-status').addEventListener('change',renderStaff);

 function refresh(){if(active==='yearboard')renderYear();if(active==='personal')renderPersonal();if(active==='monthlysignups')renderSignupReport();}
 function setHistoricalSeats(data,cancellations=[]){historicalSeats=Array.isArray(data)?data:[];cancelPanel.setRows(cancellations);refresh();}
 return {refresh,refreshOrganization,setHistoricalSeats};
}
