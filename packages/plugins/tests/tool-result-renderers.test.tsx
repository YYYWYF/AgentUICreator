// @vitest-environment jsdom
import { act, useState, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useLocalRuntime,
  type ThreadMessage,
} from '@assistant-ui/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AgentUILocaleProvider,
  ConversationCommandDecisionProvider,
  ConversationToolResult,
  type ApprovalCardProps,
  type ConversationCommandDecisionBinding,
  type ConversationToolResultProps,
  type ToolCallComponentProps,
  type ToolCallRenderContext,
  type ToolHeaderProps,
  type ToolImageProps,
  type ToolResultComponents,
  type ToolResultPart,
} from '../src/public.js';
import { ConversationToolResultPlugin as NpmResult } from '../dist/tool-result/index.js';
import { ConversationToolResultPlugin as PortableResult } from '../dist/sources/takeover/tool-result/index';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});
const framework = { renderSlot: () => null, renderScopedSlot: () => null };
const views: {
  name: string;
  View: ComponentType<ConversationToolResultProps>;
}[] = [
  { name: 'source', View: ConversationToolResult },
  {
    name: 'npm',
    View: (props) => (
      <NpmResult
        {...framework}
        tool={props}
        components={props.components}
        renderToolCall={props.renderToolCall}
        {...(props.expanded === undefined ? {} : { expanded: props.expanded })}
        {...(props.defaultExpanded === undefined
          ? {}
          : { defaultExpanded: props.defaultExpanded })}
        {...(props.onExpandedChange
          ? { onExpandedChange: props.onExpandedChange }
          : {})}
        {...(props.resolveFile ? { resolveFile: props.resolveFile } : {})}
        {...(props.resultOnly === undefined
          ? {}
          : { resultOnly: props.resultOnly })}
      />
    ),
  },
  {
    name: 'portable',
    View: (props) => (
      <PortableResult
        {...framework}
        tool={props}
        components={props.components}
        renderToolCall={props.renderToolCall}
        {...(props.expanded === undefined ? {} : { expanded: props.expanded })}
        {...(props.defaultExpanded === undefined
          ? {}
          : { defaultExpanded: props.defaultExpanded })}
        {...(props.onExpandedChange
          ? { onExpandedChange: props.onExpandedChange }
          : {})}
        {...(props.resolveFile ? { resolveFile: props.resolveFile } : {})}
        {...(props.resultOnly === undefined
          ? {}
          : { resultOnly: props.resultOnly })}
      />
    ),
  },
];
const tool: ConversationToolResultProps = {
  toolCallId: 'call',
  toolName: 'review_report',
  args: { id: 42 },
  argsText: '{"id":42}',
  status: { type: 'requires-action', reason: 'tool-calls' },
  defaultExpanded: true,
};
const parts = [
  { type: 'text', text: 'Report' },
  {
    type: 'image',
    source: { type: 'url', value: 'https://example.test/chart.png' },
  },
  {
    type: 'audio',
    source: { type: 'url', value: 'https://example.test/tone.wav' },
  },
  {
    type: 'video',
    source: { type: 'url', value: 'https://example.test/clip.webm' },
  },
  {
    type: 'document',
    source: {
      type: 'data',
      value: 'JVBERi0xLjQK',
      mimeType: 'application/pdf',
    },
    metadata: { filename: 'report.pdf' },
  },
] satisfies ToolResultPart[];
function Host({
  children,
  decisions = new Map<string, ConversationCommandDecisionBinding>(),
}: {
  children: ReactNode;
  decisions?: ReadonlyMap<string, ConversationCommandDecisionBinding>;
}) {
  const runtime = useLocalRuntime({ async *run() {} });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentUILocaleProvider locale="en-US">
        <ConversationCommandDecisionProvider decisions={decisions}>
          {children}
        </ConversationCommandDecisionProvider>
      </AgentUILocaleProvider>
    </AssistantRuntimeProvider>
  );
}
async function mount(node: ReactNode) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => root.render(node));
  return { el, root };
}
function button(el: HTMLElement, label: string) {
  const result = [...el.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!result) throw new Error('Missing button ' + label);
  return result;
}
function ApprovalCard({ header, tool, approval, views }: ApprovalCardProps) {
  return (
    <>
      {header}
      <section
        {...approval.containerProps}
        data-custom-approval={approval.phase}
      >
        <h3>{tool.toolName}</h3>
        <p>{approval.prompt}</p>
        {(approval.phase === 'pending' ||
          approval.phase === 'confirming' ||
          approval.phase === 'submitting') && (
          <>
            <button
              disabled={approval.disabled}
              onClick={() => approval.approve()}
            >
              {approval.phase === 'confirming' ? 'Confirm' : 'Allow'}
            </button>
            <button
              disabled={approval.disabled}
              onClick={() => approval.reject()}
            >
              Deny
            </button>
          </>
        )}
        {approval.error && <p role="alert">{approval.error}</p>}
        {approval.receipt?.label}
        {views.error}
        {views.result}
      </section>
    </>
  );
}

