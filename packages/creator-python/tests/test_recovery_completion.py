import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
from agent_ui_creator.domain_tools.recovery_tools import CreatorRecoveryQueries, create_recovery_query_tools
from agent_ui_creator.observability import CreatorRunLogger, CreatorRunTelemetry
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.run_control import CreatorRunControlState
from agent_ui_creator.server import _execute_agent_run
from agent_ui_creator.streaming import CreatorEventBus
from agent_ui_creator.transactions import CreatorTransactionFileInput, CreatorTransactionStore
from agent_ui_creator.validation import CommandExecutionResult


def project(root):
    (root / '.agent-ui').mkdir(exist_ok=True)
    (root / '.agent-ui/project.json').write_text(json.dumps({'mode': 'assistant', 'sourceRoot': 'src/agent-ui'}))


def record(root, run_id, files):
    for path, before, after in files:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if after is None:
            target.unlink(missing_ok=True)
        else:
            target.write_text(after)
    CreatorTransactionStore(root).persist_run(run_id=run_id, mutation_revision=1, validation_revision=None,
        files=[CreatorTransactionFileInput(*file) for file in files])


def session(root):
    project(root)
    activity = CreatorActivityRecorder(root)
    activity.begin('recovery-session')
    control = CreatorRunControlState()
    queries = CreatorRecoveryQueries(root, activity=activity, run_control=control)
    validation = SimpleNamespace(current_result=lambda: None)
    runtime = Mock()
    gate = CreatorDevelopmentCompletionGate(activity=activity, validation=validation, runtime=runtime,
        repair_state=CreatorRepairState(), run_control=control, recovery=queries, verification_mode='static_and_runtime')
    return queries, activity, validation, runtime, gate


def passed(validation, revision, status='passed'):
    validation.current_result = lambda: SimpleNamespace(status=status, revision=revision, checks=[
        SimpleNamespace(command=command, status=status, revision=revision)
        for command in ('pnpm verify:ui', 'pnpm typecheck')])


def test_list_pagination_contains_bounded_scope_and_no_source(tmp_path):
    project(tmp_path)
    record(tmp_path, 'A', [('src/agent-ui/plugins/a/index.ts', 'old source', 'new source')])
    record(tmp_path, 'B', [('src/agent-ui/plugins/b/index.ts', None, 'created source')])
    record(tmp_path, 'C', [('src/agent-ui/app-ui/app-ui.json', '{}', '{"new":true}'),
        ('src/agent-ui/plugins/c/index.ts', 'old', 'new'), ('src/agent-ui/i18n/locale.ts', 'hello', 'hi')])
    queries = CreatorRecoveryQueries(tmp_path)
    page = json.loads(create_recovery_query_tools(queries)[0].invoke({'offset': 0, 'limit': 1}))
    assert [item['runId'] for item in page['transactions']] == ['C']
    summary = page['transactions'][0]
    assert summary['fileCount'] == len(summary['changedPaths']) == 3
    assert summary['changeSummary'] == {'created': 0, 'modified': 3, 'deleted': 0}
    assert summary['scopeHints'] == ['composition', 'plugin_source']
    assert summary['undoable'] is True and summary['conflicts'] == []
    assert 'new source' not in json.dumps(page)
    assert page['hasMore'] is True and page['total'] == 3
    assert queries.list(offset=1, limit=1)['transactions'][0]['runId'] == 'B'
    assert queries.list(offset=2, limit=1)['transactions'][0]['runId'] == 'A'
    assert queries.list(limit=21)['error'] == 'INVALID_PAGINATION'
    assert queries.list(offset=-1)['error'] == 'INVALID_PAGINATION'


