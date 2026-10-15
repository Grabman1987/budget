await Promise.all(['Regular','Medium','SemiBold'].map(style=>figma.loadFontAsync({family:'Barlow Semi Condensed',style})));
let labels=0,sideLabels=0,rows=0;
for(const p of figma.root.children.filter(p=>/^2[1-9] ·|^30 ·|^31 ·/.test(p.name))){await figma.setCurrentPageAsync(p);for(const f of p.children.filter(n=>n.type==='FRAME')){
 if(f.width===1440)for(const h of f.children.filter(n=>n.name.startsWith('Schriftfeld'))){const t=h.children.find(n=>n.type==='TEXT'&&n.characters.startsWith('BLATT'));if(t&&t.width>730)t.resize(730,t.height);}
 const side=f.children.find(n=>n.name==='Navigation · Planliste');if(side)for(const t of side.findAll(n=>n.type==='TEXT'&&n.x===8&&n.width===126)){t.resize(120,t.height);sideLabels++;}
 if(f.width===390){const reg=f.children.find(n=>n.name==='Bereichsregister');if(reg)for(const t of reg.findAll(n=>n.type==='TEXT')){t.fontName={family:'Barlow Semi Condensed',style:t.fontName.style};labels++;}
 for(const table of f.children.filter(n=>n.type==='FRAME'&&n.name.startsWith('Stückliste'))){const rs=table.children.filter(n=>n.type==='FRAME'&&n.name.startsWith('Position '));let delta=0;for(const r of rs){r.y+=delta;const need=Math.max(...r.children.filter(n=>n.type==='TEXT').map(t=>t.y+t.height))+14;if(need>r.height){const d=need-r.height;for(const line of r.children.filter(n=>n.type==='LINE'&&n.y===r.height))line.y+=d;r.resize(r.width,need);delta+=d;rows++;}}if(delta){const oldBottom=table.y+table.height;table.resize(table.width,table.height+delta);for(const n of f.children)if(n!==table&&n.y>=oldBottom)n.y+=delta;if(!/^30 ·/.test(p.name))f.resize(f.width,f.height+delta);}}
 }
}
}
return {labels,sideLabels,rows};
