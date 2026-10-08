"""Test-side, content-free callback/observation evidence; no invocation changes."""
from __future__ import annotations
import hashlib
import json
import time
from collections import Counter
from datetime import datetime, timezone
from agent_ui_creator.model_protocol.request_shape import _content_chars
from test_official_composer import ModelToolTrace, ObservedLogger


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def serialized(value):
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def fingerprint(value):
    return hashlib.sha256(serialized(value).encode('utf-8')).hexdigest()


class DiagnosticModelTrace(ModelToolTrace):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.by_id = {}

    def on_chat_model_start(self, serialized_model, messages, *, run_id, **kwargs):
        # Callback is invoked for each actual transport attempt (including retries).
        roles = Counter()
        details = []
        for message in messages[0]:
            content = getattr(message, 'content', '')
            role = getattr(message, 'type', 'unknown')
            chars = _content_chars(content)
            roles[role] += chars
            details.append({'role': role, 'chars': chars, 'sha256': fingerprint(content),
                            'toolName': getattr(message, 'name', None) if role == 'tool' else None})
        row = {'attemptSequence': len(self.calls)+1, 'runId': str(run_id),
               'startedAt': stamp(), 'startedMonotonic': time.monotonic(),
               'status': 'inflight', 'callbackMessageChars': sum(roles.values()),
               'messageCharsByRole': dict(roles), 'messages': details}
        self.calls.append(row)
        self.by_id[str(run_id)] = row

    def _finish(self, run_id, status, error=None):
        row = self.by_id.get(str(run_id))
        if row is not None:
            row.update(finishedAt=stamp(), durationMs=(time.monotonic()-row['startedMonotonic'])*1000,
                       status=status, errorType=type(error).__name__ if error else None)

    def on_llm_end(self, response, *, run_id, **kwargs):
        self._finish(run_id, 'completed')
        super().on_llm_end(response, **kwargs)

    def on_llm_error(self, error, *, run_id, **kwargs):
        self._finish(run_id, 'failed', error)

    def snapshot(self, ended_monotonic):
        rows = []
        for call in self.calls:
            row = {k:v for k,v in call.items() if k != 'startedMonotonic'}
            if call['status'] == 'inflight':
                row.update(status='unfinished_at_run_end', observedDurationMs=(ended_monotonic-call['startedMonotonic'])*1000)
            rows.append(row)
        return rows


class DiagnosticLogger(ObservedLogger):
    def __init__(self, project):
        super().__init__(project)
        self.observations = []

    def record_tool_observation(self, **kwargs):
        content = getattr(kwargs.get('result'), 'content', kwargs.get('result'))
        body = serialized(content) if content is not None else ''
        self.observations.append({
            'sequence': len(self.observations)+1, 'toolName': kwargs['tool_name'],
            'modelCallSequence': kwargs['model_call_sequence'], 'toolCallId': kwargs.get('tool_call_id'),
            'startedAt': kwargs.get('started_at'), 'finishedAt': kwargs.get('finished_at'),
            'durationMs': kwargs.get('duration_ms'), 'phase': kwargs.get('phase'),
            'argumentSha256': fingerprint(kwargs['arguments']),
            'resultChars': len(body), 'resultUtf8Bytes': len(body.encode('utf-8')),
            'resultSha256': hashlib.sha256(body.encode('utf-8')).hexdigest(),
            'errorType': type(kwargs['error']).__name__ if kwargs.get('error') else None,
        })
        super().record_tool_observation(**kwargs)
