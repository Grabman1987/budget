// Native Figma target-design renderer. All content is synthetic.
// The caller appends `return await renderBatch(specs, pageName);`.
const FAMILY='Archivo', LABEL='Barlow Semi Condensed';
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:FAMILY,style})));
await figma.loadFontAsync({family:LABEL,style:'Medium'});
const palettes={
  light:{ground:'#eef3f9',sidebar:'#e3ebf5',surface:'#ffffff',soft:'#f5f8fc',active:'#dceaf8',title:'#0d5eae',ink:'#0a2342',muted:'#36557a',subtle:'#4d6a89',line:'#d3deec',field:'#6786ac',primary:'#0d5eae',onPrimary:'#ffffff',positive:'#0b7285',positiveSoft:'#d8f1f3',warning:'#8a5300',warningSoft:'#fff3d6',negative:'#b8380a',negativeSoft:'#fdeee6',white:'#ffffff'},
  dark:{ground:'#082d56',sidebar:'#05254a',surface:'#0b3766',soft:'#113b60',active:'#175687',title:'#0d5eae',ink:'#f4f9fe',muted:'#a6cee9',subtle:'#8fb4d1',line:'#1f4d7c',field:'#4987bc',primary:'#d0f4ff',onPrimary:'#082d56',positive:'#4fe3d0',positiveSoft:'#0f4651',warning:'#ffd37a',warningSoft:'#473d2b',negative:'#ff9d7a',negativeSoft:'#4a2c3c',white:'#ffffff'}
};
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
let collection=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='Budget · Zielsystem 2026-10-15');
if(!collection){collection=figma.variables.createVariableCollection('Budget · Zielsystem 2026-10-15');collection.renameMode(collection.defaultModeId,'Hell');collection.addMode('Dunkel');}
const modes={light:collection.modes.find(m=>m.name==='Hell').modeId,dark:collection.modes.find(m=>m.name==='Dunkel').modeId};
const variables={};const local=await figma.variables.getLocalVariablesAsync('COLOR');
for(const key of Object.keys(palettes.light)){
 let v=local.find(v=>v.variableCollectionId===collection.id&&v.name===key);
 if(!v)v=figma.variables.createVariable(key,collection,'COLOR');
 for(const mode of ['light','dark'])v.setValueForMode(modes[mode],rgb(palettes[mode][key]));
 variables[key]=v;
}
const paint=key=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(palettes.light[key])},'color',variables[key]);
const solid=h=>({type:'SOLID',color:rgb(h)});
function box(p,name,x,y,w,h,fill='surface',radius=0,stroke=null){const n=figma.createFrame();n.name=name;p.appendChild(n);n.x=x;n.y=y;n.resize(w,h);n.fills=fill?[paint(fill)]:[];n.cornerRadius=radius;n.clipsContent=false;if(stroke){n.strokes=[paint(stroke)];n.strokeWeight=1;}return n;}
function txt(p,s,x,y,w,size=15,tone='ink',weight='Regular',align='LEFT',family=FAMILY){const n=figma.createText();p.appendChild(n);n.name=s.slice(0,64);n.fontName={family,style:weight};n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.round(size*1.4)};n.fills=[paint(tone)];n.textAutoResize='HEIGHT';n.resize(w,Math.round(size*1.4));n.characters=String(s);n.textAlignHorizontal=align;n.x=x;n.y=y;return n;}
function rule(p,x,y,w){const n=figma.createRectangle();p.appendChild(n);n.name='Trennlinie';n.x=x;n.y=y;n.resize(w,1);n.fills=[paint('line')];return n;}
function icon(p,name,x,y,size=20,tone='muted'){
 const paths={search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m14 6-6 6 6 6"/>',chevron:'<path d="m8 5 7 7-7 7"/>',down:'<path d="m5 9 7 7 7-7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',plan:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',bank:'<path d="m2 8 10-5 10 5H2M3 21h18M5 10v8M12 10v8M19 10v8"/>',chart:'<path d="M3 3v18h18M7 16l5-7 4 3 5-7"/>',report:'<path d="M4 21V3h16v18zM8 16v-4M12 16V8M16 16v-6"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',warning:'<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',edit:'<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5M17 3v5M3 11h18"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>'};
 const n=figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#36557a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.info}</svg>`);p.appendChild(n);n.name='Icon / '+name;n.resize(size,size);n.x=x;n.y=y;for(const c of n.findAll(n=>'strokes' in n))c.strokes=[paint(tone)];return n;
}
let library=figma.root.children.find(p=>p.name==='20 · ZIELSYSTEM · Komponenten');
if(!library){library=figma.createPage();library.name='20 · ZIELSYSTEM · Komponenten';}
await figma.setCurrentPageAsync(library);
const buttons={};
for(const variant of ['Primary','Secondary','Ghost','Danger']){
 let c=library.children.find(n=>n.type==='COMPONENT'&&n.name==='Button / '+variant);
 if(!c){c=figma.createComponent();c.name='Button / '+variant;library.appendChild(c);c.x=40;c.y=120+Object.keys(buttons).length*90;c.resize(180,44);c.cornerRadius=8;c.fills=[paint(variant==='Primary'?'primary':variant==='Danger'?'negativeSoft':variant==='Secondary'?'active':'surface')];c.layoutMode='HORIZONTAL';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.paddingLeft=14;c.paddingRight=14;c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';txt(c,'Aktion',0,0,152,14,variant==='Primary'?'onPrimary':variant==='Danger'?'negative':'ink','SemiBold','CENTER');c.description='44 px target. Label states the result. Theme inherits semantic variables. Keyboard focus requires a 2 px visible outline.';}
 buttons[variant]=c;
}
function button(p,label,x,y,w=140,variant='Secondary',target=null){const n=buttons[variant].createInstance();p.appendChild(n);n.x=x;n.y=y;n.resize(w,44);const t=n.findOne(n=>n.type==='TEXT');t.characters=label;t.layoutGrow=1;t.textAutoResize='HEIGHT';t.resize(w-28,24);n.name=(target?'GO '+target+' · ':'')+label;return n;}
function tag(p,label,x,y,w=100,tone='muted'){const bg=tone==='positive'?'positiveSoft':tone==='negative'?'negativeSoft':tone==='warning'?'warningSoft':'soft';box(p,'Status',x,y,w,26,bg,13);txt(p,label,x+9,y+4,w-18,12,tone,'Medium');}
function field(p,label,value,x,y,w,options={}){txt(p,label,x,y,w,13,'muted','Medium');const n=box(p,'Feld / '+label,x,y+24,w,44,'surface',8,options.error?'negative':'field');txt(n,value||'Bitte auswählen',12,11,w-42,15,value?'ink':'subtle');if(options.select)icon(n,'down',w-30,12,20);if(options.date)icon(n,'calendar',w-32,12,20);if(options.error)txt(p,options.error,x,y+72,w,13,'negative');return n;}
function sectionTitle(p,title,x,y,w,action){txt(p,title,x,y,w,19,'ink','SemiBold');if(action)txt(p,action,x+w-150,y+3,150,13,'muted','Medium','RIGHT');}
function lineChart(p,x,y,w,h,opts={}){
 const n=box(p,opts.name||'Diagramm · Zeitachse',x,y,w,h,'surface',8);const l=48,r=16,t=20,b=34;
 for(let i=0;i<4;i++){const yy=t+(h-t-b)*i/3;rule(n,l,yy,w-l-r);txt(n,(opts.labels||['110','105','100','95'])[i],4,yy-8,36,12,'subtle','Medium','RIGHT',LABEL);}
 const points=opts.points||[.72,.66,.7,.51,.54,.42,.48,.24,.3,.18,.21,.08];
 const pts=points.map((v,i)=>`${l+(w-l-r)*i/(points.length-1)},${t+(h-t-b)*v}`).join(' ');
 const svg=figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#0b7285" stroke-width="2"/></svg>`);n.appendChild(svg);svg.name='Ist · echte Zeitabstände';for(const c of svg.findAll(n=>'strokes' in n))c.strokes=[paint('positive')];
 txt(n,opts.start||'01. Okt.',l,h-24,70,12,'subtle','Medium','LEFT',LABEL);txt(n,opts.end||'31. Okt.',w-90,h-24,74,12,'subtle','Medium','RIGHT',LABEL);
 return n;
}
function rows(p,items,x,y,w,options={}){const mobile=options.mobile;let yy=y;items.forEach((r,i)=>{const rh=mobile?64:(r[2]&&r[2]!=='group'?56:44);if(i%2===1)box(p,'Zeilenfläche',x,yy,w,rh,'soft',0);txt(p,r[0],x+12,yy+5,w*.65-24,mobile?15:14,'ink',r[2]==='group'?'SemiBold':'Regular');if(r[2]&&r[2]!=='group')txt(p,r[2],x+12,yy+(mobile?32:25),w*.65-18,12,'subtle');txt(p,r[1]||'',x+w*.65,yy+9,w*.35-12,mobile?15:14,r[3]||'ink','Medium','RIGHT');rule(p,x,yy+rh,w);yy+=rh;});return yy;}
function tabs(p,labels,x,y,w,mobile){let xx=x;for(let i=0;i<labels.length;i++){const ww=Math.min((w-8*(labels.length-1))/labels.length,150);const n=box(p,'Register '+labels[i],xx,y,ww,44,i===0?'active':null,8);txt(n,labels[i],6,12,ww-12,mobile?13:14,i===0?'ink':'muted',i===0?'SemiBold':'Regular','CENTER');xx+=ww+8;}return y+60;}
function note(p,text,x,y,w,tone='muted'){const n=box(p,'Hinweis',x,y,w,64,tone==='negative'?'negativeSoft':tone==='warning'?'warningSoft':'soft',8);icon(n,tone==='negative'?'warning':'info',12,18,20,tone);txt(n,text,42,12,w-54,13,tone);return y+80;}
function stat(p,label,value,x,y,w,sub){txt(p,label,x,y,w,13,'muted','Medium');txt(p,value,x,y+24,w,30,'ink','SemiBold');if(sub)txt(p,sub,x,y+72,w,13,'subtle');}
function shell(page,s,mode,mobile,index){const w=mobile?390:1440,h=mobile?1120:900;const f=box(page,`${s.id} · ${s.title} · ${mobile?'Phone 390':'Desktop 1440'} · ${mode==='dark'?'Dunkel':'Hell'}`,mobile?1520:0,index*2000,w,h,'ground',0);f.setExplicitVariableModeForCollection(collection,modes[mode]);f.clipsContent=true;const x=mobile?16:260,cw=mobile?358:1156;
 if(!mobile){const side=box(f,'Navigation · 236 px · 200–360 verstellbar',0,0,236,h,'sidebar');txt(side,'Budget',24,28,188,26,'ink','Bold');button(side,'Suchen · Strg K',16,82,204,'Secondary','S01');const names=['Heute','Plan','Konten','Vermögen','Reports'];const ids=['H01','P01','K01','V01','R00'];const icons=['home','plan','bank','chart','report'];names.forEach((name,i)=>{const n=box(side,'GO '+ids[i]+' · '+name,12,152+i*52,212,44,name===s.area?'active':null,8);icon(n,icons[i],14,12,20,name===s.area?'ink':'muted');txt(n,name,46,12,154,15,'ink',name===s.area?'SemiBold':'Regular');});rule(side,16,430,204);txt(side,'KONTEN',24,450,188,12,'subtle','Medium','LEFT',LABEL);rows(side,[['Budget-Konten','4.820 €'],['Musterkonto','3.920 €'],['Bargeld','140 €'],['Rücklagen','760 €'],['Depots','18.600 €']],12,480,212);button(side,'Einstellungen',16,h-76,204,'Ghost','E00');}
 const header=box(f,'Seitenkopf',mobile?0:236,0,mobile?390:1204,mobile?104:72,'title');txt(header,s.area==='Reports'?'Reports':s.area,mobile?16:24,16,mobile?242:500,mobile?24:28,'white','SemiBold');if(mobile){icon(header,'search',290,24,20,'white');icon(header,'plus',342,24,24,'white');txt(header,'Oktober 2026 · Musterdaten',16,62,350,13,'white');}else {txt(header,'Oktober 2026  ·  Musterdaten',24,50,650,13,'white');button(header,'Buchung erfassen',986,22,194,'Secondary','F01');}
 const y=mobile?126:96;if(!(s.id.startsWith('P0')&&Number(s.id.slice(1))<=4))txt(f,s.title,x,y,cw,mobile?24:28,'ink','SemiBold');if(mobile){const nav=box(f,'Hauptnavigation',0,h-72,390,72,'sidebar');['Heute','Plan','Konten','Vermögen','Reports'].forEach((name,i)=>{icon(nav,['home','plan','bank','chart','report'][i],29+i*78,10,20,name===s.area?'ink':'muted');txt(nav,name,i*78,38,78,12,'muted','Medium','CENTER');});}
 return {f,x,y:s.id.startsWith('P0')&&Number(s.id.slice(1))<=4?(mobile?120:88):y+56,w:cw,mobile,mode};
}