def test_summary_or_single_file_does_not_authorize_whole_undo(tmp_path):
    queries, activity, *_ = session(tmp_path)
    files = [('src/agent-ui/app-ui/app-ui.json', '{}', '{"new":true}'),
        ('src/agent-ui/plugins/a/index.ts', 'old', 'new'), ('src/agent-ui/i18n/locale.ts', 'hello', 'hi')]
    record(tmp_path, 'A', files)
    queries.list()
    diff = queries.change('A', files[0][0])
    assert queries.undo('A', diff['transactionId'], [f[0] for f in files])['error'] == 'RECOVERY_SCOPE_NOT_CONFIRMED'
    detail = queries.inspect('A')
    state = queries.evidence.inspected_transactions['A']
    assert state.summary_seen and state.scope_complete and state.conflict_checked
    assert set(state.selected_paths) == {f[0] for f in files}
    assert queries.undo('A', detail['transactionId'], [files[0][0]])['status'] == 'scope_mismatch'
    assert activity.revision == 0


def test_duplicate_guard_is_scoped_and_invalidates_on_files_and_history(tmp_path):
    project(tmp_path)
    files = [('src/agent-ui/plugins/a.ts', 'old', 'new'), ('src/agent-ui/plugins/b.ts', 'old', 'new')]
    record(tmp_path, 'A', files)
    queries = CreatorRecoveryQueries(tmp_path)
    for operation in (queries.list, lambda: queries.inspect('A'), lambda: queries.change('A', files[0][0])):
        assert operation()['status'] == 'available'
        assert operation()['error'] == 'RECOVERY_ALREADY_OBSERVED'
    assert queries.change('A', files[1][0])['status'] == 'available'
    (tmp_path / files[0][0]).write_text('manual edit')
    assert queries.inspect('A')['conflicts'][0]['path'] == files[0][0]
    assert queries.list()['transactions'][0]['undoable'] is False
    record(tmp_path, 'A', [(files[0][0], 'old', 'replacement')])
    assert queries.inspect('A')['fileCount'] == 1
    assert queries.evidence.duplicate_recovery_calls == 3


def test_failed_queries_retry_and_state_resets_between_runs(tmp_path):
    queries, activity, *_ = session(tmp_path)
    assert queries.inspect('A')['status'] == 'evidence_missing'
    record(tmp_path, 'A', [('src/agent-ui/plugins/a.ts', 'old', 'new')])
    assert queries.inspect('A')['status'] == 'available'
    activity.begin('next-run')
    assert queries.inspect('A')['status'] == 'available'
    assert queries.evidence.transaction_details_read == 1
    assert queries.evidence.duplicate_recovery_calls == 0


def test_recovery_requires_current_validation_but_not_runtime(tmp_path):
    queries, activity, validation, runtime, gate = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    detail = queries.inspect('A')
    result = queries.undo('A', detail['transactionId'], [path])
    assert result['completion'] == {'status': 'recovered', 'nextAction': 'validate_current_revision'}
    assert result['alreadyUndone'] is False and result['changedPaths'] == [path]
    assert gate.review('any prose').accepted is False
    passed(validation, activity.revision - 1)
    assert gate.review('完成').accepted is False
    passed(validation, activity.revision)
    decision = gate.review('any prose')
    assert decision.accepted and decision.completion == queries.evidence.final_state == 'recovered'
    runtime.current_result.assert_not_called()
    assert activity.snapshot()['verification']['runtimeStatus'] == 'not-run'
    assert queries.undo('A', detail['transactionId'], [path])['error'] == 'RECOVERY_ALREADY_OBSERVED'
    assert queries.evidence.undo_attempts == 1


def test_already_recovered_requires_before_hash_and_validation(tmp_path):
    queries, activity, validation, runtime, gate = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    CreatorTransactionStore(tmp_path).undo('A')
    detail = queries.inspect('A')
    result = queries.undo('A', detail['transactionId'], [path])
    assert result['alreadyUndone'] and result['changedPaths'] == []
    assert not gate.review('any prose').accepted
    passed(validation, activity.revision)
    assert gate.review('any prose').completion == 'already_recovered'
    (tmp_path / path).write_text('later edit')
    result = queries.undo('A', detail['transactionId'], [path])
    assert result['completion'] == {'status': 'blocked', 'reason': 'recovery_conflict'}
    assert (tmp_path / path).read_text() == 'later edit'


