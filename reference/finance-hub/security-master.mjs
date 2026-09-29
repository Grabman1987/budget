// Source-aware metadata and original-currency quotes for the encrypted investment book.
const validDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value};
const currencies=new Set(['EUR','USD','GBP','CHF','JPY','CAD','AUD','SEK','NOK','DKK','PLN','CZK','HUF','BTC','ETH']);
const classes=new Set(['stock','etf','fund','bond','crypto','commodity','cash-equivalent','other','unknown']);
// 'yahoo-chart': the nightly quote job (decision 1: Yahoo chart endpoint, no key).
const providers=new Set(['manual','portfolio-performance','yahoo-chart']);
const clean=(value,max=150)=>String(value??'').trim().slice(0,max);
const clone=value=>structuredClone(value);
function securityIn(book,id){const index=book?.securities?.findIndex(s=>s.id===id);if(index<0||index===undefined)throw Error('Wertpapier nicht gefunden.');return index}
export function securityMaster(security={}){
 const provider=security.quoteProviderConfig?.provider||'manual';
 return {id:security.id,name:security.name||'',isin:security.isin||'',wkn:security.wkn||'',ticker:security.ticker||'',exchange:security.exchange||'',currency:security.currency||'',assetClass:security.assetClass||'unknown',quoteProviderConfig:{provider:providers.has(provider)?provider:'manual',symbol:security.quoteProviderConfig?.symbol||''},quoteCount:security.quotes?.length||0,history:security.masterHistory||[]};
}
export function updateSecurityMaster(book,id,patch,{at=new Date().toISOString(),source='manual'}={}){
 const next=clone(book),index=securityIn(next,id),old=next.securities[index];
 const name=clean(patch.name??old.name),isin=clean(patch.isin??old.isin,20).toUpperCase(),wkn=clean(patch.wkn??old.wkn,12).toUpperCase(),ticker=clean(patch.ticker??old.ticker,40).toUpperCase(),exchange=clean(patch.exchange??old.exchange,80),currency=clean(patch.currency??old.currency,8).toUpperCase(),assetClass=patch.assetClass??old.assetClass??'unknown';
 const quoteProviderConfig=patch.quoteProviderConfig??old.quoteProviderConfig??{provider:'manual',symbol:''},provider=quoteProviderConfig.provider;
 if(!name)throw Error('Bitte einen Namen eingeben.');
 if(isin&&!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin))throw Error('Bitte die ISIN prüfen.');
 if(wkn&&!/^[A-Z0-9]{6}$/.test(wkn))throw Error('Bitte die WKN prüfen.');
  if(!currencies.has(currency))throw Error('Bitte die Originalwährung prüfen.');
  if(currency!==old.currency&&((old.quotes||[]).length||(next.trades||[]).some(trade=>trade.securityId===id)))throw Error('Die Originalwährung kann bei vorhandenen Kursen oder Buchungen nicht ohne Umrechnung geändert werden.');
 if(!classes.has(assetClass))throw Error('Bitte die Anlageklasse prüfen.');
 if(!providers.has(provider))throw Error('Diese Kursquelle ist noch nicht als Connector verfügbar.');
 if(!/^\d{4}-\d{2}-\d{2}T/.test(at))throw Error('Ungültiger Änderungszeitpunkt.');
 const fields={name,isin,wkn,ticker,exchange,currency,assetClass,quoteProviderConfig:{provider,symbol:clean(quoteProviderConfig.symbol,80)}};
 const changed=Object.entries(fields).some(([key,value])=>JSON.stringify(old[key]??null)!==JSON.stringify(value));
 if(!changed)return next;
 old.masterHistory=[...(old.masterHistory||[]),{at,source,before:Object.fromEntries(Object.keys(fields).map(key=>[key,clone(old[key]??null)])),after:clone(fields)}].slice(-100);
 Object.assign(old,fields);return next;
}
export function upsertSecurityQuote(book,id,{date,price,source='manual',sourceReference=null},{at=new Date().toISOString()}={}){
 if(!validDate(date))throw Error('Bitte ein gültiges Kursdatum eingeben.');
 const n=Number(price);if(!Number.isFinite(n)||n<0)throw Error('Bitte einen gültigen Kurs eingeben.');
 if(!['manual','portfolio-performance'].includes(source))throw Error('Unbekannte Kursquelle.');
 const next=clone(book),security=next.securities[securityIn(next,id)];
 if(!currencies.has(security.currency))throw Error('Die Originalwährung des Wertpapiers fehlt.');
 const previous=(security.quotes||[]).find(row=>row[0]===date),quoted=String(n);
 security.quotes=[...(security.quotes||[]).filter(row=>row[0]!==date),[date,quoted]].sort((a,b)=>a[0].localeCompare(b[0]));
 security.quoteSources||={};security.quoteSources[date]={source,sourceReference:sourceReference?clean(sourceReference,250):null,currency:security.currency,recordedAt:at};
 security.quoteHistory=[...(security.quoteHistory||[]),{at,date,previous:previous?.[1]??null,price:quoted,source,action:previous?'replace':'add'}].slice(-300);
 return next;
}
export function deleteSecurityQuote(book,id,date,{at=new Date().toISOString()}={}){
 if(!validDate(date))throw Error('Bitte ein gültiges Kursdatum eingeben.');
 const next=clone(book),security=next.securities[securityIn(next,id)],previous=(security.quotes||[]).find(row=>row[0]===date);
 if(!previous)throw Error('Kurs nicht gefunden.');
 security.quotes=security.quotes.filter(row=>row[0]!==date);delete security.quoteSources?.[date];
 security.quoteHistory=[...(security.quoteHistory||[]),{at,date,previous:previous[1],price:null,action:'delete'}].slice(-300);
 return next;
}
