from pathlib import Path
import json,struct
from urllib.parse import urlparse,parse_qs
out=Path(__file__).resolve().parents[1]
records=[]
for f in ['capture-manifest.json','extra-capture-manifest.json']:
 m=json.loads((out/'screenshots'/f).read_text());assert not m['failures'];records+=m['records']
V='packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/'
fixture='examples/creator-embedded-host/dev/violet-input/fixture.tsx'
by_surface={
 'plan':('AgentPlan','agent-plan.tsx','Level 2','Preserve title/progress/step order; foreground alpha makes Violet subtle.'),
 'status':('AgentStatus','agent-status.tsx','Level 2','Preserve indicator/label/elapsed/trailing structure. Working blue, done emerald.'),
 'job':('JobProgress','job-progress.tsx','Level 2','Preserve stage weights, progress and outcome semantics. Blue running; emerald success.'),
 'web-search':('WebSearch','web-search.tsx','Level 2','Preserve query, status and results. Foreground alpha.'),
 'retrieval':('RetrievalChunks','retrieval-chunks.tsx','Level 2','Preserve source/locator/score/text hierarchy. Blue relevance bar and emerald high score.'),
 'tool':('ConversationToolCall','tool-call.tsx','Level 2','Preserve request/result disclosure. Foreground alpha and shared paper surface.'),
 'fallback-error':('ConversationToolFallback','tool-fallback.aui.tsx','Level 4','Actual collapsed error tool; inner error details not expanded in this screenshot. Preserve lifecycle/disclosure.'),
 'reasoning':('ConversationCanonicalReasoningGroup','reasoning.aui.tsx','Level 2','Preserve trigger, content, fade/scroll and collapse anatomy. Expanded in capture.'),
 'question':('ConversationQuestionFlow → upstream OptionList','option-list.tsx','Level 3 product flow / Level 4 upstream internals','Preserve steps, choices, submission and receipt model. Additional selected shot is submitting/waiting for receipt.'),
 'source':('ConversationSource','sources.aui.tsx','Level 2','Preserve source URL/title/icon. No invented citation numbers.'),
 'file':('ConversationFile','file.tsx','Level 2','Preserve filename, MIME and download action.'),
 'quote':('ConversationQuoteBlock','quote.aui.tsx','Level 2','Preserve quote text and source message identity.'),
 'subagents':('SubagentList','subagent-list.tsx','Level 2','Preserve agent/model/progress/completion and summary distinction.'),
 'dialog':('AgentUIDialogContent','../../ui/dialog.tsx','Level 1','Preserve title/description/action and scoped portal. Do not change modal positioning DOM.'),
 'popover':('AgentUIPopoverContent','../../ui/popover.tsx','Level 1','Preserve anchor and popup behavior. Popover tokens plus foreground/10 ring.'),
 'tooltip':('AgentUITooltipContent','../../ui/tooltip.tsx','Level 1','Preserve trigger/placement. Tooltip uses foreground/background, not popover tokens.'),
 'conversation':('ConversationThread / CanonicalComposer','thread.aui.tsx','Mixed: Level 2 composer / Level 4 message internals','Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.'),
}
top=['conversation-full-light.png','component-plan-running.png','component-plan-completed.png','composer-mention.png','composer-slash.png','showcase-thread-list.png','component-status-working.png','component-tool-completed.png','component-retrieval.png','component-question.png']
text=f'''# Screenshot index

**{len(records)} captured scenes**, each with a crop/primary PNG and `-context.png` (94 PNG files). Desktop context 1440×900, device scale 1; one narrow context 390×844. Crops keep the actual component dimensions and anatomy. No AI image generation or HTML/React component replicas.

Production screenshots 01–03 use existing generated embedded Host (older foundation theme API). All other main components use actual current public components or registry implementation in an isolated development fixture. ThreadList uses the existing Theme Showcase. Static props are presentation evidence, not a claim of AG-UI integration for that optional plugin.

Creator dock visible in some context images is injected by the existing development server and is outside design scope. Atlas host document and all fixture outer padding are also outside design scope. Use the cropped images for component proposals.

## Top 10 — feed these to the visual model first

'''
for i,f in enumerate(top,1):
 assert (out/'screenshots'/f).exists()
 text+=f'{i}. [{f}](screenshots/{f})\n'
