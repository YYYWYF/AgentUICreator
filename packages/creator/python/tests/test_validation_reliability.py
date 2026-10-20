from __future__ import annotations
import asyncio
import json
import pytest
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.operator.errors import OperatorError
from agent_ui_creator.validation import CreatorValidationService, CommandExecutionResult, create_validation_tool
from agent_ui_creator.validation.errors import RegistryIntegrityError


def project(root):
    (root / '.agent-ui').mkdir()
    (root / '.agent-ui/project.json').write_text(json.dumps({'mode': 'platform', 'sourceRoot': 'src/agent-ui'}))
    registry = root / 'src/agent-ui/plugins/registry.generated.ts'
    registry.parent.mkdir(parents=True)
    registry.write_text('before registry')
    manifest = registry.parent / 'example/manifest.json'
    manifest.parent.mkdir()
    manifest.write_text('{}')
    activity = CreatorActivityRecorder(root)
    activity.begin('reliability')
    activity.capture_before_content('src/agent-ui/plugins/example/manifest.json', None)
    activity.touch('src/agent-ui/plugins/example/manifest.json')
    return registry, activity


@pytest.mark.parametrize('failure', ['after_write', 'wrong_path', 'wrong_changed', 'before_write', 'false_change', 'cancel'])
def test_registry_reconciles_disk_and_preserves_undo(tmp_path, failure):
    registry, activity = project(tmp_path)
    original = OperatorError('OPERATOR_OPERATION_FAILED', 'original failure')
    class Operator:
        calls = 0
        async def synchronize_plugin_registry(self, **kwargs):
            self.calls += 1
            if failure == 'before_write':
                raise original
            if failure != 'false_change':
                registry.write_text('after registry')
            if failure == 'after_write':
                raise original
            if failure == 'cancel':
                raise asyncio.CancelledError()
            return {'path': 'wrong' if failure == 'wrong_path' else 'src/agent-ui/plugins/registry.generated.ts', 'changed': failure != 'wrong_changed'}
    operator = Operator()
    service = CreatorValidationService(project_root=tmp_path, activity=activity,
        operator=operator, mutation_coordinator=ProjectMutationCoordinator())
    expected = asyncio.CancelledError if failure == 'cancel' else OperatorError if failure == 'before_write' else RegistryIntegrityError
    with pytest.raises(expected) as caught:
        asyncio.run(service._synchronize_plugin_registry())
    changed = failure not in {'before_write', 'false_change'}
    path = 'src/agent-ui/plugins/registry.generated.ts'
    files = {item['path']: item for item in activity.snapshot()['files']}
    assert (path in files) is changed
    assert (path in activity.mutation_paths) is changed
    if failure == 'after_write':
        assert caught.value.__cause__ is original
        assert caught.value.details['cause'] == 'original failure'
    if failure not in {'before_write', 'cancel'}:
        with pytest.raises(RegistryIntegrityError):
            asyncio.run(service._synchronize_plugin_registry())
        assert operator.calls == 1
    receipt = activity.finish()
    if changed:
        assert registry.read_text() == 'after registry'
        assert 'before registry' in files[path]['diff']
        activity.transactions.undo(receipt['transaction']['runId'])
        assert registry.read_text() == 'before registry'


class Runner:
    def __init__(self, kind=None):
        self.calls = []
        self.kind = kind
        self.recovered = False
    async def execute_known_command(self, command):
        self.calls.append(command)
        if command == 'pnpm verify:ui' and self.kind and not self.recovered:
            return CommandExecutionResult('failure', None if self.kind != 'source' else 1,
                False, None if self.kind == 'source' else self.kind)
        return CommandExecutionResult('', 0, False)


def service_for(root, runner):
    project(root)
    activity = CreatorActivityRecorder(root)
    activity.begin('validation')
    return CreatorValidationService(project_root=root, activity=activity, runner=runner)


def test_integrity_failure_tool_is_structured_and_not_repaired(tmp_path):
    registry, activity = project(tmp_path)
    class Operator:
        async def synchronize_plugin_registry(self, **kwargs):
            registry.write_text('after registry')
            return {'path': 'wrong', 'changed': True}
    service = CreatorValidationService(project_root=tmp_path, activity=activity,
        runner=Runner(), operator=Operator(), mutation_coordinator=ProjectMutationCoordinator())
    result = json.loads(asyncio.run(create_validation_tool(service).ainvoke({})))
    assert result['error']['code'] == 'REGISTRY_SYNC_INTEGRITY_FAILED'
    assert result['failureSemantics']['automaticRepairAllowed'] is False
    assert result['failureSemantics']['retryAllowed'] is False
    assert any(f['path'].endswith('registry.generated.ts') for f in activity.snapshot()['files'])


