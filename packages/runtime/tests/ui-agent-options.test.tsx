// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useAgentUILocale, useConversationComposer, usePluginActions, usePluginEvents, usePluginService, type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import { AgentApplication, createAgentUIProject, createPluginCapabilityCatalog, ConversationWelcomeFallback, type AgentProps } from '../src/ui/index.js';
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, type ConversationDataSource } from '../src/ui/services/conversations.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  act(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()));
  vi.unstubAllGlobals();
});
const eventName = 'app.ticket.summary';
const schemas = { [eventName]: z.object({ ticket_id: z.string() }).transform(value => ({ ticketId: value.ticket_id })) };
function fixture(providerEnabled = true) {
  const started = vi.fn(), stopped = vi.fn();
  const provider: UIPluginDefinition = {
    manifest: { id:'data-source', name:'Data', description:'Test history owner', version:'1.0.0', capabilities:['headless'] },
    provides:[AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
    setup:({services}) => { started(); services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, { list:async()=>[],get:async()=>{throw Error('UNCONFIGURED');},delete:async()=>{} }); return stopped; },
    Component:()=>null,
  };
  function View() {
    const labels = useAgentUILocale('composer');
    const composer = useConversationComposer();
    const history = usePluginService<ConversationDataSource>(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE);
    const events = usePluginEvents(), actions = usePluginActions();
    const [result,setResult] = useState('');
    const [historyTitle,setHistoryTitle] = useState('');
    useEffect(() => events.subscribe<{ticketId:string}>(eventName,event=>{setResult(event.payload.ticketId);}),[events]);
    useEffect(() => { let active = true; void history?.list().then(items=>{if(active)setHistoryTitle(items[0]?.title??'');}); return()=>{active=false;}; },[history]);
    return <><input placeholder={labels.placeholder} defaultValue="draft"/><ConversationWelcomeFallback/><output>{result}</output><aside>{historyTitle}</aside><span data-attachments={String(composer.attachmentsEnabled)} />
      <button onClick={()=>{void actions.sendMessage('Analyze ticket');}}>send</button></>;
  }
  const view: UIPluginDefinition = {
    manifest:{id:'view',name:'View',description:'Options test view',version:'1.0.0',data:{events:[eventName]}},
    optionalInject:[AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],Component:View,
  };
  const project = createAgentUIProject({
    appUIModelSource:JSON.stringify({applicationPlugins:[{pluginId:'data-source',enabled:providerEnabled}],root:{type:'slot',plugins:[{pluginId:'view'}]}}),
    pluginCapabilityCatalog:createPluginCapabilityCatalog([provider,view].map(definition=>({...definition,provides:definition.provides??[],inject:definition.inject??[],optionalInject:definition.optionalInject??[],loadDefinition:async()=>definition}))),
    capabilityCatalogRevision:'a'.repeat(64),});
  const container = document.createElement('div');document.body.append(container);
  const root = createRoot(container);
  cleanups.push(()=>container.remove(),()=>root.unmount());
  return {container,started,stopped,async render(props:AgentProps) {
    await act(async()=>{root.render(<AgentApplication project={project} appEventSchemas={schemas} {...props}/>);});
    await act(async()=>{await vi.waitFor(()=>expect(container.querySelector('input')).not.toBeNull());});
  }};
}
function source(title:string):ConversationDataSource {
 return {list:vi.fn(async()=>[{id:title,title}]),get:async()=>{throw Error('NOT_USED');},delete:async()=>{}};
}

it('accepts live event schemas, localized copy, welcome and history through Agent and preserves the draft on updates', async()=>{
 const requests:Record<string,any>[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  const input=JSON.parse(String(init.body));requests.push(input);
  const frames=[{type:'RUN_STARTED',threadId:input.threadId,runId:input.runId},
   {type:'CUSTOM',name:eventName,value:{ticket_id:'T-42'}},
   {type:'RUN_FINISHED',threadId:input.threadId,runId:input.runId}];
  return new Response(frames.map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});
 }));
 const f=fixture(), history=source('My history');
 const props:AgentProps={conversationDataSource:history,locale:'en-US',locales:{'en-US':{composer:{placeholder:'Business input'},conversation:{welcome:'My assistant',welcomeDescription:'Project introduction'}}}};
 await f.render(props);
 expect(f.container.querySelector('input')?.placeholder).toBe('Business input');
 expect(f.container.querySelector('h1')?.textContent).toBe('My assistant');
 expect(f.container.querySelector('.aui-thread-welcome-root p')?.textContent).toBe('Project introduction');
 expect(f.container.querySelector('aside')?.textContent).toBe('My history');
 const input=f.container.querySelector('input')!;input.value='Unsent changes';
 await f.render({...props,locales:{'en-US':{composer:{placeholder:'Updated input'},conversation:{welcome:'Updated welcome'}}}});
 expect(f.container.querySelector('input')).toBe(input);
 expect(input.value).toBe('Unsent changes');expect(input.placeholder).toBe('Updated input');
 expect(f.container.querySelector('h1')?.textContent).toBe('Updated welcome');
 expect(f.container.querySelector('.aui-thread-welcome-root p')).toBeNull();
 expect(f.started).toHaveBeenCalledTimes(1);
 await act(async()=>{f.container.querySelector('button')!.click();});
 await act(async()=>{await vi.waitFor(()=>expect(f.container.querySelector('output')?.textContent).toBe('T-42'));});
 expect(requests).toHaveLength(1);
 // Replacing the schema must update the running event decoder, not keep its initial registry.
 await f.render({...props,appEventSchemas:{[eventName]:z.object({ticket_id:z.string()}).transform(value=>({ticketId:`new:${value.ticket_id}`}))}});
 await act(async()=>{f.container.querySelector('button')!.click();});
 await act(async()=>{await vi.waitFor(()=>expect(f.container.querySelector('output')?.textContent).toBe('new:T-42'));});
});

it('isolates Host history and copy between Agent instances',async()=>{
 const a=fixture(),b=fixture();
 await a.render({conversationDataSource:source('A'),locales:{'zh-CN':{composer:{placeholder:'Input A'}}}});
 await b.render({conversationDataSource:source('B'),locales:{'zh-CN':{composer:{placeholder:'Input B'}}}});
 expect(a.container.querySelector('aside')?.textContent).toBe('A');
 expect(b.container.querySelector('aside')?.textContent).toBe('B');
 expect(a.container.querySelector('input')?.placeholder).toBe('Input A');
 expect(b.container.querySelector('input')?.placeholder).toBe('Input B');
});

it('does not activate a disabled provider merely because a Host supplied its service',async()=>{
 const f=fixture(false),history=source('Disabled');
 await f.render({conversationDataSource:history});
 expect(f.started).not.toHaveBeenCalled();expect(history.list).not.toHaveBeenCalled();
 expect(f.container.querySelector('aside')?.textContent).toBe('');
});

it('forwards attachment options and initial language without remounting the composer',async()=>{
 const f=fixture();
 await f.render({attachments:false,defaultLocale:'en-US',locales:{'en-US':{composer:{placeholder:'English initial input'}}}});
 expect(f.container.querySelector('[data-attachments]')?.getAttribute('data-attachments')).toBe('false');
 expect(f.container.querySelector('input')?.placeholder).toBe('English initial input');
 const input=f.container.querySelector('input')!;input.value='Keep this draft';
 await f.render({attachments:{},defaultLocale:'en-US'});
 expect(f.container.querySelector('[data-attachments]')?.getAttribute('data-attachments')).toBe('true');
 expect(f.container.querySelector('input')).toBe(input);expect(input.value).toBe('Keep this draft');
});
