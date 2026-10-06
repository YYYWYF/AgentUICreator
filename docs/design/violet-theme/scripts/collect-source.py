from pathlib import Path
import re,json,subprocess,hashlib
root=Path(__file__).resolve().parents[4]
out=root/'docs/design/violet-theme'
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
V='packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/'
R='packages/source-registry/registry/items/'
presets={}
def plugins(x):
 result=set()
 if isinstance(x,dict):
  if 'pluginId' in x: result.add(x['pluginId'])
  for v in x.values(): result|=plugins(v)
 elif isinstance(x,list):
  for v in x:result|=plugins(v)
 return result
for mode in ['assistant','embedded','platform']:
 presets[mode]=sorted(plugins(json.loads((root/f'packages/bootstrap/presets/{mode}/app-ui.json').read_text())))
installed=sorted(plugins(json.loads((root/'examples/creator-embedded-host/src/agent-ui/app-ui/app-ui.json').read_text())))
# Exact source-wide audit, separate token declarations, vendor, first party and development.
color=re.compile(r'(?:bg|text|border|ring|fill|stroke)-(?:black|white)(?:/\d+)?\b|\b(?:blue|indigo|violet|purple|emerald|green|red|amber|orange|yellow|pink|rose|cyan|teal|sky|lime|slate|gray|zinc|neutral|stone)-(?:\d{2,3})(?:/\d+)?\b|#[0-9a-fA-F]{3,8}\b|(?:rgba?|oklch|hsla?)\([^\n;]*?\)')
rows=[]
for scope in ['packages/react','packages/source-registry/registry/items']:
 for p in sorted((root/scope).rglob('*')):
  if not p.is_file() or p.suffix not in ['.tsx','.ts','.css']:continue
  rel=p.relative_to(root).as_posix()
  if '/tests/' in rel or '/dist/' in rel or any(part.startswith('.') for part in p.relative_to(root).parts):continue
  for n,line in enumerate(p.read_text().splitlines(),1):
   matches=color.findall(line)
   if not matches:continue
   category='A upstream-owned' if '/vendor/assistant-ui/' in rel else 'B first-party'
   if '/theme/' in rel and p.suffix=='.css': category='E canonical token declaration (expected)'
   elif any(s in rel for s in ['devstudio','debug','dev-studio','inspector']):category='D development/diagnostic'
   intent='brand-like candidate' if any(re.search(r'\b(?:blue|indigo|violet|purple)-',x) for x in matches) else 'review in context'
   if intent != 'brand-like candidate' and any(re.search(r'\b(?:emerald|green|red|amber|orange|yellow)-',x) for x in matches):intent='C status semantics; preserve unless evidence says otherwise'
   rows.append(dict(file=rel,line=n,category=category,intent=intent,colors=matches,source=line.strip()))
