/* PLK KPI: editable PowerPoint export for organization chart.
   Uses PptxGenJS browser bundle on demand; no event or chart data is uploaded. */
(function(){
 'use strict';
 const SCRIPT_URL='https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
 const W=13.333,H=7.5, FONT='Malgun Gothic';
 let loadPromise=null;
 function getPptx(){
  if(typeof window.pptxgen==='function')return Promise.resolve(window.pptxgen);
  if(loadPromise)return loadPromise;
  loadPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=SCRIPT_URL;script.async=true;
   script.onload=()=>typeof window.pptxgen==='function'?resolve(window.pptxgen):reject(new Error('PPT 생성 라이브러리를 확인할 수 없습니다.'));
   script.onerror=()=>reject(new Error('PPT 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
   document.head.appendChild(script);
  }).catch(err=>{loadPromise=null;throw err;});
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
   node.color==='default'&&node.type==='group'?palettes.navy:
   node.color==='default'&&node.type==='division'?palettes.blue:palette;
  boxes(slide,pptx,x,y,w,h,c[0],c[1],c[2]);
  const role=roles[orgEffectiveRole(node)]||'';
  const subtitle=String(node.subtitle||'').trim();
  const date=orgJoinYearMonth(node.joinDate);
  const more=[role,subtitle.replace(/\s+/g,'')===role?'':subtitle,date?'입사 '+date:''].filter(Boolean);
  const main=clamp(node.label||'이름 미입력',opts.maxLabel||36);
  const titleH=more.length?Math.max(.23,h*.52):h-.06;
  text(slide,main,x+.08,y+.04,w-.16,titleH,{size:opts.fontSize||13,bold:true,color:c[1]});
  if(more.length){
   text(slide,clamp(more.join(' · '),opts.maxSub||64),x+.06,y+titleH,w-.12,Math.max(.19,h-titleH-.05),
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
 function getDirect(id){return orgChildren(id);}
 function countSummary(){
  const counts={regional:0,branch:0,division:0,manager:0};
  for(const node of orgNodes){
   const role=orgEffectiveRole(node);
   if(counts.hasOwnProperty(role)&&orgCountable(node))counts[role]++;
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
 function overview(pptx,root,groups,pageCounter){
  const chunks=slice(groups,4);
  for(let i=0;i<Math.max(1,chunks.length);i++){
   const slide=pptx.addSlide(),part=chunks[i]||[];
   base(slide,pptx,'PLK 조직도 · 전체 현황','권역 · 지사 · 본부 구조  |  지사별 상세 구성은 다음 슬라이드에서 확인할 수 있습니다.',++pageCounter.value);
   card(slide,pptx,root,4.78,1.33,3.77,.74,{fontSize:17});
   if(part.length){
    const boxW=2.92,gap=.19,total=part.length*boxW+(part.length-1)*gap,start=(W-total)/2,top=2.69;
    const center= (node)=>start+part.indexOf(node)*(boxW+gap)+boxW/2;
    if(part.length>1)line(slide,pptx,center(part[0]),2.38,center(part[part.length-1]),2.38);
    line(slide,pptx,W/2,2.07,W/2,2.38);
    part.forEach(group=>{
     const x=start+part.indexOf(group)*(boxW+gap),cx=x+boxW/2;
     line(slide,pptx,cx,2.38,cx,top);
     card(slide,pptx,group,x,top,boxW,.7,{fontSize:14});
     const divisions=getDirect(group.id);
     for(let j=0;j<Math.min(divisions.length,4);j++){
      const yy=3.63+j*.59;
      line(slide,pptx,cx,j===0?top+.7:3.63+(j-1)*.59+.47,cx,yy);
      const division=divisions[j];
      card(slide,pptx,division,x+.18,yy,boxW-.36,.47,{fontSize:11});
     }
     if(divisions.length>4)text(slide,'외 '+(divisions.length-4)+'개 본부 / 팀',x+.2,6.1,boxW-.4,.26,{size:9,color:'657990'});
    });
   }
   summary(slide,pptx,6.43);
  }
 }
 function detail(pptx,group,root,pageCounter){
  const divisions=getDirect(group.id),divisionChunks=slice(divisions,3);
  if(!divisionChunks.length)divisionChunks.push([]);
  for(const divisionChunk of divisionChunks){
   const pages=Math.max(1,...divisionChunk.map(d=>Math.ceil(getDirect(d.id).length/6)));
   for(let chunkIndex=0;chunkIndex<pages;chunkIndex++){
    const slide=pptx.addSlide();
    base(slide,pptx,group.label+' · 조직 상세',root.label+'  |  '+group.label+(pages>1?'  ('+(chunkIndex+1)+'/'+pages+')':''),++pageCounter.value);
    card(slide,pptx,group,4.78,1.24,3.77,.68,{fontSize:16});
    const width=3.75,gap=.34,total=divisionChunk.length*width+(divisionChunk.length-1)*gap,start=(W-total)/2;
    if(divisionChunk.length){
     const center= (d)=>start+divisionChunk.indexOf(d)*(width+gap)+width/2;
     const top=2.46;
     line(slide,pptx,W/2,1.92,W/2,2.18);
     if(divisionChunk.length>1)line(slide,pptx,center(divisionChunk[0]),2.18,center(divisionChunk[divisionChunk.length-1]),2.18);
     divisionChunk.forEach(d=>{
      const x=start+divisionChunk.indexOf(d)*(width+gap),cx=x+width/2;
      line(slide,pptx,cx,2.18,cx,top);
      card(slide,pptx,d,x,top,width,.62,{fontSize:14});
      const members=getDirect(d.id).slice(chunkIndex*6,(chunkIndex+1)*6);
      members.forEach((person,j)=>{
       const yy=3.34+j*.55;
       if(j===0)line(slide,pptx,cx,top+.62,cx,yy);
       else line(slide,pptx,cx,yy-.07,cx,yy);
       card(slide,pptx,person,x+.17,yy,width-.34,.48,{fontSize:12,subSize:9,maxSub:65});
      });
      if(!members.length&&chunkIndex===0)
       text(slide,'등록된 구성원이 없습니다',x+.14,3.52,width-.28,.38,{size:10,color:'8997AA'});
     });
    }
   }
  }
 }
 async function doExport(){
  if(!Array.isArray(orgNodes)||!orgNodes.length){orgStatus('다운로드할 조직도가 없습니다.',true);return;}
  const button=document.getElementById('orgExportPpt');
  if(button.disabled)return;
  button.disabled=true;const old=button.textContent;button.textContent='PPT 생성 중…';
  try{
   const Ctor=await getPptx();
   const pptx=new Ctor();pptx.layout='LAYOUT_WIDE';pptx.author='PLK KPI';pptx.subject='조직도';pptx.title='PLK 조직도';pptx.lang='ko-KR';
   pptx.theme={headFontFace:FONT,bodyFontFace:FONT,lang:'ko-KR'};
   const pageCounter={value:0};
   const roots=orgChildren(null);
   for(const root of roots){
    const groups=getDirect(root.id);
    overview(pptx,root,groups,pageCounter);
    for(const group of groups)detail(pptx,group,root,pageCounter);
   }
   if(!roots.length)throw new Error('최상위 조직이 없습니다.');
   const title=String(roots[0].label||'PLK').replace(/[\\/:*?"<>|]/g,'_').slice(0,36);
   const name=title+'_조직도.pptx';
   await pptx.writeFile({fileName:name});
   orgStatus('조직도 PPT 다운로드를 완료했습니다. 현재 화면의 카드 정보가 반영되어 있습니다.');
  }catch(err){console.error(err);orgStatus('PPT 다운로드 오류: '+(err.message||String(err)),true);}
  finally{button.disabled=false;button.textContent=old;}
 }
 const button=document.getElementById('orgExportPpt');
 if(button)button.addEventListener('click',doExport);
})();
