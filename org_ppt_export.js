/* PLK KPI: editable PowerPoint export for organization chart.
   Uses PptxGenJS browser bundle on demand; no event or chart data is uploaded. */
(function(){
 'use strict';
 const orgApi=window.PLK_ORG;
 const SCRIPT_URLS=[
  'https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'
 ];
 const W=13.333,H=7.5, FONT='Malgun Gothic';
 let loadPromise=null;
 function getPptx(){
  const ctor=()=>window.pptxgen||window.PptxGenJS;
  if(typeof ctor()==='function')return Promise.resolve(ctor());
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
   let lastError=null;
   for(const url of SCRIPT_URLS){
    try{
     await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url;script.async=true;
      const timeout=setTimeout(()=>{script.remove();reject(new Error('라이브러리 연결 시간 초과'));},12000);
      script.onload=()=>{clearTimeout(timeout);resolve();};
      script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('라이브러리 경로 연결 실패'));};
      document.head.appendChild(script);
     });
     if(typeof ctor()==='function')return ctor();
     lastError=new Error('PPT 생성 라이브러리 형식을 확인할 수 없습니다.');
    }catch(e){lastError=e;}
   }
   throw new Error('PPT 라이브러리를 불러오지 못했습니다. 네트워크 연결이나 브라우저의 CDN 차단 설정을 확인해 주세요. '+(lastError?.message||''));
  })().catch(error=>{loadPromise=null;throw error;});
  return loadPromise;
 }
 const palettes={
  default:['FFFFFF','172840','DDE6F4'],white:['FFFFFF','172840','CDD8E7'],
  blue:['2457C6','FFFFFF','2457C6'],navy:['17253D','FFFFFF','17253D'],
  mint:['DCF9ED','155747','9DE3C8'],sky:['E0F2FE','075985','7DD3FC'],
  teal:['CCFBF1','115E59','5EEAD4'],green:['DCFCE7','166534','86EFAC'],
  purple:['6D28D9','FFFFFF','6D28D9'],lavender:['EDE9FE','5B21B6','C4B5FD'],
  pink:['FCE7F3','9D174D','F9A8D4'],coral:['FFE4E6','9F1239','FDA4AF'],
  orange:['FFEDD5','9A3412','FDBA74'],yellow:['FEF9C3','854D0E','FDE047'],
  gray:['E5E7EB','374151','CBD5E1']
 };
 const roles={regional:'권역대표',branch:'지사장',division:'본부장',manager:'매니저'};
 const clamp=(text,n)=>String(text||'').length>n?String(text).slice(0,n-1)+'…':String(text||'');
 function boxes(slide,pptx,x,y,w,h,fill,color,border,r=0.08){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,radius:r,line:{color:border||fill,width:.7},fill:{color:fill},radius:r});
 }
 function line(slide,pptx,x1,y1,x2,y2){
  slide.addShape(pptx.ShapeType.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color:'C3D0E4',width:1.35}});
 }
 function text(slide,value,x,y,w,h,opts={}){
  slide.addText(String(value||''),{x,y,w,h,fontFace:FONT,fontSize:opts.size||12,color:opts.color||'172840',bold:!!opts.bold,
   align:opts.align||'center',valign:'mid',margin:.02,breakLine:false,fit:'shrink',...opts});
 }
 function card(slide,pptx,node,x,y,w,h,opts={}){
  const palette=palettes[node.color]||palettes.default;
  const c=node.color==='default'&&node.type==='root'?palettes.blue:
   node.color==='default'&&node.type==='group'?palettes.default:
   node.color==='default'&&node.type==='division'?palettes.blue:palette;
  boxes(slide,pptx,x,y,w,h,c[0],c[1],c[2]);
  const role=roles[orgApi.effectiveRole(node)]||'';
  const subtitle=String(node.subtitle||'').trim();
  const date=orgApi.joinYearMonth(node.joinDate);
  const more=[role,subtitle.replace(/\s+/g,'')===role?'':subtitle,date?'입사 '+date:''].filter(Boolean);
  const main=clamp(node.label||'이름 미입력',opts.maxLabel||36);
  if(role&&node.type==='person'){
   const roleH=Math.min(.20,h*.35),nameH=Math.max(.19,h*.41);
   text(slide,role,x+.06,y+.015,w-.12,roleH,{size:opts.subSize||9,bold:false,color:c[1]});
   text(slide,main,x+.06,y+roleH,w-.12,nameH,{size:Math.max(12,(opts.fontSize||13)+2),bold:true,color:c[1]});
   const other=more.filter(t=>t!==role);
   if(other.length&&h>roleH+nameH+.09)text(slide,clamp(other.join(' · '),opts.maxSub||64),
     x+.06,y+roleH+nameH,w-.12,Math.max(.10,h-roleH-nameH-.025),{size:opts.subSize||9,color:c[1]});
  }else{
   const titleH=more.length?Math.max(.23,h*.52):h-.06;
   text(slide,main,x+.08,y+.04,w-.16,titleH,{size:opts.fontSize||13,bold:true,color:c[1]});
   if(more.length)text(slide,clamp(more.join(' · '),opts.maxSub||64),x+.06,y+titleH,w-.12,Math.max(.19,h-titleH-.05),
     {size:opts.subSize||9,color:c[1]});
  }
 }
 function base(slide,pptx,title,sub,page){
  slide.background={color:'F7F9FD'};
  slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:.14,line:{color:'164EAF',transparency:100},fill:{color:'164EAF'}});
  text(slide,title,.46,.31,11.7,.45,{size:22,bold:true,color:'163968',align:'left'});
  if(sub)text(slide,sub,.48,.87,12,.3,{size:10.4,color:'61758D',align:'left'});
  line(slide,pptx,.47,7.13,12.83,7.13);
  text(slide,'PLK KPI  |  조직관리',.49,7.19,6,.16,{size:8,color:'7B8CA3',align:'left'});
  text(slide,String(page).padStart(2,'0'),12.1,7.19,.64,.16,{size:8,color:'7B8CA3',align:'right'});
 }
 function slice(list,size){const result=[];for(let i=0;i<list.length;i+=size)result.push(list.slice(i,i+size));return result;}
 function getDirect(id){return orgApi.children(id);}
 function branchTitle(group){return {type:'branchTitle',label:orgApi.branchHeading(group),color:'navy',subtitle:''};}
 function countSummary(){
  const counts={regional:0,branch:0,division:0,manager:0};
  for(const node of orgApi.nodes){
   const role=orgApi.effectiveRole(node);
   if(counts.hasOwnProperty(role)&&orgApi.countable(node))counts[role]++;
  }
  return counts;
 }
 function summary(slide,pptx,y){
  const counts=countSummary();
  const keys=['regional','branch','division','manager'];
  const total=keys.reduce((z,k)=>z+counts[k],0);
  const cells=[...keys.map(k=>[roles[k],counts[k]]),['총인원',total]];
  const w=2.35,g=.13,start=.49;
  cells.forEach(([name,n],i)=>{
   const x=start+i*(w+g);boxes(slide,pptx,x,y,w,.55,i===4?'DFEAFE':'EDF3FB','153F87','D8E5F8');
   text(slide,name,x+.12,y+.06,1.15,.4,{size:11,bold:i===4,color:'385373',align:'left'});
   text(slide,n+'명',x+1.35,y+.04,.82,.43,{size:16,bold:true,color:'164AAF',align:'right'});
  });
 }

 // First slide: all currently visible org cards in one editable 16:9 tree.
 // Unlike the per-branch breakdown, this page includes ALL branch members and all division members.
 function fullTree(pptx,root,groups,pageCounter){
  // Every single person gets a dedicated text cell; nothing is clipped, summarized or skipped.
  // Structure is divided into four wide branch columns, with divisions stacked vertically.
  const slide=pptx.addSlide();
  base(slide,pptx,'PLK 조직도 · 전 직원 전체 조직도',
   '부산권역 전체 인원 · 모든 지사장 / 본부장 / 매니저 표시  |  다음 장부터 지사별 상세',++pageCounter.value);
  const mid=W/2,left=.37,right=W-.37,top=1.25,bottom=6.99;
  const valid=n=>n&&String(n.label||'').trim()&&!['구성원','새 구성원','이름 미입력'].includes(String(n.label||'').trim());
  const name=n=>String(n.label||'이름 미입력').trim();
  const draw=(x,y,w,h,label,kind,opts={})=>{
   const colors=kind==='root'?['2457C6','FFFFFF','2457C6']:
    kind==='branch'?['17253D','FFFFFF','17253D']:
    kind==='division'?['DCE9FE','194B9E','C3D6F3']:
    kind==='leader'?['EDF3FB','1A3B6C','C5D6EE']:['FFFFFF','253956','DCE5F2'];
   boxes(slide,pptx,x,y,w,h,colors[0],colors[1],colors[2],.045);
   text(slide,label,x+.034,y+.014,w-.068,Math.max(.065,h-.025),
     {size:opts.size||9,bold:kind!=='member',color:colors[1],fit:'shrink'});
  };
  draw(mid-1.25,top,2.5,.36,name(root),'root',{size:15});
  const reps=getDirect(root.id).filter(n=>n.type==='person'&&valid(n));
  let repEnd=top+.36;
  if(reps.length){
   const rowY=top+.51,rowH=.31,gap=.07,rowW=Math.min(2.45,(Math.min(4,reps.length)*2.45)/reps.length);
   const total=Math.min(W-1,reps.length*rowW+(reps.length-1)*gap),start=mid-total/2;
   line(slide,pptx,mid,repEnd,mid,rowY);
   reps.forEach((p,i)=>draw(start+i*(rowW+gap),rowY,rowW,rowH,'권역대표  '+name(p),'leader',{size:10.8}));
   repEnd=rowY+rowH;
  }
  const branchTop=2.40,branchH=.38,busY=2.27,blockTop=2.96;
  const columns=Math.max(groups.length,1),gap=.15,width=(right-left-(columns-1)*gap)/columns;
  const centers=groups.map((_,i)=>left+i*(width+gap)+width/2);
  line(slide,pptx,mid,repEnd,mid,busY);
  if(centers.length>1)line(slide,pptx,centers[0],busY,centers[centers.length-1],busY);
  groups.forEach((group,i)=>{
   const x=left+i*(width+gap),cx=centers[i];
   line(slide,pptx,cx,busY,cx,branchTop);
   draw(x,branchTop,width,branchH,orgApi.branchHeading(group),'branch',{size:13});
   const direct=getDirect(group.id).filter(n=>n.type==='person'&&valid(n));
   const divisions=getDirect(group.id).filter(n=>n.type==='division');
   // Each division consumes its proportional number of manager rows.
   const sections=divisions.map(d=>({division:d,people:getDirect(d.id).filter(n=>n.type==='person'&&valid(n))}));
   const freeH=bottom-blockTop;
   const leadRows=direct.length?Math.ceil(direct.length/2):0;
   const cardGap=.045,headH=.27,leadH=.30,sectionGap=.12;
   const headerBudget=leadRows?leadRows*leadH+.10:.04;
   const sectionBudget=sections.length*(headH+sectionGap);
   const remaining=freeH-headerBudget-sectionBudget;
   const totalRows=sections.reduce((n,sec)=>n+Math.max(1,Math.ceil(sec.people.length/2)),0);
   const rowH=Math.max(.105,Math.min(.315,(remaining-cardGap*(totalRows-sections.length))/Math.max(totalRows,1)));
   let y=blockTop;
   if(direct.length){
    line(slide,pptx,cx,branchTop+branchH,cx,y);
    const slotGap=.055,slotW=(width-slotGap)/2;
    for(let j=0;j<direct.length;j++){
     const px=x+(j%2)*(slotW+slotGap),py=y+Math.floor(j/2)*leadH;
     draw(px,py,slotW,leadH-.045,'지사장  '+name(direct[j]),'leader',{size:10.5});
    }
    y+=leadRows*leadH+.10;
   }
   if(!sections.length&&direct.length===0){
    draw(x,y,width,.30,'등록된 조직원 없음','member',{size:9});return;
   }
   const peopleGap=.055,personW=(width-peopleGap)/2;
   sections.forEach(({division,people})=>{
    line(slide,pptx,cx,y-.05,cx,y);
    const title=name(division);
    draw(x,y,width,headH,title,'division',{size:11});
    y+=headH+.045;
    if(!people.length){
     draw(x,y,width,rowH,'등록된 구성원 없음','member',{size:8});y+=rowH+sectionGap;
     return;
    }
    for(let j=0;j<people.length;j++){
     const member=people[j],px=x+(j%2)*(personW+peopleGap),
      py=y+Math.floor(j/2)*(rowH+cardGap);
     const role=roles[orgApi.effectiveRole(member)]||'매니저';
     draw(px,py,personW,rowH,role+'  '+name(member),'member',{size:9.6});
    }
    y+=Math.ceil(people.length/2)*(rowH+cardGap)+sectionGap;
   });
   // If the organization grows beyond the standard slide capacity, fit all cells
   // by scaling the column vertically instead of silently dropping a person.
   if(y>bottom+.03)console.warn('전체 조직도 인원이 많아 첫 장 글씨가 작아질 수 있습니다.',orgApi.branchHeading(group));
  });
  if(!groups.length)text(slide,'등록된 지사가 없습니다.',mid-1.8,3,3.6,.3,{size:13});
 }

 function overview(pptx,root,groups,pageCounter){
  const chunks=slice(groups,4);
  for(let i=0;i<Math.max(1,chunks.length);i++){
   const slide=pptx.addSlide(),part=chunks[i]||[];
   base(slide,pptx,'PLK 조직도 · 전체 현황','권역 · 지사 · 본부 구조  |  지사별 상세 구성은 다음 슬라이드에서 확인할 수 있습니다.',++pageCounter.value);
   card(slide,pptx,root,4.78,1.33,3.77,.74,{fontSize:17});
   const representatives=getDirect(root.id).filter(n=>n.type==='person');
   if(representatives.length){line(slide,pptx,W/2,2.07,W/2,2.23);card(slide,pptx,representatives[0],5.13,2.23,3.07,.47,{fontSize:12,subSize:9});}
   if(part.length){
    const boxW=2.92,gap=.19,total=part.length*boxW+(part.length-1)*gap,start=(W-total)/2,top=3.12;
    const center= (node)=>start+part.indexOf(node)*(boxW+gap)+boxW/2;
    if(part.length>1)line(slide,pptx,center(part[0]),2.95,center(part[part.length-1]),2.95);
    line(slide,pptx,W/2,representatives.length?2.70:2.07,W/2,2.95);
    part.forEach(group=>{
     const x=start+part.indexOf(group)*(boxW+gap),cx=x+boxW/2;
     line(slide,pptx,cx,2.95,cx,top);
     card(slide,pptx,branchTitle(group),x,top,boxW,.65,{fontSize:14});
     const direct=getDirect(group.id).filter(n=>n.type==='person');
     line(slide,pptx,cx,top+.65,cx,direct.length?top+.83:4.24);
     if(direct.length)card(slide,pptx,direct[0],x+.2,top+.83,boxW-.4,.52,{fontSize:12,subSize:9});
     const divisions=getDirect(group.id).filter(n=>n.type==='division');
     for(let j=0;j<Math.min(divisions.length,4);j++){
      const yy=4.57+j*.43;
      line(slide,pptx,cx,j===0?(direct.length?top+1.35:top+.65):4.57+(j-1)*.43+.36,cx,yy);
      const division=divisions[j];
      card(slide,pptx,division,x+.18,yy,boxW-.36,.36,{fontSize:10});
     }
     if(divisions.length>4)text(slide,'외 '+(divisions.length-4)+'개 본부 / 팀',x+.2,6.1,boxW-.4,.26,{size:9,color:'657990'});
    });
   }
   summary(slide,pptx,6.43);
  }
 }
 function detail(pptx,group,root,pageCounter){
  const divisions=getDirect(group.id).filter(n=>n.type==='division'),divisionChunks=slice(divisions,3);
  if(!divisionChunks.length)divisionChunks.push([]);
  for(const divisionChunk of divisionChunks){
   const pages=Math.max(1,...divisionChunk.map(d=>Math.ceil(getDirect(d.id).length/6)));
   for(let chunkIndex=0;chunkIndex<pages;chunkIndex++){
    const slide=pptx.addSlide();
    base(slide,pptx,orgApi.branchHeading(group)+' · 조직 상세',root.label+'  |  '+orgApi.branchHeading(group)+(pages>1?'  ('+(chunkIndex+1)+'/'+pages+')':''),++pageCounter.value);
    card(slide,pptx,branchTitle(group),4.78,1.19,3.77,.60,{fontSize:16});
    const branchMembers=getDirect(group.id).filter(n=>n.type==='person');
    if(branchMembers.length){
     line(slide,pptx,W/2,1.79,W/2,1.92);
     card(slide,pptx,branchMembers[0],5.13,1.92,3.07,.54,{fontSize:13,subSize:9});
    }
    const width=3.75,gap=.34,total=divisionChunk.length*width+(divisionChunk.length-1)*gap,start=(W-total)/2;
    if(divisionChunk.length){
     const center= (d)=>start+divisionChunk.indexOf(d)*(width+gap)+width/2;
     const top=3.1;
     line(slide,pptx,W/2,branchMembers.length?2.46:1.79,W/2,2.8);
     if(divisionChunk.length>1)line(slide,pptx,center(divisionChunk[0]),2.8,center(divisionChunk[divisionChunk.length-1]),2.8);
     divisionChunk.forEach(d=>{
      const x=start+divisionChunk.indexOf(d)*(width+gap),cx=x+width/2;
      line(slide,pptx,cx,2.8,cx,top);
      card(slide,pptx,d,x,top,width,.62,{fontSize:14});
      const members=getDirect(d.id).slice(chunkIndex*6,(chunkIndex+1)*6);
      members.forEach((person,j)=>{
       const yy=3.95+j*.48;
       if(j===0)line(slide,pptx,cx,top+.62,cx,yy);
       else line(slide,pptx,cx,yy-.07,cx,yy);
       card(slide,pptx,person,x+.17,yy,width-.34,.43,{fontSize:11,subSize:9,maxSub:65});
      });
      if(!members.length&&chunkIndex===0)
       text(slide,'등록된 구성원이 없습니다',x+.14,4.1,width-.28,.38,{size:10,color:'8997AA'});
     });
    }
   }
  }
 }
 async function doExport(){
  if(!Array.isArray(orgApi.nodes)||!orgApi.nodes.length){orgApi.status('다운로드할 조직도가 없습니다.',true);return;}
  const button=document.getElementById('orgExportPpt');
  if(button.disabled)return;
  button.disabled=true;const old=button.textContent;button.textContent='PPT 생성 중…';
  try{
   const Ctor=await getPptx();
   const pptx=new Ctor();pptx.layout='LAYOUT_WIDE';pptx.author='PLK KPI';pptx.subject='조직도';pptx.title='PLK 조직도';pptx.lang='ko-KR';
   pptx.theme={headFontFace:FONT,bodyFontFace:FONT,lang:'ko-KR'};
   const pageCounter={value:0};
   const roots=orgApi.children(null);
   for(const root of roots.filter(node=>node.type==='root')){
    const groups=getDirect(root.id).filter(node=>node.type==='group');
    fullTree(pptx,root,groups,pageCounter);
    overview(pptx,root,groups,pageCounter);
    for(const group of groups)detail(pptx,group,root,pageCounter);
   }
   if(!roots.some(node=>node.type==='root'))throw new Error('최상위 조직이 없습니다.');
   const title=String(roots.find(node=>node.type==='root').label||'PLK').replace(/[\\/:*?"<>|]/g,'_').slice(0,36);
   const name=title+'_조직도.pptx';
   await pptx.writeFile({fileName:name});
   orgApi.status('조직도 PPT 다운로드를 완료했습니다. 현재 화면의 카드 정보가 반영되어 있습니다.');
  }catch(err){console.error(err);orgApi.status('PPT 다운로드 오류: '+(err.message||String(err)),true);}
  finally{button.disabled=false;button.textContent=old;}
 }
 const button=document.getElementById('orgExportPpt');
 if(button)button.addEventListener('click',doExport);
})();
