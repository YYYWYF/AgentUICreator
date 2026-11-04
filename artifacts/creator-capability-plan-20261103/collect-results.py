from pathlib import Path
import json,csv,hashlib
b=Path(__file__).resolve().parent
cases=[('自然执行（早期修复版本）',b/'candidate',b/'model-http-requests.json'),('批准后执行（权限措辞修复前）',b/'execution/approved-execution',b/'execution/model-http-requests.json'),('批准后执行（最终版本）',b/'execution-ownership/approved-execution',b/'execution-ownership/model-http-requests.json')]
results=[]
for name,d,requests in cases:
 r=json.loads((d/'result.json').read_text())
 logs=list((d/'host/.agent-ui/creator/logs').glob('*.jsonl'))
 events=[json.loads(x) for p in logs for x in p.read_text().splitlines()]
 http=json.loads(requests.read_text())
 actual=[x for x in http if not x.get('simulatedSetup')]
 usage=[x['usage'] for x in events if x.get('event') in ['model_result','context_summary_model_result'] and x.get('usage')]
 total={k:sum(u.get(k,0) for u in usage) for k in ['input_tokens','output_tokens','total_tokens']}
 total['cached_input_tokens']=sum(u.get('input_token_details',{}).get('cache_read',0) for u in usage)
 comps=[x for x in events if x.get('event')=='context_compaction']
 states=[s for x in actual for s in x.get('hostDevelopmentState',[])]
 row=dict(name=name,scope='natural-end-to-end' if d.name=='candidate' else 'execution-stage-isolation',seconds=r['seconds'],status=r['status'],toolCalls=len(r['tools']),firstPreparation=r['firstPreparation'],firstMutation=r['firstMutationAttempt'],changedPaths=r['changedPaths'],questionCount=len(r['questions']),actualAgentRequests=sum(x.get('purpose')=='agent' for x in actual),summaryRequests=sum(x.get('purpose')=='summary' for x in actual),simulatedSetupRequests=sum(bool(x.get('simulatedSetup')) for x in http),reportedUsage=total,usageRecordCount=len(usage),usageIsLowerBound=True,compactions=len(comps),compactionEstimates=[{k:x[k] for k in ['beforeEstimatedTokens','afterEstimatedTokens','seconds'] if k in x} for x in comps],hostAuthorizedPlanObserved=any(any(p.get('status')=='authorized' for p in s.get('plans',[])) for s in states),projectParentOwnershipObserved=any(any(o.get('pluginId')=='quick-help-card' and o.get('implementationTakeoverRequired') is False for o in s.get('owners',[])) for s in states),interaction=r.get('interaction'),artifact=str(d.relative_to(b)))
 results.append(row)
report={'model':'deepseek-v4.1-flash','contextBudget':65536,'outputBudget':8192,'temperature':0.2,'deadlineIsQAHarnessOnly':True,'sameOriginalTask':True,'simulatedUserDecisionsOnlyInDisposableFixtures':True,'noVendorChange':True,'platform':'macOS only; real Windows unverified','checks':{'creatorTests':485,'testFiles':49,'creatorTypecheck':'passed','i18n':'passed','creatorBuildAndPackagedDocs':'passed'},'usageNotes':'Sum of provider-reported usage in completed Creator agent/summary log events; includes reasoning and cached input as reported. Incomplete calls and provider omissions make these lower bounds. Scripted setup requests have no real usage. HTTP AbortError after a completed model_result is not classified as a model failure.','cases':results}
(b/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
with (b/'results.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['case','scope','seconds','tools','realAgentRequests','summaryRequests','scriptedSetupRequests','inputTokensLowerBound','outputTokensLowerBound','totalTokensLowerBound','changedFiles','status'])
 for r in results:w.writerow([r['name'],r['scope'],r['seconds'],r['toolCalls'],r['actualAgentRequests'],r['summaryRequests'],r['simulatedSetupRequests'],r['reportedUsage']['input_tokens'],r['reportedUsage']['output_tokens'],r['reportedUsage']['total_tokens'],len(r['changedPaths']),r['status']])
print(json.dumps(results,ensure_ascii=False,indent=2))
