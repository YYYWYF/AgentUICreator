// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type AttachmentAdapter, type PendingAttachment } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, type AgentUILocaleCode } from "../src/locale";
import { ConversationCanonicalComposer, ConversationComposerAddAttachment } from "../src/public";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();});
it.each([['image','图片','Image'],['document','文档','Document'],['file','文件','File']] as const)("localizes %s attachment uploading/failure states without resetting it",async(type,chinese,english)=>{
 vi.stubGlobal('ResizeObserver',class {observe(){}unobserve(){}disconnect(){}});
 let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
 const adapter:AttachmentAdapter={accept:'application/pdf',async *add({file}){const item:PendingAttachment={id:'file',type,name:file.name,contentType:file.type,file,status:{type:'running',reason:'uploading',progress:0}};yield item;await gate;yield {...item,status:{type:'incomplete',reason:'error',message:'raw upload $& error'}};},async remove(){},async send(){throw Error('Send is not expected');}};
 let runtime!:AssistantRuntime;
 function Host({locale}:{locale:AgentUILocaleCode}){runtime=useLocalRuntime({async *run(){}},{adapters:{attachments:adapter}});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale}><ConversationCanonicalComposer leadingActions={<ConversationComposerAddAttachment/>}/></AgentUILocaleProvider></AssistantRuntimeProvider>;}
 const el=document.createElement('div');document.body.append(el);root=createRoot(el);await act(async()=>root!.render(<Host locale='zh-CN'/>));
 let upload!:Promise<void>;await act(async()=>{upload=runtime.thread.composer.addAttachment(new File(['data'],'original-$&.pdf',{type:'application/pdf'}));await Promise.resolve();});
 const tile=el.querySelector(`[role="button"][aria-label="${chinese}附件，正在上传"]`);expect(tile).not.toBeNull();
 await act(async()=>root!.render(<Host locale='en-US'/>));expect(el.querySelector(`[role="button"][aria-label="${english} attachment, uploading"]`)).toBe(tile);
 await act(async()=>{finish();await upload;});expect(el.querySelector(`[role="button"][aria-label="${english} attachment, upload failed"]`)).toBe(tile);
 await act(async()=>root!.render(<Host locale='zh-CN'/>));expect(el.querySelector(`[role="button"][aria-label="${chinese}附件，上传失败"]`)).toBe(tile);
 expect(runtime.thread.composer.getState().attachments[0]?.name).toBe('original-$&.pdf');
 expect(runtime.thread.composer.getState().attachments[0]?.status).toMatchObject({message:'raw upload $& error'});
 expect(el.querySelectorAll('.aui-attachment-add-icon')).toHaveLength(1);
});
