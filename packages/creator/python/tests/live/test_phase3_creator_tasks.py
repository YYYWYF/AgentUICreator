"""Opt-in real configured model -> Creator /creator -> real Operator acceptance.

No monkeypatched model, route, validation, permissions or Runtime evidence.
"""
from __future__ import annotations
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import time
import pytest
from fastapi.testclient import TestClient
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.server import create_app
from phase3_support import ROOT,SKILLS,MODEL_PATH,prepare_host,clone_host,model,instances

pytestmark=[pytest.mark.live_model,pytest.mark.skipif(os.environ.get('CREATOR_RUN_LIVE_MODEL')!='1',reason='Explicit live model opt-in required')]
CASES={
 'plugin_question':'这个项目的输入框插件提供哪些公开定制能力？修改输入框外观是否需要接管源码？只查看，不要修改。',
 'hide':'隐藏输入框的语音输入按钮，保留插件及其源码，其他功能不变。',
 'move':'把助手回复下方的复制按钮移到重新生成按钮后面，保持其余按钮的顺序和功能不变。',
 'layout':'通过布局配置，把主会话面板的 maxWidth 设置为 960px，保留左侧会话历史和现有插件组合。',
 'public_props':'给输入框外壳加 12px 圆角，通过当前项目薄应用层的公开 rootProps.style 设置 borderRadius，保留现有 props 透传，不接管实现源码。',
 'takeover_question':'我需要修改 Composer 的上游实现源码，而不只是 props 或 JSX 包装。请先展示该插件的具体源码接管计划，等待我确认；确认前不要写入。',
}


def file_snapshot(root):
    return {p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*')
            if p.is_file() and not any(part in {'node_modules','.agentuicreator','.git','dist'} for part in p.relative_to(root).parts)}


def forwards_composer_props(content):
    # Rest-binding names are arbitrary; check their JSX forwarding, not the
    # spelling "props". Also retain the caller's rootProps and nested style.
    binding = re.search(r'\{\s*rootProps\s*,\s*\.\.\.\s*(\w+)\s*\}\s*(?:=\s*props|:)', content)
    name = binding.group(1) if binding else 'props'
    root = 'rootProps' if binding else 'props.rootProps'
    return (bool(re.search(r'\{\s*\.\.\.\s*' + re.escape(name) + r'\s*\}', content))
            and bool(re.search(r'\.\.\.\s*' + re.escape(root) + r'\s*[,}]', content))
            and bool(re.search(r'\.\.\.\s*' + re.escape(root) + r'\??\.style', content)))


@pytest.fixture(scope='module')
def live_seed(tmp_path_factory):
    settings=CreatorModelSettings.from_environment(config_root=ROOT)
    # Test facts only; never serialize credentials or endpoint configuration.
    print(json.dumps({'model':settings.model_name,'temperature':settings.temperature,'maxTokens':settings.max_tokens,'requestTimeoutSeconds':settings.timeout_seconds,'maxRetries':settings.max_retries}),flush=True)
    return prepare_host(tmp_path_factory.mktemp('phase3-live-seed')/'host')


