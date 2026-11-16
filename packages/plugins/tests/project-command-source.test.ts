// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentUILocaleCode, ConversationSlashCommand } from '@za38.03/agent-ui-plugins';
import { createConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';

type Registry = ReturnType<typeof createConversationCommandRegistry>;
type LoadInput = { locale: AgentUILocaleCode; signal: AbortSignal };
type Loader = (input: LoadInput) => Promise<readonly ConversationSlashCommand[]>;
interface LocaleService {
  getSnapshot(): { locale: AgentUILocaleCode };
  subscribe(listener: () => void): () => void;
}
interface GeneratedModule {
  businessCommands: { loadCommands: Loader };
  default: {
    setup(context: {
      services: {
        provide(name: string, value: Registry): void;
        get(name: string): LocaleService;
      };
      actions: { startNewConversation(): Promise<void> };
    }): () => void;
  };
}

// Exercise the actual generated template with its Host imports supplied here.
async function generatedModule(): Promise<GeneratedModule> {
  const source = await readFile(new URL('../src/plugins/conversation-command-source/adapters/application-definition.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const imports: Record<string, unknown> = {
    '@za38.03/agent-ui-plugins': {
      resolveAgentUILocaleMessages: (locale: string) => ({ conversationTriggers: { newConversation: `new:${locale}` } }),
    },
    '@za38.03/agent-ui-plugins/conversation-command-source': {
      manifest: { id: 'conversation-command-source' }, bindSetup: (setup: unknown) => setup,
    },
    '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale': { AGENT_UI_LOCALE_SERVICE: 'agent-ui.locale' },
    '@za38.03/agent-ui-plugins/composer-triggers': { CONVERSATION_COMMAND_SOURCE: 'conversation.slash-command-source', createConversationCommandRegistry },
    './index': { ConversationCommandSourcePlugin: () => null },
  };
  const module: { exports: unknown } = { exports: {} };
  runInNewContext(code, {
    module, AbortController, console,
    require(name: string): unknown {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected template import: ${name}`);
      return imports[name];
    },
  });
  return module.exports as GeneratedModule;
}

function mount(module: GeneratedModule) {
  let locale: AgentUILocaleCode = 'zh-CN';
  const listeners = new Set<() => void>();
  let registry: Registry | undefined;
  const startNewConversation = vi.fn(async () => {});
  const stop = module.default.setup({
    services: {
      provide(name, value) {
        expect(name).toBe('conversation.slash-command-source');
        registry = value;
      },
      get: () => ({
        getSnapshot: () => ({ locale }),
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      }),
    },
    actions: { startNewConversation },
  });
  if (!registry) throw new Error('Template did not provide its command registry');
  return {
    registry, stop, startNewConversation,
    setLocale(next: AgentUILocaleCode) { locale = next; listeners.forEach(listener => listener()); },
  };
}

function pendingCommands() {
  let resolve!: (commands: readonly ConversationSlashCommand[]) => void;
  const promise = new Promise<readonly ConversationSlashCommand[]>(done => { resolve = done; });
  return { promise, resolve };
}
const command = (id: string): ConversationSlashCommand => ({ id, label: id, mode: 'directive' });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); });

it('keeps the default new-conversation command usable without a business request', async () => {
  const module = await generatedModule();
  const load = vi.spyOn(module.businessCommands, 'loadCommands');
  const host = mount(module);
  await flush();
  expect(load).toHaveBeenCalledOnce();
  expect(load.mock.calls[0]?.[0].locale).toBe('zh-CN');
  const commands = host.registry.getSnapshot();
  expect(commands.map(item => item.id)).toEqual(['new']);
  const newCommand = commands[0];
  if (newCommand?.mode !== 'action') throw new Error('Default action is missing');
  await newCommand.execute();
  expect(host.startNewConversation).toHaveBeenCalledOnce();
  host.stop();
});

it('automatically registers the commands returned by the project request and cleans them up', async () => {
  const module = await generatedModule();
  const execute = vi.fn<() => void>();
  const load = vi.fn<Loader>().mockResolvedValue([command('summarize'), { id: 'refresh', label: 'Refresh', mode: 'action', execute }]);
  module.businessCommands.loadCommands = load;
  const host = mount(module);
  await flush();
  expect(host.registry.getSnapshot().map(item => item.id)).toEqual(['new', 'summarize', 'refresh']);
  const action = host.registry.getSnapshot()[2];
  if (action?.mode !== 'action') throw new Error('Project action is missing');
  await action.execute();
  expect(execute).toHaveBeenCalledOnce();
  host.stop();
  expect(load.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(host.registry.getSnapshot()).toEqual([]);
});

it('reloads for the current language and ignores stale or stopped requests', async () => {
  const module = await generatedModule();
  const first = pendingCommands();
  const second = pendingCommands();
  const third = pendingCommands();
  const load = vi.fn<Loader>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  module.businessCommands.loadCommands = load;
  const host = mount(module);
  host.setLocale('en-US');
  expect(load.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(load.mock.calls[1]?.[0].locale).toBe('en-US');
  second.resolve([command('current')]);
  first.resolve([command('stale')]);
  await flush();
  expect(host.registry.getSnapshot().map(item => item.id)).toEqual(['new', 'current']);
  expect(host.registry.getSnapshot()[0]?.label).toBe('new:en-US');
  host.setLocale('zh-CN');
  expect(host.registry.getSnapshot().map(item => item.id)).toEqual(['new']);
  host.stop();
  third.resolve([command('after_stop')]);
  await flush();
  expect(load.mock.calls[2]?.[0].signal.aborted).toBe(true);
  expect(host.registry.getSnapshot()).toEqual([]);
});

it.each(['request failure', 'duplicate command'] as const)('preserves the default command on %s', async failure => {
  const module = await generatedModule();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  module.businessCommands.loadCommands = failure === 'request failure'
    ? async () => { throw new Error('REQUEST_FAILED'); }
    : async () => [command('partial'), command('new')];
  const host = mount(module);
  await flush();
  expect(host.registry.getSnapshot().map(item => item.id)).toEqual(['new']);
  expect(error).toHaveBeenCalledWith('COMMANDS_LOAD_FAILED', expect.objectContaining({ message: expect.any(String) }));
  host.stop();
});
