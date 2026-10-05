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


def runtime_service(activity, debugging, initial, repair_state=None):
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
        debugging=debugging, repair_state=repair_state)
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


# Runtime target completion must share its differential with the ordinary Host
# gate and Scope Guard, while leaving global Runtime inspection unchanged.
def runtime_errors(*records):
    result = runtime_result(status='failed' if records else 'passed')
    result['currentErrors'] = list(records)
    result['summary']['currentOpenCount'] = len(records)
    return result


def runtime_error(plugin='foo', instance='foo-main', kind='plugin-render', message='Render failure'):
    return {'id': 'diagnostic-' + instance, 'kind': kind, 'pluginId': plugin,
            'instanceId': instance, 'errorMessage': message, 'componentStack': 'source(42:2)'}


def targeted_runtime_session(tmp_path, *, bind=True):
    scope = ChangeScopeMetrics(taskChangeLayers=['plugin_behavior'], scopeResources=['plugin:foo'])
    validation, activity, gate, static = session(tmp_path, '', '', '', '', '', '', '',
        mode='static_and_runtime', scope=scope)
    a, b = runtime_error(), runtime_error('bar', 'bar-main')
    service, store, _ = runtime_service(activity, validation.debugging, runtime_errors(a, b), validation.repair_state)
    gate.runtime = service
    tool = create_runtime_diagnostic_tool(service)
    call(static)
    call(tool, **({'targetDiagnosticIds': [a['id']]} if bind else {}))
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path), run_control=CreatorRunControlState())
    guard.metrics = scope
    guard.debugging = validation.debugging
    return validation, activity, gate, static, tool, store, guard, a, b


