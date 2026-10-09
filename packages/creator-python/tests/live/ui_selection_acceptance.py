"""Persistent real Creator acceptance; run directly, no mocked model decisions."""
from __future__ import annotations
import asyncio
import json
import os
import shutil
import sys
import time
import subprocess
from pathlib import Path
from langgraph.checkpoint.memory import InMemorySaver
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentInterrupted
from test_official_composer import ROOT, fresh_host, ObservedHost, hashes

from timeout_diagnostics import DiagnosticModelTrace, DiagnosticLogger, stamp

OUTPUT = Path(os.environ['CREATOR_ACCEPTANCE_OUTPUT']).resolve()
ACCEPTANCE_TIMEOUT_SECONDS = int(os.environ.get('CREATOR_ACCEPTANCE_TIMEOUT_SECONDS', '600'))
DS = '''import type {ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes} from 'react';
import './system.css';
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`acme-button ${props.className ?? ''}`} />; }
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`acme-input ${props.className ?? ''}`} />; }
export function Card(props: HTMLAttributes<HTMLDivElement>) { return <section {...props} className={`acme-card ${props.className ?? ''}`} />; }
'''
CSS = '''.acme-host { --acme-bg:#f5f7fc; --acme-surface:#fff; --acme-text:#19213a; --acme-border:#c8d2e4; --acme-primary:#405bce; --acme-radius:12px; color:var(--acme-text); background:var(--acme-bg); font-family:Inter,system-ui,sans-serif; padding:16px; }
.acme-host[data-theme="dark"] { --acme-bg:#121827; --acme-surface:#202a40; --acme-text:#eef2ff; --acme-border:#475675; --acme-primary:#9eaaff; }
.acme-button { font:inherit; border:1px solid var(--acme-border); border-radius:var(--acme-radius); padding:8px 16px; color:var(--acme-text); background:var(--acme-surface); cursor:pointer; }
.acme-input { font:inherit; border:1px solid var(--acme-border); border-radius:var(--acme-radius); padding:8px 12px; color:var(--acme-text); background:var(--acme-surface); max-width:100%; }
.acme-card { border:1px solid var(--acme-border); border-radius:var(--acme-radius); padding:16px; margin-bottom:16px; background:var(--acme-surface); }
'''

def setup():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    os.environ['AGENT_UI_HOST_PACKAGES_PREPARED'] = '1'
    project = fresh_host(OUTPUT)
    project.rename(OUTPUT / 'A')
    for name in ('B', 'C'):
        shutil.copytree(OUTPUT / 'A', OUTPUT / name, symlinks=True)
    for name in ('A','B','C'):
        root = OUTPUT / name
        pkg = json.loads((root / 'package.json').read_text())
        pkg['scripts']['verify:ui'] = 'node --import tsx scripts/verify-ui.ts'
        pkg['packageManager'] = 'npm@11.0.0'
        if name in ('B','C'):
            pkg['dependencies']['antd'] = '^5.29.3'
            # Consumer-local dependency links, never edit the example's node_modules.
            modules = root / 'node_modules'
            template_modules = modules.resolve()
            modules.unlink()
            modules.mkdir()
            for entry in template_modules.iterdir():
                (modules / entry.name).symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
            external = Path(os.environ.get('CREATOR_ACCEPTANCE_ANTD_MODULES', str(OUTPUT / '.dependencies/antd/node_modules')))
            if not (external / 'antd/package.json').is_file():
                raise RuntimeError('Install a real Antd 5 fixture dependency before setup; CREATOR_ACCEPTANCE_ANTD_MODULES supplies its node_modules directory.')
            (modules / 'antd').symlink_to(external / 'antd', target_is_directory=True)
        modules = root / 'node_modules'
        if modules.is_symlink():
            target = modules.resolve()
            modules.unlink()
            modules.mkdir()
            for entry in target.iterdir():
                (modules / entry.name).symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
        bins = modules / '.bin'
        bins.unlink()
        bins.mkdir()
        for command, file in {'tsc':'typescript/bin/tsc', 'vite':'vite/bin/vite.js', 'tsx':'tsx/dist/cli.mjs'}.items():
            (bins / command).symlink_to((modules / file).resolve())
        (root / 'package.json').write_text(json.dumps(pkg, indent=2)+'\n')
        controls = root / 'src/design-system'
        controls.mkdir(exist_ok=True)
        (controls / 'index.tsx').write_text(DS)
        (controls / 'system.css').write_text(CSS)
        imports = "import { Button, Input, Card } from './design-system';"
        provider_start = '<div className="acme-host" data-theme={dark ? "dark" : "light"}>'
        provider_end = '</div>'
        if name == 'B':
            imports = "import { Button, Input, Card, ConfigProvider, theme } from 'antd';"
            provider_start = '<ConfigProvider theme={{algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token:{borderRadius:12, colorPrimary:"#405bce", fontFamily:"Inter,system-ui,sans-serif"}}}><div className="acme-host" data-theme={dark ? "dark" : "light"}>'
            provider_end = '</div></ConfigProvider>'
        extra = "import { ConfigProvider } from 'antd';\nexport const LegacyProvider = ConfigProvider;\n" if name == 'C' else ''
        (root / 'src/App.tsx').write_text(f'''import {{ useState }} from 'react';
import {{ useAgentUILocale }} from '@agent-ui/react';
import {{ AgentMount }} from './AgentMount';
{imports}
{extra}
import './design-system/system.css';
export function App() {{
  const m = useAgentUILocale('accessibility');
  const [dark,setDark]=useState(false);
  return {provider_start}<Card><Button aria-label={{m.language}} onClick={{()=>setDark(!dark)}}>{{m.language}}</Button><Input aria-label={{m.language}} placeholder={{m.language}} /></Card><AgentMount />{provider_end};
}}
''')
        (root / 'baseline-hashes.json').write_text(json.dumps(hashes(root),indent=2))
    (OUTPUT / 'setup.json').write_text(json.dumps({'preparedUsingExistingArtifacts':True,'scenarios':['A','B','C']},indent=2))

