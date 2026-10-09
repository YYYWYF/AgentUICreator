import asyncio,json,time
from pathlib import Path
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority
from agent_ui_creator.plugin_development.prepare_tool import create_prepare_ui_plugin_development_tool,PrepareUIPluginDevelopmentInput
from agent_ui_creator.model_protocol.reliability import CreatorModelInvocationReliability
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
R=Path('/Users/yifei/.codex/worktrees/host-ui-rerun/AgentUICreator');O=Path(__file__).parent;B=O/'scenarios/B'
async def main():
 s=CreatorModelSettings.from_environment(config_root=Path('/Users/yifei/Coding/AgentUICreator'))
 authority=PluginDevelopmentAuthority(B,thread_id='protocol-probe',skills_root=R/'packages/creator/skills')
 tool=create_prepare_ui_plugin_development_tool(authority)
 model=create_creator_chat_model(s,thread_id='host-ui-rerun-protocol')
 metrics=ToolProtocolMetrics();reliability=CreatorModelInvocationReliability(metrics=metrics,max_retries=s.max_retries,recovery_factory=lambda:create_creator_chat_model(s,thread_id='host-ui-rerun-protocol'))
 prompt='This is an isolated structured tool compatibility test. Propose a bounded plan for a business notes UI plugin: note input, add to list, help overlay, reuse the existing host controls and theme with no new dependencies. Call prepare_ui_plugin_development once with all required fields. This probe only validates the returned arguments; it does not authorize or execute the plan. Host source evidence follows.\n'
 for file in ('src/App.tsx','src/AgentMount.tsx','src/design-system/system.css','package.json'):prompt+='\nFILE '+file+'\n'+(B/file).read_text()
 result={'model':s.model_name,'maxTokens':s.max_tokens,'timeoutSeconds':s.timeout_seconds,'maxRetries':s.max_retries,'schemaModified':False,'toolExecuted':False,'hostAuthorized':False,'attemptScope':'one structured invocation with existing bounded transport retry policy'}
 start=time.monotonic()
 try:
  response=await reliability.ainvoke(model,lambda m:m.bind_tools([tool]).ainvoke([{'role':'user','content':prompt}]))
  result.update(content=response.content,toolCalls=response.tool_calls,invalidToolCalls=response.invalid_tool_calls,responseMetadata=response.response_metadata,usageMetadata=response.usage_metadata)
  calls=response.tool_calls
  errors=[]
  for c in calls:
   try:PrepareUIPluginDevelopmentInput.model_validate(c['args'])
   except Exception as e:errors.append(str(e))
  result['validationErrors']=errors
  result['status']='PASS' if len(calls)==1 and calls[0]['name']=='prepare_ui_plugin_development' and isinstance(calls[0]['args'].get('deliveryContract'),dict) and isinstance(calls[0]['args'].get('componentBasisRefs'),list) and bool(calls[0]['args'].get('uiScope')) and not errors and not response.invalid_tool_calls and response.response_metadata.get('finish_reason')!='length' else 'FAIL'
 except Exception as e:result.update(status='FAIL',errorType=type(e).__name__,error=str(e))
 result['durationSeconds']=time.monotonic()-start;result['metrics']=metrics.to_dict();(O/'protocol-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str));print(json.dumps({k:result[k] for k in ('model','status','durationSeconds')},ensure_ascii=False))
asyncio.run(main())