def test_conflict_blocks_without_partial_writes(tmp_path):
    queries, activity, validation, runtime, gate = session(tmp_path)
    files = [('src/agent-ui/plugins/a.ts', 'old A', 'new A'), ('src/agent-ui/plugins/b.ts', 'old B', 'new B')]
    record(tmp_path, 'A', files)
    detail = queries.inspect('A')
    (tmp_path / files[1][0]).write_text('manual B')
    result = queries.undo('A', detail['transactionId'], [f[0] for f in files])
    assert result['completion'] == {'status': 'blocked', 'reason': 'recovery_conflict'}
    assert queries.run_control.blocked
    assert (tmp_path / files[0][0]).read_text() == 'new A'
    assert (tmp_path / files[1][0]).read_text() == 'manual B'
    assert activity.revision == 0
    decision = gate.review('撤销完成')
    assert decision.accepted and decision.completion == 'blocked' and decision.reason == 'recovery_conflict'


def test_missing_target_finishes_as_structured_user_input(tmp_path):
    queries, activity, validation, runtime, gate = session(tmp_path)
    queries.list()
    decision = gate.review('完成')
    assert decision.accepted and decision.completion == 'needs_user_input'
    assert decision.reason == 'missing_recovery_evidence'


def test_failed_validation_stops_and_later_edits_are_preserved(tmp_path):
    queries, activity, validation, runtime, gate = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    detail = queries.inspect('A')
    queries.undo('A', detail['transactionId'], [path])
    passed(validation, activity.revision, 'failed')
    decision = gate.review('恢复成功')
    assert decision.accepted and decision.completion == 'blocked' and decision.reason == 'recovery_validation_failed'
    passed(validation, activity.revision)
    (tmp_path / path).write_text('later edit')
    assert gate.review('完成').reason == 'recovery_conflict'
    assert (tmp_path / path).read_text() == 'later edit'


class RecoveryModel(FakeMessagesListChatModel):
    model_calls: int = 0

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.model_calls += 1
        assert self.model_calls <= len(self.responses), "Unexpected extra model call after recovery completion"
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    def bind_tools(self, tools, **kwargs):
        return self


def call(name, args, call_id):
    return AIMessage(content='', tool_calls=[{'name': name, 'args': args, 'id': call_id}])


class PassingRunner:
    async def execute_known_command(self, command):
        return CommandExecutionResult('', 0, False)


@pytest.mark.parametrize('include_validation', [True, False])
def test_real_agent_recovery_converges_and_logs_completion(tmp_path, include_validation):
    project(tmp_path)
    for run_id in ('A', 'B', 'C'):
        record(tmp_path, run_id, [(f'src/agent-ui/plugins/{run_id}.ts', 'old', 'new')])
    path = 'src/agent-ui/plugins/C.ts'
    # Scripted model verifies actual tool/runtime wiring, not remote-model behavior.
    detail = CreatorRecoveryQueries(tmp_path).inspect('C')
    responses = [call('inspect_creator_transactions', {}, 'list'),
        call('inspect_creator_transaction', {'run_id': 'C'}, 'detail'),
        call('undo_creator_run', {'run_id': 'C', 'transaction_id': detail['transactionId'], 'requested_paths': [path]}, 'undo')]
    if not include_validation:
        responses.append(AIMessage(content='Undo completed.'))
    responses += [call('validate_creator_changes', {}, 'validate'), AIMessage(content='完成')]
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id='recovery-real', agent_mode='domain-write')
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin('recovery-real')
    telemetry = CreatorRunTelemetry(activity=activity)
    client = SimpleNamespace(metrics=ProjectControlMetrics())
    agent = create_domain_write_creator_agent(model=RecoveryModel(responses=responses), workspace=tmp_path,
        activity=activity, project_control=client, telemetry=telemetry, validation_runner=PassingRunner(),
        automatic_completion_repair=True, verification_mode='static_and_runtime')
    execution = asyncio.run(_execute_agent_run(agent.run('撤销刚刚修改 C'), activity=activity,
        logger=logger, telemetry=telemetry, event_bus=CreatorEventBus()))
    assert execution.result.completion == 'recovered'
    assert [item.name for item in execution.result.activities] == [
        'inspect_creator_transactions', 'inspect_creator_transaction', 'undo_creator_run', 'validate_creator_changes']
    assert client.metrics.requests == 0
    assert (tmp_path / path).read_text() == 'old'
    entries = [json.loads(line) for line in logger.path.read_text().splitlines()]
    finished = next(item['data'] for item in entries if item['type'] == 'run_finished')
    assert finished['status'] == 'recovered'
    assert finished['recoveryMetrics'] == {'transactionsInspected': 1, 'transactionDetailsRead': 1,
        'transactionChangesRead': 0, 'undoAttempts': 1, 'duplicateRecoveryCalls': 0, 'finalState': 'recovered', 'reason': None}