class DeliveryLogger(DiagnosticLogger):
    def record_tool_observation(self, **kwargs):
        super().record_tool_observation(**kwargs)
        if kwargs['tool_name'] not in {
            'prepare_ui_plugin_development', 'create_ui_plugin', 'create_custom_plugin',
            'edit_file', 'edit_file_from_read', 'mutate_ui_plugin_source',
            'mutate_app_ui_model', 'validate_creator_changes', 'verify_ui_plugin_behavior',
        }:
            return
        content = getattr(kwargs.get('result'), 'content', kwargs.get('result'))
        with (self.evidence_root / 'tool-results.jsonl').open('a') as output:
            output.write(json.dumps({'tool': kwargs['tool_name'], 'result': content},
                                    ensure_ascii=False, default=str) + '\n')

    def __init__(self, root):
        super().__init__(root)
        self.evidence_root = root


class ObservedAuthority(PluginDevelopmentAuthority):
    """Record real Host decisions, including rejected plans, without changing admission."""
    def prepare(self, **kwargs):
        path = self.project_root / 'prepare-observations.json'
        observations = json.loads(path.read_text()) if path.exists() else []
        row = {'input': kwargs}
        observations.append(row)
        try:
            result = super().prepare(**kwargs)
            row['result'] = result
            return result
        except Exception as error:
            row['error'] = {'type': type(error).__name__, 'code': getattr(error, 'code', None), 'message': str(error)}
            raise
        finally:
            path.write_text(json.dumps(observations, ensure_ascii=False, indent=2, default=str))


