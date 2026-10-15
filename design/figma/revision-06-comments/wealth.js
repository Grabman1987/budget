const stock=[11300,11355,11320,11460,11410,11530,11585,11520,11660,11730,11700,11820,11910,12000],bond=[6448,6460,6470,6450,6475,6490,6500,6510,6530,6520,6550,6570,6580,6600],total=stock.map((v,i)=>v+bond[i]),ds=dates(14),ticks=[[0,'01. Okt.'],[3,'04. Okt.'],[6,'07. Okt.'],[9,'10. Okt.'],[13,'14. Okt.']];
for(const id of IDS){const f=await figma.getNodeByIdAsync(id),c=start(f,264),{root:p,w,m}=c;
if(KIND==='V01'){
metrics(p,[['Nettovermögen',eur(22170),'26.650 € Vermögen − 4.480 € Schulden'],['Veränderung · 01.–14.10.',eur(852),'Eigenleistung 0 € · Markt / Bewertung +852 €']],w,m);
heading(p,'Täglicher Vermögensstand',w,'01');
const vals=total.map(v=>v+3570);chart(p,'Ist-Nettovermögen · Tageswerte',w,m,[{name:'Nettovermögen · EUR',values:vals}],{min:21000,max:22500,ticks:m?ticks.filter((_,i)=>i!==1):ticks,dates:ds});
legend(p,['━ Ist-Nettovermögen in EUR · 01.–14. Oktober 2026','Tagesstand nach Buchungen und Bewertung · keine Rendite-Indexwerte.'],w);
heading(p,'Eigenleistung und Marktbewegung',w,'02');
const n=panel(p,'Veränderungsbeiträge · getrennte gemeinsame Null',w,m?220:230),L=56,pw=w-76,zero=135,vals2=[{label:'01.–07.10.',own:0,market:337},{label:'08.–14.10.',own:0,market:515}];label(n,'Wochenbeiträge · EUR',12,10,w-24,14,'ink','SemiBold');for(const v of [-200,0,200,400,600]){const y=zero-v*.15;rect(n,'Raster '+v,L,y,pw,1,'line');label(n,String(v),0,y-8,45,11,'muted','Regular','RIGHT');}vals2.forEach((a,i)=>{const x=L+pw*(i+.5)/2,bw=Math.min(56,pw*.12);rect(n,'Markt '+a.market,x+5,zero-a.market*.15,bw,a.market*.15,'positive',.6);line(n,'Eigenleistung 0 EUR',[[x-bw-5,zero],[x-5,zero]],'ink');label(n,'0 / +'+a.market+' €',x-58,zero-a.market*.15-22,120,12,'ink','Medium');label(n,a.label,x-60,190,120,12,'muted','Regular','CENTER');});
legend(p,['━ Eigenleistung: Einzahlungen − Entnahmen   ▰ Markt / Bewertung','Getrennt vom Bestandsdiagramm: Beiträge sind Flüsse, der Vermögensstand ist ein Bestand.'],w);
table(p,['Bestandteil','Betrag'],[['Budget-Konten',eur(4820)],['Wertpapiere',eur(18600)],['Liquide Mittel in Depots',eur(3230)],['Schulden','−'+eur(4480)],['Nettovermögen',eur(22170)]],w,m);
controls(p,[['Portfolio','V02'],['Vermögen und Schulden','R09'],['Quellbuchungen','R18']],w,m,3);
}
if(KIND==='V02'){
metrics(p,[['Portfoliowert',eur(18600),'Bewertungsstand 14.10.2026'],['Gewinn seit Kauf','+1.240,00 €','+7,14 % gegenüber Einstand 17.360 €']],w,m);
controls(p,[['Trade erfassen','F13','Primary'],['Sparplan','F15','Secondary'],['Zeitraum · 01.–14. Oktober','V02']],w,m,3);
heading(p,'Istvermögen · tatsächlicher Depotwert',w,'01');
chart(p,'Portfoliowert · täglich · EUR',w,m,[{name:'Wertpapierbestand in EUR',values:total}],{min:17500,max:19000,ticks:m?ticks.filter((_,i)=>i!==1):ticks,dates:ds});
note(p,'Der Euro-Verlauf zeigt den bewerteten Bestand. Einzahlungen und Entnahmen verändern den Wert; für den Renditevergleich wird deshalb die zeitgewichtete Performance getrennt gezeigt.',w);
heading(p,'Rendite im Vergleich',w,'02');
const checks=stack(p,'Benchmark-Auswahl',w,m?'VERTICAL':'HORIZONTAL',8);const cw=m?w:(w-24)/4;check(checks,'Weltaktien',true,cw);check(checks,'Nasdaq 100',true,cw);check(checks,'S&P 500',false,cw);check(checks,'ATX',false,cw);
const idx=total.map(v=>Math.round(v/total[0]*1000)/10),world=[100,100.4,100.2,100.7,100.9,101.2,101.3,101.1,101.7,102.1,102,102.6,103.1,103.6],nas=[100,101,100.4,101.8,101.3,102.2,103,102.5,103.6,104,103.7,104.9,105.4,106.1];
chart(p,'Performance · gemeinsamer Start 100',w,m,[{name:'Portfolio · TTWROR',values:idx,tone:'positive'},{name:'Weltaktien · gestrichelt',values:world,tone:'muted',dash:[6,3]},{name:'Nasdaq 100 · punktiert',values:nas,tone:'ink',dash:[2,4]}],{min:98,max:108,unit:'index',ticks:m?ticks.filter((_,i)=>i!==1):ticks,dates:ds});
legend(p,['━ Portfolio +4,8 %   ┄ Weltaktien +3,6 %   ··· Nasdaq 100 +6,1 %','01.–14.10.2026 · gleiche Zeitspanne und Indexbasis · Kurse in EUR · Musterdaten'],w);
note(p,'Fehlende Kurse bleiben Lücken. Ein fortgeschriebener Kurs erhält Datum und Kennzeichnung. Der Benchmark ist kein Bestandteil des eigenen Vermögens.',w);
heading(p,'Asset-Aufteilung und Entwicklung',w,'03');
const layout=stack(p,'Anlageklassen · zwei Spalten auf Desktop',w,m?'VERTICAL':'HORIZONTAL',24),colw=m?w:(w-24)/2,a=stack(layout,'Zusammensetzung heute',colw,'VERTICAL',12),b=stack(layout,'Tägliche Entwicklung',colw,'VERTICAL',12);
text(a,'Zusammensetzung · 14. Oktober',colw,15,'ink','SemiBold');
const mix=stack(a,'Anteile · gemeinsamer Gesamtwert',colw,'HORIZONTAL',0);const st=stack(mix,'Aktien · 64,5 %',colw*12000/18600,'VERTICAL',0,'positive',8);text(st,'Aktien 64,5 %',st.width-16,m?11:13,'white','SemiBold');const bo=stack(mix,'Anleihen · 35,5 %',colw*6600/18600,'VERTICAL',0,'muted',8);text(bo,'Anleihen 35,5 %',bo.width-16,m?10:13,'white','SemiBold');
table(a,['Anlageklasse','Wert'],[['Aktien · Musterfonds',eur(12000)],['Anleihen · Musteranleihe',eur(6600)],['Gesamt',eur(18600)]],colw,m);
chart(b,'Anlageklassen · täglicher Wert',colw,true,[{name:'Aktien',values:stock,tone:'positive'},{name:'Anleihen',values:bond,tone:'muted',dash:[6,3]}],{min:0,max:14000,extrema:false,ticks:[[0,'01. Okt.'],[6,'07. Okt.'],[13,'14. Okt.']],dates:ds});
legend(b,['━ Aktien: 11.300 → 12.000 €','┄ Anleihen: 6.448 → 6.600 €','Summen entsprechen dem täglichen Depotwert oben.'],colw);
heading(p,'Portfolio verwalten und vertiefen',w,'04');
controls(p,[['Portfolio-Kennzahlen','V09'],['Positionen und Instrumente','V10'],['Anteil nach Plattform','V17'],['Allokation','V18'],['Sparpläne','V16'],['Portfolio-Einstellungen','E01'],['Benchmark-Details','R11'],['Quellbuchungen','R18']],w,m,3);
}
finish(c);}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
