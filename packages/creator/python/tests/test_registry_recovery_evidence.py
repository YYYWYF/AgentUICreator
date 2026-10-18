import json
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.activity.recovery import recover_registry_evidence
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.validation.attribution import _attribution_context


def prior(root):
    (root / '.agent-ui').mkdir()
    (root / '.agent-ui/project.json').write_text(json.dumps({'mode':'platform','sourceRoot':'src/agent-ui'}))
    logger = CreatorRunLogger(root)
    logger.begin(run_id='old', thread_id='same')
    activity = CreatorActivityRecorder(root, logger=logger)
    activity.begin('old')
    path = 'src/agent-ui/plugins/example/manifest.json'
    target = root / path
    target.parent.mkdir(parents=True)
    activity.capture_before_content(path, None)
    target.write_text('{"id":"example"}')
    activity.touch(path)
    activity.finish()
    logger.finish('error', error=RuntimeError('interrupted'))
    return path


def current(root, thread='same'):
    logger = CreatorRunLogger(root)
    logger.begin(run_id='new', thread_id=thread)
    activity = CreatorActivityRecorder(root, logger=logger)
    activity.begin('new')
    return activity


def test_same_thread_and_whole_receipt_hash_are_required(tmp_path):
    path = prior(tmp_path)
    activity = current(tmp_path)
    assert recover_registry_evidence(activity) == (path,)
    assert activity.mutation_paths == ()
    assert recover_registry_evidence(current(tmp_path, 'other')) == ()
    (tmp_path / path).write_text('manual change')
    assert recover_registry_evidence(activity) == ()


def test_recovery_is_attribution_not_a_new_write_or_receipt(tmp_path):
    path = prior(tmp_path)
    activity = current(tmp_path)
    activity.recovered_paths = recover_registry_evidence(activity)
    assert path in _attribution_context(activity, None).changed_paths
    assert activity.snapshot()['files'] == []
    assert activity.mutation_paths == ()


def test_undone_transaction_does_not_supply_evidence(tmp_path):
    path = prior(tmp_path)
    activity = current(tmp_path)
    activity.transactions.undo('old')
    assert not (tmp_path / path).exists()
    assert recover_registry_evidence(activity) == ()


def test_empty_exception_still_logs_type_and_first_cancel_source(tmp_path):
    import asyncio
    from agent_ui_creator.streaming.event_bus import CreatorEventBus
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id='cancelled', thread_id='thread')
    bus = CreatorEventBus(event_sink=logger.record)
    bus.request_cancel('response_stream_cancelled')
    bus.request_cancel('response_stream_finalized')
    logger.finish('error', error=asyncio.CancelledError())
    events = [json.loads(line) for line in logger.path.read_text().splitlines()]
    assert bus.cancel_source == 'response_stream_cancelled'
    assert events[-1]['data']['errorType'] == 'CancelledError'
    assert events[-1]['data']['error'] == ''
    assert [x['data']['source'] for x in events if x['type']=='run_cancel_requested'] == ['response_stream_cancelled']


def test_registry_sync_recovers_prior_request_once_without_rewriting_source(tmp_path):
    import asyncio
    from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
    from agent_ui_creator.validation import CreatorValidationService
    path = prior(tmp_path)
    activity = current(tmp_path)
    registry = tmp_path / 'src/agent-ui/plugins/registry.generated.ts'
    registry.write_text('old')

    class Operator:
        calls = 0
        async def synchronize_plugin_registry(self, *, expected_source_hash):
            self.calls += 1
            registry.write_text('generated')
            return {'changed':True, 'path':'src/agent-ui/plugins/registry.generated.ts'}

    operator = Operator()
    service = CreatorValidationService(project_root=tmp_path, activity=activity,
        operator=operator, mutation_coordinator=ProjectMutationCoordinator())
    async def run():
        await service._synchronize_plugin_registry()
        await service._synchronize_plugin_registry()
    asyncio.run(run())
    assert operator.calls == 1
    assert activity.mutation_paths == ('src/agent-ui/plugins/registry.generated.ts',)
    assert path in activity.recovered_paths
    assert (tmp_path / path).read_text() == '{"id":"example"}'