async def run(name):
    root = OUTPUT / name
    prompt = ('开发一个新的业务备注 UI 插件并挂载到当前 Agent 界面：输入备注、点击添加后显示备注列表，提供按钮打开说明弹层。'
              '先读取当前 src/App.tsx、真实宿主组件源码/导出、Provider、主题和使用习惯，自主判断应复用哪个 UI 体系并在交付中说明依据。'
              '复用宿主当前控件和主题，不增加、不重新安装或升级任何依赖，不修改 assistant-ui vendor、Runtime 或 framework。'
              '处理空白输入，展示空列表状态；说明弹层能打开、关闭并支持键盘和焦点返回。使用 React 本地状态，不添加后端或 Service。'
              '所有文案使用现有统一 locale 层且中英文齐全，明暗主题和窄视图可用。沿用现有 ui-plugin-development Skill，完成 Host verify:ui、typecheck、build（includeBuild=true）和最终交付回执。')
    if os.environ.get('CREATOR_ACCEPTANCE_CONTINUE') == '1':
        prompt = ('继续完成当前尚未交付的 business-notes 业务备注 UI 插件，不创建重复插件。'
                  '上一阶段已经通过真实 Creator 创建完整源码与统一双语 locale，并由 Host 验证，但尚未挂载。'
                  '项目虚拟根是 /，不是 /workspace。现有源码路径为 /src/agent-ui/plugins/business-notes/{manifest.json,definition.ts,index.tsx,styles.css}；宿主页面为 /src/App.tsx，已有计划为 /prepare-observations.json。先检查这些真实文件和最新 Composition，保持已由源码确认的宿主组件与主题选型，不再遍历 Conversation 或 Runtime。'
                  '补齐两个现有源码中的交付缺口：说明弹层关闭按钮的无障碍名称使用统一 locale 的关闭文案，面板背景和文字优先继承宿主实际 theme token。'
                  '按现有工具继续业务开发交付，必要时准备当前任务的有界开发计划；不复用上一任务的授权、不增加依赖、不改 Runtime/framework/vendor。'
                  '将 business-notes 挂载为现有 Sidebar 的新增导航项，复用窄屏抽屉。保留备注输入、空白处理、列表、空状态和说明弹层的键盘/焦点交互。'
                  '完成最终 revision 的 verify:ui、typecheck、build（includeBuild=true）、Registry、Composition 与静态交付回执。')
    if os.environ.get('CREATOR_ACCEPTANCE_FINISH_ONLY') == '1':
        prompt = ('完成当前已有 business-notes 业务备注 UI 插件的最后交付阶段，不重复创建或修改已验证的源码。'
                  '现有源码已经由真实 Creator 生成并修复，当前 verify:ui/typecheck 已通过，备注输入、列表、空白处理、说明弹层、统一 locale 和宿主 theme token 已实现。'
                  '先检查最新 Composition 和 /src/agent-ui/plugins/business-notes/manifest.json，以及 /prepare-observations.json 中真实 Host 的计划。'
                  '为当前未完成的开发交付提交适用于已有身份的完成计划；随后将 business-notes 插入宿主现有 Sidebar 的新增导航项，复用窄屏抽屉，不增加主会话横向轨道。'
                  '项目虚拟根为 /，Sidebar 当前 ref 为 l0；最终位置以最新 Host Snapshot 为准。'
                  '当前 Runtime Registry 仅含 selected/resolved 插件，因此未挂载时没有该 import 是正常的，不要手工改 Registry 或等待未选中导入。'
                  '通过 mutate_app_ui_model 完成挂载后，执行 validate_creator_changes(includeBuild=true)，检查最终 Registry、Composition 和 inspect_ui_plugin_delivery 回执。'
                  '不安装或升级依赖，不修改 Runtime/framework/vendor；不得把 static_only 交付宣称为浏览器或 Runtime 验证。')
    if os.environ.get('CREATOR_ACCEPTANCE_PLACEMENT') == 'sidebar':
        prompt += '挂载位置采用宿主现有 Sidebar 的新增导航项，复用其窄屏抽屉，不增加主会话横向轨道。'
    feedback_file = os.environ.get('CREATOR_ACCEPTANCE_BROWSER_FEEDBACK_FILE')
    if feedback_file:
        prompt = Path(feedback_file).read_text()
    (root / 'request.txt').write_text(prompt)
    host = ObservedHost(root)
    logger = DeliveryLogger(root)
    run_id = f'ui-selection-{name}' + ('-finish' if os.environ.get('CREATOR_ACCEPTANCE_CONTINUE') == '1' else '')
    logger.begin(run_id=run_id,thread_id=run_id)
    activity = CreatorActivityRecorder(root,logger=logger)
    activity.begin(run_id)
    trace = DiagnosticModelTrace()
    settings = CreatorModelSettings.from_environment(config_root=ROOT)
    model = create_creator_chat_model(settings,thread_id=run_id)
    if os.environ.get('CREATOR_ACCEPTANCE_USE_RESPONSES') == '1':
        model.use_responses_api = True
    if os.environ.get('CREATOR_ACCEPTANCE_OMIT_TEMPERATURE') == '1':
        model.temperature = None
    model.callbacks=[trace]
    authority = ObservedAuthority(root,thread_id=run_id,skills_root=ROOT/'packages/creator/skills')
    authority.begin_task(task_id=run_id,request_id=run_id,user_message=prompt,intent='explicit')
    creator = create_domain_write_creator_agent(model=model,workspace=root,project_control=host,
        activity=activity,checkpointer=InMemorySaver(),thread_id=run_id,
        skills_root=ROOT/'packages/creator/skills',max_retries=settings.max_retries,
        automatic_completion_repair=True,verification_mode='static_only',
        plugin_development_authority=authority)
    outcome = {'scenario':name,'model':settings.model_name,'realCreatorInvoked':True,'maxTokens':settings.max_tokens}
    run_started_at = stamp()
    run_started_monotonic = time.monotonic()
    environment = {'model': settings.model_name, 'singleRequestTimeoutSeconds': settings.timeout_seconds,
                   'overallTimeoutSeconds': ACCEPTANCE_TIMEOUT_SECONDS, 'maxTokens': settings.max_tokens,
                   'maxRetries': settings.max_retries, 'apiProtocol': 'responses' if model.use_responses_api else 'chat-completions', 'temperature': model.temperature, 'configuredTemperature': settings.temperature, 'rawTraceEnabled': settings.raw_trace,
                   'commit': subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
                   'scenario': name, 'host': 'React + Ant Design 5' if name == 'B' else name,
                   'skillsRoot': str(ROOT/'packages/creator/skills'),
                   'modelCallBudget': creator.protocol.max_model_calls}
    try:
        result=await asyncio.wait_for(creator.run_messages([{'role':'user','content':prompt}]),timeout=ACCEPTANCE_TIMEOUT_SECONDS)
        outcome.update({'interrupted':isinstance(result,DeepAgentInterrupted),
                        'completion':getattr(result,'completion',None),'text':getattr(result,'text',str(result))})
    except TimeoutError:
        outcome.update({'completion':'error','errorType':'TimeoutError',
                        'error':f'Real Creator exceeded the {ACCEPTANCE_TIMEOUT_SECONDS}-second acceptance limit before delivery.'})
    except Exception as e:
        outcome.update({'completion':'error','errorType':type(e).__name__,'error':str(e)})
    finally:
        ended_monotonic = time.monotonic()
        # Persist first, before expensive source hashing / completion inspection.
        diagnostics = {'startedAt': run_started_at, 'finishedAt': stamp(),
                       'durationMs': (ended_monotonic-run_started_monotonic)*1000,
                       'modelAttempts': trace.snapshot(ended_monotonic),
                       'toolObservations': logger.observations}
        (root/'model-metrics.json').write_text(json.dumps(creator.protocol.metrics.to_dict(),ensure_ascii=False,indent=2))
        (root/'diagnostics.json').write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2))
        (root/'environment.json').write_text(json.dumps(environment,ensure_ascii=False,indent=2))
        baseline = json.loads((root/'baseline-hashes.json').read_text())
        current = hashes(root)
        changed = [file for file in sorted(set(baseline) | set(current))
                   if (file.startswith('src/') or file in {'package.json','package-lock.json','pnpm-lock.yaml'})
                   and baseline.get(file) != current.get(file)]
        imports = {file: [line for line in (root/file).read_text().splitlines()
                          if line.lstrip().startswith('import ')]
                   for file in changed if file.endswith(('.ts','.tsx')) and (root/file).is_file()}
        (root/'source-changes.json').write_text(json.dumps({'changedFiles':changed,'imports':imports},ensure_ascii=False,indent=2))
        outcome['developmentPlan'] = None if authority.active is None else authority.active.public_result()
        outcome['deliveries'] = creator.completion_gate.inspect_deliveries()
        (root/'model-tool-calls.json').write_text(json.dumps(trace.tools,ensure_ascii=False,indent=2))
        (root/'host-calls.json').write_text(json.dumps(host.calls,ensure_ascii=False,indent=2,default=str))
        (root/'activity.json').write_text(json.dumps(activity.snapshot(),ensure_ascii=False,indent=2,default=str))
        (root/'outcome.json').write_text(json.dumps(outcome,ensure_ascii=False,indent=2,default=str))
        print(json.dumps(outcome,ensure_ascii=False),flush=True)
        # ProjectControlClient owns no persistent connection to close.

if __name__ == '__main__':
    if sys.argv[1]=='setup': setup()
    else: asyncio.run(run(sys.argv[1]))
