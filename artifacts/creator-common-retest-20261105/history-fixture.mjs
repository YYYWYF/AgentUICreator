import { createServer } from 'node:http';
import { appendFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Disposable QA backend, never shipped in the Agent UI production application.
const log = fileURLToPath(new URL('./history-requests.live.jsonl', import.meta.url));
const conversation = { id: 'qa-history-001', title: '自有接口验收会话' };
await appendFile(log, '');
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5174');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, 'http://127.0.0.1:47835');
  await appendFile(log, JSON.stringify({ at: new Date().toISOString(), method: request.method, path: url.pathname, query: url.search }) + '\n');
  if (request.method === 'GET' && url.pathname === '/avatar.svg') {
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#ef6c00"/><text x="32" y="40" font-size="25" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">QA</text></svg>'); return;
  }
  if (request.method === 'GET' && url.pathname === '/conversations') {
    response.end(JSON.stringify({ conversations: [conversation] })); return;
  }
  if (request.method === 'GET' && ['/conversation/qa-history-001', '/conversations/qa-history-001'].includes(url.pathname)) {
    response.end(JSON.stringify({ ...conversation, state: { values: { messages: [{ id: 'qa-answer', type: 'ai', content: '这条历史消息来自本地自有接口。' }] } } })); return;
  }
  response.writeHead(404); response.end(JSON.stringify({ error: 'Not found in QA fixture' }));
});
server.listen(47835, '127.0.0.1', async () => {
  await writeFile(fileURLToPath(new URL('./history-fixture-pid.json', import.meta.url)), JSON.stringify({ pid: process.pid }));
  console.log('QA history fixture: http://127.0.0.1:47835');
});
const close = () => server.close(() => process.exit(0));
process.once('SIGTERM', close); process.once('SIGINT', close);
