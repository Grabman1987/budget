(()=>{
const {V3Ueb,V3UebPh,V3Pos,V3Inst,V3PosPh,V3Spar}=window.V3,{V3Alloc,V3Schulden,V3SchuldenPh}=window.V3B;
const X=40,Y=130,GX=1540,GY=1040;
const FR=[['Übersicht · Lichtpause · Als Nächstes (4 Zeilen, je eine Aktion) · Zusammensetzung nach Anlageart',<V3Ueb fid="ueb.hell"/>],
['Übersicht · Blaupause · „+ Investment“-Menü offen',<V3Ueb dark fid="ueb.dunkel" open="add"/>],
['Übersicht · Lichtpause · Seiten-Dropdown offen, nichts offen („Alles erledigt“)',<V3Ueb fid="ueb.leer" open="page" empty/>],
['Positionen · Lichtpause · Alle Anlagen, Spalten wie bisher',<V3Pos fid="pos.hell"/>],
['Positionen · Blaupause · Instrument MSCI World ETF, Transaktionen editierbar',<V3Inst dark fid="pos.inst"/>],
['Positionen · Lichtpause · Umschalter „Aktivitäten“',<V3Pos fid="pos.akt" mode="akt"/>],
['Positionen · Blaupause · Anlageart P2P, Anlageart-Dropdown offen',<V3Pos dark fid="pos.p2p" art="P2P" open="art"/>],
['Sparpläne · Lichtpause · Rate ändern, Pausieren',<V3Spar fid="spar"/>],
['Allokation · Blaupause · Ist/Ziel/Abweichung, Stufen, Ausgleich über nächste Sparrate',<V3Alloc dark fid="alloc"/>],
['Schulden · Lichtpause · Sondertilgung 100 € monatlich, live',<V3Schulden fid="schulden.hell"/>],
['Schulden · Blaupause · 50 € monatlich + 2.000 € einmalig',<V3Schulden dark fid="schulden.dunkel" xm={50} once={2000}/>]];
const PH=[['Phone · Übersicht',V3UebPh],['Phone · Positionen',V3PosPh],['Phone · Schulden',V3SchuldenPh]];
const SETS={a:[[0,1,2],[0]],b:[[3,4,5,6],[1]],c:[[7,8,9,10],[2]]},SET=SETS[window.V3SET||'a'],FRS=SET[0].map(i=>FR[i]),PHS=SET[1].map(i=>PH[i]),NAV=[['a','Übersicht','vermoegen-v3.html'],['b','Positionen','vermoegen-v3-positionen.html'],['c','Sparpläne · Allokation · Schulden','vermoegen-v3-planen.html']],PY=Y+Math.ceil(FRS.length/3)*GY;
function V3Canvas(){const lb=(x,y,t)=><div style={{position:'absolute',left:x,top:y-30,fontSize:13,fontWeight:600,whiteSpace:'nowrap'}}>{t}</div>;
return <div style={{position:'absolute',left:0,top:0,width:X+3*GX,height:PY+900,fontFamily:'Archivo,system-ui,sans-serif',color:'#0a2342'}}><div style={{position:'absolute',left:X,top:24,fontSize:30,fontWeight:700}}>Budget · Vermögen v3 · Übersicht und Aktion</div>
<div style={{position:'absolute',left:X,top:72,display:'flex',gap:18,fontSize:14}}>{NAV.map(n=><a key={n[0]} href={n[2]} style={{fontWeight:n[0]===(window.V3SET||'a')?700:400}}>{n[1]}</a>)}</div>{FRS.map((f,i)=>{const x=X+(i%3)*GX,y=Y+Math.floor(i/3)*GY;return <React.Fragment key={i}>{lb(x,y,f[0])}<div style={{position:'absolute',left:x,top:y}}>{f[1]}</div></React.Fragment>})}
{PHS.map(([t,C],i)=><React.Fragment key={t}>{lb(X+i*430,PY,t)}<div style={{position:'absolute',left:X+i*430,top:PY}}><C/></div></React.Fragment>)}</div>}
ReactDOM.createRoot(document.getElementById('root')).render(<V3Canvas/>);
})();
