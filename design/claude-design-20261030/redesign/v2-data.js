(()=>{const S=2870;
const P=[['30.10.','Wien Energie',-74.5,1],['01.11.','Miete',-890,1],['02.11.','A1 Telekom',-19.9,1],['03.11.','Gewerkschaft GPA',-42.3,1],['05.11.','Wohnkredit-Rate',-412,1],['06.11.','Netflix',-17.99,1],['08.11.','Fitnessstudio',-29.9,0],['10.11.','Mastercard-Abrechnung',-841.41,1],['12.11.','Sparplan Depot',-130,1],['13.11.','Gehalt',4323.68,1],['20.11.','Kfz-Versicherung',-169.71,1],['25.11.','Visa-Abrechnung',-725.68,1],['30.11.','Wien Energie',-74.5,1],['01.12.','Miete',-890,1],['02.12.','A1 Telekom',-19.9,1]];
let v=S;const rows=P.map(r=>{v=Math.round((v+r[2])*100)/100;return [...r,v]});
const DO={'30.10.':1,'01.11.':3,'02.11.':4,'03.11.':5,'05.11.':7,'06.11.':8,'08.11.':10,'10.11.':12,'12.11.':14,'13.11.':15,'20.11.':22,'25.11.':27,'30.11.':32,'01.12.':33,'02.12.':34};
const out=P.filter(r=>r[2]<0),to12=P.filter(r=>r[2]<0&&DO[r[0]]<=14);
const sum=a=>Math.round(a.reduce((s,r)=>s+r[2],0)*100)/100;
window.BD={saldo:S,pay:P,rows,sumTo12:sum(to12),tief:rows.find(r=>r[0]==='12.11.')[4],tiefDate:'12.11.',gehalt:4323.68,hoch:rows.find(r=>r[0]==='13.11.')[4],hochDate:'13.11.',faellig:sum(out),faelligN:out.length,dayOf:{'30.10.':1,'01.11.':3,'02.11.':4,'03.11.':5,'05.11.':7,'06.11.':8,'08.11.':10,'10.11.':12,'12.11.':14,'13.11.':15,'20.11.':22,'25.11.':27,'30.11.':32,'01.12.':33,'02.12.':34},
kommend:{n:to12.length,sum:sum(to12)}};})();