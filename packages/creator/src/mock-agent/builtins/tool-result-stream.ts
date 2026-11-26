import { defineScenario } from '../scenario.js';

const chunks = [
  '[1/4] 开始读取待检查文件。\n',
  '[2/4] 已读取 3 个文件，正在检查配置。\n',
  '[3/4] 配置检查通过，正在汇总结果。\n',
  '[4/4] 汇总完成，等待最终结果。\n',
];

export const toolResultStreamScenario = defineScenario({
  id: 'tool-result-stream',
  title: 'Stream Tool Results',
  description: '工具执行期间分四段输出日志，最后通过 TOOL_CALL_RESULT 返回完整结果并正常结束。',
  category: 'tools',
  capabilities: ['tool'],
  resources: ['tool-group', 'tool-approval'],
  reference: {
    audience: 'backend',
    protocol: 'AG-UI',
    pattern: 'Streaming Tool Results',
    presentation: 'Tool Result',
    eventFlow: ['TOOL_CALL_START/ARGS/END', 'CUSTOM · TOOL_CALL_STREAM_RESULT × 4', 'TOOL_CALL_RESULT', 'TEXT_MESSAGE_*', 'RUN_FINISHED'],
  },
  steps: [],
  async prepareRun(input) {
    const toolCallId = `streamed-workspace-check:${input.runId}`;
    return {
      steps: [{
        type: 'message',
        text: '开始检查文件。展开下方工具卡片，可以看到检查日志逐段出现。',
        intervalMs: 25,
      }, {
        type: 'tool',
        toolCallId,
        name: 'check_workspace',
        args: { files: ['application/Agent.tsx', 'app-ui/model.ts', 'plugins/registry.ts'] },
        prepareDurationMs: 300,
        during: chunks.map((content, index) => ({
          type: 'custom' as const,
          name: 'TOOL_CALL_STREAM_RESULT',
          value: { toolCallId, content },
          delayMs: index === 0 ? 600 : 3500,
        })),
        durationMs: 2500,
        result: `${chunks.join('')}检查完成：3 个文件全部通过。\n`,
      }, {
        type: 'message',
        text: '工具结果已全部返回，本次检查正常结束。',
        intervalMs: 35,
      }],
    };
  },
});
