from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock

from langchain.agents.middleware import ModelRequest
from langchain_core.messages import HumanMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.change_scope import ChangeScopeMetrics, ScopeAwareRecoveryGuard
from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
from agent_ui_creator.domain_agent.debugging_convergence import DebuggingEvidenceConvergenceMiddleware
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.run_control import CreatorRunControlState
from agent_ui_creator.runtime_diagnostics.tool import RuntimeDiagnosticInspectionService, create_runtime_diagnostic_tool
from agent_ui_creator.validation import CommandExecutionResult, CreatorValidationService, create_validation_tool


FOO = 'plugins/foo/index.tsx'
BAR = 'plugins/bar/index.tsx'
TARGET = {'path': FOO, 'code': 'TS2345'}


def ts(path=FOO, line=42, message='Wrong argument'):
    return f'{path}({line},2): error TS2345: {message}'


class Runner:
    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def execute_known_command(self, command):
        self.calls.append(command)
        output = self.outputs.pop(0)
        return CommandExecutionResult(output, 1 if 'error TS' in output else 0, False)


def session(tmp_path, *outputs, runtime=None, mode='static_only', scope=None):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin('debug-run')
    repair = CreatorRepairState()
    validation = CreatorValidationService(project_root=tmp_path, activity=activity,
        runner=Runner(*outputs), repair_state=repair, scope=scope)
    runtime = runtime or SimpleNamespace(current_result=lambda: None)
    gate = CreatorDevelopmentCompletionGate(activity=activity, validation=validation,
        runtime=runtime, repair_state=repair, verification_mode=mode)
    return validation, activity, gate, create_validation_tool(validation)


def call(tool, **args):
    return json.loads(asyncio.run(tool.ainvoke(args)))


def mutate(root, activity, version):
    path = root / FOO
    path.parent.mkdir(parents=True, exist_ok=True)
    activity.capture_before_content(FOO, path.read_text() if path.exists() else None)
    path.write_text(version)
    activity.touch(FOO)


def test_targeted_existing_error_requires_resolution_not_just_delta_pass(tmp_path):
    baseline = ts() + '\n' + ts(BAR)
    validation, activity, gate, tool = session(tmp_path, baseline, '', baseline, '', ts(BAR))
    first = call(tool, targetDiagnostics=[TARGET])
    assert first['result']['status'] == 'passed'
    assert first['result']['diagnosticIdentities'][0]['line'] == 42
    pending = gate.review('fixed')
    assert not pending.accepted and pending.reason == 'target_diagnostic_remaining'
    assert FOO in pending.feedback and 'read' in pending.feedback.lower()
    assert validation.debugging.targets
    mutate(tmp_path, activity, 'fixed foo')
    call(tool)
    finished = gate.review('fixed')
    assert finished.accepted and finished.completion == 'success'
    assert finished.reason == 'resolved_target_diagnostic'
    assert validation.current_result().workspace_warning['diagnosticCount'] == 1
    assert validation.debugging.final_state == 'resolved'
    assert validation.repair_state.repair_rounds == 1


def test_moved_diagnostic_is_still_unresolved_and_existing_repair_limit_applies(tmp_path):
    validation, activity, gate, tool = session(tmp_path,
        ts(), '', ts(), '', ts(line=80), '', ts(line=120))
    call(tool, targetDiagnostics=[TARGET])
    assert not gate.review('done').accepted
    mutate(tmp_path, activity, 'attempt one')
    call(tool)
    assert not gate.review('done').accepted
    mutate(tmp_path, activity, 'attempt two')
    call(tool)
    result = gate.review('done')
    assert result.accepted and result.completion == 'failed'
    assert validation.debugging.final_state == 'unresolved_after_limit'


def test_clean_goal_cannot_be_downgraded_to_delta(tmp_path):
    validation, _, gate, tool = session(tmp_path, ts(), '', ts(), '', ts())
    assert call(tool, mode='clean')['result']['status'] == 'failed'
    assert call(tool, mode='delta')['result']['status'] == 'passed'
    assert not gate.review('done').accepted
    assert validation.debugging.clean_requested


def test_already_absent_target_can_finish_without_noop_mutation(tmp_path):
    validation, activity, gate, tool = session(tmp_path, '', '', '')
    call(tool, targetDiagnostics=[TARGET])
    decision = gate.review('当前诊断已消失')
    assert decision.accepted and decision.completion == 'already_satisfied'
    assert validation.debugging.final_state == 'unchanged_preexisting'
    assert activity.revision == 0


def test_duplicate_validation_reuses_successful_evidence_and_invalidates(tmp_path):
    validation, activity, _, tool = session(tmp_path, ts(), '', ts(), '', ts(), '', ts())
    call(tool, targetDiagnostics=[TARGET])
    count = len(validation.runner.calls)
    repeated = call(tool, targetDiagnostics=[TARGET])
    assert repeated['result']['code'] == 'DIAGNOSTIC_ALREADY_OBSERVED'
    assert len(validation.runner.calls) == count
    # Different arguments may bind another target; they are not permanent bans.
    assert 'reusePreviousResult' not in call(tool, mode='clean')['result']
    mutate(tmp_path, activity, 'new revision')
    assert 'reusePreviousResult' not in call(tool)['result']
    assert len(validation.runner.calls) > count


def runtime_result(status='failed', fresh=True, message='Render failure'):
    return {'currentHash': 'a' * 64, 'runtimeStatus': status,
        'runtimeObserved': True, 'diagnosticFresh': fresh, 'compositionFresh': fresh,
        'compositionVerified': True, 'currentErrors': [] if status == 'passed' else [{
            'id': 'diagnostic-foo', 'kind': 'plugin-render', 'pluginId': 'foo',
            'instanceId': 'foo-main', 'errorMessage': message, 'componentStack': FOO,
        }], 'summary': {'currentOpenCount': 0 if status == 'passed' else 1}}


