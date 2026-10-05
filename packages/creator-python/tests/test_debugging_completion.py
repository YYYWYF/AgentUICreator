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
from agent_ui_creator.validation import CommandExecutionResult, CreatorValidationService, create_validation_tool, create_static_diagnostic_tool


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


def bind_static(validation, tool, targets):
    result = call(tool)
    validation.bind_debugging_targets(targets)
    return result


def select_runtime(validation, service, tool, diagnostic_id):
    payload = call(tool)
    record = next(item for item in payload["result"]["currentErrors"] if item["id"] == diagnostic_id)
    selected = call(selection_tools(validation, service)[0], target_id=record["debuggingTargetId"])
    if not selected["ok"]:
        return selected
    payload["result"]["targetDiagnosticCount"] = len(validation.debugging.runtime_targets)
    return payload


def mutate(root, activity, version):
    path = root / FOO
    path.parent.mkdir(parents=True, exist_ok=True)
    activity.capture_before_content(FOO, path.read_text() if path.exists() else None)
    path.write_text(version)
    activity.touch(FOO)


def test_targeted_existing_error_requires_resolution_not_just_delta_pass(tmp_path):
    baseline = ts() + '\n' + ts(BAR)
    validation, activity, gate, tool = session(tmp_path, baseline, '', baseline, '', ts(BAR))
    first = bind_static(validation, tool, [TARGET])
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
    bind_static(validation, tool, [TARGET])
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
    bind_static(validation, tool, [TARGET])
    decision = gate.review('当前诊断已消失')
    assert decision.accepted and decision.completion == 'already_satisfied'
    assert validation.debugging.final_state == 'unchanged_preexisting'
    assert activity.revision == 0


def test_duplicate_validation_reuses_successful_evidence_and_invalidates(tmp_path):
    validation, activity, _, tool = session(tmp_path, ts(), '', ts(), '', ts(), '', ts())
    bind_static(validation, tool, [TARGET])
    count = len(validation.runner.calls)
    repeated = bind_static(validation, tool, [TARGET])
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
    bound = select_runtime(validation, service, runtime, "diagnostic-foo")
    assert bound['ok'] and bound['result']['targetDiagnosticCount'] == 1
    assert FOO in bound['result']['currentErrors'][0]['componentStack']
    repeated = select_runtime(validation, service, runtime, "diagnostic-foo")
    assert repeated['result']['reusePreviousResult'] is True and client.verifications == 1
    store.result = runtime_result(message='Updated error')
    assert service.current_result() is None  # A new report invalidates old evidence.
    assert 'reusePreviousResult' not in select_runtime(validation, service, runtime, "diagnostic-foo")['result']
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
    call(create_runtime_diagnostic_tool(service))
    result = call(selection_tools(validation, service)[0], target_id="runtime:" + validation.debugging.runtime_key(runtime_result()["currentErrors"][0]))
    assert result['error']['code'] == 'DEBUGGING_TARGET_NOT_OBSERVED'
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
    bind_static(validation, tool, [TARGET])
    decision = gate.review('fixed')
    assert decision.accepted and decision.completion == 'blocked'
    assert validation.debugging.reason == 'runtime_failure_outside_scope'


def test_current_diagnostic_convergence_and_ordinary_change_is_unaffected(tmp_path):
    validation, _, _, tool = session(tmp_path, ts(), '', ts())
    runtime = SimpleNamespace(current_result=lambda: None)
    middleware = DebuggingEvidenceConvergenceMiddleware(validation, runtime)
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content='hide right panel')], tools=[])
    assert middleware._request(request) is request
    bind_static(validation, tool, [TARGET])
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


