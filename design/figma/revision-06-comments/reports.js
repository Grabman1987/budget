for(const id of IDS){const f=await figma.getNodeByIdAsync(id),c=start(f,204),{root:p,w,m}=c;
if(KIND==='R01'){
controls(p,[['1 M','R01'],['3 M','R01'],['1 J','R01'],['3 J / 5 J / 10 J','R01']],w,m,4);
metrics(p,[['Monatsprognose · Oktober',eur(380),'3.600 € Einnahmen − 3.220 € prognostizierte Ausgaben'],['Bereits gebuchter Überschuss',eur(1470),'3.600 € Einnahmen − 2.130 € Ausgaben · bis 15.10.']],w,m);
chart(p,'Monatlicher Überschuss · Mai–Oktober 2026',w,m,[{name:'Abgeschlossene Monate',values:[260,350,320,410,290,null]},{name:'Oktober · Prognose',values:[null,null,null,null,290,380],tone:'muted',dash:[6,4]}],{min:0,max:600,ticks:['Mai','Jun.','Jul.','Aug.','Sep.','Okt.'].map((s,i)=>[i,s]),dates:['Mai','Juni','Juli','August','September','Oktober']});
legend(p,['━ Gebucht · abgeschlossene Monate   ┄ Oktober: Prognose, laufender Monat','Hoch: August 410 € · Tief: Mai 260 € · Prognose ist kein gebuchter Istwert.'],w);
controls(p,[['Tabelle anzeigen','R18'],['Quellbuchungen','R18'],['Drucken','S11'],['Erwartet und erhalten','R19'],['Kontoprognose','H02'],['Datenbasis und Berechnung','R06']],w,m,3);
note(p,'Musterdaten · Kalenderzeiträume und Kontenfilter gelten gleichermaßen für Diagramm, Tabelle und Kennzahlen.',w);
}
if(KIND==='R03'){
controls(p,[['1 M','R03'],['3 M','R03'],['1 J · 2026','R03','Secondary'],['3 J','R38'],['5 J','R39'],['10 J / Alles','R40']],w,false,m?3:6);
const gross=[3900,3900,3900,3950,3950,5950,3950,3950,3950,4500],net=[2700,2700,2700,2720,2720,4120,2720,2720,2720,3265],sum=a=>a.reduce((a,b)=>a+b,0);
metrics(p,[['Jahresbrutto · bisher',eur(sum(gross)),'Jänner–Oktober 2026 · inkl. 2.500 € Sonderzahlungen'],['Jahresnetto · bisher',eur(sum(net)),'10 Monate · ohne 75 € Aufwandsersatz · kein volles Jahr']],w,m);
chart(p,'Gehaltsverlauf · monatliches Nettogehalt',w,m,[{name:'Netto inklusive Sonderzahlungen',values:net}],{min:0,max:4500,ticks:(m?[[0,'Jän.'],[3,'Apr.'],[6,'Jul.'],[9,'Okt.']]:['Jän.','Feb.','Mär.','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.'].map((s,i)=>[i,s])),dates:['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober']});
legend(p,['━ Netto · Sonderzahlungen sind enthalten und in der Tabelle separat ausgewiesen.','Juni: +1.400 € netto Sonderzahlung · Oktober: +45 € reguläres Netto und 500 € Sonderzahlung.'],w);
table(p,['Monat / Lohnart','Brutto','Netto'],[['Oktober · laufend',eur(4000),eur(2765)],['Oktober · Sonderzahlung',eur(500),eur(500)],['September · laufend',eur(3950),eur(2720)],['Juni · laufend',eur(3950),eur(2720)],['Juni · Sonderzahlung',eur(2000),eur(1400)]],w,m);
note(p,'Zeitraumauswahl: 3, 5 und 10 Jahre bei vorhandenen Daten. Fehlende Monate bleiben Lücken. Bei mehrjährigen Ansichten werden Kalenderjahre beschriftet; Details bleiben monatlich abrufbar.',w);
controls(p,[['Gehaltszettel-Historie','R17'],['Gehaltszettel öffnen','G01'],['Drucken','S11']],w,m,3);
}
if(KIND==='R04'){
fields(p,[['Zeitraum','Oktober 2026 · bis 15.10.'],['Detailgrad','Kategorien · alle Ausgaben']],w,m);
heading(p,'Von Einnahmen zur Verwendung',w,'01');
const n=panel(p,'Sankey · Kategorien · proportional in EUR',w,m?520:390);const L=m?18:72,R=m?w-24:w-220,scale=m?.083:.07,top=78,total=3600*scale;
const group=[['Wohnen',900,'muted'],['Lebensmittel',280,'positive'],['Weitere Ausgaben',950,'field'],['Überschuss',1470,'primary']];let sy=top,dy=46;
label(n,'Einnahmen 3.600 €',16,12,w-32,15,'ink','SemiBold');
rect(n,'Quelle · 3.600 €',L,top,10,total,'ink');
for(const [name,value,tone] of group){const hh=value*scale,mid=(L+R)/2,svg=track(figma.createVector());n.appendChild(svg);svg.name=name+' · '+value+' €';svg.vectorPaths=[{windingRule:'NONZERO',data:`M ${L+10} ${sy} C ${mid} ${sy} ${mid} ${dy} ${R} ${dy} L ${R} ${dy+hh} C ${mid} ${dy+hh} ${mid} ${sy+hh} ${L+10} ${sy+hh} Z`}];svg.fills=[paint(tone,.22)];svg.strokes=[];rect(n,name+' · Ziel',R,dy,10,hh,tone);label(n,name+' · '+num(value)+' €',m?90:R+22,dy+(m?2:Math.max(0,hh/2-10)),m?w-130:185,12,'ink','Medium');sy+=hh;dy+=hh+(m?22:16);}
metrics(p,[['Einnahmen',eur(3600)],['Ausgaben',eur(2130)],['Überschuss',eur(1470)]],w,m);
table(p,['Verwendung','Betrag'],group.map(a=>[a[0],eur(a[1])]),w,m);
note(p,'Die Breite jedes Flusses entspricht seinem Betrag. 900 + 280 + 950 = 2.130 € Ausgaben; zusammen mit 1.470 € Überschuss ergeben sich 3.600 € Einnahmen. Kategorien öffnen ihre Quellbuchungen.',w);
controls(p,[['Quellbuchungen öffnen','R18'],['Gruppen / Kategorien','R04']],w,m,2);
}
if(KIND==='R05'||KIND==='R35'){
controls(p,[['Kategorien','R05'],['Monate','R05'],['Jahre','R35']],w,m,3);
metrics(p,[['Ausgaben · Oktober',eur(2130),'Laufender Monat · bis 15.10.2026']],w,m);
const data=[['Wohnen',950,950,950],['Alltag',580,640,610],['Mobilität',130,150,170],['Freizeit',120,95,85],['Sonstiges',300,280,315]];
const n=stack(p,'Heatmap · gemeinsame Skala 0–1.000 EUR',w,'VERTICAL',8,'surface',12),iw=w-24,lw=m?98:220,cw=(iw-lw-16)/3;
const header=stack(n,'Monate',iw,'HORIZONTAL',4);text(header,'Kategorie',lw,12,'muted');for(const s of ['Aug.','Sep.','Okt.*'])text(header,s,cw,12,'muted','SemiBold');
for(const a of data){const row=stack(n,'Kategorie '+a[0],iw,'HORIZONTAL',4);text(row,a[0],lw,13);for(const v of a.slice(1)){const cell=stack(row,'Wert '+v+' EUR',cw,'VERTICAL',0,null,8);cell.fills=[paint('primary',.06+.32*v/1000)];text(cell,num(v)+' €',cw-16,13,'ink','Medium');}}
const key=stack(n,'Quantitative Legende',iw,'HORIZONTAL',0);for(const v of [0,250,500,750,1000]){const cell=stack(key,'Skala '+v,iw/5,'VERTICAL',4,null,4);cell.fills=[paint('primary',.06+.32*v/1000)];text(cell,String(v),iw/5-8,11);}
text(n,'EUR · dieselbe Skala für alle Kategorien und Monate',iw,12,'muted');
note(p,'Dunkler bedeutet höherer Betrag. Gleiche Werte erhalten dieselbe Farbe. *Oktober ist unvollständig und wird nicht als voller Monat mit August und September verglichen.',w);
controls(p,[['Tabelle anzeigen','R18'],['Drucken','S11'],['36-Monats-Tabelle','R30'],['Jahres-Heatmap','R35'],['Eigene Auswertung','R28'],['Projekte / Einnahmen und Kosten','R16'],['Kontakte-Abrechnung','R17']],w,m,3);
}
if(KIND==='R09'){
metrics(p,[['Nettovermögen',eur(22170),'26.650 € Vermögen − 4.480 € Schulden']],w,m);
const n=panel(p,'Vermögen, Schulden und Netto · Mai–Oktober',w,m?340:360),L=m?48:72,R=20,T=52,B=55,pw=w-L-R,ph=n.height-T-B,zero=T+ph*30000/36000,sc=ph/36000,pitch=pw/6,bw=pitch*.58;
label(n,'Vermögen / Schulden / Netto · EUR',14,10,w-28,14,'ink','SemiBold');for(const v of [-6000,0,10000,20000,30000]){const y=zero-v*sc;rect(n,'Raster '+v,L,y,pw,1,'line');label(n,(v/1000)+' Tsd.',1,y-8,L-8,11,'muted','Regular','RIGHT');}
const asset=[24000,25000,25500,25900,26200,26650],debt=[5000,4900,4800,4700,4600,4480],net=asset.map((v,i)=>v-debt[i]);
for(let i=0;i<6;i++){const x=L+pitch*i+(pitch-bw)/2;rect(n,'Vermögen '+asset[i],x,zero-asset[i]*sc,bw,asset[i]*sc,'positive',.4);const d=rect(n,'Schulden −'+debt[i],x,zero,bw,debt[i]*sc,null);d.strokes=[paint('muted')];d.dashPattern=[4,3];label(n,['Mai','Jun.','Jul.','Aug.','Sep.','Okt.'][i],L+pitch*i,n.height-35,pitch,11,'muted','Regular','CENTER');}
line(n,'Nettovermögen · Differenz',net.map((v,i)=>[L+pitch*(i+.5),zero-v*sc]),'ink');label(n,'Hoch 22.170 € · Okt.',w-185,38,170,11,'ink','Medium');label(n,'Tief 19.000 € · Mai',L,zero-net[0]*sc+10,170,11,'ink','Medium');
legend(p,['▰ Vermögen über Null   ▱ Schulden unter Null   ━ Nettovermögen','Gemeinsame Nulllinie · Säulenbreite 58 % des Monatsabstands · keine gestapelten Nettowerte.'],w);
table(p,['Monat','Vermögen / Schulden','Netto'],asset.map((v,i)=>[['Mai','Juni','Juli','August','September','Oktober'][i],eur(v)+' / −'+eur(debt[i]),eur(net[i])]),w,m);
controls(p,[['Quellbuchungen','R18'],['Tabelle anzeigen','R09'],['Drucken','S11']],w,m,3);
}
finish(c);
}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