(out/'audit.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
brand=[x for x in rows if x['intent']=='brand-like candidate']
report=f'''# Hardcoded color audit\n\nSource commit: `{commit}`. Static scan of source `.ts/.tsx/.css` in the two requested scopes, excluding tests/dist; line-level matches, not a count of bugs. Exact reproduction: `python3 docs/design/violet-theme/scripts/collect-source.py`.\n\nFound **{len(rows)} matching lines**; **{len(brand)} brand-like blue/indigo/violet/purple lines** outside canonical token declarations. Full machine-readable evidence: [audit.json](audit.json).\n\nPalette declarations in shadcn-theme-presets.css and agent-ui-theme-extensions.css are expected. Success emerald/green, error red, warning amber should keep their meaning. Transparent black overlays and neutral text are not automatically branding bugs. Hex/rgb in dynamic CSS or markdown syntax need manual interpretation.\n\nHighest priority: AgentStatus working dot, JobProgress active bar, RetrievalChunks relevance bar, surfaces.tsx shared live constant, Sources info variant. Search for consumers before overriding a shared style. AgentPlan uses foreground alpha, not primary; no blue hardcode there.\n\nNo fixes performed.\n\n| Category | Intent | Source | Literal matches |\n| --- | --- | --- | --- |\n'''
for x in rows:
 report+=f"| {x['category']} | {x['intent']} | `{x['file']}:{x['line']}` | {'; '.join(x['colors']).replace('|','&#124;')} |\n"
(out/'HARDCODED-COLOR-AUDIT.md').write_text(report)
# Evidence record for every upstream element and visual plugin; no invented selectors.
semantic=re.compile(r'(?:(?:bg|text|border|ring|fill|stroke)-)(background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground)?|secondary(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|destructive|input|ring|border|success|warning|sidebar(?:-[a-z-]+)?)(?:/[^\s"\']+)?')
def facts(p):
 s=p.read_text()
 hooks=sorted(set(re.findall(r'(?:data-slot|data-ui-plugin|data-agent-ui-composition-part)="([^"{}]+)"',s)))
 tokens=sorted(set(semantic.findall(s)))+sorted(set(re.findall(r'var\(--([a-z0-9-]+)',s)))
 colors=sorted(set(color.findall(s)))
 return {'source':p.relative_to(root).as_posix(),'tokens':tokens,'hooks':hooks,'colors':colors}
elements=[facts(p) for p in sorted((root/V).glob('*.tsx'))]
visual=[]
for p in sorted((root/R).glob('*/files/plugins/*/index.tsx')):
 s=p.read_text()
 if 'return null;' in s and not re.search(r'<[A-Z]|<[a-z]',s):continue
 f=facts(p);f['plugin']=p.parent.name
 f['defaultModes']=[m for m,ids in presets.items() if f['plugin'] in ids]
 f['installedEmbedded']=f['plugin'] in installed
 f['publicRenderers']=sorted(set(re.findall(r'\b(?:Conversation[A-Z]\w*|AgentPlan|AgentStatus|JobProgress|WebSearch|RetrievalChunks|Button|Input|NativeSelect|SubagentList)\b',s)))
 visual.append(f)
(out/'source-evidence.json').write_text(json.dumps({'commit':commit,'presets':presets,'installedEmbedded':installed,'upstreamElements':elements,'visualPluginEntries':visual},indent=2))
text=f'''# UI inventory\n\nObserved `dev` source at `{commit}` (2026-10-05). Scope: final deployed Agent frontend UI and plugins. Creator Agent / workbench / inspector are excluded from visual redesign.\n\nAvailability has three distinct meanings: public exported component, installable Source Registry resource, and an actually active AppUIModel contribution. They are not interchangeable. Fixture screenshots establish rendering of public surfaces, not installation in every preset.\n\n## Actual compositions\n\n'''
for m,ids in presets.items():text+=f"- `{m}/default`: {len(ids)} plugin IDs: "+', '.join(f'`{x}`' for x in ids)+'.\n'
text+='\nExisting generated embedded Host active IDs: '+', '.join(f'`{x}`' for x in installed)+'.\n\nThe generated embedded tree retains an older `defaultMode/getMode/useAgentUIThemeMode` API while current registry uses `theme/getTheme/useAgentUITheme`. It was left untouched. Production screenshots 01–03 document that existing target; current public wrappers and token presets are captured separately in fixture shots. Do not treat the Host screenshot as a freshly regenerated latest foundation.\n\n## Registry visual entries\n\n| Plugin | Default modes | Existing embedded active | Public renderers observed | Source |\n| --- | --- | --- | --- | --- |\n'
for x in visual:text+=f"| {x['plugin']} | {', '.join(x['defaultModes']) or 'optional'} | {'yes' if x['installedEmbedded'] else 'no'} | {', '.join(x['publicRenderers']) or 'product markup / integration'} | `{x['source']}` |\n"
text+='''\n## Coverage interpretation\n\n- ConversationThread supplies real User/Assistant message rendering, Markdown, code blocks, lists, tables, blockquotes, message actions, response footer. Canonical Composer owns the runtime input/attachments/send/cancel composition through the public facade.\n- Welcome and starter suggestions are product integration seams; production empty screenshot is authoritative for that preset.\n- ThreadList / new chat / active thread are supported public surfaces and navigation plugins; embedded default has no navigation sidebar. The Showcase thread list is fixture data.\n- AgentPlan, AgentStatus, JobProgress, task/subagent groups are upstream presentation with product projection/registration. Most specialized message resources are optional.\n- WebSearch and RetrievalChunks are optional plugins; SearchFiles is a foundation toolkit presentation. Unknown tools use ToolFallback.\n- Frontend form/dialog demos and ask_user_question are installable product integrations; they are not all active in default embedded. QuestionFlow is product-owned orchestration over upstream OptionList.\n- Generative UI / A2UI are installable registry integrations; neither is formally active in the inspected embedded AppUIModel. Do not add them to a design mock merely because a mock scenario exists.\n- Chart is actual first-party chart-message implementation; fixture registers it using DataMessageUIRegistration. It is optional.\n- Quote, Mention and Slash exist as public surfaces and installable plugin compositions. Quote preview/selection toolbar and result directives must remain linked to Composer behavior.\n- Overlay support: scoped Dialog, Popover, Tooltip, NativeSelect, Image zoom. No custom Select/Dropdown menu should be invented from a native select. Thread actions are governed by the actual ThreadList composition.\n\n## State ledger\n\nCaptured: idle, running, completed, waiting, error, selected options (after interaction), empty/error mention results, actual light/dark/violet and a narrow conversation. Runtime streaming, send/cancel, response actions, Markdown and tool grouping are exercised through Mock Agent.\n\nNot exhaustive: hover/focus/disabled for every control, attachment upload and image zoom, quote selection toolbar, thread action menu, task-group nested states, frontend form/dialog lifecycle, generative/A2UI integration, resumed plan stream. See screenshot index for specific missing states. Static support does not imply screenshot or behavioral validation.\n\n## Element source facts\n\nTokens below are directly found in each source file; inherited shared surfaces (`paper`, `live`, `ghostButton`) and wrapper styles require the owning source too. Hooks are observed at the pinned revision, not a promise of upstream stability.\n\n| Element file | Direct tokens | Observed data hooks | Literal colors |\n| --- | --- | --- | --- |\n'''
for x in elements:text+=f"| `{x['source']}` | {', '.join(x['tokens']) or 'inherited / see source'} | {', '.join(x['hooks']) or 'none literal'} | {', '.join(x['colors']) or 'none direct'} |\n"
(out/'UI-INVENTORY.md').write_text(text)
print(json.dumps({'elementFiles':len(elements),'visualPluginEntries':len(visual),'auditLines':len(rows),'brandLines':len(brand),'presets':{k:len(v) for k,v in presets.items()}}))