def test_ordinary_delta_does_not_inject_debugging(tmp_path):
    validation, _, _, tool = session(tmp_path, ts(BAR), '', ts(BAR))
    middleware = DebuggingEvidenceConvergenceMiddleware(validation, SimpleNamespace(current_result=lambda: None))
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content='hide right panel')], tools=[])
    payload = call(tool)
    assert '"debuggingTargetId":' not in json.dumps(payload)
    assert payload['result']['diagnosticIdentities'][0]['message'] == 'Wrong argument'
    assert middleware._request(request) is request
    assert not validation.debugging.diagnostic_scope_pending
    assert not validation.debugging.active
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    assert guard._debugging_selection_guard({"args": {"file_path": FOO}}, "edit_file") is None


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
    if bind:
        select_runtime(validation, service, tool, a["id"])
    else:
        call(tool)
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
    select_runtime(validation, gate.runtime, tool, a["id"])
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
    result = select_runtime(validation, service, create_runtime_diagnostic_tool(service), "diagnostic-foo-main")
    assert result['error']['code'] == 'DEBUGGING_EVIDENCE_INCOMPLETE'
    assert validation.debugging.runtime_baseline is None and not validation.debugging.runtime_targets


def test_runtime_baseline_is_not_captured_after_a_mutation(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    mutate(tmp_path, activity, 'changed before diagnosis')
    service, _, _ = runtime_service(activity, validation.debugging, runtime_errors(runtime_error()))
    payload = call(create_runtime_diagnostic_tool(service))
    assert payload['result']['currentErrors'][0]['pluginId'] == 'foo'
    assert not validation.debugging.observed_targets
    assert not validation.debugging.diagnostic_scope_pending
    assert validation.debugging.runtime_baseline is None


def selection_tools(validation, runtime=None):
    from agent_ui_creator.domain_tools.debugging_tools import create_debugging_target_tools
    return create_debugging_target_tools(
        validation, runtime or SimpleNamespace(current_result=lambda: None),
    )


def test_static_string_target_selection_resolves_requested_error(tmp_path):
    validation, activity, gate, static = session(tmp_path, ts(), '', ts(), '', '')
    observed = call(create_static_diagnostic_tool(validation))
    target_id = observed['result']['diagnosticIdentities'][0]['debuggingTargetId']
    select, _ = selection_tools(validation)
    assert set(select.args_schema.model_json_schema()['properties']) == {'target_id'}
    assert validation.debugging.diagnostic_scope_pending
    assert target_id in validation.debugging.observed_targets
    result = call(select, target_id=target_id)
    assert result['result']['owner'] == {'path': FOO}
    assert validation.debugging.targets and not validation.debugging.diagnostic_scope_pending
    mutate(tmp_path, activity, 'fixed')
    call(static)
    assert gate.review('fixed').completion == 'success'
    assert validation.debugging.final_state == 'resolved'


def test_unobserved_and_previous_run_ids_are_rejected(tmp_path):
    validation, activity, _, static = session(tmp_path, ts(), '', ts())
    target_id = call(create_static_diagnostic_tool(validation))['result']['diagnosticIdentities'][0]['debuggingTargetId']
    select, _ = selection_tools(validation)
    assert call(select, target_id='ts:invented')['error']['code'] == 'DEBUGGING_TARGET_NOT_OBSERVED'
    activity.begin('next-run')
    assert call(select, target_id=target_id)['error']['code'] == 'DEBUGGING_TARGET_NOT_OBSERVED'
    assert not validation.debugging.targets


def test_static_mutation_requires_target_without_touching_files(tmp_path):
    validation, activity, _, static = session(tmp_path, ts(), '', ts())
    call(create_static_diagnostic_tool(validation))
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    for name, args in (
        ('edit_file', {'file_path': FOO}),
        ('edit_file_from_read', {'file_path': FOO}),
        ('mutate_ui_plugin_source', {'pluginId': 'foo'}),
        ('mutate_app_ui_model', {'operations': []}),
    ):
        request = SimpleNamespace(tool_call={'id': name, 'name': name, 'args': args})
        handler = Mock()
        result = guard.wrap_tool_call(request, handler)
        assert json.loads(result.content)['error']['code'] == 'DEBUGGING_TARGET_REQUIRED'
        handler.assert_not_called()
    assert activity.revision == 0 and not (tmp_path / FOO).exists()


def test_runtime_string_target_baseline_and_differential(tmp_path):
    validation, activity, gate, static, runtime, store, guard, a, b = targeted_runtime_session(tmp_path, bind=False)
    select, _ = selection_tools(validation, gate.runtime)
    target_id = call(runtime)['result']['currentErrors'][0]['debuggingTargetId']
    assert validation.debugging.diagnostic_scope_pending
    assert call(select, target_id=target_id)['result']['status'] == 'selected'
    assert len(validation.debugging.runtime_baseline) == 2
    mutate(tmp_path, activity, 'fixed A')
    call(static)
    store.result = runtime_errors(b)
    call(runtime)
    difference = validation.debugging.runtime_differential(gate.runtime.current_result(), activity.revision)
    assert not validation.debugging.diagnostic_scope_pending
    assert 'runtime:' + validation.debugging.runtime_key(b) in validation.debugging.observed_targets
    assert difference['targetResolved'][0]['pluginId'] == 'foo'
    assert difference['unchangedPreexistingRuntimeDiagnostics'][0]['pluginId'] == 'bar'
    assert not difference['introducedRuntimeDiagnostics']
    assert gate.review('fixed A').completion == 'success'


def test_runtime_pending_ambiguity_and_owner_constraint(tmp_path):
    validation, activity, gate, _, runtime, _, guard, _, _ = targeted_runtime_session(tmp_path, bind=False)
    handler = Mock()
    request = SimpleNamespace(tool_call={'id': 'edit', 'name': 'edit_file',
                                        'args': {'file_path': FOO}})
    assert json.loads(guard.wrap_tool_call(request, handler).content)['error']['code'] == 'DEBUGGING_TARGET_REQUIRED'
    handler.assert_not_called()
    assert activity.revision == 0
    guard._debugging_selection_guard({'id': 'ask', 'args': {}}, 'ask_user_question')
    assert validation.debugging.ambiguous_target_stops == 1
    select, _ = selection_tools(validation, gate.runtime)
    target_id = call(runtime)['result']['currentErrors'][0]['debuggingTargetId']
    call(select, target_id=target_id)
    request.tool_call['args']['file_path'] = BAR
    assert json.loads(guard.wrap_tool_call(request, handler).content)['error']['code'] == 'DEBUGGING_TARGET_OWNER_REQUIRED'
    handler.assert_not_called()


def test_runtime_selection_after_mutation_cannot_invent_baseline(tmp_path):
    validation, activity, gate, _, runtime, _, _, _, _ = targeted_runtime_session(tmp_path, bind=False)
    target_id = call(runtime)['result']['currentErrors'][0]['debuggingTargetId']
    mutate(tmp_path, activity, 'changed')
    select, _ = selection_tools(validation, gate.runtime)
    assert call(select, target_id=target_id)['error']['code'] == 'DEBUGGING_BASELINE_REQUIRED'
    assert validation.debugging.runtime_baseline is None


def test_all_current_runtime_uses_no_array_and_preserves_scope_guard(tmp_path):
    validation, _, gate, _, _, _, guard, _, _ = targeted_runtime_session(tmp_path, bind=False)
    _, select_all = selection_tools(validation, gate.runtime)
    assert not select_all.args_schema.model_json_schema()['properties']
    assert call(select_all)['result']['targetCount'] == 2
    assert len(validation.debugging.runtime_targets) == 2
    guard._preserve_scope({'source': 'test'}, workspace_integrity=False)
    request = SimpleNamespace(tool_call={'id': 'bar', 'name': 'edit_file',
                                        'args': {'file_path': BAR}})
    handler = Mock()
    assert json.loads(guard.wrap_tool_call(request, handler).content)['error']['code'] == 'CROSS_RESOURCE_REPAIR_PROHIBITED'
    handler.assert_not_called()


def test_string_target_introduced_runtime_error_cannot_finish_success(tmp_path):
    validation, activity, gate, static, runtime, store, _, _, b = targeted_runtime_session(tmp_path, bind=False)
    select, _ = selection_tools(validation, gate.runtime)
    call(select, target_id=call(runtime)['result']['currentErrors'][0]['debuggingTargetId'])
    mutate(tmp_path, activity, 'fixed A but regressed')
    call(static)
    store.result = runtime_errors(b, runtime_error('foo', 'new-instance'))
    call(runtime)
    difference = validation.debugging.runtime_differential(gate.runtime.current_result(), activity.revision)
    assert len(difference['targetResolved']) == 1
    assert len(difference['unchangedPreexistingRuntimeDiagnostics']) == 1
    assert len(difference['introducedRuntimeDiagnostics']) == 1
    assert gate.review('done').completion != 'success'


def test_composition_without_observed_diagnostics_needs_no_selection(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    handler = Mock(return_value='{"ok": false}')
    request = SimpleNamespace(tool_call={'id': 'composition', 'name': 'mutate_app_ui_model',
                                        'args': {'operations': []}})
    guard.wrap_tool_call(request, handler)
    handler.assert_called_once()
    assert validation.debugging.target_selection_calls == 0
    assert not validation.debugging.diagnostic_scope_pending


def test_target_ids_ignore_evidence_only_fields():
    from agent_ui_creator.debugging import DebuggingEvidence
    from agent_ui_creator.validation.diagnostics import TypeScriptDiagnostic
    first = TypeScriptDiagnostic(FOO, 'TS2322', 'Wrong type', 1, 2)
    moved = TypeScriptDiagnostic(FOO, 'TS2322', 'Wrong type', 90, 8)
    assert DebuggingEvidence.static_key(first) == DebuggingEvidence.static_key(moved)
    assert 'debuggingTargetId' not in first.to_dict()
    a = runtime_error()
    b = {**a, 'id': 'new-report', 'errorMessage': 'different message',
         'stack': 'new stack', 'timestamp': 'later', 'appUIModelHash': 'b' * 64}
    assert DebuggingEvidence.runtime_key(a) == DebuggingEvidence.runtime_key(b)


def test_truncated_runtime_cannot_bind_baseline(tmp_path):
    validation, _, gate, _, runtime, store, _, _, _ = targeted_runtime_session(tmp_path, bind=False)
    store.result['summary']['truncated'] = True
    target_id = call(runtime)['result']['currentErrors'][0]['debuggingTargetId']
    select, _ = selection_tools(validation, gate.runtime)
    assert call(select, target_id=target_id)['error']['code'] == 'DEBUGGING_EVIDENCE_INCOMPLETE'
    assert validation.debugging.runtime_baseline is None
    assert not validation.debugging.runtime_targets


def test_async_mutation_boundary_also_requires_target(tmp_path):
    validation, _, _, static = session(tmp_path, ts(), '', ts())
    call(create_static_diagnostic_tool(validation))
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    request = SimpleNamespace(tool_call={'id': 'edit', 'name': 'edit_file',
                                        'args': {'file_path': FOO}})
    async def handler(_):
        raise AssertionError('pending target must not execute mutation')
    result = asyncio.run(guard.awrap_tool_call(request, handler))
    assert json.loads(result.content)['error']['code'] == 'DEBUGGING_TARGET_REQUIRED'


def test_model_facing_debugging_schemas_hide_legacy_complex_arguments(tmp_path):
    validation, activity, _, static = session(tmp_path)
    service, _, _ = runtime_service(activity, validation.debugging, runtime_result())
    select, select_all = selection_tools(validation, service)
    expected = [(static, {'mode'}), (create_runtime_diagnostic_tool(service), {'includeStale'}),
                (select, {'target_id'}), (select_all, set()),
                (create_static_diagnostic_tool(validation), set())]
    for tool, properties in expected:
        assert set(tool.args_schema.model_json_schema()['properties']) == properties


def test_old_static_warning_does_not_block_current_task_runtime_tail_repair(tmp_path):
    validation, activity, _, tool = session(tmp_path, ts(BAR), '', ts(BAR))
    mutate(tmp_path, activity, 'ordinary button change')
    assert call(tool)['result']['status'] == 'passed'
    assert validation.current_result().workspace_warning['diagnosticCount'] == 1
    service, _, _ = runtime_service(activity, validation.debugging, runtime_result())
    # The verification tail reads evidence directly; only discovery tools enter
    # pending target selection. Old B must not turn the current task into Debugging.
    asyncio.run(service.inspect_host())
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    assert not validation.debugging.diagnostic_scope_pending
    assert not validation.debugging.active
    assert guard._debugging_selection_guard({'args': {'file_path': FOO}}, 'edit_file') is None


def test_runtime_non_plugin_targets_use_semantic_layers_and_resources(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    width = {**runtime_error(kind='plugin-width-incompatible'),
             'target': {'type': 'layout_slot', 'slotRef': 'slot:main'}}
    event = {'id': 'unknown-event', 'kind': 'application-event-unknown',
             'eventName': 'app.progress', 'errorMessage': 'Unknown event'}
    gate = {**runtime_error(kind='application-gate'),
            'errorMessage': 'Missing service:app-session'}
    for record, layer, resource, tool_name, args in (
        (width, 'composition', 'plugin-instance:foo-main', 'mutate_app_ui_model',
         {'operations': [{'type': 'set_plugin_enabled', 'instanceId': 'foo-main', 'enabled': True}]}),
        (event, 'agent_integration', 'agent-contract:agent-events', 'edit_file',
         {'file_path': 'agent-contract/agent-events.ts'}),
        (gate, 'runtime_capability', 'service:app-session', 'mutate_ui_service_contract',
         {'serviceName': 'app-session'}),
    ):
        validation.debugging.reset(activity.run_id)
        service, _, _ = runtime_service(activity, validation.debugging, runtime_errors(record))
        runtime = create_runtime_diagnostic_tool(service)
        target_id = call(runtime)['result']['currentErrors'][0]['debuggingTargetId']
        selected = call(selection_tools(validation, service)[0], target_id=target_id)['result']
        assert selected['repairLayer'] == layer
        assert resource in selected['repairResources']
        guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
        guard.debugging = validation.debugging
        assert guard._debugging_selection_guard({'args': args}, tool_name) is None
        assert guard._debugging_selection_guard({'args': {'file_path': BAR}}, 'edit_file') is not None


def test_gate_missing_owner_evidence_allows_targeted_service_inspection(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    record = {**runtime_error(kind='application-gate'), 'errorMessage': 'Service app-session unavailable'}
    service, _, _ = runtime_service(activity, validation.debugging, runtime_errors(record))
    target_id = call(create_runtime_diagnostic_tool(service))['result']['currentErrors'][0]['debuggingTargetId']
    call(selection_tools(validation, service)[0], target_id=target_id)
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    args = {'serviceName': 'app-session'}
    blocked = guard._debugging_selection_guard({'args': args}, 'mutate_ui_service_contract')
    assert json.loads(blocked.content)['error']['code'] == 'DEBUGGING_OWNER_EVIDENCE_REQUIRED'
    assert guard._debugging_selection_guard({'args': {}}, 'inspect_ui_services') is None
    guard._observe_result('inspect_ui_services', {}, json.dumps({'ok': True, 'result': {'services': [
        {'name': 'unrelated', 'providers': [{'pluginId': 'foo'}]},
        {'name': 'app-session', 'providers': [{'pluginId': 'foo'}]},
    ]}}))
    target = validation.debugging.observed_targets[target_id]
    assert target['repairResources'] == ['service:app-session']
    assert guard._debugging_selection_guard({'args': args}, 'mutate_ui_service_contract') is None


def test_undeclared_subscription_repairs_only_consuming_manifest(tmp_path):
    validation, activity, _, _ = session(tmp_path)
    record = {**runtime_error(kind='plugin-event-undeclared-subscription'), 'eventName': 'app.progress'}
    service, _, _ = runtime_service(activity, validation.debugging, runtime_errors(record))
    target_id = call(create_runtime_diagnostic_tool(service))['result']['currentErrors'][0]['debuggingTargetId']
    call(selection_tools(validation, service)[0], target_id=target_id)
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = validation.debugging
    assert guard._debugging_selection_guard({'args': {'file_path': 'plugins/foo/manifest.json'}}, 'edit_file') is None
    assert guard._debugging_selection_guard({'args': {'file_path': FOO}}, 'edit_file') is not None
    assert guard._debugging_selection_guard({'args': {'file_path': 'plugins/bar/manifest.json'}}, 'edit_file') is not None


def test_ordinary_post_mutation_runtime_error_allows_scoped_repair(tmp_path):
    scope = ChangeScopeMetrics(taskChangeLayers=['plugin_behavior'], scopeResources=['plugin:foo'])
    validation, activity, gate, static = session(tmp_path, '', '', '', '', '',
        mode='static_and_runtime', scope=scope)
    mutate(tmp_path, activity, 'ordinary Plugin A modification')
    assert call(static)['result']['status'] == 'passed'
    service, store, _ = runtime_service(activity, validation.debugging,
        runtime_errors(runtime_error()), validation.repair_state)
    gate.runtime = service
    runtime = create_runtime_diagnostic_tool(service)
    payload = call(runtime)
    assert payload['result']['runtimeStatus'] == 'failed'
    assert payload['result']['currentErrors'][0]['pluginId'] == 'foo'
    assert '"debuggingTargetId":' not in json.dumps(payload)
    assert 'select_debugging_target' not in payload['result']['debuggingGuidance']
    assert payload['result']['runtimeDebuggingDifferential'] is None
    assert not validation.debugging.observed_targets
    assert not validation.debugging.runtime_targets
    assert validation.debugging.runtime_baseline is None
    assert not validation.debugging.diagnostic_scope_pending

    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path), run_control=CreatorRunControlState())
    guard.metrics = scope
    guard.debugging = validation.debugging
    guard._observe_result('inspect_runtime_errors', {}, json.dumps(payload))
    assert not guard.run_control.blocked
    request = SimpleNamespace(tool_call={'id': 'repair', 'name': 'edit_file_from_read',
                                        'args': {'file_path': FOO}})
    def repair(_):
        mutate(tmp_path, activity, 'repaired Plugin A')
        return '{"ok": true}'
    handler = Mock(side_effect=repair)
    guard.wrap_tool_call(request, handler)
    handler.assert_called_once()
    assert activity.revision == 2
    assert call(static)['result']['status'] == 'passed'
    store.result = runtime_errors()
    assert call(runtime)['result']['runtimeStatus'] == 'passed'
    assert gate.review('repaired').completion == 'success'
    assert validation.debugging.target_selection_calls == 0


def test_static_discovery_enriches_same_validation_diagnostic_with_selectable_id(tmp_path):
    validation, _, _, static = session(tmp_path, ts(BAR), '', ts(BAR))
    ordinary = call(static)
    assert '"debuggingTargetId":' not in json.dumps(ordinary)
    assert not validation.debugging.diagnostic_scope_pending
    discovered = call(create_static_diagnostic_tool(validation))
    diagnostic = discovered['result']['diagnosticIdentities'][0]
    assert diagnostic['path'] == ordinary['result']['diagnosticIdentities'][0]['path']
    assert validation.debugging.diagnostic_scope_pending
    assert call(selection_tools(validation)[0], target_id=diagnostic['debuggingTargetId'])['ok']