it.each(views)(
  '$name passes only header and body to renderToolCall, with independently working arguments disclosure',
  async ({ View }) => {
    let nodes!: ToolCallRenderContext;
    const { el } = await mount(
      <Host>
        <View
          {...tool}
          defaultExpanded={false}
          status={{ type: 'complete' }}
          result={parts}
          renderToolCall={(value) => {
            nodes = value;
            return (
              <article>
                {value.header}
                <main>{value.defaultView}</main>
              </article>
            );
          }}
        />
      </Host>,
    );
    expect(Object.keys(nodes).sort()).toEqual(['defaultView', 'header']);
    expect(
      el.querySelector('main [data-slot="tool-fallback-trigger"]'),
    ).toBeNull();
    expect(
      el.querySelector('main [data-slot="tool-fallback-args"]'),
    ).toBeNull();
    expect(el.querySelectorAll('img,audio,video')).toHaveLength(3);
    expect(el.querySelector('[data-slot="tool-fallback-args"]')).toBeNull();
    await act(async () =>
      el
        .querySelector<HTMLButtonElement>(
          '[data-slot="tool-fallback-trigger"]',
        )!
        .click(),
    );
    expect(
      el.querySelectorAll('[data-slot="tool-fallback-args"]'),
    ).toHaveLength(1);
  },
);
it.each(views)(
  '$name omitting header removes invocation information and null suppresses media',
  async ({ View }) => {
    const { el, root } = await mount(
      <Host>
        <View
          {...tool}
          result={parts}
          renderToolCall={({ defaultView }) => defaultView}
        />
      </Host>,
    );
    expect(el.querySelector('[data-slot="tool-fallback-trigger"]')).toBeNull();
    expect(el.textContent).not.toContain('review_report');
    expect(el.querySelector('img')).not.toBeNull();
    await act(async () =>
      root.render(
        <Host>
          <View {...tool} result={parts} renderToolCall={() => null} />
        </Host>,
      ),
    );
    expect(el.textContent).toBe('');
    expect(el.querySelector('img,audio,video')).toBeNull();
  },
);
it.each(views)(
  '$name replaces one image type without judgments or duplicate invocation headers',
  async ({ View }) => {
    let image!: ToolImageProps;
    const components: ToolResultComponents = {
      Image: (props) => {
        image = props;
        return (
          <figure data-custom-image="">
            <img src={props.src} alt={props.filename ?? ''} />
          </figure>
        );
      },
    };
    const { el } = await mount(
      <Host>
        <View {...tool} result={parts} components={components} />
      </Host>,
    );
    expect(image.src).toBe('https://example.test/chart.png');
    expect(el.querySelectorAll('[data-custom-image]')).toHaveLength(1);
    expect(
      el.querySelectorAll('[data-slot="tool-fallback-trigger"]'),
    ).toHaveLength(1);
    expect(el.querySelectorAll('audio,video')).toHaveLength(2);
    expect(el.querySelector('a[download]')?.getAttribute('download')).toBe(
      'report.pdf',
    );
  },
);
it.each(views)(
  '$name routes Header, Args, Approval, Result and Error without losing other defaults',
  async ({ View }) => {
    const components: ToolResultComponents = {
      Header: (props) => <h3 data-custom-title="">{props.tool.toolName}</h3>,
      Args: (props) => (
        <code data-custom-args="">{JSON.stringify(props.args)}</code>
      ),
      Approval: (props) => (
        <aside data-custom-panel="">{props.defaultView}</aside>
      ),
      Result: (props) => (
        <output data-custom-result="">{props.defaultView}</output>
      ),
      Error: (props) => <p data-custom-error="">{props.error.errorText}</p>,
    };
    const { el, root } = await mount(
      <Host>
        <View
          {...tool}
          approval={{ id: 'request' }}
          respondToApproval={async () => {}}
          result={parts}
          components={components}
        />
      </Host>,
    );
    expect(el.querySelector('[data-custom-title]')?.textContent).toBe(
      'review_report',
    );
    expect(el.querySelector('[data-custom-args]')?.textContent).toBe(
      '{"id":42}',
    );
    expect(el.querySelector('[data-slot="tool-fallback-args"]')).toBeNull();
    expect(el.querySelector('[data-custom-panel] button')).not.toBeNull();
    expect(el.querySelectorAll('[data-custom-result] img')).toHaveLength(1);
    await act(async () =>
      root.render(
        <Host>
          <View
            {...tool}
            status={{ type: 'incomplete', reason: 'error', error: 'Failed' }}
            components={components}
          />
        </Host>,
      ),
    );
    expect(el.querySelector('[data-custom-error]')?.textContent).toBe('Failed');
    expect(el.querySelector('[data-slot="tool-fallback-error"]')).toBeNull();
  },
);
it.each(views)(
  '$name ApprovalCard receives optional header and full operations, ordinary calls retain their defaults',
  async ({ View }) => {
    const respond = vi
      .fn<NonNullable<ConversationToolResultProps['respondToApproval']>>()
      .mockResolvedValue(undefined);
    const components = { ApprovalCard };
    const { el } = await mount(
      <Host>
        <View
          {...tool}
          toolCallId="ordinary"
          toolName="read_file"
          result="Done"
          status={{ type: 'complete' }}
          components={components}
        />
        <View
          {...tool}
          toolCallId="approval"
          approval={{ id: 'request' }}
          respondToApproval={respond}
          components={components}
        />
      </Host>,
    );
    expect(el.querySelectorAll('[data-custom-approval]')).toHaveLength(1);
    expect(
      el.querySelector('[data-slot="tool-fallback-result"]')?.textContent,
    ).toContain('Done');
    await act(async () => button(el, 'Allow').click());
    expect(respond).toHaveBeenCalledExactlyOnceWith({ approved: true });
  },
);
it.each(views)(
  '$name a full ApprovalCard can omit header and overrides the general layout renderer',
  async ({ View }) => {
    const layout = vi.fn<
      NonNullable<ConversationToolResultProps['renderToolCall']>
    >(({ header, defaultView }) => (
      <>
        {header}
        {defaultView}
      </>
    ));
    const { el, root } = await mount(
      <Host>
        <View
          {...tool}
          approval={{ id: 'request' }}
          components={{
            ApprovalCard: (props) => (
              <section>
                <b>Own title</b>
                {props.views.approval}
                {props.views.result}
              </section>
            ),
          }}
          renderToolCall={layout}
        />
      </Host>,
    );
    expect(layout).not.toHaveBeenCalled();
    expect(el.querySelector('[data-slot="tool-fallback-trigger"]')).toBeNull();
    expect(el.querySelector('[data-slot="tool-fallback-args"]')).toBeNull();
    await act(async () =>
      root.render(
        <Host>
          <View
            {...tool}
            status={{ type: 'complete' }}
            renderToolCall={layout}
          />
        </Host>,
      ),
    );
    expect(layout).toHaveBeenCalled();
  },
);
it('parent Result replacement owns its children while defaultView preserves image overrides', async () => {
  const Image = vi.fn<(props: ToolImageProps) => ReactNode>((props) => (
    <img data-custom-image="" src={props.src} alt="" />
  ));
  const { el, root } = await mount(
    <Host>
      <ConversationToolResult
        {...tool}
        result={parts}
        components={{
          Image,
          Result: () => <p>Own result</p>,
        }}
      />
    </Host>,
  );
  expect(Image).not.toHaveBeenCalled();
  expect(el.querySelector('img')).toBeNull();
  await act(async () =>
    root.render(
      <Host>
        <ConversationToolResult
          {...tool}
          result={parts}
          components={{
            Image,
            Result: (props) => <section>{props.defaultView}</section>,
          }}
          renderToolCall={({ header, defaultView }) => (
            <article>
              {header}
              {defaultView}
            </article>
          )}
        />
      </Host>,
    ),
  );
  expect(el.querySelectorAll('[data-custom-image]')).toHaveLength(1);
});
it('resultOnly applies result components and bypasses header, approval and global layout', async () => {
  const unused = vi.fn(() => <p>Wrong region</p>);
  const { el } = await mount(
    <Host>
      <ConversationToolResult
        {...tool}
        resultOnly
        result={parts}
        renderToolCall={unused}
        components={{
          Header: unused,
          ApprovalCard: unused,
          Image: (props) => <img data-custom-image="" src={props.src} alt="" />,
        }}
      />
    </Host>,
  );
  expect(unused).not.toHaveBeenCalled();
  expect(el.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  expect(el.querySelector('[data-custom-image]')).not.toBeNull();
  expect(el.querySelector('audio')).not.toBeNull();
});
it('text, audio, video and file overrides are independently typed and text covers plain JSON', async () => {
  const components: ToolResultComponents = {
    Text: (props) => <strong>{props.text}</strong>,
    Audio: (props) => <audio data-custom-audio="" src={props.src} />,
    Video: (props) => <video data-custom-video="" src={props.src} />,
    File: (props) => (
      <a data-custom-file="" href={props.src}>
        {props.filename}
      </a>
    ),
  };
  const { el, root } = await mount(
    <Host>
      <ConversationToolResult
        {...tool}
        result={parts}
        components={components}
      />
    </Host>,
  );
  expect(el.querySelector('strong')?.textContent).toBe('Report');
  expect(
    el.querySelectorAll(
      '[data-custom-audio],[data-custom-video],[data-custom-file]',
    ),
  ).toHaveLength(3);
  await act(async () =>
    root.render(
      <Host>
        <ConversationToolResult
          {...tool}
          result={{ done: true }}
          components={components}
        />
      </Host>,
    ),
  );
  expect(el.querySelector('strong')?.textContent).toContain('"done": true');
});
it('custom component state survives ordinary rerenders', async () => {
  function Image(props: ToolImageProps) {
    const [count, setCount] = useState(0);
    return (
      <button onClick={() => setCount(count + 1)}>
        {props.filename ?? 'Image'}:{count}
      </button>
    );
  }
  const components = { Image };
  const render = () => (
    <Host>
      <ConversationToolResult
        {...tool}
        result={parts}
        components={components}
      />
    </Host>
  );
  const { el, root } = await mount(render());
  await act(async () => button(el, 'Image:0').click());
  await act(async () => root.render(render()));
  expect(button(el, 'Image:1')).not.toBeNull();
});
it('file resolution stays in the framework and unavailable sources keep default feedback', async () => {
  let finish!: (url: string) => void;
  let signal!: AbortSignal;
  const resolveFile = vi.fn(
    (_: { type: 'file'; value: string }, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    },
  );
  const Image = vi.fn<(props: ToolImageProps) => ReactNode>((props) => (
    <img data-custom-image="" src={props.src} alt="" />
  ));
  const render = (result: unknown) => (
    <Host>
      <ConversationToolResult
        {...tool}
        result={result}
        resolveFile={resolveFile}
        components={{ Image }}
      />
    </Host>
  );
  const { el, root } = await mount(
    render([{ type: 'image', source: { type: 'file', value: 'opaque' } }]),
  );
  expect(Image).not.toHaveBeenCalled();
  expect(el.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => finish('https://example.test/resolved.png'));
  expect(el.querySelector('img')?.src).toBe(
    'https://example.test/resolved.png',
  );
  await act(async () =>
    root.render(
      render([
        {
          type: 'image',
          source: { type: 'url', value: 'javascript:alert(1)' },
        },
      ]),
    ),
  );
  expect(signal.aborted).toBe(true);
  expect(el.querySelector('img')).toBeNull();
  expect(el.querySelector('[role="status"]')).not.toBeNull();
});
it('custom approval retains notes, confirmation, duplicate protection, retry and receipt focus', async () => {
  let current!: ApprovalCardProps;
  let fail!: (error: Error) => void;
  const respond = vi
    .fn<NonNullable<ConversationToolResultProps['respondToApproval']>>()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValue(undefined);
  const Card = (props: ApprovalCardProps) => {
    current = props;
    return <ApprovalCard {...props} />;
  };
  const render = (settled = false) => (
    <Host>
      <ConversationToolResult
        {...tool}
        status={settled ? { type: 'complete' } : tool.status}
        approval={{
          id: 'native',
          allowFreeform: true,
          options: [{ id: 'permit', kind: 'allow-once', confirm: true }],
          ...(settled ? { approved: true, optionId: 'permit' } : {}),
        }}
        respondToApproval={respond}
        components={{ ApprovalCard: Card }}
      />
    </Host>
  );
  const { el, root } = await mount(render());
  await act(async () => current.approval.setNote('Record this decision'));
  await act(async () => button(el, 'Allow').click());
  expect(current.approval.phase).toBe('confirming');
  expect(respond).not.toHaveBeenCalled();
  button(el, 'Confirm').focus();
  await act(async () => {
    current.approval.approve();
    current.approval.approve();
  });
  expect(respond).toHaveBeenCalledExactlyOnceWith({
    optionId: 'permit',
    text: 'Record this decision',
  });
  expect(current.approval.phase).toBe('submitting');
  expect(current.methods.respondToApproval).toBeUndefined();
  await act(async () => fail(new Error('Try again')));
  expect(current.approval.error).toBe('Try again');
  await act(async () => button(el, 'Allow').click());
  await act(async () => button(el, 'Confirm').click());
  expect(respond).toHaveBeenCalledTimes(2);
  const staleApprove = current.approval.approve;
  await act(async () => root.render(render(true)));
  expect(current.approval.phase).toBe('settled');
  expect(document.activeElement).toBe(
    el.querySelector('[data-custom-approval]'),
  );
  await act(async () => staleApprove());
  expect(respond).toHaveBeenCalledTimes(2);
});
it.each(views)(
  '$name command approval stays selected after settlement and remount without recreating a gate',
  async ({ View }) => {
    const submit = vi
      .fn<ConversationCommandDecisionBinding['submit']>()
      .mockResolvedValue(undefined);
    const decisions = new Map([
      [
        'call',
        {
          request: { description: 'Review', allowedDecisions: ['approve'] },
          submit,
        },
      ],
    ]);
    const render = (pending: boolean, visible = true) => (
      <Host
        decisions={
          pending
            ? decisions
            : new Map<string, ConversationCommandDecisionBinding>()
        }
      >
        {visible && (
          <View
            {...tool}
            status={pending ? tool.status : { type: 'complete' }}
            result={pending ? undefined : 'Approved result'}
            components={{ ApprovalCard }}
          />
        )}
      </Host>
    );
    const { el, root } = await mount(render(true));
    await act(async () => button(el, 'Allow').click());
    expect(submit).toHaveBeenCalledExactlyOnceWith('approve');
    await act(async () => root.render(render(false, false)));
    await act(async () => root.render(render(false)));
    expect(
      el
        .querySelector('[data-custom-approval]')
        ?.getAttribute('data-custom-approval'),
    ).toBe('settled');
    expect(el.textContent).toContain('Approved result');
    expect(el.textContent).toContain('Allowed');
    expect(
      [...el.querySelectorAll('button')].filter(
        (node) => node.textContent === 'Allow',
      ),
    ).toHaveLength(0);
  },
);
it.each(['frontend', 'interrupt', 'approval'] as const)(
  '%s rejection uses its original transport',
  async (kind) => {
    const send = vi
      .fn<(payload: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    const transport =
      kind === 'frontend'
        ? { addResult: send }
        : kind === 'interrupt'
          ? { interrupt: { type: 'human' as const, payload: {} }, resume: send }
          : { approval: { id: 'request' }, respondToApproval: send };
    const { el } = await mount(
      <Host>
        <ConversationToolResult
          {...tool}
          {...transport}
          components={{ ApprovalCard }}
        />
      </Host>,
    );
    await act(async () => {
      button(el, 'Deny').click();
      button(el, 'Allow').click();
    });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      kind === 'frontend' ? 'User denied tool execution' : { approved: false },
    );
  },
);
it.each(['approve', 'reject'] as const)(
  '%s requires an explicit choice among multiple options and retains confirmation',
  async (decision) => {
    const send = vi
      .fn<(payload: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    let current!: ApprovalCardProps;
    const Card = (props: ApprovalCardProps) => {
      current = props;
      return null;
    };
    await mount(
      <Host>
        <ConversationToolResult
          {...tool}
          approval={{
            id: 'request',
            options: [
              { id: 'once', kind: 'allow-once', confirm: true },
              { id: 'always', kind: 'allow-always', confirm: true },
              { id: 'deny-once', kind: 'reject-once', confirm: true },
              { id: 'deny-always', kind: 'reject-always', confirm: true },
            ],
          }}
          respondToApproval={send}
          components={{ ApprovalCard: Card }}
        />
      </Host>,
    );
    await act(async () => current.approval[decision]());
    expect(send).not.toHaveBeenCalled();
    const optionId = decision === 'approve' ? 'always' : 'deny-once';
    await act(async () => current.approval[decision](optionId));
    expect(current.approval.phase).toBe('confirming');
    expect(send).not.toHaveBeenCalled();
    await act(async () => current.approval[decision]());
    expect(send).toHaveBeenCalledExactlyOnceWith({ optionId });
  },
);
it('component props expose real frontend input, resume and recording methods', async () => {
  const addResult = vi.fn<(value: unknown) => void>();
  const resume = vi.fn<(value: unknown) => void>();
  const record = vi
    .fn<
      NonNullable<ConversationToolResultProps['unstable_recordInteraction']>
    >()
    .mockResolvedValue(undefined);
  let current!: ToolCallComponentProps;
  const Header = (props: ToolHeaderProps) => {
    current = props;
    return props.defaultView;
  };
  const { root } = await mount(
    <Host>
      <ConversationToolResult
        {...tool}
        addResult={addResult}
        unstable_recordInteraction={record}
        components={{ Header }}
      />
    </Host>,
  );
  await act(async () => {
    current.methods.addResult?.({ id: 7 });
    await current.methods.unstable_recordInteraction?.({
      type: 'action',
      payload: { id: 7 },
    });
  });
  expect(addResult).toHaveBeenCalledWith({ id: 7 });
  expect(record).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(
      <Host>
        <ConversationToolResult
          {...tool}
          toolCallId="interrupt"
          status={{ type: 'requires-action', reason: 'interrupt' }}
          interrupt={{ type: 'human', payload: {} }}
          resume={resume}
          components={{ Header }}
        />
      </Host>,
    ),
  );
  await act(async () => current.methods.resume?.({ approved: false }));
  expect(resume).toHaveBeenCalledWith({ approved: false });
});
it('a generic input interrupt and a cold ordinary result do not select ApprovalCard', async () => {
  const Card = vi.fn<(props: ApprovalCardProps) => ReactNode>(() => (
    <p>Wrong card</p>
  ));
  let current!: ToolCallComponentProps;
  const Header = (props: ToolHeaderProps) => {
    current = props;
    return props.defaultView;
  };
  const resume = vi
    .fn<(value: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  const { root } = await mount(
    <Host>
      <ConversationToolResult
        {...tool}
        status={{ type: 'requires-action', reason: 'interrupt' }}
        resumeInterrupt={resume}
        components={{ Header, ApprovalCard: Card }}
      />
    </Host>,
  );
  expect(current.approval).toBeUndefined();
  await act(async () =>
    current.methods.resumeInterrupt?.({ answer: 'Selected' }),
  );
  expect(resume).toHaveBeenCalledExactlyOnceWith({ answer: 'Selected' });
  await act(async () =>
    root.render(
      <Host>
        <ConversationToolResult
          {...tool}
          toolName="approve"
          status={{ type: 'complete' }}
          result={{ approved: true }}
          components={{ ApprovalCard: Card }}
        />
      </Host>,
    ),
  );
  expect(Card).not.toHaveBeenCalled();
});
it('readonly approvals cannot submit through custom components', async () => {
  let current!: ApprovalCardProps;
  const send = vi
    .fn<(value: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  function ReadonlyHost() {
    const runtime = useExternalStoreRuntime<ThreadMessage>({
      messages: [],
      isRunning: false,
      onNew: async () => {},
    });
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <AgentUILocaleProvider locale="en-US">
          <ConversationToolResult
            {...tool}
            approval={{ id: 'history' }}
            respondToApproval={send}
            components={{
              ApprovalCard: (props) => {
                current = props;
                return null;
              },
            }}
          />
        </AgentUILocaleProvider>
      </AssistantRuntimeProvider>
    );
  }
  await mount(<ReadonlyHost />);
  expect(current.approval.phase).toBe('readonly');
  await act(async () => {
    current.approval.approve();
    current.approval.reject();
  });
  expect(send).not.toHaveBeenCalled();
});
it('the independent header receives focus when a completed frontend approval disappears from a custom layout', async () => {
  const render = (complete: boolean) => (
    <Host>
      <ConversationToolResult
        {...tool}
        addResult={() => {}}
        status={complete ? { type: 'complete' } : tool.status}
        result={complete ? 'Done' : undefined}
        renderToolCall={({ header, defaultView }) => (
          <article>
            {header}
            {defaultView}
          </article>
        )}
      />
    </Host>
  );
  const { el, root } = await mount(render(false));
  button(el, 'Allow').focus();
  await act(async () => button(el, 'Allow').click());
  await act(async () => root.render(render(true)));
  expect(document.activeElement).toBe(
    el.querySelector('[data-slot="tool-fallback-trigger"]'),
  );
});
