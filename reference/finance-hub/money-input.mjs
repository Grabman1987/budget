export function parseEuroCents(input){
  const raw=String(input??'').trim().replace(/\s|€/g,'');
  if(!raw)throw Error('Bitte einen Betrag eingeben.');
  let normalized;
  if(/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw))normalized=raw.replaceAll('.','').replace(',','.');
  else if(/^[-+]?\d+(?:,\d{1,2})?$/.test(raw))normalized=raw.replace(',','.');
  else if(/^[-+]?\d+(?:\.\d{1,2})?$/.test(raw))normalized=raw;
  else throw Error('Bitte Euro und höchstens zwei Nachkommastellen eingeben.');
  const negative=normalized.startsWith('-'),digits=normalized.replace(/^[-+]/,''),[whole,fraction='']=digits.split('.');
  const value=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);
  if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Der Betrag ist zu groß.');
  return Number(value);
}
