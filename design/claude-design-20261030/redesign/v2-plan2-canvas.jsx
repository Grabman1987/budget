const PC2={X:40,G:100,Y:130,R2:1530,R3:2930};
const lb2=(x,y,t)=><div style={{position:'absolute',left:x,top:y-30,fontSize:13,fontWeight:600,whiteSpace:'nowrap'}}>{t}</div>;
const at=(x,y,el)=><div style={{position:'absolute',left:x,top:y}}>{el}</div>;
function PlCanvas2(){const {X,G,Y,R2,R3}=PC2,X2=X+1440+G;
return <div style={{position:'absolute',left:0,top:0,width:X2+1440+X,height:R3+844+70,fontFamily:'Archivo,system-ui,sans-serif',color:'#0a2342'}}>
<div style={{position:'absolute',left:X,top:24,fontSize:30,fontWeight:700}}>Budget · Plan › Monat v2</div>
{lb2(X,Y,'Desktop 1440×1300 (900 = Falz) · Lichtpause · Verschieben-Popover am überzogenen Lebensmittel')}{at(X,Y,<PlDesk2 id="hell.auswahl" sel pop/>)}
{lb2(X2,Y,'Desktop 1440×1300 · Lichtpause · Verteilen-Menü mit Vorschau, Kategorie inline hinzufügen')}{at(X2,Y,<PlDesk2 id="hell.hinzufuegen" addIn vert preview/>)}
{lb2(X,R2,'Desktop 1440×1300 · Blaupause · Dichte „Minimal“, ⋯ Menü, Rückgängig-Toast')}{at(X,R2,<PlDesk2 id="dunkel" dark menu dens="min" toast/>)}
{lb2(X2,R2,'Konzept · neue Funktion · Desktop 1440×1300 · „Bis Gehalt“ (Gehaltsperiode statt Kalendermonat)')}{at(X2,R2,<PlDesk2 id="hell.bisgehalt" bg sel view="view"/>)}
{lb2(X,R3,'Phone · Liste')}{at(X,R3,window.PlPh2&&<window.PlPh2/>)}
{lb2(X+430,R3,'Phone · Kategorie angetippt (Vollbild Zuweisen)')}{at(X+430,R3,window.PlPh2&&<window.PlPh2 sheet/>)}{lb2(X+860,R3,'Phone · Bearbeiten (Stift)')}{at(X+860,R3,window.PlPh2&&<window.PlPh2 edit/>)}</div>}
ReactDOM.createRoot(document.getElementById('root')).render(<PlCanvas2/>);
