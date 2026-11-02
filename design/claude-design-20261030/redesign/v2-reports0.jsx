(()=>{
const W=window;
const Back=({h=22})=><span style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--primary)',fontWeight:600,fontSize:13.5,height:h}}><W.Ic n="ChevronLeft" s={15}/>Reports</span>;
W.RpHd=({n,name,q,period,vs,dar,right,menu,chain,res,sub})=><div style={{display:'flex',alignItems:'flex-end',gap:32,padding:'6px 12px 4px 20px'}}>
<div style={{display:'flex',flexDirection:'column',gap:10,minWidth:0}}><Back/>
<div><div style={{fontSize:26,fontWeight:650,lineHeight:1.2}}>{name}</div><div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>Report {n} · {q}</div></div>
<div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><W.Sel2>{period}</W.Sel2>{vs&&<W.Sel2>{vs}</W.Sel2>}{dar&&<span style={{position:'relative'}}><W.Sel2>Darstellung: {dar}</W.Sel2>{menu}</span>}{right}</div></div>
<div style={{marginLeft:'auto',textAlign:'right',minWidth:0,paddingBottom:2}}><div className="tn" style={{fontSize:14,color:'var(--ink-2)',marginBottom:2}}>{chain}</div><div className="tn" style={{fontSize:52,fontWeight:640,lineHeight:1.05,whiteSpace:'nowrap'}}>{res}</div>{sub&&<div className="tn" style={{fontSize:13.5,color:'var(--ink-2)',marginTop:4}}>{sub}</div>}</div></div>;
W.RpHdPh=({period,vs,dar,right,chain,res,sub})=><><div style={{height:30,display:'flex',alignItems:'center'}}><Back h={30}/></div>
<div style={{display:'flex',alignItems:'center',gap:8,height:44}}><W.DDn t={period}/>{vs&&<W.DDn t={vs}/>}{right}</div>{dar&&<div style={{display:'flex',alignItems:'center',height:40}}><W.DDn t={'Darstellung: '+dar}/></div>}
<div style={{textAlign:'right',padding:'6px 0 10px'}}><div className="tn" style={{fontSize:12.5,color:'var(--ink-2)',marginBottom:2}}>{chain}</div><div className="tn" style={{fontSize:36,fontWeight:640,lineHeight:1.05}}>{res}</div>{sub&&<div className="tn" style={{fontSize:12.5,color:'var(--ink-2)',marginTop:2}}>{sub}</div>}</div></>;
})();
