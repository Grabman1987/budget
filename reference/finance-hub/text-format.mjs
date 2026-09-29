// Shared, DOM-free formatting helpers for the cockpit (contract of the 24.09.2026 audit, Paket 0).
// `src/format.js` re-exports everything here plus `today()` for browser modules. Money is always
// integer cents; a missing value renders as EMPTY, never as "NaN" or "undefined".
export const EMPTY='–';
const LOCALE='de-AT';
// Plain numbers use dot grouping like the currency style ("1.445"); de-AT's own decimal style would insert a thin space.
const NUMBER_LOCALE='de-DE';
const roundHalfAway=value=>Math.sign(value)*Math.round(Math.abs(value));
const isCents=value=>Number.isFinite(value);
const monthNames=['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const dayValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'));

export function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

// role: 'kpi' (tiles, no cents), 'table' and 'inline' (two decimals). sign: 'auto' | 'always' | 'never'.
export function eur(cents,{role='inline',sign='auto'}={}){
 if(!isCents(cents))return EMPTY;
 const digits=role==='kpi'?0:2;
 const formatter=new Intl.NumberFormat(LOCALE,{style:'currency',currency:'EUR',minimumFractionDigits:digits,maximumFractionDigits:digits});
 const value=role==='kpi'?roundHalfAway(cents/100):cents/100;
 let text=formatter.format(sign==='never'?Math.abs(value):value);
 if(sign==='always'&&value>0)text='+'+text;
 return text;
}

export function num(value,{decimals=0}={}){
 if(!Number.isFinite(value))return EMPTY;
 return new Intl.NumberFormat(NUMBER_LOCALE,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value);
}

// ratio 0.123 → "12,3 %"
export function pct(ratio,{decimals=1,sign='auto'}={}){
 if(!Number.isFinite(ratio))return EMPTY;
 const text=num(ratio*100,{decimals})+' %';
 return sign==='always'&&ratio>0?'+'+text:text;
}

export function dt(iso){
 if(!dayValid(iso))return EMPTY;
 return iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);
}

// Free text from banks, notes and sources may carry ISO days ("[BANK-AUDIT 2026-09-22]"). For display
// every valid YYYY-MM-DD becomes TT.MM.JJJJ (CALC-16); the stored text stays untouched. Returns plain
// text: callers still pass the result through esc().
export function deDates(text){
 return String(text??'').replace(/(?<![\d.-])(\d{4}-\d{2}-\d{2})(?![\d-])/g,iso=>dayValid(iso)?dt(iso):iso);
}

export function mo(yearMonth){
 const match=/^(\d{4})-(\d{2})/.exec(String(yearMonth||''));
 if(!match)return EMPTY;
 const index=Number(match[2])-1;
 return index>=0&&index<12?monthNames[index]+' '+match[1]:EMPTY;
}

// "heute", "gestern", "morgen", "in 3 Tagen", "vor 5 Tagen"; beyond two weeks the plain date.
export function relDay(iso,today){
 if(!dayValid(iso)||!dayValid(today))return dt(iso);
 const diff=Math.round((Date.parse(iso+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 if(diff===0)return 'heute';
 if(diff===1)return 'morgen';
 if(diff===-1)return 'gestern';
 if(diff>1&&diff<=14)return 'in '+diff+' Tagen';
 if(diff<-1&&diff>=-14)return 'vor '+(-diff)+' Tagen';
 return dt(iso);
}

export function plural(n,singular,pluralForm){
 if(!Number.isFinite(n))return EMPTY+' '+pluralForm;
 return num(n)+' '+(n===1?singular:pluralForm);
}

// A leading emoji (category and group names carry them) becomes its own span so it can be sized
// and aligned independently of the text. Everything is escaped.
const GLYPH=/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;
export function glyph(text){
 const value=String(text??'');
 const match=GLYPH.exec(value);
 if(!match)return esc(value);
 return `<span class="glyph">${esc(match[1])}</span>${esc(value.slice(match[0].length))}`;
}

// Chart axes: whole euros in the same style as the rest of the app ("€ 1.445", "-€ 12.560").
export function axisMoney(cents){return eur(cents,{role:'kpi'});}
