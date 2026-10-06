import { createConversationService, createHttpConversationDataSource } from "../../../../packages/source-registry/registry/items/foundation-core-application/files/services/conversations";
import { createConversationServiceThreadBinding } from "../../../../packages/source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/threads/conversation-service-thread-binding";
import { A2uiConversationIntegration } from "../../../../packages/source-registry/registry/items/integration-a2ui/files/integrations/a2ui/A2uiConversationIntegration";
// Development-only fixture. Imports real public surfaces; no component/CSS replicas.
// Load foundation styles before real Plugin CSS, matching the host style boundary.
import "@agent-ui/react/styles.css";
import { ImageRoot, ImageGenerating, ImageContentFilterError, ImageZoom, ImagePreview } from "../../../../packages/react/src/internal/adapters/assistant-ui/components/assistant-ui/elements/image";
import { TaskCard } from "../../../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/task-card";
import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import { useAui } from "@assistant-ui/react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useConversationThreadListGroups, ConversationThreadListRoot, ConversationThreadListItem, ConversationThreadListItemByIndex, ConversationThreadListNew,
  AgentUIRoot, AgentPlan, AgentStatus, JobProgress, WebSearch, RetrievalChunks, SubagentList, ConversationQuoteBlock,
  ConversationToolCall, ConversationToolFallback, ConversationSource, ConversationFile,
  ConversationQuestionFlow, ConversationCanonicalReasoningGroup, ConversationThread,
  ConversationCanonicalComposer, ConversationComposerSend, ConversationComposerCancel,
  ConversationComposerAddAttachment, ConversationComposerMentionTrigger, ConversationComposerCommandTrigger,
  ConversationComposerQuotePreview, ConversationToolkitProvider, DataMessageUIRegistration,
  AgentUIDialog, AgentUIDialogContent, AgentUIPopover, AgentUIPopoverTrigger, AgentUIPopoverContent,
  AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent, TooltipProvider, Button,
  type AgentUITheme,
} from "@agent-ui/react";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { chartMessageUI } from "../../../../packages/source-registry/registry/items/plugin-chart-message/files/plugins/chart-message/index";
import { themeShowcaseLocale as copy } from "../../src/theme-showcase.locale";
const params = new URLSearchParams(location.search);
const theme = (params.get("theme") || "light") as AgentUITheme;
const surface = params.get("surface") || "plan-running";
const steps = ["Inspect current implementation", "Compare AG-UI runtime", "Update UI composition", "Run regression checks"];
const binding = surface === "threads" ? createConversationServiceThreadBinding() : createEphemeralConversationThreadBinding();
if(surface === "threads") {const service=createConversationService({dataSource:createHttpConversationDataSource({endpoint:"/__agent-ui/mock-data"})});(binding as any).attachConversationService(service);await service.refresh();}
const demoAttachments = new DemoAttachmentAdapter();
const attachmentAdapter = surface.startsWith("attachment-") ? {
 accept:"image/*,application/pdf",
 async *add({file}:{file:File}) {
 const item={id:crypto.randomUUID(),type:"image" as const,name:file.name,contentType:file.type,file,content:[{type:"image" as const,image:URL.createObjectURL(file)}]};
 if(surface==="attachment-uploading") { yield {...item,status:{type:"running" as const}}; await new Promise(()=>{}); }
 else if(surface==="attachment-error") yield {...item,status:{type:"incomplete" as const,reason:"error" as const,message:"Fixture upload failed"}};
 else yield {...item,status:{type:"requires-action" as const,reason:"composer-send" as const}};
 }, remove:async()=>{},send:demoAttachments.send.bind(demoAttachments)
}:demoAttachments;