@pytest.mark.parametrize('case',list(CASES))
def test_real_creator_task(live_seed,tmp_path,case):
    root=clone_host(live_seed,tmp_path/('host-'+case))
    output=Path(os.environ.get('CREATOR_PHASE3_REPORT_DIR',str(ROOT/'packages/creator/docs/verification/phase3-2026-10-19/live')))
    output.mkdir(parents=True,exist_ok=True)
    before=file_snapshot(root)
    settings=CreatorServerSettings(project_root=root,skills_root=SKILLS,config_root=ROOT,
        auth_token='phase3-isolated-test-token-'+'x'*32,verification_mode='static_only')
    started=time.monotonic()
    events=[]
    exception=None
    print('LIVE_START '+case,flush=True)
    try:
        with TestClient(create_app(settings),headers={'Authorization':'Bearer '+settings.auth_token}) as client:
            with client.stream('POST','/creator',json={'threadId':'phase3-'+case,'runId':'phase3-'+case,
                    'messages':[{'role':'user','content':CASES[case]}]}) as response:
                assert response.status_code==200
                for line in response.iter_lines():
                    if line.startswith('data: '):
                        event=json.loads(line[6:])
                        events.append(event)
    except Exception as error:
        exception={'type':type(error).__name__,'message':str(error)[:3000]}
    elapsed=round(time.monotonic()-started,3)
    after=file_snapshot(root)
    changed=[p for p in sorted(before.keys()|after.keys()) if before.get(p)!=after.get(p)]
    text=''.join(e.get('delta','') for e in events if e.get('type')=='TEXT_MESSAGE_CONTENT')
    errors=[e for e in events if e.get('type')=='RUN_ERROR']
    questions=[e.get('value',{}) for e in events if e.get('name')=='on_interrupt']
    result=next((e.get('result',{}) for e in reversed(events) if e.get('type')=='RUN_FINISHED' and e.get('result')), {})
    current={i['id']:i for i in instances(model(root))}
    initial={i['id']:i for i in instances(json.loads(before[MODEL_PATH]))}
    expected=False
    if case=='plugin_question': expected=not changed and not questions and bool(text)
    elif case=='hide': expected=current['dictation-action-main'].get('enabled') is False and current.keys()==initial.keys()
    elif case=='move':
        actions=current['response-footer-main']['slots']['actions']
        expected=[i['id'] for i in actions]==['reload-action-main','copy-action-main','feedback-actions-main','export-markdown-action-main']
    elif case=='layout':
        def panels(value):
            if isinstance(value,dict):
                if value.get('type')=='panel': yield value
                for child in value.values(): yield from panels(child)
            elif isinstance(value,list):
                for child in value: yield from panels(child)
        expected=any(p.get('maxWidth') in {960,'960px'} for p in panels(model(root))) and current.keys()==initial.keys()
    elif case=='public_props':
        content=(root/'src/agent-ui/plugins/composer/index.tsx').read_text()
        expected=bool(re.search(r'borderRadius\s*:\s*(?:12|[\'\"]12px[\'\"])',content)) and forwards_composer_props(content) and not (root/'src/agent-ui/plugins/composer/source').exists() and MODEL_PATH not in changed
    elif case=='takeover_question':
        expected=bool(questions) and any('plugin-source-' in json.dumps(q) for q in questions) and not changed
    # Actual state alone is insufficient: task errors/blocked completion also fail.
    completion=result.get('completion')
    passed=expected and not errors and exception is None and (case=='takeover_question' or completion in {'success','already_satisfied'})
    protected=[p for p in changed if p.startswith(('src/agent-ui/runtime/','src/agent-ui/framework/')) or p in {'package.json','tsconfig.json'}]
    passed=passed and not protected
    logs=sorted((root/'.agentuicreator/logs').glob('*.jsonl'))
    log_events=[json.loads(line) for p in logs for line in p.read_text().splitlines()]
    finished=next((e['data'] for e in reversed(log_events) if e['type']=='run_finished'),{})
    record={'case':case,'prompt':CASES[case],'projectRoot':str(root),'durationSeconds':elapsed,'passed':passed,
            'expectedStateMatched':expected,'completion':completion,'exception':exception,'errors':errors,'questions':questions,
            'changedPaths':changed,'changedFileHashes':{p:{'before':hashlib.sha256(before[p]).hexdigest() if p in before else None,'after':hashlib.sha256(after[p]).hexdigest() if p in after else None} for p in changed},'protectedChanges':protected,'response':text,'verificationMode':'static_only',
            'runtimeEvidence':'not collected','browserVisualEvidence':'not collected','result':result,'runSummary':finished}
    (output/(case+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    (output/(case+'.events.json')).write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
    patch=''.join(''.join(difflib.unified_diff(before.get(p,b'').decode('utf-8',errors='replace').splitlines(True),after.get(p,b'').decode('utf-8',errors='replace').splitlines(True),fromfile='a/'+p,tofile='b/'+p)) for p in changed)
    (output/(case+'.patch')).write_text(patch,encoding='utf-8')
    for i,p in enumerate(logs):
        (output/(case+f'.{i}.jsonl')).write_bytes(p.read_bytes())
    print('LIVE_END '+json.dumps({k:record[k] for k in ['case','durationSeconds','passed','completion','expectedStateMatched','changedPaths','errors','exception']},ensure_ascii=False),flush=True)
    assert passed, json.dumps({k:record[k] for k in ['case','expectedStateMatched','completion','errors','exception','questions','changedPaths']},ensure_ascii=False)
