// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLedgerWrites } from './mutations';
import type { BookingPage, ListedBooking } from './types';

vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useToast: () => ({ show: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());
const listed = (id:string,amountCents:number,currency='EUR') => ({id,amountCents,currency,splits:[]} as unknown as ListedBooking);

it.each([false,true])('keeps complete-filter count/native/EUR facts pending for an uncached deleted partner and retains exact snapshots on failure (fail=%s)', async (fail) => {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const keys = [
    ['ledger','bookings','infinite',{q:'synthetic'}],
    ['ledger','bookings','infinite',{accountId:'partner-account'}],
    ['ledger','bookings','infinite',{accountId:'foreign-account'}],
  ];
  const pages: BookingPage[] = [
    {items:[listed('selected',-1234)],total:205,sumCents:-1367,sumEurCents:-1390,nextCursor:'unloaded',nativeTotals:[{currency:'EUR',count:204,cents:-1557},{currency:'USD',count:1,cents:190}]},
    {items:[listed('unrelated',444)],total:4,sumCents:1678,sumEurCents:1678,nextCursor:'unloaded-partner',nativeTotals:[{currency:'EUR',count:4,cents:1678}]},
    {items:[listed('foreign-visible',-101,'USD')],total:4,sumCents:190,sumEurCents:167,nextCursor:'unloaded-foreign',nativeTotals:[{currency:'USD',count:4,cents:190}]},
  ];
  const before = pages.map((page) => ({pages:[page],pageParams:[undefined]}));
  const after: typeof before = fail ? before : [
    {pages:[{...pages[0]!,items:[listed('canonical-next',567)],total:203,nextCursor:'remaining',nativeTotals:[{currency:'EUR',count:202,cents:-1557},{currency:'USD',count:1,cents:190}]}],pageParams:[undefined]},
    {pages:[{...pages[1]!,total:3,sumCents:444,sumEurCents:444,nextCursor:null,nativeTotals:[{currency:'EUR',count:3,cents:444}]}],pageParams:[undefined]},
    before[2]!,
  ];
  let releaseRead!: () => void;
  const blocked = new Promise<void>((resolve) => {releaseRead=resolve;});
  let reads=0;
  const unsubscribe = keys.map((key,index) => {
    client.setQueryData(key,before[index]);
    const observer = new QueryObserver(client,{queryKey:key,staleTime:Infinity,queryFn:async()=>{reads+=1;await blocked;return after[index]!;}});
    return observer.subscribe(()=>undefined);
  });
  let finishWrite!: (response:Response) => void;
  const fetch = vi.fn(()=>new Promise<Response>((resolve)=>{finishWrite=resolve;}));
  vi.stubGlobal('fetch',fetch);
  const {result,unmount} = renderHook(useLedgerWrites,{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
  let writing!: Promise<unknown>;
  try {
    act(()=>{writing=result.current.bulk.mutateAsync({ids:['selected'],remove:true,previewRevision:'a'.repeat(64)}).catch((error:unknown)=>error);});
    await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
    expect(keys.map((key)=>client.getQueryData(key))).toEqual(before);
    await act(async()=>{
      finishWrite(new Response(JSON.stringify(fail ? {error:'invalid',message:'Synthetic rejection'} : {changed:['selected','unselected-partner'],skipped:[],transferPairs:1,groupId:'synthetic-delete-group'}),{status:fail?422:200}));
      await writing;
    });
    await waitFor(()=>expect(reads).toBe(3));
    if (fail) expect(keys.map((key)=>client.getQueryData(key))).toEqual(before);
    else {
      const pending=keys.map((key)=>client.getQueryData<typeof before[number]>(key)!.pages[0]!);
      expect(pending.map((page)=>page.nativeTotalsPending)).toEqual([true,true,true]);
      // The complete-filter facts stay at their last canonical values, even though the
      // selected visible row is removed. A missing partner's filter membership is never guessed.
      expect(pending.map((page)=>page.total)).toEqual([205,4,4]);
      expect(pending.map((page)=>page.sumCents)).toEqual([-1367,1678,190]);
      expect(pending.map((page)=>page.sumEurCents)).toEqual([-1390,1678,167]);
      expect(pending.map((page)=>page.nativeTotals)).toEqual(pages.map((page)=>page.nativeTotals));
      expect(pending[0]!.items).toEqual([]);
      expect(pending[1]!.items.map((item)=>item.id)).toEqual(['unrelated']);
    }
    await act(async()=>{releaseRead();});
    await waitFor(()=>expect(keys.map((key)=>client.getQueryState(key)?.fetchStatus)).toEqual(['idle','idle','idle']));
    expect(keys.map((key)=>client.getQueryData(key))).toEqual(after);
    expect(keys.map((key)=>client.getQueryData<typeof before[number]>(key)?.pages[0]?.nativeTotalsPending)).toEqual([undefined,undefined,undefined]);
  } finally {
    releaseRead();
    unsubscribe.forEach((off)=>off());
    unmount();client.clear();
  }
});
