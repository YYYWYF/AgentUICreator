import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const {expect}=createRequire(path.join(repo,'apps/creator-workbench/package.json'))('@playwright/test');

export async function verifyScenario({caseId,testCase,page,frame,fixture,dir}:any){
 const checks:any[]=[];const sent:any[]=[];
 const check=async(name:string,run:()=>Promise<void>)=>{try{await run();checks.push({name,status:'passed'});}catch(error:any){checks.push({name,status:'failed',error:error.message});throw error;}};
 const surface=frame.locator('[data-ui-plugin="conversation-surface"]');
 const editor=frame.locator('.aui-composer-root').getByRole('textbox');
 const submit=async(text:string)=>{const count=fixture.runCount();await editor.fill(text);await frame.locator('.aui-composer-send').click();await expect.poll(()=>fixture.runCount(),{timeout:12000}).toBe(count+1);await expect(surface.getByText('wire:first',{exact:false}).last()).toBeVisible();};
 const events=async(values:any[])=>{sent.push(...values.map(event=>({at:new Date().toISOString(),event})));fixture.emitEvents(values);await page.waitForTimeout(350);};
 const finish=async()=>{fixture.finishRun();await expect(frame.getByRole('button',{name:/停止生成|Stop generating/i})).toHaveCount(0,{timeout:8000});};
 const custom=async(event:any,label:string)=>{await submit(label);await events([event]);await finish();};
 try{
 if(caseId==='case01-cards'){
  const cards=frame.locator('.quick-help-card'),one=cards.filter({hasText:'使用说明'}),two=cards.filter({hasText:'常见问题'});
  await check('two independently named cards',async()=>{await expect(cards).toHaveCount(2);await expect(one).toBeVisible();await expect(two).toBeVisible();});
  await check('first collapse leaves second expanded',async()=>{await one.getByRole('button',{name:/知道了|got it/i}).click();await expect(one.locator('.quick-help-card__body')).toBeHidden();await expect(two.locator('.quick-help-card__body')).toBeVisible();});
  await check('second collapse leaves first expanded',async()=>{await one.locator('.quick-help-card__toggle').click();await two.getByRole('button',{name:/知道了|got it/i}).click();await expect(two.locator('.quick-help-card__body')).toBeHidden();await expect(one.locator('.quick-help-card__body')).toBeVisible();});
  await check('second title reopens body',async()=>{await two.locator('.quick-help-card__toggle').click();await expect(two.locator('.quick-help-card__body')).toBeVisible();});
 }else if(caseId==='case03-message-actions'){
  const copy=surface.getByRole('button',{name:/复制|Copy/i}),reload=surface.getByRole('button',{name:/重新生成|重新回答|重试|Regenerate|Reload/i}),feedback=surface.getByRole('button',{name:/有帮助|没有帮助|点赞|点踩|Helpful|Not helpful|Like|Dislike/i});
  await submit('第一条流式回答');
  await check('streaming hides completed-response actions',async()=>{await expect(copy).toHaveCount(0);await expect(reload).toHaveCount(0);await expect(feedback).toHaveCount(0);await expect(frame.getByRole('button',{name:/停止生成|Stop generating/i})).toBeVisible();});
  await finish();
  await check('completed response exposes actions once',async()=>{await expect(copy).toHaveCount(1);await expect(copy).toBeVisible();await expect(reload).toHaveCount(1);await expect(reload).toBeVisible();await expect(feedback).toHaveCount(2);});
  const count=fixture.runCount();await reload.click();await expect.poll(()=>fixture.runCount()).toBe(count+1);
  await check('regenerating hides old completion actions',async()=>{await expect(copy).toHaveCount(0);await expect(reload).toHaveCount(0);});
  await frame.getByRole('button',{name:/停止生成|Stop generating/i}).click();
  await check('stopped response can regenerate',async()=>{await expect(reload).toHaveCount(1);await expect(reload).toBeVisible();});
  const next=fixture.runCount();await reload.click();await expect.poll(()=>fixture.runCount()).toBe(next+1);await finish();
  await check('second completion has no duplicate actions',async()=>{await expect(copy).toHaveCount(1);await expect(reload).toHaveCount(1);await expect(feedback).toHaveCount(2);});
 }else if(caseId==='case04-help-actions'){
  await check('example action fills current composer without sending',async()=>{const count=fixture.runCount();await frame.getByRole('button',{name:'查看示例',exact:true}).click();await expect(editor).toHaveValue('请给我一个使用示例');expect(fixture.runCount()).toBe(count);});
  await check('filled example can be sent by user',async()=>{const count=fixture.runCount();await frame.locator('.aui-composer-send').click();await expect.poll(()=>fixture.runCount()).toBe(count+1);await finish();});
 }else if(caseId==='case05-order'){
  await custom(testCase.event,'查看订单');
  await check('order event renders business fields',async()=>{await expect(surface.getByText('O-20261104-001',{exact:false})).toBeVisible();await expect(surface.getByText('键盘',{exact:false})).toBeVisible();await expect(surface.getByText('鼠标垫',{exact:false})).toBeVisible();await expect(surface.getByText(/已支付|已付款|Paid/).first()).toBeVisible();await expect(surface.getByText(/258/).first()).toBeVisible();});
  const long=structuredClone(testCase.event);long.value.order_no='O-LONG';long.value.items=Array.from({length:9},(_,i)=>({name:`扩展商品-${i+1}`,quantity:i+1,unit_price:10}));
  await custom(long,'查看商品较多的订单');
  await check('long order has working expansion',async()=>{const target=surface.getByText('O-LONG',{exact:false});const card=target.locator('xpath=ancestor::*[.//button][1]');await card.getByRole('button',{name:/展开|更多|全部|查看商品|Show|Expand/i}).first().click();await expect(surface.getByText('扩展商品-9',{exact:false})).toBeVisible();});
  const invalid=structuredClone(testCase.event);invalid.value={order_no:'O-INVALID',items:null,total_amount:'bad'};
  await custom(invalid,'异常订单数据');
  await check('malformed order leaves composer usable',async()=>{await expect(frame.locator('[data-plugin-state="error"]')).toHaveCount(0);await expect(editor).toBeEditable();});
 }else if(caseId==='case06-inspection'){
  await custom(testCase.event,'检查订单服务');
  await check('inspection event renders check statuses',async()=>{await expect(surface.getByText('数据库连接',{exact:false})).toBeVisible();await expect(surface.getByText('支付接口',{exact:false})).toBeVisible();});
  await check('failed inspection exposes details',async()=>{await surface.getByText('支付接口',{exact:false}).first().click();await expect(surface.getByText('UPSTREAM_TIMEOUT',{exact:false})).toBeVisible();await expect(surface.getByText('支付接口响应超时',{exact:false})).toBeVisible();});
  await check('error details copy to clipboard',async()=>{await surface.getByRole('button',{name:/复制错误|复制详情|复制错误详情|Copy error|Copy details/i}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('UPSTREAM_TIMEOUT');});
  const empty=structuredClone(testCase.event);empty.value.checks=[];await custom(empty,'空检查结果');
  const invalid=structuredClone(testCase.event);invalid.value.checks='invalid';await custom(invalid,'格式错误的检查结果');
  await check('empty and malformed checks do not crash conversation',async()=>{await expect(frame.locator('[data-plugin-state="error"]')).toHaveCount(0);await expect(editor).toBeEditable();});
 }else if(caseId==='case07-sales'){
  await custom(testCase.event,'查看月度报表');
  const table=surface.getByRole('table'),rows=table.getByRole('row');
  await check('JSON string parses into a table',async()=>{await expect(table).toBeVisible();await expect(table.getByText('2026-09',{exact:true})).toBeVisible();await expect(table.getByText('2026-10',{exact:true})).toBeVisible();});
  await check('revenue sort changes displayed order',async()=>{const header=table.getByRole('columnheader',{name:/收入|Revenue/i});await header.click();let text=await rows.nth(1).innerText();if(!text.includes('2026-10')){await header.click();text=await rows.nth(1).innerText();}expect(text).toContain('2026-10');});
  await check('row selection exposes order count',async()=>{await table.getByRole('row').filter({hasText:'2026-09'}).click();await expect(surface.getByText(/订单.*320|320.*订单|Orders.*320/i).last()).toBeVisible();});
  const invalid=structuredClone(testCase.event);invalid.value.payload='{not JSON';await custom(invalid,'无法解析的报表');
  const empty=structuredClone(testCase.event);empty.value.payload=JSON.stringify({title:'空报表',rows:[]});await custom(empty,'空报表');
  await check('bad JSON and empty rows leave conversation usable',async()=>{await expect(frame.locator('[data-plugin-state="error"]')).toHaveCount(0);await expect(editor).toBeEditable();});
 }else if(caseId==='case08-progress'){
  await submit('开始生成报告');await events([testCase.event]);
  await check('custom event renders right-side progress panel',async()=>{await expect(frame.getByText('任务进度',{exact:true})).toBeVisible();await expect(frame.getByText('生成销售报告',{exact:true})).toBeVisible();const title=await frame.getByText('任务进度',{exact:true}).boundingBox();const area=await surface.boundingBox();expect(title?.x).toBeGreaterThan((area?.x??0)+(area?.width??0)/2);});
  const other=structuredClone(testCase.event);other.value={...other.value,job_id:'J-002',title:'同步客户资料',completed:1,total:5};
  const completed=structuredClone(testCase.event);completed.value={...completed.value,completed:10,status:'completed'};await events([other,completed]);
  await check('same job updates without duplicating other jobs',async()=>{await expect(frame.getByText('生成销售报告',{exact:true})).toHaveCount(1);await expect(frame.getByText('同步客户资料',{exact:true})).toHaveCount(1);await expect(frame.getByText(/已完成|完成|Completed/).last()).toBeVisible();});
  const failed=structuredClone(other);failed.value={...failed.value,status:'failed',error:testCase.failureExample};await events([failed]);
  await check('failed job exposes its error',async()=>{await frame.getByText('同步客户资料',{exact:true}).click();const detail=frame.getByText('销售数据暂时无法读取',{exact:false});if(!await detail.isVisible()){await frame.getByRole('button',{name:/错误|详情|展开|Error|Details/i}).last().click();}await expect(detail).toBeVisible();await expect(frame.getByText('DATA_SOURCE_UNAVAILABLE',{exact:false})).toBeVisible();});
  const invalid=structuredClone(testCase.event);invalid.value={job_id:null,completed:'invalid',total:0};await events([invalid]);await finish();
  await check('invalid progress does not crash UI',async()=>{await expect(frame.locator('[data-plugin-state="error"]')).toHaveCount(0);await expect(editor).toBeEditable();});
 }
 if(!checks.length)throw Error('No assertions defined for scenario '+caseId);
 await page.screenshot({path:path.join(dir,'verified.png'),fullPage:true});
 return {status:'passed',checks,protocolEventsSent:sent};
 }catch(error:any){await page.screenshot({path:path.join(dir,'verification-failed.png'),fullPage:true}).catch(()=>{});return {status:'failed',checks,error:error.message,protocolEventsSent:sent};}
 finally{await writeFile(path.join(dir,'ag-ui-events-sent.json'),JSON.stringify(sent,null,2));}
}
