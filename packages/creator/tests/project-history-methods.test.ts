import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createMockConversationApiHandler } from '../src/mock-agent/conversations/handler.js';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { ProjectConversationDataSource } from './support/project-history-source.js';

// Templates are frontend source assets, loaded by the same bundler as a project.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../../plugins/resources/registry/items/foundation/core-application/files/services/conversations/data-source.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { createConversationDataSource } = await import(
  /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0]!.text).toString('base64')}`
) as { createConversationDataSource(options: { endpoint: string }): ProjectConversationDataSource };
import type { MockConversationFixture } from '../src/mock-agent/conversations/fixtures.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});
async function backend() {
  const fixture: MockConversationFixture = {
    summary: { id: '会话/a b', title: 'Saved', status: 'regular' },
    detail: { id: '会话/a b', title: 'Saved', history: { format: 'langchain', messages: [{ id: 'm1', type: 'human', content: 'Hello' }] } },
  };
  const handler = createMockConversationApiHandler({ endpoint: '/history', fixtures: [fixture], listDelayMs: 0, detailDelayMs: 0 });
  const server = createServer((request, response) => {
    void handler(request, response).then(handled => {
      if (!handled) { response.statusCode = 404; response.end(); }
    });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('TEST_ADDRESS_REQUIRED');
  const endpoint = `http://127.0.0.1:${address.port}/history`;
  return { source: createConversationDataSource({ endpoint }), endpoint, fixture };
}

it('runs all project methods against the same default Mock contract', async () => {
  const { source, fixture, endpoint } = await backend();
  expect(await source.list()).toEqual([fixture.summary]);
  expect(await source.get(fixture.detail.id)).toEqual(fixture.detail);
  await source.rename!(fixture.detail.id, 'Renamed');
  expect((await source.get(fixture.detail.id)).title).toBe('Renamed');
  await source.archive!(fixture.detail.id);
  expect(await source.list()).toMatchObject([{ title: 'Renamed', status: 'archived' }]);
  await source.unarchive!(fixture.detail.id);
  expect(await source.list()).toMatchObject([{ status: 'regular' }]);
  await source.delete(fixture.detail.id);
  expect(await source.list()).toEqual([]);
  await expect(source.get(fixture.detail.id)).rejects.toThrow('404');
  expect((await fetch(`${endpoint}/conversation/${encodeURIComponent(fixture.detail.id)}`)).status).toBe(404);
});

it('passes request cancellation through the project method', async () => {
  const { source } = await backend();
  const controller = new AbortController();
  controller.abort();
  await expect(source.list({ signal: controller.signal })).rejects.toThrow();
});
