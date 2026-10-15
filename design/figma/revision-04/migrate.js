const done=[];
for(const page of bpPages){await figma.setCurrentPageAsync(page);for(const f of [...page.children].filter(n=>n.type==='FRAME'&&/^[A-Z]\d\d ·/.test(n.name))){const id=f.name.slice(0,3);if(['P01','P02','P03','P04'].includes(id))continue;const parts=f.name.split(' · '),title=parts[1],mobile=f.width===390,area={H:'Heute',P:'Plan',K:'Konten',V:'Vermögen',R:'Reports',F:'Buchungen',G:'Gehaltszettel',E:'Einstellungen',S:'Budget'}[id[0]];
 const keep=[...f.children].filter(n=>!n.name.startsWith('Navigation ·')&&!['Seitenkopf','Hauptnavigation','Bereichsregister'].includes(n.name)&&!(n.type==='TEXT'&&n.y===(mobile?126:96)&&n.characters===title));
 const staging=box(page,'TEMP',0,0,f.width,f.height,null);for(const n of keep)staging.appendChild(n);const c=bpShell(f,title,area);const minY=Math.min(...keep.filter(n=>n.name!=='Dialog-Hintergrund').map(n=>n.y));const delta=c.y-minY;
 for(const n of keep){f.appendChild(n);if(n.name==='Dialog-Hintergrund'){n.resize(f.width,Math.max(f.height,n.height));continue;}n.y+=delta;if(mobile&&n.x>=16)n.x-=4;for(const child of [n,...('findAll'in n?n.findAll(a=>a.type==='FRAME'):[])]){if(child.type==='FRAME'&&child.cornerRadius>4&&child.cornerRadius<13)child.cornerRadius=4;} }
 staging.remove();
 // Add drafting detail to independent chart/metric sections without altering their values.
 const directTexts=f.children.filter(n=>n.type==='TEXT');let pos=1;for(const t of directTexts){if(t.fontSize>=18&&t.fontSize<=22&&t.width>c.w*.6&&t.y>=c.y){const label=String(pos++).padStart(2,'0');const head=t.clone();f.appendChild(head);t.remove();head.x=c.x+34;head.resize(c.w-34,head.height);const e=figma.createEllipse();f.appendChild(e);e.x=c.x;e.y=head.y+2;e.resize(22,22);e.fills=[];e.strokes=[paint('field')];txt(f,label,c.x,head.y+5,22,12,'muted','Medium','CENTER',LABEL);}}
 for(const n of f.children){if(n.type==='TEXT'&&n.fontSize>=30&&n.y>=c.y){const next=f.children.filter(t=>t.y>n.y+n.height&&t.x>=n.x&&t.x<n.x+n.width).sort((a,b)=>a.y-b.y)[0];if(!next||next.y-(n.y+n.height)>=16)bpDim(f,n.x,n.y+n.height+8,Math.min(n.width,c.w));}}
 bpFinish(c);f.setExplicitVariableModeForCollection(collection,modes[mobile?'light':'dark']);f.setExplicitVariableModeForCollection(collection,modes[mobile?'dark':'light']);done.push(id+(mobile?'m':'d'));
}}
return {updated:done.length,screens:done};
