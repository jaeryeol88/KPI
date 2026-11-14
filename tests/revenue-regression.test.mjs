import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const utilSource=await readFile(new URL('../signup_date_utils.js', import.meta.url),'utf8');
const {signupPaymentAmounts,installmentRevenueForMonth,monthlyRecognizedRevenue}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(utilSource));

const branch1={branch:'부산 1지사',signupDate:'2026-11-11',group:'individual',seats:1,paymentType:'installment',installmentMonths:10,revenue:27550000};
const branch2={branch:'부산 2지사',signupDate:'2026-11-09',group:'individual',seats:1,paymentType:'full',revenue:27550000};

test('10개월 균등분납: 11월 두 계약 합계 5,510,000원',()=>{
 const a={...branch1,installmentAmounts:Array(10).fill(2755000)};
 const b={...branch1,signupDate:'2026-11-12',installmentAmounts:[]};
 const events=[{branch:'부산 1지사',signupEntries:[a,b]}];
 assert.equal(installmentRevenueForMonth(a,2026,11),2755000);
 assert.equal(installmentRevenueForMonth(b,2026,11),2755000);
 assert.equal(monthlyRecognizedRevenue(events,{year:2026,month:11,branches:['부산 1지사']}),5510000);
 assert.equal(monthlyRecognizedRevenue(events,{year:2026,month:12,branches:['부산 1지사']}),5510000);
 assert.equal(monthlyRecognizedRevenue(events,{year:2027,month:9,branches:['부산 1지사']}),0);
});

test('전체와 지사별: 금액 혼합/중복 없이 담당 지사에만 반영',()=>{
 const events=[
  {branch:'부산 1지사',signupEntries:[branch1]},
  {branch:'부산 2지사',signupEntries:[branch2]},
  {branch:'부산 3지사',signupEntries:[{...branch1,branch:'부산 3지사',paymentType:'installment',installmentMonths:2,revenue:12000000,installmentAmounts:[2000000,10000000]}]},
  {branch:'부산 4지사',signupEntries:[]}
 ];
 const sum=branches=>monthlyRecognizedRevenue(events,{year:2026,month:11,branches});
 assert.equal(sum(['부산 1지사']),2755000);
 assert.equal(sum(['부산 2지사']),27550000);
 assert.equal(sum(['부산 3지사']),2000000);
 assert.equal(sum(['부산 4지사']),0);
 assert.equal(sum(null),32305000);
 assert.equal(sum(['부산 1지사','부산 2지사','부산 3지사','부산 4지사']),sum(null));
});

test('비균등 분납/연도 넘김/취소는 개별 회차를 따름',()=>{
 const uneven={...branch1,signupDate:'2026-12-18',revenue:10000000,installmentMonths:3,installmentAmounts:[1000000,3000000,6000000]};
 assert.equal(installmentRevenueForMonth(uneven,2026,12),1000000);
 assert.equal(installmentRevenueForMonth(uneven,2027,1),3000000);
 assert.equal(installmentRevenueForMonth(uneven,2027,2),6000000);
 assert.equal(installmentRevenueForMonth({...uneven,withdrawn:true},2027,1),0);
});

test('회차 배열 없는 계약을 완납으로 처리하지 않음',()=>{
 assert.deepEqual(signupPaymentAmounts(branch1),Array(10).fill(2755000));
 assert.deepEqual(signupPaymentAmounts({...branch1,revenue:10000001}),[]);
 assert.equal(installmentRevenueForMonth({...branch1,revenue:10000001},2026,11),0);
});

test('관리자/뷰어/월별 입회 현황 모두 공통 분납 함수 사용',async()=>{
 const paths=['index.html','viewer.html','viewer_extra.js'];
 for(const path of paths){
  const s=await readFile(new URL('../'+path,import.meta.url),'utf8');
  assert.match(s,/signupPaymentAmounts\(/,path+' does not use shared schedule');
  assert.match(s,/signup_date_utils\.js\?v=payment-schedule-unified-20261114/,path+' uses old imported schedule');
 }
});

test('모듈 문법 확인 (실제 브라우저 모듈과 동일한 파싱)',async()=>{
 for(const path of ['signup_date_utils.js','viewer_extra.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(p.status,0,path+': '+p.stderr);
 }
 for(const path of ['index.html','viewer.html']){
  const html=await readFile(new URL('../'+path,import.meta.url),'utf8');
  const chunks=[...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(chunks.length,path+': missing module script');
  for(const [,source] of chunks){
   const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
   assert.equal(p.status,0,path+': '+p.stderr);
  }
 }
});
