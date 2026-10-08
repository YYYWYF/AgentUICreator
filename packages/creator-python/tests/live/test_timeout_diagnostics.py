"""Check diagnostic capture without contacting a model provider."""
import asyncio
import json
from types import SimpleNamespace
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import HumanMessage
from timeout_diagnostics import DiagnosticModelTrace, DiagnosticLogger
from analyze_timeout_diagnostics import union


def test_callback_lifecycle_records_volume_without_content():
    trace = DiagnosticModelTrace()
    private_text = 'private-request-正文'
    asyncio.run(FakeListChatModel(responses=['private-response'], callbacks=[trace]).ainvoke([HumanMessage(content=private_text)]))
    captured = trace.snapshot(0)
    assert len(captured) == 1 and captured[0]['status'] == 'completed'
    assert captured[0]['callbackMessageChars'] == len(private_text)
    assert captured[0]['durationMs'] >= 0
    assert private_text not in json.dumps(captured)
    assert 'private-response' not in json.dumps(captured)


def test_cancelled_callback_and_utf8_result_survive_snapshot(tmp_path):
    trace = DiagnosticModelTrace()
    trace.on_chat_model_start({}, [[HumanMessage(content='secret')]], run_id='run')
    trace.on_llm_error(asyncio.CancelledError(), run_id='run')
    assert trace.snapshot(0)[0]['errorType'] == 'CancelledError'
    logger = DiagnosticLogger(tmp_path)
    logger.record_tool_observation(model_call_sequence=1,tool_name='read_file',phase='before_first_mutation',
                                   arguments={'file_path':'/a'},result=SimpleNamespace(content='备注'))
    assert logger.observations[0]['resultChars'] == 2
    assert logger.observations[0]['resultUtf8Bytes'] == 6
    assert '备注' not in json.dumps(logger.observations,ensure_ascii=False)


def test_interval_union_avoids_parallel_double_counting():
    assert union([(0,10),(3,7),(8,15),(20,25)]) == 20
    assert union([]) == 0
