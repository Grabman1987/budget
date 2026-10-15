const data=[['G01','Alltag & Haushalt',950,-620,330,true],['01','Lebensmittel',500,-280,220],['02','Haushalt',200,-140,60],['03','Mobilität',250,-200,50],['G02','Fixkosten',1100,-1025,75,true],['04','Wohnen',900,-900,0],['05','Versicherungen',200,-125,75],['G03','Freizeit & Zukunft',600,0,600,true],['06','Freizeit',200,0,200],['07','Sparen',400,0,400],['G04','Weitere Kategorien',830,-485,545,true]];
for(const id of IDS){const f=await figma.getNodeByIdAsync(id),c=start(f,264),{root:p,w,m}=c;
const top=stack(p,'Monatsnavigation und Ansicht',w,m?'VERTICAL':'HORIZONTAL',12);btn(top,'‹  Oktober 2026  ›',m?w:260,'Secondary','P07');btn(top,'1 / 2 / 3 Monate',m?w:220,'Ghost','P16');btn(top,'Ansicht / Gruppen / Filter',m?w:300,'Ghost','P15');btn(top,'Mehr Aktionen  ⋯',m?w:w-816,'Ghost','P24');
if(KIND==='P03'){
const selection=stack(p,'Kontext · zwei ausgewählte Kategorien',w,'VERTICAL',10,'surface',12);text(selection,'2 Kategorien ausgewählt · Lebensmittel, Haushalt',w-24,15,'ink','SemiBold');const acts=stack(selection,'Auswahlaktionen',w-24,m?'VERTICAL':'HORIZONTAL',12),aw=m?w-24:(w-60)/4;btn(acts,'Zuweisen',aw,'Primary','P18');btn(acts,'Verschieben',aw,'Ghost','F09');btn(acts,'Ziel setzen',aw,'Secondary','F08');btn(acts,'Auswahl aufheben',aw,'Ghost','P01');}
else if(KIND==='P04')note(p,'Unterdeckung: 80,00 € in zwei Kategorien · Deckung aus verfügbaren Mitteln prüfen.',w);
else{const acts=stack(p,'Primäre Planaktionen',w,'HORIZONTAL',12);btn(acts,'Zuweisen',m?(w-12)/2:200,'Primary','P18');btn(acts,'+ Kategorie / Gruppe',m?(w-12)/2:220,'Ghost','P24');}
const cols=stack(p,'Monatsplan und Inspector',w,m?'VERTICAL':'HORIZONTAL',24),lw=m?w:812,iw=m?w:320,left=stack(cols,'Kategorien',lw,'VERTICAL',12),right=stack(cols,'Inspector · kontextbezogen',iw,'VERTICAL',16,'surface',16),rw=iw-32;
if(!(KIND==='P02'&&m)){
const t=stack(left,'Kategorientabelle · durchgehende Umrandung',lw,'VERTICAL',0,'surface');t.strokes=[paint('field')];t.strokeWeight=1;
const h=stack(t,'Spaltenüberschriften',lw,'HORIZONTAL',0,'soft',10);text(h,'POS / KATEGORIE',m?lw*.60-20:lw*.44-20,11,'muted','SemiBold');if(!m){text(h,'GEPLANT',lw*.18,11,'muted','SemiBold');text(h,'AKTIVITÄT',lw*.18,11,'muted','SemiBold');}text(h,'VERFÜGBAR',m?lw*.40-20:lw*.20-20,11,'muted','SemiBold');rect(t,'Kopfabschluss',0,0,lw,1,'field');
for(const r of data){const selected=KIND==='P03'&&['01','02'].includes(r[0]),g=r[5];const row=stack(t,'GO '+(g?'P03':'P02')+' · '+r[1],lw,'VERTICAL',5,g?'active':selected?'positiveSoft':null,10);if(g){row.strokes=[paint('line')];row.strokeWeight=1;}
const rr=stack(row,'Kategorie und Werte',lw-20,'HORIZONTAL',0),labelw=m?lw*.60-20:lw*.44-20;
const ll=stack(rr,'Kategorie',labelw,'HORIZONTAL',8);const mark=panel(ll,'GO P03 · Auswahl',18,18);mark.cornerRadius=2;if(selected){mark.fills=[paint('primary')];label(mark,'✓',2,0,14,12,'onPrimary','SemiBold');}text(ll,r[0]+'  '+r[1],labelw-26,m?13:14,'ink',g?'SemiBold':'Regular');
if(!m){text(rr,num(r[2],2),lw*.18,13,'ink',g?'SemiBold':'Regular');text(rr,num(r[3],2),lw*.18,13,'ink',g?'SemiBold':'Regular');}text(rr,num(r[4],2),m?lw*.40-20:lw*.20-20,13,'ink',g?'SemiBold':'Regular');
if(!g){if(m)text(row,'Plan '+num(r[2],2)+' € · Aktivität '+num(r[3],2)+' €',lw-20,12,'muted');const bar=stack(row,'Zielstand · Ausgabe / Plan',lw-20,'HORIZONTAL',0);const bw=m?lw-20:220;const trackbar=panel(bar,'Budgetverbrauch '+r[1],bw,4);trackbar.fills=[paint('line')];trackbar.strokes=[];rect(trackbar,'Verbraucht',0,0,bw*Math.min(1,Math.abs(r[3])/r[2]),4,'positive');}rect(t,'Zeilengrenze',0,0,lw,1,'line');}
note(left,'Summe: 3.480 € geplant · −2.130 € Aktivität · 1.550 € verfügbar, einschließlich 200 € Übertrag.',lw);
}
heading(right,KIND==='P02'?'Lebensmittel':KIND==='P03'?'Ziele für die Auswahl':'Monatsübersicht',rw);
if(KIND==='P02'||KIND==='P03'){
metrics(right,[[KIND==='P02'?'Verfügbar':'Ausgewählt verfügbar',KIND==='P02'?eur(220):eur(280)]],rw,true);
text(right,KIND==='P03'?'Gemeinsame Zieleingabe · gilt je ausgewählter Kategorie':'Ziel & Fälligkeit',rw,15,'ink','SemiBold');field(right,'Zielbetrag',KIND==='P03'?'500,00 € je Kategorie':'500,00 €',rw);field(right,'Rhythmus','Monatlich auffüllen',rw);field(right,'Fällig am','1. des Monats',rw);field(right,'Budgetklasse','Bedarf',rw);
btn(right,KIND==='P03'?'Ziele für 2 Kategorien prüfen':'Ziel speichern',rw,'Secondary','F08');note(right,KIND==='P03'?'Vorschau vor Übernahme: zwei Ziele, zusammen 1.000 €. Zuweisungen bleiben unverändert.':'Ziel 500 € · bereits 500 € zugewiesen · noch benötigt 0 €.',rw);
controls(right,[['Zuweisung berechnen','P18'],['Geld verschieben','F09'],['Buchungen und Verlauf','P20']],rw,true);
}else{
metrics(right,[['Noch zu verplanen',eur(120),'3.600 € Eingänge − 3.480 € Zuweisungen']],rw,true);
table(right,['Monat','Betrag'],[['Einnahmen',eur(3600)],['Geplant','−'+eur(3480)],['Übertrag in Kategorien',eur(200)],['Aktivität','−'+eur(2130)],['Verfügbar',eur(1550)]],rw,true);
heading(right,'50 / 30 / 20',rw);for(const [name,v,target] of [['Bedarf',59,50],['Wunsch',17,30],['Zukunft',24,20]]){text(right,name+' · '+v+' % / Ziel '+target+' %',rw,12,'muted');const bar=panel(right,'Anteil '+name,rw,8);bar.fills=[paint('line')];bar.strokes=[];rect(bar,'Ist',0,0,rw*v/100,8,'positive');rect(bar,'Ziel',rw*target/100,0,2,8,'ink');}
controls(right,[['Wasserfall','P12'],['Vorschlag prüfen','P21'],['Zuweisungsverlauf','P20']],rw,true);
}
finish(c);}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
