// Run on the existing component page before native-screens.js. No new component or token.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('169:23'));
const ids=[];
for(const id of ['178:5','169:24','169:28']){
 const n=await figma.getNodeByIdAsync(id);
 for(const t of n.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);
 if(id==='178:5'){
  for(const c of n.children)c.constraints={horizontal:'STRETCH',vertical:'MIN'};
  for(const t of n.children.find(c=>c.type==='FRAME').findAllWithCriteria({types:['TEXT']}))t.constraints={horizontal:'STRETCH',vertical:'MIN'};
 }else for(const t of n.children.filter(c=>c.type==='TEXT'))t.layoutSizingHorizontal='FILL';
 ids.push(n.id,...n.findAll(()=>true).map(c=>c.id));
}
return {mutatedNodeIds:ids};