def test_simple_panel_change_keeps_composition_path(tmp_path):
    from test_domain_write_grounding import GroundingClient
    from agent_ui_creator.files import read_creator_file_state

    project(tmp_path)
    source = tmp_path / 'src/agent-ui'
    source.mkdir(parents=True)
    app_path = 'src/agent-ui/app-ui/app-ui.json'
    registry_path = 'src/agent-ui/plugins/registry.generated.ts'

    class PanelClient(GroundingClient):
        async def request_app_ui_model_mutation(self, input):
            assert input['appUIModelHash'] == self.hash()
            assert input['operations'] == [{'type': 'remove_layout_node', 'nodeRef': 'l2'}]
            self.mutations.append(input)
            self.metrics.record('mutate_app_ui_model', 1, False)
            before_hash = self.hash()
            model = self.model()
            model['root']['children'].pop()
            (self.root / 'app-ui/app-ui.json').write_text(json.dumps(model) + '\n')
            return {'transactionId': 'hide-right-panel', 'changed': True, 'changedPaths': [app_path],
                'mutationFootprint': {'appUIModel': True, 'pluginConfig': False, 'generatedRegistry': False,
                    'sourceFiles': False, 'runtimeFiles': False, 'dependencies': False, 'workspaceInfrastructure': False},
                'appUIModel': {'beforeHash': before_hash, 'afterHash': self.hash()},
                'snapshotToken': {'appUIModelHash': self.hash(),
                    'capabilityCatalogSourceHash': read_creator_file_state(tmp_path, registry_path).hash}}

    client = PanelClient(source)
    telemetry = CreatorRunTelemetry()
    model = RecoveryModel(responses=[call('inspect_ui_project', {'view': 'composition'}, 'inspect'),
        call('mutate_app_ui_model', {'operations': [{'type': 'remove_layout_node', 'nodeRef': 'l2'}]}, 'hide'),
        call('validate_creator_changes', {}, 'validate'), AIMessage(content='已隐藏右侧面板')])
    agent = create_domain_write_creator_agent(model=model, workspace=tmp_path, project_control=client,
        telemetry=telemetry, validation_runner=PassingRunner(), verification_mode='static_only',
        automatic_completion_repair=True)
    agent.activity.begin('simple-panel')
    result = asyncio.run(agent.run('隐藏右侧面板'))
    assert result.completion == 'success'
    assert [item.name for item in result.activities] == ['inspect_ui_project', 'mutate_app_ui_model', 'validate_creator_changes']
    assert telemetry.recovery.evidence.status == 'inactive'
    assert telemetry.recovery_metrics()['undoAttempts'] == 0
    assert len(client.model()['root']['children']) == 1


