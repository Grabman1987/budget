const dialogIds=KIND==='F01'?['211:1541','211:1794']:KIND==='F03'?['211:2661','211:2923']:KIND==='F04'?['174:2669','174:2741']:KIND==='G03'?['173:300','173:384']:KIND==='G04'?['173:495','173:570']:['173:875','173:921'];
for(let i=0;i<IDS.length;i++){
const source=await figma.getNodeByIdAsync(IDS[i]),f=await figma.getNodeByIdAsync(dialogIds[i]),m=source.width===390,pad=m?16:24,w=f.width-pad*2;
for(const n of [...f.children])if(n.y>=124){removed.push(n.id);n.remove();}
const p=stack(f,'REV06 · Formularinhalt',w,'VERTICAL',20);p.x=pad;p.y=136;mutated.push(source.id,f.id);
if(KIND==='F01'||KIND==='F04'){
metrics(p,[[KIND==='F01'?'Betrag':'Gesamtbetrag',KIND==='F01'?eur(36.8):eur(120)]],w,m);
fields(p,[['An',KIND==='F01'?'Musterladen':'Musterrestaurant'],['Konto','Musterkonto'],['Datum','15.10.2026'],['Status','Vorgemerkt'],['Wiederholung','Keine'],['Notiz / Projekt / Markierung','Optional hinzufügen']],w,m);
heading(p,'Aufteilung',w,'01');
if(KIND==='F01'){
fields(p,[['Buchungszeile 1 · Kategorie','Lebensmittel'],['Betrag der Zeile','36,80 €']],w,m);
const r=stack(p,'Zeilenwerkzeuge',w,m?'VERTICAL':'HORIZONTAL',12);btn(r,'+ Buchungszeile',m?w:(w-12)/2,'Secondary','F04');btn(r,'Kontaktanteil hinzufügen',m?w:(w-12)/2,'Ghost','F04');
}else{
const split=stack(p,'Aufteilung · eigene Kategorie und Kontakt',w,m?'VERTICAL':'HORIZONTAL',24),cw=m?w:(w-24)/2,a=stack(split,'Eigener Anteil',cw,'VERTICAL',12),b=stack(split,'Kontaktanteil',cw,'VERTICAL',12);
text(a,'Eigener Anteil',cw,16,'ink','SemiBold');field(a,'Kategorie','Essen',cw);field(a,'Betrag · EUR','60,00',cw);
text(b,'Kontaktanteil',cw,16,'ink','SemiBold');field(b,'Kontakt','Musterkontakt A',cw);const row=stack(b,'Wert und Einheit',cw,'HORIZONTAL',12);field(row,'Wert','50,00',(cw-12)*.58);field(row,'Einheit','%',(cw-12)*.42);text(b,'50 % von 120 € = 60,00 € Kontaktanteil',cw,13,'muted');
controls(p,[['+ Kategoriezeile','F04'],['+ Kontaktanteil','F04']],w,m,2);
}
note(p,KIND==='F01'?'Aufgeteilt 36,80 € · Rest 0,00 €':'Eigener Anteil 60,00 € + Kontaktanteil 60,00 € = 120,00 € · Rest 0,00 €',w);
text(p,'Speichern ist möglich, sobald die Summe aller Buchungszeilen dem Gesamtbetrag entspricht. Kontaktanteile unterstützen einen festen Eurobetrag oder einen Prozentsatz.',w,13,'muted');
controls(p,[['Abbrechen','S08'],['Speichern','K06','Primary']],w,false,2);
}
if(KIND==='F03'){
metrics(p,[['Umbuchungsbetrag',eur(100)]],w,m);
const accounts=stack(p,'Von und Nach Konto',w,m?'VERTICAL':'HORIZONTAL',24),cw=m?w:(w-24)/2,from=stack(accounts,'Belastungsseite',cw,'VERTICAL',10),to=stack(accounts,'Gutschriftseite',cw,'VERTICAL',10);
field(from,'Von Konto','Musterkonto',cw);check(from,'Belastung bestätigt',false,cw);text(from,'−100,00 € · vorgemerkt',cw,13,'muted');
field(to,'Nach Konto','Bargeld',cw);check(to,'Gutschrift bestätigt',true,cw);text(to,'+100,00 € · Bargeld ist sofort bestätigt',cw,13,'muted');
fields(p,[['Datum','15.10.2026'],['Notiz','Optional']],w,m);
note(p,'Innerhalb des Budgets · keine Kategorie nötig. Beide Seiten werden gemeinsam gespeichert und gemeinsam rückgängig gemacht. Der Bestätigungsstatus gehört zur jeweiligen Kontoseite.',w);
btn(p,'Umbuchung in ein Depot',m?w:300,'Ghost','F24');
controls(p,[['Abbrechen','S08'],['100,00 € umbuchen','K06','Primary']],w,false,2);
}
if(KIND==='G03'||KIND==='G04'){
fields(p,[['Auszahlungskonto','Musterkonto'],['Auszahlungsdatum','15.10.2026'],['Von','Musterarbeitgeber'],['Abrechnungsmonat','Oktober 2026']],w,m);
if(KIND==='G03'){
heading(p,'Lohnarten aus dem Gehaltszettel',w,'01');
table(p,['Code / Position','Betrag'],[['1000 · Brutto laufend',eur(4000)],['1100 · Sonderzahlung',eur(500)],['Brutto gesamt',eur(4500)],['3000 · Sozialversicherung','−'+eur(680)],['4000 · Lohnsteuer','−'+eur(520)],['5000 · Essensabzug','−'+eur(35)],['Sonstige Abzüge',eur(0)],['2000 · Telearbeit',eur(30)],['2010 · Fahrtkostenzuschuss',eur(45)],['Netto Gehalt',eur(3265)],['Erstattungen',eur(75)],['Netto / Auszahlung',eur(3340)]],w,m);
note(p,'Codes stehen vor den Bezeichnungen und stammen aus dem Originalbeleg. Sonderzahlung, Telearbeit und Fahrtkostenzuschuss bleiben einzeln nachvollziehbar.',w);
heading(p,'Erwartete Zahlung zuordnen · optional',w,'02');text(p,'Vorschlag: Gehalt Oktober · 3.600,00 € erwartet. Auszahlung weicht um −260,00 € ab.',w,14);controls(p,[['Erwartung zuordnen','G05'],['Ohne Erwartung fortfahren','G06']],w,m,2);
controls(p,[['Original-PDF','G07'],['Ablehnen','G05','Danger'],['3.340,00 € bestätigen','G06','Primary']],w,m,3);
}else{
note(p,'Lohnart 9876 · Essensabzug · 35,00 € ist noch nicht zugeordnet. Bestehendes Feld wählen oder ein neues Auswertungsfeld anlegen.',w);
fields(p,[['Bestehendes Feld','Abzüge · Essensabzug'],['Zuordnung gilt für','Musterarbeitgeber']],w,m);
heading(p,'Neues Feld / neue Auswertungsspalte',w,'01');
fields(p,[['Feldbezeichnung','Essensabzug'],['Quellcode / Spaltennummer','9876'],['Berechnungsgruppe','Abzüge'],['Gültig ab','Oktober 2026']],w,m);
check(p,'Als eigene Spalte im Gehaltsreport anzeigen',true,w);
note(p,'Vorschau: Code 9876 → Essensabzug → Abzüge −35,00 €. Neue Felder verwenden die bestehenden Berechnungsgruppen. Die Originalbezeichnung bleibt erhalten.',w);
controls(p,[['Vorhandenes Feld zuordnen','G03'],['Neues Feld anlegen und prüfen','G03','Primary']],w,m,2);
}
}
if(KIND==='G06'){
metrics(p,[['Gehaltszettel bestätigt',eur(3340),'15.10.2026 · Musterkonto · Musterarbeitgeber']],w,m);
note(p,'Auszahlung vorgemerkt. Der bestätigte Gehaltszettel bedeutet noch keinen bestätigten Bankeingang. Eine verknüpfte Erwartung wird mit der tatsächlichen Auszahlung abgeglichen.',w);
controls(p,[['Zum Gehaltsreport','R03','Primary'],['Rückgängig','G03']],w,false,2);
controls(p,[['Original-PDF','G07'],['Gehaltszettel schließen','G01']],w,false,2);
}
text(p,'Änderungen werden erst beim Speichern übernommen.',w,12,'muted');
f.resize(f.width,p.y+p.height+24);const nav=source.children.find(n=>n.name==='Hauptnavigation');source.resize(source.width,Math.max(900,f.y+f.height+24+(nav?72:0)));if(nav){nav.y=source.height-72;mutated.push(nav.id);}evidence.push({id:source.id,dialog:f.id,body:p.id,name:source.name,width:f.width,height:f.height,columns:m?1:2});
}
return{createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,evidence};
