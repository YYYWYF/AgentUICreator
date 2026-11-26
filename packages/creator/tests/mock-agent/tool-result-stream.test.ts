import type { AGUIEvent, RunAgentInput } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import { expect, it, vi } from 'vitest';
import { listOfficialMockScenarios, runOfficialMockScenario } from '../../src/mock-agent/index.js';

const input: RunAgentInput = {
  threadId: 'stream-tool-thread', runId: 'stream-tool-run',
  messages: [], tools: [], context: [], state: {}, forwardedProps: {},
};

it('lists a selectable tool streaming demo and emits delayed chunks before one complete result', async () => {
  expect(listOfficialMockScenarios().find(scenario => scenario.id === 'tool-result-stream'))
    .toMatchObject({ category: 'tools', capabilities: ['tool'], resources: ['tool-group', 'tool-approval'] });
  vi.useFakeTimers();
  const events: Array<{ event: AGUIEvent; at: number }> = [];
  try {
    const collecting = (async () => {
      for await (const event of runOfficialMockScenario(input, 'tool-result-stream')) {
        events.push({ event: EventSchemas.parse(event), at: Date.now() });
      }
    })();
    await vi.runAllTimersAsync();
    await collecting;
    const chunks = events.filter(item => item.event.type === 'CUSTOM' && item.event.name === 'TOOL_CALL_STREAM_RESULT');
    expect(chunks).toHaveLength(4);
    const final = events.find(item => item.event.type === 'TOOL_CALL_RESULT');
    expect(final?.event.type).toBe('TOOL_CALL_RESULT');
    const content = chunks.map(({ event }) => {
      if (event.type !== 'CUSTOM') throw new Error('Expected a CUSTOM output chunk');
      const value: unknown = event.value;
      if (typeof value !== 'object' || value === null || !('content' in value) || typeof value.content !== 'string') {
        throw new Error('Missing text output');
      }
      expect(value).toMatchObject({ toolCallId: `streamed-workspace-check:${input.runId}` });
      return value.content;
    }).join('');
    expect(final?.event).toMatchObject({
      toolCallId: `streamed-workspace-check:${input.runId}`, content: `${content}检查完成：3 个文件全部通过。\n`,
    });
    expect(events.filter(item => item.event.type === 'TOOL_CALL_RESULT')).toHaveLength(1);
    for (let index = 1; index < chunks.length; index++) {
      expect(chunks[index]!.at - chunks[index - 1]!.at).toBeGreaterThanOrEqual(3500);
    }
    expect(final!.at - chunks.at(-1)!.at).toBeGreaterThanOrEqual(2500);
    const toolEnd = events.findIndex(item => item.event.type === 'TOOL_CALL_END');
    expect(events.indexOf(chunks[0]!)).toBeGreaterThan(toolEnd);
    expect(events.at(-1)?.event).toMatchObject({ type: 'RUN_FINISHED' });
  } finally { vi.useRealTimers(); }
});

it('uses a distinct tool call id for another run in the same conversation', async () => {
  const ids: string[] = [];
  for (const runId of ['first-run', 'second-run']) {
    for await (const event of runOfficialMockScenario({ ...input, runId }, 'tool-result-stream', { timingScale: 0 })) {
      if (event.type === 'TOOL_CALL_START') ids.push(event.toolCallId);
    }
  }
  expect(ids).toEqual(['streamed-workspace-check:first-run', 'streamed-workspace-check:second-run']);
});