@pytest.mark.parametrize('scenario', ['missing', 'conflict'])
def test_real_agent_recovery_terminal_status_never_requires_reply_format(tmp_path, scenario):
    project(tmp_path)
    client = SimpleNamespace(metrics=ProjectControlMetrics())
    responses = [call('inspect_creator_transactions', {}, 'list')]
    path = 'src/agent-ui/plugins/A.ts'
    if scenario == 'conflict':
        record(tmp_path, 'A', [(path, 'old', 'new')])
        detail = CreatorRecoveryQueries(tmp_path).inspect('A')
        (tmp_path / path).write_text('later manual edit')
        responses += [call('inspect_creator_transaction', {'run_id': 'A'}, 'detail'),
            call('undo_creator_run', {'run_id': 'A', 'transaction_id': detail['transactionId'], 'requested_paths': [path]}, 'undo')]
    else:
        responses.append(AIMessage(content='我没有修改工程'))
    telemetry = CreatorRunTelemetry()
    agent = create_domain_write_creator_agent(model=RecoveryModel(responses=responses), workspace=tmp_path,
        project_control=client, telemetry=telemetry, automatic_completion_repair=True,
        validation_runner=PassingRunner())
    agent.activity.begin('terminal-' + scenario)
    result = asyncio.run(agent.run('恢复我的历史修改'))
    assert result.completion == ('blocked' if scenario == 'conflict' else 'needs_user_input')
    assert result.completion_reason == ('recovery_conflict' if scenario == 'conflict' else 'missing_recovery_evidence')
    assert client.metrics.requests == 0
    assert not agent.activity.snapshot()['files']
    if scenario == 'conflict':
        assert (tmp_path / path).read_text() == 'later manual edit'


@pytest.mark.parametrize('flag', ['summary_seen', 'scope_complete', 'conflict_checked'])
def test_each_inspection_precondition_is_required(tmp_path, flag):
    queries, activity, *_ = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    detail = queries.inspect('A')
    setattr(queries.evidence.inspected_transactions['A'], flag, False)
    assert queries.undo('A', detail['transactionId'], [path])['error'] == 'RECOVERY_SCOPE_NOT_CONFIRMED'
    assert activity.revision == 0 and (tmp_path / path).read_text() == 'new'


def test_large_transaction_summary_cannot_hide_partial_scope(tmp_path):
    queries, activity, *_ = session(tmp_path)
    files = [(f'src/agent-ui/plugins/file-{index}.ts', 'old', 'new') for index in range(21)]
    record(tmp_path, 'A', files)
    summary = queries.list()['transactions'][0]
    assert summary['fileCount'] == 21 and len(summary['changedPaths']) == 20 and summary['pathsTruncated']
    first = queries.inspect('A')
    assert first['scopeComplete'] is False
    assert queries.undo('A', first['transactionId'], [f[0] for f in files])['error'] == 'RECOVERY_SCOPE_NOT_CONFIRMED'
    second = queries.inspect('A', page=2)
    assert second['scopeComplete'] is True
    assert queries.undo('A', second['transactionId'], [f[0] for f in files])['status'] == 'undone'


def test_mixed_authoring_cannot_use_recovery_completion_boundary(tmp_path):
    queries, activity, *_ = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    # Even a separate mutation to the same path must retain the development gate.
    activity.capture_before(path)
    activity.touch(path)
    detail = queries.inspect('A')
    queries.undo('A', detail['transactionId'], [path])
    assert queries.is_recovery_only() is False


def test_concurrent_duplicate_undo_executes_once(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    queries, activity, *_ = session(tmp_path)
    path = 'src/agent-ui/plugins/a.ts'
    record(tmp_path, 'A', [(path, 'old', 'new')])
    detail = queries.inspect('A')
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: queries.undo('A', detail['transactionId'], [path]), range(2)))
    assert {result['status'] for result in results} == {'undone', 'already_observed'}
    assert queries.evidence.undo_attempts == queries.evidence.duplicate_recovery_calls == 1
    assert activity.revision == 1 and (tmp_path / path).read_text() == 'old'
