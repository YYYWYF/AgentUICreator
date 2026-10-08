"""Persistent real Creator acceptance; run directly, no mocked model decisions."""
from __future__ import annotations
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from langgraph.checkpoint.memory import InMemorySaver
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentInterrupted
from test_official_composer import ROOT, fresh_host, ObservedHost, ObservedLogger, ModelToolTrace, hashes

OUTPUT = Path(os.environ['CREATOR_ACCEPTANCE_OUTPUT']).resolve()
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

async def run(name):
    root = OUTPUT / name
    prompt = ('开发一个新的业务备注 UI 插件并挂载到当前 Agent 界面：输入备注、点击添加后显示备注列表，提供按钮打开说明弹层。'
              '先读取当前 src/App.tsx、真实宿主组件源码/导出、Provider、主题和使用习惯，自主判断应复用哪个 UI 体系并在交付中说明依据。'
              '复用宿主当前控件和主题，不增加、不重新安装或升级任何依赖，不修改 assistant-ui vendor、Runtime 或 framework。'
              '所有文案使用现有统一 locale 层且中英文齐全。沿用现有 ui-plugin-development Skill，完成 Host verify:ui、typecheck、build（includeBuild=true）和最终交付回执。')
    (root / 'request.txt').write_text(prompt)
    host = ObservedHost(root)
    logger = ObservedLogger(root)
    run_id = f'ui-selection-{name}'
    logger.begin(run_id=run_id,thread_id=run_id)
    activity = CreatorActivityRecorder(root,logger=logger)
    activity.begin(run_id)
    trace = ModelToolTrace()
    settings = CreatorModelSettings.from_environment(config_root=ROOT)
    model = create_creator_chat_model(settings,thread_id=run_id)
    model.callbacks=[trace]
    authority = PluginDevelopmentAuthority(root,thread_id=run_id,skills_root=ROOT/'packages/creator/skills')
    authority.begin_task(task_id=run_id,request_id=run_id,user_message=prompt,intent='explicit')
    creator = create_domain_write_creator_agent(model=model,workspace=root,project_control=host,
        activity=activity,checkpointer=InMemorySaver(),thread_id=run_id,
        skills_root=ROOT/'packages/creator/skills',max_retries=settings.max_retries,
        automatic_completion_repair=True,verification_mode='static_only',
        plugin_development_authority=authority)
    outcome = {'scenario':name,'model':settings.model_name,'realCreatorInvoked':True,'maxTokens':settings.max_tokens}
    try:
        result=await asyncio.wait_for(creator.run_messages([{'role':'user','content':prompt}]),timeout=600)
        outcome.update({'interrupted':isinstance(result,DeepAgentInterrupted),
                        'completion':getattr(result,'completion',None),'text':getattr(result,'text',str(result))})
    except TimeoutError:
        outcome.update({'completion':'error','errorType':'TimeoutError',
                        'error':'Real Creator exceeded the 600-second acceptance limit before delivery.'})
    except Exception as e:
        outcome.update({'completion':'error','errorType':type(e).__name__,'error':str(e)})
    finally:
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
