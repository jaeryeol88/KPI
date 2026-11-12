/* Responsive connector lines for the organization chart in both admin and viewer. */
const CSS_ID='plk-org-lines-styles';
if(!document.getElementById(CSS_ID)){
 const sheet=document.createElement('style');sheet.id=CSS_ID;
 sheet.textContent=[
 '.org-canvas,.v-org-canvas{position:relative;isolation:isolate}',
 '.org-root-branch,.v-org-root{position:relative;z-index:1}',
 '.org-connectors-svg{position:absolute!important;left:0!important;top:0!important;z-index:0!important;overflow:visible;pointer-events:none!important}',
 '.org-region-direct-members:before,.org-group-wrap:before,.org-group-row:before,.org-group-row:after,.org-branch-direct-members:before,.org-group-wrap .org-unit-row:before,.org-branch-leader:before,.v-org-region-members:before,.v-org-group:before,.v-org-groups:before,.v-org-groups:after,.v-org-direct-members:before,.v-org-branch-units:before,.v-org-branch-leader:before{display:none!important}',
 '.org-region-direct-members .org-node-person,.v-org-region-members .v-org-card.person{min-width:215px;min-height:89px;padding:15px 18px;gap:5px}',
 '.org-region-direct-members .org-node-person strong,.v-org-region-members .v-org-card.person strong{font-size:20px;line-height:1.45}',
 '.org-region-direct-members .org-node-person .org-card-role,.v-org-region-members .v-org-card.person .v-org-role{font-size:18px;font-weight:850;line-height:1.5}',
 '.org-region-direct-members .org-node-person small:not(.org-card-role),.v-org-region-members .v-org-card.person small:not(.v-org-role){font-size:14px}'
 ].join('\n');
 document.head.appendChild(sheet);
}
const NS='http://www.w3.org/2000/svg';
function direct(parent,selector){return parent?[...parent.children].filter(n=>n.matches(selector)):[];}
function first(parent,selector){return direct(parent,selector)[0]||null;}
export function drawOrgConnectorLines(canvas,mode){
 if(!canvas)return;
 const viewer=mode==='viewer';
 let svg=first(canvas,'.org-connectors-svg');
 if(!svg){svg=document.createElementNS(NS,'svg');svg.setAttribute('class','org-connectors-svg');svg.setAttribute('aria-hidden','true');canvas.prepend(svg);}
 svg.replaceChildren();
 const rect=canvas.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const width=Math.ceil(Math.max(canvas.scrollWidth,canvas.clientWidth)),height=Math.ceil(Math.max(canvas.scrollHeight,canvas.clientHeight));
 svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox','0 0 '+width+' '+height);
 const point=(el,bottom)=>{
  const r=el.getBoundingClientRect();
  return {x:r.left-rect.left+r.width/2,y:(bottom?r.bottom:r.top)-rect.top};
 };
 const path=d=>{
  const item=document.createElementNS(NS,'path');item.setAttribute('d',d);item.setAttribute('fill','none');
  item.setAttribute('stroke','#acbfd8');item.setAttribute('stroke-width','2');
  item.setAttribute('stroke-linecap','round');item.setAttribute('stroke-linejoin','round');svg.appendChild(item);
 };
 const connect=(parent,children)=>{
  if(!parent||!children.length)return;
  const a=point(parent,true),ends=children.map(n=>point(n,false)).sort((x,y)=>x.x-y.x);
  const top=Math.min(...ends.map(p=>p.y));if(top<=a.y+1)return;
  if(ends.length===1&&Math.abs(a.x-ends[0].x)<1){path('M'+a.x+' '+a.y+'V'+ends[0].y);return;}
  const mid=a.y+(top-a.y)/2;
  path('M'+a.x+' '+a.y+'V'+mid);
  if(ends.length===1){path('M'+a.x+' '+mid+'H'+ends[0].x+'V'+ends[0].y);return;}
  path('M'+ends[0].x+' '+mid+'H'+ends[ends.length-1].x);
  for(const p of ends)path('M'+p.x+' '+mid+'V'+p.y);
 };
 for(const root of canvas.querySelectorAll(viewer?'.v-org-root':'.org-root-branch')){
  const rootCard=viewer?first(root,'.v-org-card.root'):first(first(root,'.org-root-row'),'.org-node-root');
  const personWrap=first(root,viewer?'.v-org-region-members':'.org-region-direct-members');
  const people=viewer?direct(personWrap,'.v-org-card.person'):direct(personWrap,'.org-person').map(w=>first(w,'.org-node-person')).filter(Boolean);
  const groupWrap=first(root,viewer?'.v-org-groups':'.org-group-row');
  const groups=direct(groupWrap,viewer?'.v-org-group':'.org-group-wrap');
  let from=rootCard;
  for(const member of people){connect(from,[member]);from=member;}
  connect(from,groups.map(g=>first(g,viewer?'.v-org-branch-heading':'.org-branch-heading')).filter(Boolean));
  for(const group of groups){
   const heading=first(group,viewer?'.v-org-branch-heading':'.org-branch-heading');
   const directWrap=first(group,viewer?'.v-org-direct-members':'.org-branch-direct-members');
   const members=viewer?direct(directWrap,'.v-org-card.person'):direct(directWrap,'.org-person').map(w=>first(w,'.org-node-person')).filter(Boolean);
   let source=heading;
   for(const member of members){connect(source,[member]);source=member;}
   const unitRow=first(group,viewer?'.v-org-divisions':'.org-unit-row');
   const units=direct(unitRow,viewer?'.v-org-division':'.org-unit-col');
   connect(source,units.map(u=>first(u,viewer?'.v-org-card.division':'.org-node-division')).filter(Boolean));
   for(const unit of units){
    let prev=first(unit,viewer?'.v-org-card.division':'.org-node-division');
    const wrap=first(unit,viewer?'.v-org-members':'.org-person-list');
    const staff=viewer?direct(wrap,'.v-org-card.person'):direct(wrap,'.org-person').map(w=>first(w,'.org-node-person')).filter(Boolean);
    for(const person of staff){connect(prev,[person]);prev=person;}
   }
  }
 }
}
