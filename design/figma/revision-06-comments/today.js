for(const id of IDS){const f=await figma.getNodeByIdAsync(id),c=start(f,204),{root:p,w,m}=c;
if(KIND==='H01'){
metrics(p,[['Noch zu verplanen',eur(120),'Eingänge und Übertrag − Zuweisungen'],['Verfügbar im Budget',eur(1550),'Nach bisheriger Aktivität'],['Nettovermögen',eur(22170),'Bewertungsstand 14.10.2026']],w,m);
heading(p,'Monat im Blick',w,'01');
chart(p,'Ausgaben im Oktober · kumuliert',w,m,[{name:'Gebuchte Ausgaben',values:[0,110,110,410,470,470,700,850,980,1090,1300,1470,1600,1880,2130,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{name:'Prognose',values:Array.from({length:31},(_,i)=>i<14?null:Math.round(2130+(3220-2130)*(i-14)/16)),tone:'muted',dash:[6,4]},{name:'Monatsplan 2.400 EUR',values:Array(31).fill(2400),tone:'field',dash:[2,4]}],{min:0,max:4000,ticks:[[0,'01. Okt.'],[7,'08. Okt.'],[14,'15. Okt.'],[21,'22. Okt.'],[30,'31. Okt.']],dates:dates(31),today:14});
legend(p,['━ Ist 2.130 €   ┄ Prognose 3.220 €   ··· Monatsplan 2.400 €','Heute 15.10. · Prognose ab Stichtag · Plan und Prognose bleiben getrennt.'],w);
heading(p,'Vermögen · täglich',w,'02');
const daily=[21318,21385,21360,21480,21455,21590,21655,21600,21760,21820,21820,21960,22060,22170];chart(p,'Ist-Nettovermögen · 01.–14. Oktober',w,m,[{name:'Nettovermögen',values:daily}],{min:21000,max:22500,ticks:[[0,'01. Okt.'],[6,'07. Okt.'],[13,'14. Okt.']],dates:dates(14)});
controls(p,[['Vermögensdetails','V01'],['Portfolio und Benchmarks','V02']],w,m,2);
const twocol=stack(p,'Aufgaben und fällige Zahlungen',w,m?'VERTICAL':'HORIZONTAL',24),cw=m?w:(w-24)/2,a=stack(twocol,'Zu tun',cw,'VERTICAL',12),b=stack(twocol,'Fällig in 14 Tagen',cw,'VERTICAL',12);
heading(a,'Zu tun',cw,'03');controls(a,[['Plan prüfen · 80 € decken','P01'],['Buchungen prüfen · Vorschläge','K07'],['Kontostände prüfen · vor 8 Tagen','K08']],cw,true);
heading(b,'Fällig in 14 Tagen',cw,'04');table(b,['Zahlung','Fällig'],[['Musterservice · −24 €','18. Oktober'],['Mustervertrag · −42 €','27. Oktober']],cw,m);btn(b,'Zahlungen und Abos',cw,'Ghost','P08');
heading(p,'Letzte Buchungen',w,'05');table(p,['Buchung','Betrag'],[['Musterladen · Lebensmittel','−36,80 €'],['Musterservice · Abo','−24,00 €']],w,m);
controls(p,[['Alle Buchungen','K06'],['Kontoprognose','H02'],['Ansicht anpassen','H05']],w,m,3);
}
if(KIND==='H02'){
metrics(p,[['Tiefster erwarteter Kontostand',eur(420),'27. Oktober · Prognose'],['Kontostand heute',eur(3920),'15. Oktober · gebucht']],w,m);
controls(p,[['Monat · bis 02. November','H02'],['Bis Gehalt · bis 17. November','H02','Secondary']],w,m,2);
const count=48,actual=Array.from({length:count},(_,i)=>i<=14?4300-(Math.floor(i/3)*95):null),forecast=Array.from({length:count},(_,i)=>i<14?null:i<18?3920:i<22?3280:i<26?1800:i<30?420:i<35?580:i<40?530:i<45?500:i===45?4100:i===46?3900:3820);
// Forecasts are event-driven step lines, matching BalanceDrawing / StepLine in GitHub.
const n=chart(p,'Musterkonto · Ist und Kontoprognose',w,m,[{name:'Ist · täglicher Kontostand',values:actual}],{min:0,max:5000,ticks:[[0,'01. Okt.'],[14,'15. Okt.'],[30,'31. Okt.'],[47,'17. Nov.']],dates:dates(count),today:14,extrema:false});
const L=m?48:68,R=18,T=54,B=58,pw=w-L-R,ph=n.height-T-B,xx=i=>L+pw*i/47,yy=v=>T+ph*(5000-v)/5000,pts=[];for(let i=14;i<count;i++){if(i===14)pts.push([xx(i),yy(forecast[i])]);else{pts.push([xx(i),yy(forecast[i-1])]);pts.push([xx(i),yy(forecast[i])]);}}line(n,'Prognose · Ereignisse als Stufen',pts,'muted',[6,4]);
const low=26;line(n,'Tiefpunkt 27. Oktober',[[xx(low),yy(420)-4],[xx(low),yy(420)+4]],'negative');label(n,'Tief 420 € · 27.10.',Math.min(w-150,Math.max(L,xx(low)-75)),yy(420)-28,150,11,'ink','Medium');
line(n,'Gehalt · 15. November',[[xx(45),T],[xx(45),T+ph]],'field',[2,4]);label(n,'Gehalt +3.600 €',Math.max(L,Math.min(w-150,xx(45)-130)),T+6,145,11,'ink','Medium');
legend(p,['━ Gebucht bis heute   ┄ Erwartet ab heute · Stufen nach Fälligkeit','Gehalt: 15.11. +3.600 € · Tiefpunkt: 27.10. 420 € · Null bleibt sichtbar.'],w);
heading(p,'Ereignisse im Zeitraum',w,'01');table(p,['Ereignis','Datum','Betrag'],[['Musterservice','18.10.','−24,00 €'],['Mustervertrag','27.10.','−42,00 €'],['Gehaltserwartung','15.11.','+3.600,00 €']],w,m);
note(p,'Ausgewählt: Bis Gehalt · 01.10.–17.11.2026. Konten, Fälligkeiten und offene Buchungen bestimmen die Vorschau. Die Prognose erzeugt keine Buchungen.',w);
controls(p,[['Herleitung und Datenbasis','H03'],['Zahlungen und Abos','P08'],['Buchungen öffnen','K06']],w,m,3);
}
finish(c);}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
