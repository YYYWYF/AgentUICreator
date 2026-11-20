// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAui, type AssistantRuntime, type AttachmentAdapter } from '@assistant-ui/react';
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from '@za38.03/agent-ui-runtime';
import { expect, it } from 'vitest';
import { AgentUILocaleProvider } from '../src/locale.js';
import { ConversationCanonicalComposer } from '../src/plugins/composer/adapters/presentation/composer.js';
import { ConversationComposerAddAttachment } from '../src/plugins/add-attachment-action/adapters/presentation/add-attachment-action.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each([
  { locale: 'zh-CN' as const, unavailable: '附件功能不可用。' },
  { locale: 'en-US' as const, unavailable: 'Attachments are unavailable.' },
])('follows attachment capability updates and localizes no-adapter errors in $locale', async ({ locale, unavailable }) => {
  let runtime!: AssistantRuntime;
  const threadBinding = createEphemeralConversationThreadBinding();
  const adapter: AttachmentAdapter = {
    accept: 'text/plain',
    async add({ file }) {
      return { id: file.name, type: 'document', name: file.name, file, contentType: file.type, status: { type: 'requires-action', reason: 'composer-send' } };
    },
    async remove() {},
    async send(attachment) {
      return { ...attachment, status: { type: 'complete' }, content: [{ type: 'text', text: 'Attachment' }] };
    },
  };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  function Host({ enabled }: { enabled: boolean }) {
    return <ConversationRuntimeProvider endpoint='http://example.test/agent' threadBinding={threadBinding}
      attachments={enabled ? {} : false} attachmentAdapter={enabled ? adapter : undefined}>
      <AgentUILocaleProvider locale={locale}><Capture />
      <ConversationCanonicalComposer leadingActions={<ConversationComposerAddAttachment aria-label='fixture-attach' />} />
    </AgentUILocaleProvider></ConversationRuntimeProvider>;
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Host enabled={false} />));
    await act(async () => runtime.thread.composer.setText('Preserve attachment draft'));
    expect(host.querySelector('[aria-label="fixture-attach"]')).toBeNull();
    await act(async () => {
      await expect(runtime.thread.composer.addAttachment(new File(['Text'], 'disabled.txt', { type: 'text/plain' }))).rejects.toThrow('Attachments are not supported');
    });
    expect(host.querySelector('[data-slot="aui_composer-attachment-error"]')?.textContent).toBe(unavailable);
    expect(runtime.thread.composer.getState().attachments).toEqual([]);
    await act(async () => root.render(<Host enabled />));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="fixture-attach"]')?.disabled).toBe(false);
    await act(async () => { await runtime.thread.composer.addAttachment(new File(['Text'], 'enabled.txt', { type: 'text/plain' })); });
    expect(runtime.thread.composer.getState().attachments.map(attachment => attachment.name)).toEqual(['enabled.txt']);
    expect(host.querySelector('[data-slot="aui_composer-attachment-error"]')).toBeNull();
    await act(async () => root.render(<Host enabled={false} />));
    expect(runtime.thread.getState().capabilities.attachments).toBe(false);
    expect(host.querySelector('[aria-label="fixture-attach"]')).toBeNull();
    expect(runtime.thread.composer.getState().text).toBe('Preserve attachment draft');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
