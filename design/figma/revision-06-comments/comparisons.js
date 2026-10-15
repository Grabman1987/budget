for(const id of IDS){const f=await figma.getNodeByIdAsync(id),c=start(f,204),{root:p,w,m}=c;
const idx=[100,100.4,100.2,100.9,100.8,101.5,101.9,101.6,102.5,102.8,102.8,103.6,104.2,104.8],b=[100,100.7,100.6,101.1,101.2,101.8,102,101.7,102.7,103.2,103.4,104,104.6,105.2],world=[100,100.4,100.2,100.7,100.9,101.2,101.3,101.1,101.7,102.1,102,102.6,103.1,103.6],nas=[100,101,100.4,101.8,101.3,102.2,103,102.5,103.6,104,103.7,104.9,105.4,106.1];
metrics(p,[[KIND==='R10'?'Musterdepot A · TTWROR':'Zeitgewichtete Rendite','+4,8 %','01.–14.10.2026 · Tageswerte']],w,m);
if(KIND==='R10')fields(p,[['Depot A','Musterdepot A'],['Depot B','Musterdepot B']],w,m);
else{
controls(p,[['Rendite','R11','Secondary'],['Verteilung','R19'],['Einzahlungen','R20']],w,false,3);
const checks=stack(p,'Benchmarks',w,m?'VERTICAL':'HORIZONTAL',8),cw=m?w:(w-24)/4;for(const name of ['Weltaktien','Nasdaq 100','S&P 500','ATX'])check(checks,name,true,cw);
}
const sp=world.map((v,i)=>v+i*.025),atx=world.map((v,i)=>v-i*.08);const series=KIND==='R10'?[{name:'Depot A',values:idx},{name:'Depot B',values:b,tone:'muted',dash:[6,3]}]:[{name:'Portfolio',values:idx},{name:'Weltaktien',values:world,tone:'muted',dash:[6,3]},{name:'Nasdaq 100',values:nas,tone:'ink',dash:[2,4]},{name:'S&P 500',values:sp,tone:'field',dash:[10,3,2,3]},{name:'ATX',values:atx,tone:'negative',dash:[12,5]}];
chart(p,KIND==='R10'?'Depots · gleicher Zeitraum und Indexstart':'Portfolio und Benchmarks · täglicher Vergleich',w,m,series,{min:98,max:108,unit:'index',dates:dates(14),ticks:m?[[0,'01. Okt.'],[6,'07. Okt.'],[13,'14. Okt.']]:[[0,'01. Okt.'],[3,'04. Okt.'],[6,'07. Okt.'],[9,'10. Okt.'],[13,'14. Okt.']]});
legend(p,KIND==='R10'?['━ Depot A +4,8 %   ┄ Depot B +5,2 %','Gemeinsamer erster Bewertungsstand = 100 · identischer Zeitraum · Tageswerte']:['━ Portfolio +4,8 %   ┄ Weltaktien +3,6 %   ··· Nasdaq 100 +6,1 %','─·─ S&P 500 +3,9 %   ━ ━ ATX +2,6 % · gemeinsame EUR- und Zeitbasis'],w);
note(p,'Fehlende Kurse bleiben Lücken. Einzahlungen und Entnahmen sind in der zeitgewichteten Rendite bereinigt; der Euro-Bestand steht gesondert im Portfolio. Synthetische Vergleichsdaten.',w);
controls(p,[['Tabelle und Berechnung','R21'],['Quellbuchungen','R18'],['Drucken','S11'],['Portfolio-Kennzahlen','V09'],['Rendite und Risiko','R28'],['Istvermögen / Asset-Entwicklung','V02']],w,m,3);finish(c);
}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