function ThreadListFixture(){const {threadIds}=useConversationThreadListGroups();return <ConversationThreadListRoot><ConversationThreadListNew>New chat</ConversationThreadListNew>{threadIds.map((id,index)=><ConversationThreadListItemByIndex key={id} index={index} components={{ThreadListItem:ThreadItem}} />)}</ConversationThreadListRoot>;}
function ThreadItem(){return <ConversationThreadListItem actions={{rename:true,archive:true,delete:true}} />;}
function SeedAttachment(){const aui=useAui();useEffect(()=>{void fetch('/@fs/Users/yifei/Coding/AgentUICreator/docs/design/violet-theme/screenshots/component-chart.png').then(r=>r.blob()).then(b=>aui.threads.__internal_getAssistantRuntime!().thread.composer.addAttachment(new File([b],"preview.png",{type:"image/png"}))).catch(()=>{});},[]);return null;}
const fixtureCommands = [{id:"summarize",label:copy.command,mode:"directive" as const}];
const commandSource = {getSnapshot:()=>fixtureCommands,subscribe:()=>()=>{}};
const mentionSource = {cacheKey:"fixture",search:async({query}:{query:string})=> query === "none" ? [] : query === "error" ? Promise.reject(new Error("Fixture source error")) : [{id:"design",type:"team",label:copy.mention}]};
const emptyToolkit = {};
function SeedAttachmentWrapper(){return surface.startsWith("attachment-")?<SeedAttachment />:null;}
function FixtureToolkit({children}:{children:React.ReactNode}){return (params.get("scenario")||"").startsWith("a2ui")?<A2uiConversationIntegration>{children}</A2uiConversationIntegration>:<ConversationToolkitProvider toolkit={emptyToolkit}>{children}</ConversationToolkitProvider>;}
function Fixture() {
  const [open, setOpen] = useState(true);
  const [dialog, setDialog] = useState(surface === "dialog");
  let content;
  if (surface === "threads") content = <ThreadListFixture />;
  else if(surface === "task-states") content=<div style={{display:"grid",gap:20}}>{["working","waiting","failed","cancelled","done"].map(state=><TaskCard key={state} state={state as any} label={`Task ${state}`} open={open} onOpenChange={setOpen} result={state==="failed"?"Fixture task failed":undefined}><TaskCard state="done" label="Nested child task" result="Child result" /></TaskCard>)}</div>;
  else if(surface === "image-zoom") content=<ImageRoot><ImageZoom src="/@fs/Users/yifei/Coding/AgentUICreator/docs/design/violet-theme/screenshots/component-chart.png"><ImagePreview src="/@fs/Users/yifei/Coding/AgentUICreator/docs/design/violet-theme/screenshots/component-chart.png" alt="Theme chart preview" /></ImageZoom></ImageRoot>;
  else if(surface === "disabled-overlays") content=<div style={{display:"flex",gap:16}}><AgentUIPopover><AgentUIPopoverTrigger render={<Button disabled>Popover disabled</Button>} /><AgentUIPopoverContent>Popover</AgentUIPopoverContent></AgentUIPopover><AgentUITooltip><AgentUITooltipTrigger render={<Button disabled>Tooltip disabled</Button>} /><AgentUITooltipContent>Tooltip</AgentUITooltipContent></AgentUITooltip><AgentUIDialog.Root><AgentUIDialog.Trigger render={<Button disabled>Dialog disabled</Button>} /><AgentUIDialogContent><AgentUIDialog.Title>Dialog</AgentUIDialog.Title></AgentUIDialogContent></AgentUIDialog.Root></div>;
  else if(surface === "controls") content=<div style={{display:"flex",gap:16}}><Button>Primary</Button><Button variant="outline">Secondary</Button><Button disabled>Disabled</Button></div>;
  else if (surface === "studies-media-task") content = <div style={{display:"grid",gap:24}}><ImageRoot><ImageGenerating /></ImageRoot><ImageRoot><ImageContentFilterError reason="The image request was filtered." /></ImageRoot><TaskCard label="Inspect theme integration" state="working" elapsed="0:12" open={open} onOpenChange={setOpen}>Inspect the active Agent UI theme scope.</TaskCard><TaskCard label="Validate style isolation" state="done" result="All checks passed" /></div>;
  else if (surface === "studies-reference") content = <div style={{display:"grid",gap:28}}><WebSearch query="AG-UI theme tokens" results={[{title:"AG-UI documentation",domain:"docs.ag-ui.com"},{title:"assistant-ui",domain:"assistant-ui.com"}]} searching={false} labels={{searching:"Searching",complete:"Search complete"}} /><RetrievalChunks query="theme contract" chunks={[{id:"1",source:"THEME.md",locator:"L12–L26",score:0.92,text:"Themes consume semantic tokens and preserve component anatomy."},{id:"2",source:"UPSTREAM.md",locator:"L5–L18",score:0.76,text:"Vendor ownership and upgrade boundary."}]} searching={false} labels={{retrieving:"Retrieving",complete:"Retrieval complete",relevance:"Relevance",score:"Score"}} /><ConversationSource sourceType="url" id="docs" url="https://ui.shadcn.com/docs/theming" title="shadcn theme documentation" /><ConversationQuoteBlock messageId="fixture-message" text="Preserve the real component structure and theme through semantic tokens." /><ConversationFile filename="theme-contract.txt" data="data:text/plain;base64,VGhlbWUgY29udHJhY3Q=" mimeType="text/plain" /></div>;
  else if (surface === "studies-progress") content = <div style={{display:"grid",gap:28}}><JobProgress title="Build UI" stages={[{name:"Analyze",weight:1},{name:"Build",weight:2},{name:"Validate",weight:1}]} stageIndex={1} stageProgress={0.45} eta="12s" /><JobProgress title="Build UI" stages={[{name:"Analyze",weight:1},{name:"Build",weight:2},{name:"Validate",weight:1}]} stageIndex={3} stageProgress={1} eta="0s" outcome={{status:"success",summary:"All checks passed"}} /><SubagentList agents={[{name:"Architecture",model:"Agent"},{name:"UI review",model:"Agent"}]} completedCount={1} progress={[1,0.4]} showSummary={false} summaryAgent={{name:"Summary",model:"Agent"}} /></div>;
  else if (surface === "icons") content = <div style={{display:"grid",gap:24}}><ConversationCanonicalReasoningGroup group={{type:"group-reasoning",indices:[0],status:{type:"running"}}}>Inspect the active UI composition and preserve the upstream component structure.</ConversationCanonicalReasoningGroup><ConversationCanonicalReasoningGroup group={{type:"group-reasoning",indices:[0],status:{type:"complete"}}}>Keep theme changes inside the Agent UI scope.</ConversationCanonicalReasoningGroup><ConversationToolCall label="Search files" activeLabel="Searching files" query="theme tokens" request={'{"query":"theme"}'} result={'{"files":["theme-contract.ts"]}'} running={false} open={open} onOpenChange={setOpen} /><AgentPlan title="Workspace update" steps={steps} activeIndex={1} /><AgentStatus state="working" label="Analyzing workspace" elapsed="0:12" /></div>;
  else if (surface.startsWith("plan")) content = <AgentPlan title="Workspace update" steps={steps} activeIndex={surface === "plan-completed" ? 4 : 1} />;
  else if (surface.startsWith("status")) content = <AgentStatus state={surface === "status-done" ? "done" : surface === "status-waiting" ? "waiting" : "working"} label="Analyzing workspace" elapsed="0:12" />;
  else if (surface.startsWith("job")) content = <JobProgress title="Build UI" stages={[{name:"Analyze",weight:1},{name:"Build",weight:2},{name:"Validate",weight:1}]} stageIndex={surface === "job-success" ? 3 : 1} stageProgress={0.45} eta="12s" {...(surface === "job-success" ? {outcome:{status:"success" as const,summary:"All checks passed"}} : {})} />;
  else if (surface === "web-search") content = <WebSearch query="AG-UI theme tokens" results={[{title:"AG-UI documentation",domain:"docs.ag-ui.com"},{title:"assistant-ui",domain:"assistant-ui.com"}]} searching={false} labels={{searching:"Searching",complete:"Search complete"}} />;
  else if (surface === "retrieval") content = <RetrievalChunks query="theme contract" chunks={[{id:"1",source:"THEME.md",locator:"L12–L26",score:0.92,text:"Themes consume semantic tokens and preserve component anatomy."},{id:"2",source:"UPSTREAM.md",locator:"L5–L18",score:0.76,text:"Vendor ownership and upgrade boundary."}]} searching={false} labels={{retrieving:"Retrieving",complete:"Retrieval complete",relevance:"Relevance",score:"Score"}} />;
  else if (surface.startsWith("tool-")) content = <ConversationToolCall label="Search files" activeLabel="Searching files" query="theme tokens" request={'{"query":"theme"}'} result={'{"files":["theme-contract.ts"]}'} running={surface === "tool-running"} open={open} onOpenChange={setOpen} />;
  else if (surface === "fallback-error") content = <ConversationToolFallback toolCallId="fixture" toolName="search_files" args={{query:"theme"}} argsText={'{"query":"theme"}'} result={{error:"Mock search failed"}} isError status={{type:"incomplete",reason:"error"}} />;
  else if (surface === "reasoning") content = <ConversationCanonicalReasoningGroup group={{type:"group-reasoning",indices:[0],status:{type:"complete"}}}>Inspect the active UI composition and preserve the upstream component structure.</ConversationCanonicalReasoningGroup>;
  else if (surface === "question") content = <ConversationQuestionFlow steps={[{id:"layout",question:"你希望采用哪种首页布局？",description:"选择一个方向",options:[{id:"dashboard",label:"Dashboard",description:"适合信息密度较高的首页"},{id:"sidebar",label:"Sidebar",description:"适合有持续导航的首页"}],selectionMode:"multiple",minSelections:1,maxSelections:2}]} onComplete={async()=>{}} labels={{back:"返回",next:"下一步",submit:"提交",submitting:"提交中",answered:"已回答",noneSelected:"未选择"}} />;
  else if (surface === "source") content = <ConversationSource sourceType="url" id="docs" url="https://ui.shadcn.com/docs/theming" title="shadcn theme documentation" />;
  else if (surface === "quote") content = <ConversationQuoteBlock messageId="fixture-message" text="Preserve the real component structure and theme through semantic tokens." />;
  else if (surface === "subagents") content = <SubagentList agents={[{name:"Architecture",model:"Agent"},{name:"UI review",model:"Agent"}]} completedCount={1} progress={[1,0.4]} showSummary={false} summaryAgent={{name:"Summary",model:"Agent"}} />;
  else if (surface === "file") content = <ConversationFile filename="theme-contract.txt" data="data:text/plain;base64,VGhlbWUgY29udHJhY3Q=" mimeType="text/plain" />;
  else if (surface === "popover") content = <AgentUIPopover defaultOpen><AgentUIPopoverTrigger render={<Button variant="outline">Popover</Button>} /><AgentUIPopoverContent>{copy.popoverText}</AgentUIPopoverContent></AgentUIPopover>;
  else if (surface === "tooltip") content = <AgentUITooltip defaultOpen><AgentUITooltipTrigger render={<Button variant="outline">Help</Button>} /><AgentUITooltipContent>Theme settings</AgentUITooltipContent></AgentUITooltip>;
  else if (surface === "dialog") content = <AgentUIDialog.Root open={dialog} onOpenChange={setDialog}><AgentUIDialogContent showCloseButton={false}><AgentUIDialog.Title>{copy.dialog}</AgentUIDialog.Title><AgentUIDialog.Description>{copy.dialogText}</AgentUIDialog.Description><Button onClick={()=>setDialog(false)}>{copy.close}</Button></AgentUIDialogContent></AgentUIDialog.Root>;
  else content = <FixtureToolkit><DataMessageUIRegistration definition={chartMessageUI} /><ConversationThread labels={{generationStopped:copy.stopped}} composer={<ConversationCanonicalComposer placeholder={copy.composer} inputAriaLabel={copy.composer} beforeInput={<><SeedAttachmentWrapper /><ConversationComposerQuotePreview dismissLabel="Dismiss quote" /></>} leadingActions={<ConversationComposerAddAttachment label="Add Attachment" />} triggers={<><ConversationComposerMentionTrigger labels={copy.triggers} source={mentionSource} /><ConversationComposerCommandTrigger labels={copy.triggers} source={commandSource} /></>} submitAction={<><ConversationComposerSend label={copy.send} /><ConversationComposerCancel label={copy.stop} /></>} />} /></FixtureToolkit>;
  // Outer sizing only. No styles/selectors applied to component descendants.
  return <AgentUIRoot theme={theme}><TooltipProvider><main data-fixture-surface={surface} style={{background:"var(--background)",minHeight:"100vh",padding:48,boxSizing:"border-box"}}><div style={{width:surface === "conversation" ? "min(100%, 900px)" : "min(100%, 600px)",height:surface === "conversation" ? "760px" : undefined}}>{content}</div></main></TooltipProvider></AgentUIRoot>;
}
createRoot(document.getElementById("input")!).render(<ConversationRuntimeProvider endpoint={`/agent?scenario=${params.get("scenario") || "reasoning-tool-success"}`} threadBinding={binding} attachmentAdapter={attachmentAdapter}><Fixture /></ConversationRuntimeProvider>);
