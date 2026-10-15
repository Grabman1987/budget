// Native editable additions; synthetic content only. Prefix with const BATCH=['V18','V19'].
const page=await figma.getNodeByIdAsync('172:1942');
await figma.setCurrentPageAsync(page);
const componentIds={field:'178:5',check:'189:1408',primary:'169:24',secondary:'169:28'};
const components={};
for(const [name,id] of Object.entries(componentIds))components[name]=await figma.getNodeByIdAsync(id);
const roots=await Promise.all(['206:8062','206:8339'].map(id=>figma.getNodeByIdAsync(id)));
const fonts=new Map();
for(const root of [...roots,...Object.values(components)])for(const t of root.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);
await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
const vars=(await figma.variables.getLocalVariablesAsync('COLOR')).filter(v=>v.variableCollectionId==='VariableCollectionId:169:2');
const paint=name=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars.find(v=>v.name===name));
function column(parent,w,name){const f=figma.createAutoLayout('VERTICAL');parent.appendChild(f);f.name=name;f.resize(w,100);f.layoutSizingHorizontal='FIXED';f.primaryAxisSizingMode='AUTO';f.counterAxisSizingMode='FIXED';f.itemSpacing=16;f.fills=[];return f;}
function text(p,value,w,size=16,weight='Regular',tone='ink'){const t=figma.createText();p.appendChild(t);t.fontName={family:'Archivo',style:weight};t.fontSize=size;t.lineHeight={unit:'PERCENT',value:145};t.fills=[paint(tone)];t.textAutoResize='HEIGHT';t.resize(w,24);t.characters=value;t.layoutSizingVertical='HUG';t.name=value.slice(0,60);return t;}
function field(p,label,value,w){const n=components.field.createInstance();p.appendChild(n);n.name='Feld · '+label;n.resize(w,76);const ts=n.findAllWithCriteria({types:['TEXT']});ts[0].characters=label;ts[0].resize(w,20);ts[0].textAutoResize='HEIGHT';const frame=n.children.find(c=>c.type==='FRAME');frame.resize(w,44);ts[1].characters=value;ts[1].fontSize=16;ts[1].resize(w-24,24);ts[1].textAutoResize='HEIGHT';return n;}
function check(p,label,checked,w){const n=components.check.createInstance();p.appendChild(n);n.name=(checked?'Ausgewählt':'Ausgeschlossen')+' · '+label;n.resize(w,44);const t=n.findAllWithCriteria({types:['TEXT']})[0];t.characters=label;t.resize(w-48,24);t.textAutoResize='WIDTH_AND_HEIGHT';const mark=n.children.find(c=>c.name==='Icon / check');if(mark)mark.visible=checked;return n;}
function button(p,label,target,w,primary=false){const n=components[primary?'primary':'secondary'].createInstance();p.appendChild(n);n.resize(w,44);n.name='GO '+target+' · '+label;const t=n.findAllWithCriteria({types:['TEXT']})[0];t.characters=label;t.resize(w-28,22);return n;}
function section(p,title,w){const s=column(p,w,title);s.paddingTop=16;s.strokes=[paint('line')];s.strokeTopWeight=1;s.strokeBottomWeight=0;s.strokeLeftWeight=0;s.strokeRightWeight=0;text(s,title,w,20,'SemiBold');return s;}
function pair(p,label,value,w,mobile){const row=figma.createAutoLayout(mobile?'VERTICAL':'HORIZONTAL');p.appendChild(row);row.name='Stücklistenposition · '+label;row.resize(w,50);row.primaryAxisSizingMode='AUTO';row.counterAxisSizingMode='FIXED';row.itemSpacing=mobile?4:16;row.paddingTop=8;row.paddingBottom=8;row.fills=[paint('soft')];row.paddingLeft=12;row.paddingRight=12;const inner=w-24;text(row,label,mobile?inner:inner*.55,15,'Medium');text(row,value,mobile?inner:inner*.45-16,16,'Regular');return row;}
const specs={
 V18:{title:'Anlagebasis wählen',sub:'01 / Konten und Depots',next:'V19',nextLabel:'Weiter zur Zuordnung'},
 V19:{title:'Anlageklassen zuordnen',sub:'02 / Wertpapiere und Cash',next:'V20',nextLabel:'Weiter zu den Stufen'},
 V20:{title:'Vermögensstufen',sub:'03 / Zielgewichte ab Vermögen',next:'V21',nextLabel:'Übersicht prüfen'},
 V21:{title:'Stufenplan prüfen',sub:'04 / Wirksamkeit und Freigaben',next:'V13',nextLabel:'Zur Aufteilung'},
};
const created=[],frames=[];
for(const id of BATCH)for(const mobile of [false,true]){
 const spec=specs[id],name=id+' · '+spec.title+' · '+(mobile?'Phone 390 · Dunkel':'Desktop 1440 · Hell');
 let existing=page.children.find(n=>n.type==='FRAME'&&n.name===name);const oldPosition=existing?{x:existing.x,y:existing.y}:null;if(existing)existing.remove();
 const f=roots[mobile?1:0].clone();page.appendChild(f);f.name=name;f.x=oldPosition?.x??(mobile?1520:0);f.y=oldPosition?.y??Math.max(...page.children.filter(n=>n!==f&&n.x===f.x).map(n=>n.y+n.height))+160;
 const bodyY=mobile?260:264,w=mobile?366:1156;
 for(const n of [...f.children])if(n.y>=bodyY&&n.name!=='Hauptnavigation')n.remove();
 const header=f.children.find(n=>n.name.startsWith('Schriftfeld'));
 header.name='Schriftfeld · '+id;
 for(const t of header.findAllWithCriteria({types:['TEXT']})){
  if(t.characters.includes('BLATT V13'))t.characters=t.characters.replace('V13',id);
  if(t.characters==='Zielquoten und Rebalancing'){t.characters=spec.title;if(mobile)t.fontSize=22;}
 }
 const body=column(f,w,'Vermögensstufen · Inhalt');body.x=mobile?12:260;body.y=bodyY;
 text(body,spec.sub,w,14,'Medium','muted');
 if(id==='V18'){
  text(body,'Welche Konten zählen für deine Anlageziele?',w,22,'SemiBold');
  text(body,'Dieselbe Auswahl bestimmt Vermögensstufe und Cashanteil. Ein separates Verrechnungskonto wird nur mitgezählt, wenn du es auswählst.',w);
  const s=section(body,'Einbezogene Konten und Depots',w);
  for(const [label,on] of [['Musterdepot A',true],['Verrechnungskonto A',true],['Anlagereserve',true],['Alltagskonto',false],['Geldbörse',false],['Haushaltsreserve',false]])check(s,label,on,w);
  const t=section(body,'Berechnungsbasis',w);pair(t,'Wertpapiere in ausgewählten Depots','48.000,00 €',w,mobile);pair(t,'Ausgewählte Liquidität','2.000,00 €',w,mobile);pair(t,'Für die Vermögensstufe','50.000,00 €',w,mobile);
  text(body,'Negative Kontosalden zählen mit. Kontenauswahl und Cash-Zuordnung gelten für Aufteilung, Risikoprüfung, Reports und Sparplanvorschläge — einschließlich historischer Auswertungen.',w,14,'Regular','muted');
 }else if(id==='V19'){
  text(body,'Vorhandene Wertpapiere in der Zielstruktur',w,22,'SemiBold');
  text(body,'Zielgewichte gehören zu Anlageklassen. Die vorhandene datierte Wertpapier-Zuordnung bleibt maßgeblich; Hebel erhöht nicht den Marktwert.',w);
  const s=section(body,'Klassen und zugeordnete Positionen',w);
  for(const [label,value] of [['Weltaktien','Weltfonds A'],['Aktien mit Hebel 2×','Hebelfonds B'],['Managed Futures','Trendfonds C · Produktprüfung offen'],['Liquidität / kurze EUR-Anlagen','Verrechnungskonto A · Anlagereserve']])pair(s,label,value,w,mobile);
  const t=section(body,'Cash gezielt zuordnen',w);field(t,'Klasse für Verrechnungskonto A','Liquidität / kurze EUR-Anlagen',mobile?w:540);field(t,'Klasse für Anlagereserve','Liquidität / kurze EUR-Anlagen',mobile?w:540);
  button(body,'Wertpapier-Zuordnung bearbeiten','V11',mobile?w:330);
  text(body,'Unzugeordnete Positionen bleiben sichtbar. Bei fehlenden Kursen oder Wechselkursen wird keine Vermögensstufe behauptet und keine Optimierung vorgeschlagen.',w,14,'Regular','muted');
 }else if(id==='V20'){
  text(body,'Beispielplan · sieben frei editierbare Stufen',w,22,'SemiBold');
  text(body,'Reihenfolge: Weltaktien / Hebel 2× / Managed Futures / Liquidität. Zielgewichte sind keine Kaufaufträge.',w);
  const s=section(body,'Stufenplan als Stückliste',w);
  for(const [label,value] of [['Ab 0 €','85 / 15 / 0 / 0 %'],['Ab 10.000 €','75 / 5 / 20 / 0 %'],['Ab 50.000 €','75 / 5 / 20 / 0 %'],['Ab 100.000 €','75 / 5 / 20 / 0 %'],['Ab 500.000 €','65 / 5 / 20 / 10 %'],['Ab 1.000.000 €','60 / 5 / 20 / 15 %'],['Ab 2.000.000 €','60 / 5 / 20 / 15 %']])pair(s,label,value,w,mobile);
  const t=section(body,'Vermögensstufe bearbeiten',w);field(t,'Ab Vermögen (€)','500.000,00',mobile?w:540);field(t,'Bezeichnung','Vermögensarchitektur',mobile?w:540);
  for(const [label,value] of [['Weltaktien (%)','65,00'],['Aktien mit Hebel 2× (%)','5,00'],['Managed Futures (%)','20,00'],['Liquidität (%)','10,00']])field(t,label,value,mobile?w:540);
  text(t,'Summe 100,00 % · Grenze greift exakt ab 500.000,00 €',w,16,'SemiBold');
  button(body,'Vermögensstufe hinzufügen','V20',mobile?w:330);
  text(body,'Entwurf: Bedingte Zielstrukturen benötigen eine Freigaberegel. Managed Futures erst nach Produktprüfung; Reserve nur nach bestätigtem Liquiditäts- oder Entnahmebedarf.',w,14,'Regular','muted');
 }else{
  text(body,'Vor dem Speichern',w,22,'SemiBold');
  const s=section(body,'Deine Auswahl',w);pair(s,'Anlagebasis','3 ausgewählte Konten / Depots',w,mobile);pair(s,'Klassen und Vermögensstufen','4 Klassen · 7 Stufen · jeweils 100 %',w,mobile);
  field(s,'Gültig ab','15.10.2026',mobile?w:540);
  const t=section(body,'Bedingungen des Beispielplans',w);pair(t,'Ab 10.000 / 50.000 / 100.000 €','Managed-Futures-Freigabe erforderlich',w,mobile);pair(t,'Ab 500.000 €','Zusätzlich Liquiditätsbedarf prüfen',w,mobile);pair(t,'Ab 1 / 2 Mio. €','Zusätzlich Entnahmeplanung prüfen',w,mobile);
  text(body,'Freigaberegel noch zur Entscheidung: Bis zur Freigabe die letzte freigegebene Zielstruktur beibehalten. Unbekannte Bewertung zeigt „Stufe nicht ermittelbar“.',w);
  text(body,'Speichern übernimmt Kontenauswahl, Cash-Klassen und Sollversion gemeinsam. Rückgängig stellt die vorherige Konfiguration wieder her. Sparraten, Buchungen und Wertpapierorders bleiben separate Vorgänge.',w,14,'Regular','muted');
  button(body,'Stufen bearbeiten','V20',mobile?w:280);
 }
 button(body,spec.nextLabel,spec.next,mobile?w:300,true);
 if(!mobile&&['V19','V20'].includes(id)){
  const section=f.findOne(n=>n.type==='FRAME'&&['Cash gezielt zuordnen','Vermögensstufe bearbeiten'].includes(n.name));
  const fields=section.children.filter(n=>n.type==='INSTANCE'&&n.name.startsWith('Feld ·'));
  for(let i=0;i<fields.length;i+=2){const row=figma.createAutoLayout('HORIZONTAL');section.insertChild(1+i/2,row);row.name='Eingabereihe';row.fills=[];row.itemSpacing=24;row.resize(1156,76);row.primaryAxisSizingMode='FIXED';row.counterAxisSizingMode='AUTO';for(const n of fields.slice(i,i+2)){row.appendChild(n);n.resize(566,76);n.layoutSizingHorizontal='FILL';}}
 }
 const bottom=body.y+body.height;const nav=f.children.find(n=>n.name==='Hauptnavigation');if(nav){nav.y=Math.max(772,bottom+28);f.resize(390,nav.y+72);}else{f.resize(1440,Math.max(900,bottom+24));const side=f.children.find(n=>n.name==='Navigation · Planliste');side.resize(236,f.height);side.children.find(n=>n.name.includes('Profil /')).y=f.height-72;}
 f.setExplicitVariableModeForCollection('VariableCollectionId:169:2',mobile?'169:0':'169:1');f.setExplicitVariableModeForCollection('VariableCollectionId:169:2',mobile?'169:1':'169:0');
 const descendants=f.findAll(()=>true);created.push(f.id,...descendants.map(n=>n.id));frames.push({id:f.id,name:f.name,width:f.width,height:f.height,texts:descendants.filter(n=>n.type==='TEXT').length,instances:descendants.filter(n=>n.type==='INSTANCE').length});
}
return {createdNodeIds:created,frames};