def runtime_service(activity, debugging, initial):
    store = SimpleNamespace(result=initial)
    store.inspect = lambda **_: deepcopy(store.result)
    store.current_composition = lambda **_: {'instances': []}
    client = SimpleNamespace(verifications=0)
    async def project():
        return {'appUIModel': {'hash': 'a' * 64}, 'plugins': []}
    async def verify(**_):
        client.verifications += 1
        return {'verified': True, 'checks': []}
    client.inspect_ui_project = project
    client.verify_runtime_composition = verify
    service = RuntimeDiagnosticInspectionService(store=store, thread_id='test',
        project_control=client, observations=DomainObservationContext(), activity=activity,
        debugging=debugging)
    return service, store, client


def test_runtime_target_binding_freshness_duplicates_and_changed_evidence(tmp_path):
    validation, activity, gate, static = session(tmp_path, '', '', '', '', '', mode='static_and_runtime')
    service, store, client = runtime_service(activity, validation.debugging, runtime_result())
    gate.runtime = service
    runtime = create_runtime_diagnostic_tool(service)
    bound = call(runtime, targetDiagnosticIds=['diagnostic-foo'])
    assert bound['ok'] and bound['result']['targetDiagnosticCount'] == 1
    assert FOO in bound['result']['currentErrors'][0]['componentStack']
    repeated = call(runtime, targetDiagnosticIds=['diagnostic-foo'])
    assert repeated['result']['reusePreviousResult'] is True and client.verifications == 1
    store.result = runtime_result(message='Updated error')
    assert service.current_result() is None  # A new report invalidates old evidence.
    assert 'reusePreviousResult' not in call(runtime, targetDiagnosticIds=['diagnostic-foo'])['result']
    assert client.verifications == 2
    call(static)  # Capture pre-mutation baseline and current static evidence.
    mutate(tmp_path, activity, 'fixed render')
    store.result = runtime_result(status='passed')
    call(static)
    call(runtime)
    assert gate.review('done').completion == 'success'
    assert validation.debugging.final_state == 'resolved'


def test_stale_runtime_does_not_bind_targets_or_authorize_repair(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    service, _, _ = runtime_service(activity, validation.debugging, runtime_result(status='stale', fresh=False))
    result = call(create_runtime_diagnostic_tool(service), targetDiagnosticIds=['diagnostic-foo'])
    assert result['error']['code'] == 'DEBUGGING_EVIDENCE_STALE'
    assert not validation.debugging.runtime_targets and activity.revision == 0


def test_runtime_diagnosis_before_authoring_does_not_grant_scope(tmp_path):
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path), run_control=CreatorRunControlState())
    # Observation with no established side-effect scope is allowed; an existing
    # Composition scope continues to reject a Plugin source failure.
    guard._observe_result('inspect_runtime_errors', {}, json.dumps({'ok': True, 'result': runtime_result()}))
    assert not guard.run_control.blocked and not guard.metrics.taskChangeLayers
    guard.metrics.commit_scope('composition', ['app-ui-model'])
    guard._observe_result('inspect_runtime_errors', {}, json.dumps({'ok': True, 'result': runtime_result()}))
    assert guard.run_control.blocked


def test_composition_only_runtime_failure_ends_structured_blocked(tmp_path):
    scope = ChangeScopeMetrics(taskChangeLayers=['composition'])
    runtime = SimpleNamespace(current_result=lambda: runtime_result())
    validation, _, gate, tool = session(tmp_path, '', '', '', mode='static_and_runtime', scope=scope, runtime=runtime)
    call(tool, targetDiagnostics=[TARGET])
    decision = gate.review('fixed')
    assert decision.accepted and decision.completion == 'blocked'
    assert validation.debugging.reason == 'runtime_failure_outside_scope'


def test_current_diagnostic_convergence_and_ordinary_change_is_unaffected(tmp_path):
    validation, _, _, tool = session(tmp_path, ts(), '', ts())
    runtime = SimpleNamespace(current_result=lambda: None)
    middleware = DebuggingEvidenceConvergenceMiddleware(validation, runtime)
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content='hide right panel')], tools=[])
    assert middleware._request(request) is request
    call(tool, targetDiagnostics=[TARGET])
    focused = middleware._request(request)
    assert FOO in focused.messages[-1].content
    assert 'nearest contract' in focused.messages[-1].content
    assert 'Do not repeat glob' in focused.messages[-1].content


def test_explicit_clean_goal_resolves_all_current_errors(tmp_path):
    initial = ts() + '\n' + ts(BAR)
    validation, activity, gate, tool = session(tmp_path, initial, '', initial, '', '')
    assert call(tool, mode='clean')['result']['status'] == 'failed'
    mutate(tmp_path, activity, 'clean project')
    assert call(tool, mode='clean')['result']['status'] == 'passed'
    assert gate.review('typecheck clean').completion == 'success'
    assert validation.metrics()['currentTypecheckDiagnostics'] == 0


def test_ordinary_delta_does_not_inject_debugging_for_unrelated_existing_errors(tmp_path):
    validation, _, _, tool = session(tmp_path, ts(BAR), '', ts(BAR))
    middleware = DebuggingEvidenceConvergenceMiddleware(validation, SimpleNamespace(current_result=lambda: None))
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content='hide right panel')], tools=[])
    call(tool)
    assert middleware._request(request) is request
    assert not validation.debugging.active