def test_runtime_target_a_resolved_b_unchanged_is_success_with_warning(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    mutate(tmp_path, activity, 'fixed A')
    call(static)
    store.result = runtime_errors(b)
    payload = call(tool)
    guard._observe_result('inspect_runtime_errors', {}, json.dumps(payload))
    assert not guard.run_control.blocked
    assert payload['result']['runtimeStatus'] == 'failed'  # Global facts are preserved.
    difference = payload['result']['runtimeDebuggingDifferential']
    assert len(difference['targetResolved']) == 1 and not difference['targetRemaining']
    assert not difference['introducedRuntimeDiagnostics']
    assert difference['unchangedPreexistingRuntimeDiagnostics'][0]['pluginId'] == 'bar'
    decision = gate.review('A fixed')
    assert decision.accepted and decision.completion == 'success'
    assert validation.debugging.final_state == 'resolved'
    assert '无关 Runtime 错误' in decision.text
    assert activity.snapshot()['verification']['status'] == 'changed-and-verified'
    assert validation.metrics()['debuggingMetrics']['runtimeDifferential'] == difference


def test_unrelated_baseline_runtime_failure_does_not_lock_another_layer(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    # B is from another owning layer. It remains a warning rather than granting
    # that layer or terminating an otherwise successful repair of A.
    b['kind'] = 'application-event-unknown'
    b['eventName'] = 'legacy.event'
    store.result = runtime_errors(a, b)
    validation.debugging.runtime_baseline = None
    call(tool, targetDiagnosticIds=[a['id']])
    mutate(tmp_path, activity, 'fixed A')
    call(static)
    store.result = runtime_errors(b)
    payload = call(tool)
    guard._observe_result('inspect_runtime_errors', {}, json.dumps(payload))
    assert not guard.run_control.blocked
    assert guard.metrics.taskChangeLayers == ['plugin_behavior']
    assert gate.review('done').completion == 'success'


def test_new_runtime_regression_is_not_hidden_by_resolved_target(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    mutate(tmp_path, activity, 'A fixed but setup broken')
    call(static)
    c = runtime_error(kind='plugin-activation', message='New setup error')
    store.result = runtime_errors(b, c)
    payload = call(tool)
    assert payload['result']['runtimeDebuggingDifferential']['introducedRuntimeDiagnostics'][0]['kind'] == 'plugin-activation'
    guard._observe_result('inspect_runtime_errors', {}, json.dumps(payload))
    assert not guard.run_control.blocked  # C is repairable within plugin:foo.
    decision = gate.review('A fixed')
    assert not decision.accepted and decision.reason == 'introduced_runtime_regression'
    assert 'New setup error' in decision.feedback
    assert [item['pluginId'] for item in gate._runtime_completion_evidence()['currentErrors']] == ['foo']
    assert validation.debugging.final_state != 'resolved'


def test_new_outside_scope_runtime_regression_blocks(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    mutate(tmp_path, activity, 'fixed A but new bar setup failure')
    call(static)
    store.result = runtime_errors(b, runtime_error('bar', 'bar-main', 'plugin-activation'))
    call(tool)
    decision = gate.review('done')
    assert decision.completion == 'blocked' and decision.reason == 'runtime_failure_outside_scope'
    assert validation.debugging.final_state == 'blocked'


def test_runtime_target_still_present_obeys_existing_repair_limit(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    assert gate.review('done').reason == 'runtime_target_remaining'
    for version in ('attempt one', 'attempt two'):
        mutate(tmp_path, activity, version)
        call(static)
        store.result = runtime_errors(a, b)
        call(tool)
        decision = gate.review('done')
    assert decision.accepted and decision.completion == 'failed'
    assert validation.debugging.final_state == 'unresolved_after_limit'


def test_ordinary_runtime_verification_keeps_global_failure_semantics(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path, bind=False)
    mutate(tmp_path, activity, 'ordinary modification')
    call(static)
    store.result = runtime_errors(b)
    payload = call(tool)
    assert payload['result']['runtimeDebuggingDifferential'] is None
    guard._observe_result('inspect_runtime_errors', {}, json.dumps(payload))
    assert not validation.debugging.runtime_targets
    assert gate._runtime_completion_evidence()['runtimeStatus'] == 'failed'
    assert gate.review('done').feedback is not None


def test_runtime_identity_survives_message_stack_report_id_and_hash_changes(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    changed = {**a, 'errorMessage': 'Updated explanation', 'componentStack': 'source(90:7)',
               'id': 'new-report-id', 'appUIModelHash': 'b' * 64}
    store.result = runtime_errors(changed, b)
    difference = call(tool)['result']['runtimeDebuggingDifferential']
    assert len(difference['targetRemaining']) == 1
    assert not difference['targetResolved'] and not difference['introducedRuntimeDiagnostics']
    assert difference['targetRemaining'][0]['messageHash'] != difference['unchangedPreexistingRuntimeDiagnostics'][0]['messageHash']
    assert gate.review('done').reason == 'runtime_target_remaining'


def test_target_projection_cannot_waive_composition_or_geometry_obligations(tmp_path):
    validation, activity, gate, static, tool, store, guard, a, b = targeted_runtime_session(tmp_path)
    store.result = runtime_errors(b)
    payload = call(tool)['result']
    assert gate._runtime_completion_evidence()['runtimeStatus'] == 'passed'
    evidence = validation.debugging
    failed_composition = {**payload, 'compositionVerified': False,
                          'compositionChecks': [{'status': 'failed'}]}
    assert evidence.runtime_completion_view(failed_composition, activity.revision)['runtimeStatus'] == 'failed'
    failed_geometry = {**payload, 'verificationTail': {'geometryVerification': {'status': 'failed'}}}
    assert evidence.runtime_completion_view(failed_geometry, activity.revision)['runtimeStatus'] == 'failed'


def test_incomplete_runtime_evidence_cannot_establish_a_baseline(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    initial = runtime_errors(runtime_error())
    initial['summary']['truncated'] = True
    service, _, _ = runtime_service(activity, validation.debugging, initial)
    result = call(create_runtime_diagnostic_tool(service), targetDiagnosticIds=['diagnostic-foo-main'])
    assert result['error']['code'] == 'DEBUGGING_EVIDENCE_INCOMPLETE'
    assert validation.debugging.runtime_baseline is None and not validation.debugging.runtime_targets


def test_runtime_baseline_is_not_captured_after_a_mutation(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    mutate(tmp_path, activity, 'changed before diagnosis')
    service, _, _ = runtime_service(activity, validation.debugging, runtime_errors(runtime_error()))
    result = call(create_runtime_diagnostic_tool(service), targetDiagnosticIds=['diagnostic-foo-main'])
    assert result['error']['code'] == 'DEBUGGING_BASELINE_REQUIRED'
    assert validation.debugging.runtime_baseline is None