@pytest.mark.parametrize('kind', ['timeout', 'start_failed', 'infrastructure'])
@pytest.mark.parametrize('use_tool', [False, True])
def test_same_revision_transient_retry_recovers_both_caches(tmp_path, kind, use_tool):
    runner = Runner(kind)
    service = service_for(tmp_path, runner)
    tool = create_validation_tool(service)
    async def validate(retry=False):
        if use_tool:
            return json.loads(await tool.ainvoke({'retryInfrastructure': retry}))['result']
        return (await service.validate(retry_infrastructure=retry)).to_dict()
    first = asyncio.run(validate())
    assert first['status'] == 'failed'
    assert first['failureSemantics']['retryAllowed'] is True
    assert first['failureSemantics']['automaticRepairAllowed'] is False
    count = len(runner.calls)
    runner.recovered = True
    assert asyncio.run(validate())['status'] == 'failed'
    assert len(runner.calls) == count
    recovered = asyncio.run(validate(True))
    assert recovered['status'] == 'passed'
    assert recovered['revision'] == first['revision'] == 0
    assert len(runner.calls) == count + 1
    asyncio.run(validate(True))
    assert len(runner.calls) == count + 1


@pytest.mark.parametrize('kind', ['timeout', 'permission', 'configuration', 'integrity', 'source'])
def test_retry_budget_and_non_retryable_failures(tmp_path, kind):
    runner = Runner(kind)
    service = service_for(tmp_path, runner)
    tool = create_validation_tool(service)
    first = json.loads(asyncio.run(tool.ainvoke({})))['result']
    count = len(runner.calls)
    for _ in range(4):
        last = json.loads(asyncio.run(tool.ainvoke({'retryInfrastructure': True})))['result']
    assert len(runner.calls) == count + (1 if kind == 'timeout' else 0)
    assert last['status'] == first['status'] == 'failed'
    if kind != 'source':
        assert last['failureSemantics']['retryAllowed'] is False


def test_transient_baseline_only_retried_before_any_mutation(tmp_path):
    class BaselineRunner(Runner):
        async def execute_known_command(self, command):
            self.calls.append(command)
            if command == 'pnpm typecheck' and not self.recovered:
                return CommandExecutionResult('timeout', None, False, 'timeout')
            return CommandExecutionResult('', 0, False)
    runner = BaselineRunner()
    service = service_for(tmp_path, runner)
    assert asyncio.run(service.validate()).status == 'failed'
    runner.recovered = True
    assert asyncio.run(service.validate(retry_infrastructure=True)).status == 'passed'
    assert service.has_pre_mutation_baseline


def test_failed_baseline_not_recaptured_after_mutation(tmp_path):
    class BaselineRunner(Runner):
        async def execute_known_command(self, command):
            self.calls.append(command)
            if command == 'pnpm typecheck' and not self.recovered:
                return CommandExecutionResult('timeout', None, False, 'timeout')
            return CommandExecutionResult('', 0, False)
    runner = BaselineRunner()
    service = service_for(tmp_path, runner)
    asyncio.run(service.ensure_baseline())
    service.activity.capture_before_content('src/agent-ui/new.ts', None)
    (tmp_path / 'src/agent-ui/new.ts').write_text('new')
    service.activity.touch('src/agent-ui/new.ts')
    runner.recovered = True
    asyncio.run(service.validate(retry_infrastructure=True))
    assert not service.has_pre_mutation_baseline
    assert runner.calls.count('pnpm typecheck') == 2  # baseline + current, never a replacement baseline


def test_failure_metadata_does_not_expand_receipt_contract(tmp_path):
    service = service_for(tmp_path, Runner('timeout'))
    result = asyncio.run(service.validate())
    assert result.failure_semantics['failures'][0]['kind'] == 'timeout'
    assert all('failureKind' not in item for item in service.activity.snapshot()['validations'])
    assert all('failureKind' not in item for item in result.to_dict()['checks'])


def test_baseline_only_transient_failure_exposes_bounded_tool_retry(tmp_path):
    class FirstCallFails(Runner):
        async def execute_known_command(self, command):
            self.calls.append(command)
            if len(self.calls) == 1:
                return CommandExecutionResult('timeout', None, False, 'timeout')
            return CommandExecutionResult('', 0, False)
    runner = FirstCallFails()
    service = service_for(tmp_path, runner)
    tool = create_validation_tool(service)
    failed = json.loads(asyncio.run(tool.ainvoke({})))['result']
    assert failed['status'] == 'failed'
    assert failed['failureSemantics']['retryAllowed']
    assert all(item['exitCode'] == 0 for item in failed['checks'])
    recovered = json.loads(asyncio.run(tool.ainvoke({'retryInfrastructure': True})))['result']
    assert recovered['status'] == 'passed'
    count = len(runner.calls)
    asyncio.run(tool.ainvoke({'retryInfrastructure': True}))
    assert len(runner.calls) == count == 5
