"""Offline content-free evidence export. No model calls; raw logs stay outside Git."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


def load(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')


def ms(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()*1000


def union(intervals):
    total = 0
    end = None
    for start, finish in sorted(intervals):
        if finish < start:
            raise ValueError('reversed interval')
        total += finish-max(start, end if end is not None else start) if end is None or finish > end else 0
        end = max(finish, end if end is not None else finish)
    return total


def correlation(rows, key='requestMessageChars'):
    pairs = [(r[key], r['durationMs']) for r in rows if r.get(key) is not None and r.get('durationMs') is not None]
    if len(pairs) < 3 or len({x for x,y in pairs}) < 2 or len({y for x,y in pairs}) < 2:
        return None
    return statistics.correlation([x for x,y in pairs], [y for x,y in pairs])


def read_events(root):
    paths = sorted(root.glob('.agentuicreator/logs/*.jsonl'))
    return [[json.loads(line) for line in p.read_text().splitlines()] for p in paths]


def historical(root):
    histories = []
    paths = sorted(root.glob('attempt-*')) + [root]
    event_sets = read_events(root)
    for index, path in enumerate(paths):
        outcome = load(path/'outcome.json')
        events = event_sets[index]
        tools = [e['data'] for e in events if e['type']=='creator_tool_observation']
        proposed = load(path/'model-tool-calls.json')
        repeats = Counter((t['name'],json.dumps(t['arguments'],sort_keys=True,ensure_ascii=False)) for t in proposed)
        histories.append({'attempt':path.name if path != root else 'final-8192',
                          'maxTokens':outcome.get('maxTokens'), 'errorType':outcome.get('errorType'),
                          'proposedToolCalls':len(proposed), 'executedToolCalls':len(tools),
                          'completedModelCallsLowerBound':max((t['modelCallSequence'] for t in tools),default=0),
                          'toolDurationSumMs':sum(t.get('durationMs') or 0 for t in tools),
                          'toolWallMs':union([(ms(t['startedAt']),ms(t['finishedAt'])) for t in tools if t.get('startedAt') and t.get('finishedAt')]),
                          'toolCounts':dict(Counter(t['toolName'] for t in tools)),
                          'toolStatuses':dict(Counter(t['status'] for t in tools)),
                          'toolErrorCodes':dict(Counter(t['structuredErrorCode'] for t in tools if t.get('structuredErrorCode'))),
                          'repeatedProposedArgumentGroups':[{'toolName':k[0],'argumentSha256':hashlib.sha256(k[1].encode()).hexdigest(),'count':v} for k,v in repeats.items() if v>1],
                          'lastEvent':{'type':events[-1]['type'],'timestamp':events[-1]['timestamp'],
                                       'toolName':events[-1]['data'].get('toolName')},
                          'transportEvents':[{'type':e['type'],'timestamp':e['timestamp'],
                                              'data':{k:v for k,v in e['data'].items() if k in {'modelCallSequence','attempt','attempts','failures','failureKind','durationMs','requestMessageChars','requestMessageCount','requestToolCount','requestToolSchemaChars','requestMaxToolSchemaChars','requestMaxToolSchemaName'}}} for e in events if e['type'].startswith('model_transport')],
                          'authorizedPlan':bool(outcome.get('developmentPlan')),
                          'sourceChangedFiles':load(path/'source-changes.json').get('changedFiles') if (path/'source-changes.json').exists() else None,
                          'missing':['model lifecycle','completed model traces','model-facing tool result sizes'],
                          'hostResponseSizesAreNotModelToolResultSizes':True})
    return histories


def analyze(old, run, output):
    output.mkdir(parents=True, exist_ok=True)
    diag, metrics, env, outcome = [load(run/name) for name in ['diagnostics.json','model-metrics.json','environment.json','outcome.json']]
    events = read_events(run)[-1]
    attempts = diag['modelAttempts']
    for r in attempts:
        if r.get('errorType') == 'CancelledError':
            r['status'] = 'cancelled_at_run_end'
    completed = [r for r in attempts if r['status']=='completed']
    traces = metrics['traces']
    alignment = len(completed)==len(traces)
    if alignment:
        for row, trace in zip(completed,traces):
            # Official metrics are authoritative for input/tool schema shape.
            row.update({k:v for k,v in trace.items() if k not in {'durationMs','providerResponse','langChainProviderMetadata'}})
            row['protocolDurationMs'] = trace['durationMs']
    failures = [e['data'] for e in events if e['type']=='model_transport_attempt_failed']
    failed_attempts = [r for r in attempts if r['status']=='failed']
    if len(failures) == len(failed_attempts):
        for row, failure in zip(failed_attempts, failures):
            if row.get('errorType') != failure.get('errorType'):
                raise ValueError('Failure callback/log alignment mismatch')
            row['sequence'] = failure['modelCallSequence']
            row['transportAttempt'] = failure['attempt']
            row['failureKind'] = failure['failureKind']
            row.update({k:v for k,v in failure.items() if k.startswith('request')})
            row['inputShapeSource'] = 'existing-transport-failure-log'
    tools = diag['toolObservations']
    logged = {e['data'].get('toolCallId'):e['data'] for e in events if e['type']=='creator_tool_observation'}
    seen_args = defaultdict(list)
    seen_results = Counter()
    for row in tools:
        observation = logged.get(row['toolCallId'],{})
        row.update({k:observation.get(k) for k in ['status','arguments','structuredErrorCode']})
        key = (row['toolName'],row['argumentSha256'])
        previous = seen_args[key]
        row['repeatOfSequences'] = [r['sequence'] for r in previous]
        row['sameResultAsPreviousSameArguments'] = any(r['resultSha256']==row['resultSha256'] for r in previous) if previous else None
        row['newEvidence'] = 'identical-result' if row['sameResultAsPreviousSameArguments'] else 'changed-result-needs-semantic-review' if previous else 'first-observation'
        row['resultSeenBefore'] = seen_results[row['resultSha256']]>0
        previous.append(row);seen_results[row['resultSha256']]+=1
    model_intervals = [(ms(r['startedAt']),ms(r.get('finishedAt',diag['finishedAt']))) for r in attempts]
    tool_intervals = [(ms(r['startedAt']),ms(r['finishedAt'])) for r in tools if r.get('startedAt') and r.get('finishedAt')]
    model_wall, tool_wall = union(model_intervals), union(tool_intervals)
    combined = union(model_intervals+tool_intervals)
    durations = sorted(r['durationMs'] for r in completed)
    groups = defaultdict(lambda:{'count':0,'chars':0,'utf8Bytes':0,'durationSumMs':0})
    for r in tools:
        g=groups[r['toolName']];g['count']+=1;g['chars']+=r['resultChars'];g['utf8Bytes']+=r['resultUtf8Bytes'];g['durationSumMs']+=r.get('durationMs') or 0
    ranking = sorted([{'toolName':k,**v} for k,v in groups.items()],key=lambda r:r['chars'],reverse=True)
    result_sources = {r['resultSha256']:r for r in tools}
    growth = []
    for r in attempts:
        detail = r['messages']; hashes = Counter(m['sha256'] for m in detail if m['role']=='tool')
        duplicate_chars = sum(m['chars'] for m in detail if m['role']=='tool' and hashes[m['sha256']]>1)
        source_chars = Counter()
        for m in detail:
            if m['role'] != 'tool':
                continue
            source = result_sources.get(m['sha256'])
            if source is None:
                category = 'unmatched-tool-message'
            elif source['toolName']=='read_file' and '/skills/' in (source.get('arguments') or {}).get('file_path',''):
                category = 'skill-read'
            else:
                category = source['toolName']
            source_chars[category] += m['chars']
        growth.append({k:r.get(k) for k in ['attemptSequence','sequence','status','requestMessageChars','requestMessageCount','requestToolSchemaChars','requestToolCount','requestMaxToolSchemaName','requestMaxToolSchemaChars','inputTokens','outputTokens','durationMs','observedDurationMs','callbackMessageChars','messageCharsByRole']} | {'duplicateToolMessageCharsIncludingAllCopies':duplicate_chars,'toolMessageCharsByResultSource':dict(source_chars)})
    # No message fingerprints are needed in published model timeline.
    timeline = [{k:v for k,v in r.items() if k!='messages'} for r in attempts]
    retries = [e for e in events if e['type'].startswith('model_transport')]
    summary = {
        'historical':historical(old), 'diagnosticRun':{
            'elapsedMs':diag['durationMs'],'outcome':outcome.get('errorType',outcome.get('completion')),
            'logicalModelRequests':max((r.get('sequence',0) for r in attempts),default=0),'actualModelAttempts':len(attempts),'completedModelRequests':len(completed),
            'failedModelRequests':len([r for r in attempts if r['status']=='failed']),
            'unfinishedModelRequests':len([r for r in attempts if r['status'] in {'unfinished_at_run_end','cancelled_at_run_end'}]),
            'cancelledModelRequests':len([r for r in attempts if r['status']=='cancelled_at_run_end']),
            'completedModelDurationSumMs':sum(durations),'modelWallMs':model_wall,
            'modelWallFraction':model_wall/diag['durationMs'],
            'meanCompletedModelMs':statistics.mean(durations) if durations else None,
            'p95CompletedModelMs':durations[math.ceil(len(durations)*.95)-1] if durations else None,
            'maxCompletedModelMs':max(durations,default=None),
            'maxObservedModelAttemptMs':max((r.get('durationMs') or r.get('observedDurationMs',0) for r in attempts),default=None),
            'failedModelDurationSumMs':sum(r.get('durationMs',0) for r in failed_attempts),
            'outputTokensDurationPearsonR':correlation(traces, 'outputTokens'),
            'proposedToolCalls':len(load(run/'model-tool-calls.json')),'executedToolCalls':len(tools),
            'toolDurationSumMs':sum(r.get('durationMs') or 0 for r in tools),
            'toolWallMs':tool_wall,'modelToolOverlapMs':model_wall+tool_wall-combined,
            'otherObservableMs':max(0,diag['durationMs']-combined),
            'slowestTool':max(tools,key=lambda r:r.get('durationMs') or 0,default=None),
            'firstContext':growth[0] if growth else None,'lastContext':growth[-1] if growth else None,
            'maxCompletedRequestMessageChars':max((r.get('requestMessageChars',0) for r in traces),default=0),
            'messageCharsDurationPearsonR':correlation(traces),'correlationSampleSize':len(traces),
            'traceCallbackAlignment':alignment,
            'retryRepairCounters':{k:metrics[k] for k in ['modelTransportRetries','modelTransportFailures','protocolRepairAttempts','modelTruncatedTurns','modelTruncationRepairAttempts','invalidToolCalls','toolArgumentParseFailures','repeatedToolLoops']},
            'finishLengthCount':sum(r['finishReason']=='length' for r in traces),
            'outputAtConfiguredLimitCount':sum((r.get('outputTokens') or 0)>=env['maxTokens'] for r in traces),
            'toolStatuses':dict(Counter(r.get('status') for r in tools)),
            'toolErrorCodes':dict(Counter(r['structuredErrorCode'] for r in tools if r.get('structuredErrorCode'))),
            'toolRanking':ranking,'largestFiveToolReturns':sorted(tools,key=lambda r:r['resultChars'],reverse=True)[:5],
            'near48000CharReturns':sum(47000<=r['resultChars']<=49000 for r in tools),
            'identicalRepeatResults':sum(r['sameResultAsPreviousSameArguments'] is True for r in tools),
            'repeatedArgumentExecutions':sum(bool(r['repeatOfSequences']) for r in tools),
            'lastCompleteEvent':{'type':events[-1]['type'],'timestamp':events[-1]['timestamp'],'toolName':events[-1]['data'].get('toolName')},
            'lastModelAttempt':timeline[-1] if timeline else None,
            'sourceChangedFiles':load(run/'source-changes.json').get('changedFiles',[]),
            'planAuthorized':bool(outcome.get('developmentPlan')),
            'transportEvents':[{'type':e['type'],'timestamp':e['timestamp'],'durationMs':e['data'].get('durationMs'),'modelCallSequence':e['data'].get('modelCallSequence')} for e in retries],
        },
        'limitations':['Callback elapsed includes network, provider prefill, generation and streaming; does not isolate server latency.',
                       'Character counts are not token estimates. Original attempts have no per-request lifecycle or tool result size.',
                       'Protocol durations may include transport retry/backoff; use callback interval union for time attribution.',
                       'Result hash equality proves unchanged content, not that every repeated inspection is unnecessary.',
                       'Correlation in one run is descriptive and confounded by different tool-argument output lengths.'],
    }
    write(output/'summary.json',summary)
    original_events = read_events(old)[-1]
    original_tools = [dict(e['data'], evidenceRun='original-final-8192', resultChars=None,
                           resultUtf8Bytes=None, resultSha256=None, argumentSha256=None,
                           repeatAssessment='unavailable-full-arguments-not-in-jsonl')
                      for e in original_events if e['type']=='creator_tool_observation']
    bound = summary['historical'][-1]['completedModelCallsLowerBound']
    original_models = [{'evidenceRun':'original-final-8192','sequence':i,
                        'status':'completed-inferred-from-observation-counter',
                        'startedAt':None,'finishedAt':None,'durationMs':None,
                        'requestMessageChars':None,'requestToolSchemaChars':None,
                        'inputTokens':None,'outputTokens':None,
                        'firstAssociatedToolStartedAt':next((r['startedAt'] for r in original_tools if r['modelCallSequence']==i),None)}
                       for i in range(1,bound+1)]
    write(output/'model-timeline.json',original_models + [dict(r,evidenceRun='diagnostic-B') for r in timeline])
    write(output/'tool-timeline.json',original_tools + [dict(r,evidenceRun='diagnostic-B') for r in tools])
    write(output/'context-growth.json',growth)
    write(output/'environment.json',env|{'originalEvidenceDirectory':str(old),'diagnosticEvidenceDirectory':str(run),'fixtureSourceHashDrift':[], 'liveRuns':1,'diagnosticChangesOnly':True,
          'fixturePackageVersions':{name:load(run/'node_modules'/name/'package.json')['version'] for name in ['react','antd']},
          'requestSha256':hashlib.sha256((run/'request.txt').read_bytes()).hexdigest(),
          'fixtureReuse':'Original B source; dependency links reused, framework packages rebuilt at baseline; control entry repointed to baseline artifact.',
          'modelRequestBodiesRecorded':False,'toolBodiesInPublishedArtifacts':False})
    return summary


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--original',type=Path,required=True);parser.add_argument('--run',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();analyze(args.original,args.run,args.output)