text+='\nCompare `conversation-full-dark.png` / `conversation-full-violet.png`; use Composer idle variants, chart and Markdown top/middle as additional evidence. Current Violet is a baseline, not the proposed modern brand design.\n\n## Capture records\n\n'
for r in records:
 f=r['file'];q=parse_qs(urlparse(r['url']).query);surface=q.get('surface',[''])[0]
 key=next((k for k in by_surface if surface==k or surface.startswith(k+'-')), 'conversation')
 renderer,source,level,preserve=by_surface[key]
 sources=[fixture,'packages/react/src/public.tsx',V+source]
 hooks=r['slots']
 if f.startswith('0') and 'production' in f or f.startswith('01-'):
  renderer='Existing generated embedded Agent + AppUIModel plugins';level='Per Plugin; Host document excluded';sources=['examples/creator-embedded-host/src/App.tsx','examples/creator-embedded-host/src/AgentMount.tsx','examples/creator-embedded-host/src/agent-ui/app-ui/app-ui.json'];preserve='Existing target composition. Stale foundation noted; do not copy Atlas host elements or Creator dock into design.'
 elif 'thread-list' in f:
  renderer='ConversationThreadListRoot / Item / New';level='Level 2';sources=['examples/creator-embedded-host/src/theme-showcase.tsx',V+'thread-list.aui.tsx','packages/react/src/internal/conversation-thread-list-item.tsx'];preserve='Preserve existing new-chat/thread item/control hierarchy. Thread binding is fixture-only; no sidebar in embedded default.'
 elif 'component-chart' in f:
  renderer='Actual registry chartMessageUI';level='Level 3';sources=[fixture,'packages/source-registry/registry/items/plugin-chart-message/files/plugins/chart-message/index.tsx','packages/source-registry/registry/items/plugin-chart-message/files/plugins/chart-message/style.css'];preserve='Preserve chart title/labels/value and bar ratios. Uses --chart-1, --muted and --border. Real Plugin CSS imported after root CSS.'
 if 'composer-mention' in f or 'composer-slash' in f:
  sources+=['packages/react/src/internal/conversation-composer-triggers.tsx',V+'composer-trigger-popover.aui.tsx',V+'directive-text.tsx'];preserve+=' Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.'
 if 'composer-attachment' in f:sources+=[V+'attachment.aui.tsx','packages/mock-agent/src/demo-attachment-adapter.ts'];preserve+=' Actual PDF tile; filename is tooltip presentation, not always visible text.'
 data=(out/'screenshots'/f).read_bytes();w,h=struct.unpack('>II',data[16:24])
 text+=f'### {f}\n\n[Primary/crop](screenshots/{f}) · [Full context](screenshots/{r["context"]})\n\n'
 text+=f'- Surface / rendered by: {renderer}; fixture state `{surface or "existing target/showcase"}`.\n- Viewport: {r["viewport"]["width"]}×{r["viewport"]["height"]}; primary PNG: {w}×{h}.\n- Capture URL: `{r["url"]}`.\n- Origin/data: {r["note"]}\n- Relevant files: '+', '.join('`'+s+'`' for s in sources)+'.\n'
 text+='- Observed selectors in rendered page: '+(', '.join(f'`[data-slot="{s}"]`' for s in hooks) or 'no literal data-slot in capture')+'. These are observed page-wide hooks; verify component scope before overriding.\n'
 text+=f'- Design freedom / current visual characteristics / must preserve: {level}. {preserve}\n\n'
text+='''## Missing / limited states

No screenshot proof for installed frontend form/dialog capability lifecycle, A2UI/Generative UI integration (not active in inspected embedded target), image zoom, quote selection toolbar, nested task-group transcript, archived/renamed/deleted thread menu, resumed plan events, all hover/disabled states, warning/error/success for every component, Mention loading, or asynchronous command failure. These remain available source surfaces where noted; do not invent a design from absent evidence.

AgentPlan running/completed shots use the actual public component with authoritative props, not proof of latest resumed Activity stream behavior. AgentStatus/JobProgress fixed props are similarly visual baselines. ToolFallback error is collapsed, so it is not an expanded error-detail screenshot. Question selected shot shows submission awaiting a receipt, not a completed receipt.

This is an input collection, not behavioral acceptance of every optional Plugin. Errors discovered in product sources would be recorded, not fixed. Production code/styles and vendor were not modified by this task.
'''
(out/'SCREENSHOT-INDEX.md').write_text(text)
print(len(records))
