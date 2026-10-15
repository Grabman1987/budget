for(const id of IDS){const f=await figma.getNodeByIdAsync(id);const rev=f.findAll(n=>n.type==='FRAME'&&n.name.startsWith('REV06 ·'));if(!rev.length)continue;
for(const root of rev){for(const inst of root.findAll(n=>n.type==='INSTANCE'&&/^(Aktiv|Inaktiv) ·/.test(n.name))){const title=inst.name.replace(/^(Aktiv|Inaktiv) · /,''),yes=inst.name.startsWith('Aktiv'),parent=inst.parent,index=parent.children.indexOf(inst),w=inst.width;const row=stack(parent,'Kontrollkästchen · '+title,w,'HORIZONTAL',8);row.counterAxisAlignItems='CENTER';parent.insertChild(index,row);row.appendChild(inst);inst.resize(36,44);mutated.push(inst.id);const t=inst.findOne(n=>n.type==='TEXT');t.characters='';mutated.push(t.id);text(row,title,w-44,14);}
for(const t of root.findAll(n=>n.type==='TEXT'&&n.characters==='Index · gemeinsamer Start = 100')){t.characters='Index';mutated.push(t.id);}
}
if(PAGE==='169:32'){
const sheet=f.children.find(n=>n.name.startsWith('Schriftfeld'));if(sheet){const boundaries=sheet.findAll(n=>n.type==='LINE'&&Math.abs(n.y-sheet.height)<1&&n.width>sheet.width*.9);for(const n of boundaries){removed.push(n.id);n.remove();}}
}
const dialog=f.children.find(n=>n.name.startsWith('Dialog ·'));if(dialog){const body=dialog.children.find(n=>n.name.startsWith('REV06 ·'));dialog.resize(dialog.width,body.y+body.height+24);mutated.push(dialog.id);f.resize(f.width,Math.max(900,dialog.y+dialog.height+24));mutated.push(f.id);}
evidence.push({id:f.id,checked:rev.length});}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
