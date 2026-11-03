import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const repository = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(repository, 'apps/creator-workbench/package.json'));
const { chromium } = require('@playwright/test');
const { createServer, build } = await import(pathToFileURL(require.resolve('vite')).href);
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default;
const tailwind = (await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)).default;
const runtimeRequire = createRequire(path.join(repository, 'packages/runtime/package.json'));
const output = path.resolve(process.argv[2] ?? path.join(repository, 'artifacts/tool-result-20261028'));
await mkdir(output, { recursive: true });
const root = await realpath(await mkdtemp(path.join(tmpdir(), 'agent-ui-tool-result-')));
await mkdir(path.join(root, 'public'));
await symlink(path.join(repository, 'packages/plugins/node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
await writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script></html>');
const browser = await chromium.launch({ headless: true });
const generator = await browser.newPage();
const media = await generator.evaluate(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const draw = (progress = 1) => {
    ctx.fillStyle = '#f4f5fb'; ctx.fillRect(0, 0, 640, 300);
    ctx.fillStyle = '#4338ca'; ctx.font = 'bold 22px system-ui'; ctx.fillText('Quarterly performance', 30, 40);
    for (let i = 0; i < 4; i++) {
      const height = [76, 112, 145, 180][i] * progress;
      ctx.fillStyle = ['#c7d2fe', '#a5b4fc', '#818cf8', '#4f46e5'][i]; ctx.fillRect(55 + i * 145, 250 - height, 85, height);
      ctx.fillStyle = '#475569'; ctx.font = '14px system-ui'; ctx.fillText('Q' + (i + 1), 83 + i * 145, 277);
    }
  };
  draw(); const png = canvas.toDataURL('image/png').split(',')[1];
  const stream = canvas.captureStream(12); const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const done = new Promise(resolve => { recorder.onstop = resolve; });
  recorder.ondataavailable = event => chunks.push(event.data); recorder.start();
  for (let i = 0; i < 18; i++) { draw((i + 1) / 18); await new Promise(resolve => setTimeout(resolve, 80)); }
  recorder.stop(); await done; stream.getTracks().forEach(track => track.stop());
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return { png, video: btoa(binary) };
});
await generator.close();
await writeFile(path.join(root, 'public/chart.png'), Buffer.from(media.png, 'base64'));
await writeFile(path.join(root, 'public/clip.webm'), Buffer.from(media.video, 'base64'));
// A local playable three-second WAV; acceptance has no external media dependency.
const samples = 24000 * 3; const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / 24000 * 2 * Math.PI * 440) * 900), 44 + i * 2);
await writeFile(path.join(root, 'public/audio.wav'), wav);
// Small valid local PDF for a real download assertion.
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Length 51 >>\nstream\nBT /F1 18 Tf 30 90 Td (Tool result report) Tj ET\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let pdf = '%PDF-1.4\n'; const offsets = [0]; for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await writeFile(path.join(root, 'public/report.pdf'), pdf);
await writeFile(path.join(root, 'main.tsx'), `
import '@za38.03/agent-ui-plugins/styles.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpAgent } from '@ag-ui/client';
import { useAgUiRuntime } from '@assistant-ui/react-ag-ui';
import { AssistantRuntimeProvider, useAssistantToolUI } from '@assistant-ui/react';
import { AgentUIRoot, AgentUILocaleProvider, ConversationThread, ConversationToolTimeline } from '@za38.03/agent-ui-plugins';
import { ConversationToolResultPlugin } from '@za38.03/agent-ui-plugins/tool-result';
import './host.css';
const origin = location.origin;
const parts = [
  { type: 'text', text: '已生成季度分析图、音频摘要、演示视频和 PDF 报告。' },
  { type: 'image', source: { type: 'url', value: origin + '/chart.png', mimeType: 'image/png' }, metadata: { filename: '季度趋势.png' } },
  { type: 'audio', source: { type: 'url', value: origin + '/audio.wav', mimeType: 'audio/wav' }, metadata: { filename: '语音摘要.wav' } },
  { type: 'video', source: { type: 'url', value: origin + '/clip.webm', mimeType: 'video/webm' }, metadata: { filename: '季度演示.webm' } },
  { type: 'document', source: { type: 'url', value: origin + '/report.pdf', mimeType: 'application/pdf' }, metadata: { filename: '季度报告.pdf' } },
];
const snapshot = new URLSearchParams(location.search).has('snapshot');
const agent = new HttpAgent({ url: origin + '/agent', fetch: async (_url, init) => {
 const input = JSON.parse(String(init.body));
 const events = [{ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId }, ...(snapshot ? [{ type: 'MESSAGES_SNAPSHOT', messages: [
 { id: 'u', role: 'user', content: '请生成季度报告，附上图表、音频摘要和演示视频。' },
 { id: 'a', role: 'assistant', content: '', toolCalls: [{ id: 'media', type: 'function', function: { name: 'generate_media', arguments: '{}' } }] },
 { id: 't', role: 'tool', toolCallId: 'media', content: parts }
 ] }] : [
 { type: 'TEXT_MESSAGE_START', messageId: 'a', role: 'assistant' }, { type: 'TEXT_MESSAGE_END', messageId: 'a' },
 { type: 'TOOL_CALL_START', toolCallId: 'media', toolCallName: 'generate_media', parentMessageId: 'a' },
 { type: 'TOOL_CALL_ARGS', toolCallId: 'media', delta: '{}' }, { type: 'TOOL_CALL_END', toolCallId: 'media' },
 { type: 'TOOL_CALL_RESULT', messageId: 't', toolCallId: 'media', content: parts }
 ]), { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } }];
 return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
} });
const frame = { renderSlot: () => null, renderScopedSlot: () => null };
function Result(tool) { return <ConversationToolResultPlugin {...frame} tool={tool} />; }
function CustomUI() { useAssistantToolUI({ toolName: 'generate_media', render: () => <div data-custom-tool>Project custom renderer</div> }); return null; }
function App() {
 const runtime = useAgUiRuntime({ agent }); const [enabled, enable] = useState(true); const [dark, theme] = useState(false); const [english, language] = useState(false); const [custom, setCustom] = useState(false);
 useEffect(() => { if (!runtime.thread.getState().isLoading) runtime.thread.append('请生成季度报告，附上图表、音频摘要和演示视频。'); }, []);
 return <><header><div><span className="eyebrow">AGENT UI · TOOL RESULT</span><h1>工具结果 · 多模态展示</h1><p>同一次工具调用，按返回顺序展示文本、图片、音频、视频与文档。</p></div><nav>
 <label><input type="checkbox" checked={enabled} onChange={e => enable(e.target.checked)} />启用插件</label>
 <label><input type="checkbox" checked={dark} onChange={e => theme(e.target.checked)} />深色</label>
 <label><input type="checkbox" checked={english} onChange={e => language(e.target.checked)} />English</label>
 <label><input type="checkbox" checked={custom} onChange={e => setCustom(e.target.checked)} />自定义 UI</label>
 </nav></header><main><AgentUIRoot theme={dark ? 'dark' : 'light'}><AgentUILocaleProvider locale={english ? 'en-US' : 'zh-CN'}><AssistantRuntimeProvider runtime={runtime}>
 {custom && <CustomUI />}<ConversationThread composer={null} components={{ ...(enabled ? { ToolFallback: Result } : {}), ToolTimeline: ConversationToolTimeline }} />
 </AssistantRuntimeProvider></AgentUILocaleProvider></AgentUIRoot></main></>;
}
createRoot(document.getElementById('root')).render(<App />);
`);
await writeFile(path.join(root, 'host.css'), `body{margin:0;background:#f1f3f8;color:#182138;font-family:system-ui,sans-serif}header{max-width:840px;margin:32px auto 20px;padding:0 24px}h1{font-size:26px;margin:8px 0}header p{font-size:14px;color:#68748b;line-height:1.6}.eyebrow{font-size:11px;letter-spacing:.14em;color:#6658c5}nav{display:flex;gap:20px;flex-wrap:wrap;font-size:13px;margin-top:18px}nav label{display:flex;align-items:center;gap:5px}main{max-width:840px;margin:0 auto 32px;border-radius:20px;overflow:hidden;box-shadow:0 8px 36px #172b4d0c;background:white}.agent-ui-root{min-height:100px;background:var(--background);color:var(--foreground)}.aui-thread-root{height:auto!important}.aui-thread-viewport{overflow:visible!important}.aui-user-message-root{margin:14px 0}.aui-message-group{padding-bottom:24px}@media(max-width:600px){header{margin-top:20px;padding:0 16px}h1{font-size:23px}main{margin:0 8px 24px;border-radius:14px}nav{gap:12px}}`);
const config = { root, configFile: false, plugins: [react(), tailwind()], resolve: { dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/core'], alias: [
 { find: /^@za38\.03\/agent-ui-plugins$/, replacement: path.join(repository, 'packages/plugins/dist/index.js') },
 { find: '@za38.03/agent-ui-plugins/tool-result', replacement: path.join(repository, 'packages/plugins/dist/tool-result/index.js') },
 { find: '@za38.03/agent-ui-plugins/styles.css', replacement: path.join(repository, 'packages/plugins/dist/styles.css') },
 { find: '@assistant-ui/react-ag-ui', replacement: runtimeRequire.resolve('@assistant-ui/react-ag-ui') },
 { find: '@ag-ui/client', replacement: runtimeRequire.resolve('@ag-ui/client') },
] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root, repository] } }, logLevel: 'warn' };
const server = await createServer(config); await server.listen();
const address = server.httpServer.address(); const url = 'http://127.0.0.1:' + address.port;
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, acceptDownloads: true });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
const checks = [];
try {
 await page.goto(url); await page.locator('[data-slot="tool-result-part"]').nth(4).waitFor();
 await page.waitForFunction(() => document.querySelector('img')?.complete && document.querySelector('img')?.naturalWidth > 0 && document.querySelector('audio')?.readyState >= 2 && document.querySelector('video')?.readyState >= 2);
 await page.locator('video').evaluate(video => { video.currentTime = .8; });
 await page.waitForFunction(() => !document.querySelector('video').seeking && document.querySelector('video').readyState >= 2);
 assert.deepEqual(await page.locator('[data-content-type]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-content-type'))), ['text', 'image', 'audio', 'video', 'document']); checks.push('Five content types in original order, real media loaded');
 assert.equal(await page.locator('[data-content-type=audio] a, [data-content-type=video] a').count(), 0);
 assert.equal(await page.locator('video').getAttribute('controlslist'), 'nodownload'); checks.push('Audio/video download entries hidden; native video download control suppressed');
 assert.equal(await page.locator('[data-slot=agent-ui-thread-content]').evaluate(node => getComputedStyle(node).paddingLeft), '16px');
 checks.push('Canonical Tailwind theme and utility layer ordering verified');
 await page.screenshot({ path: path.join(output, 'desktop-light.png'), fullPage: true, animations: 'disabled' });
 await page.getByRole('button', { name: /播放.*语音/ }).click();
 await page.waitForFunction(() => document.querySelector('audio').currentTime > .15); checks.push('Audio plays via the existing player control');
 await page.getByRole('button', { name: /暂停.*语音/ }).click();
 await page.locator('video').evaluate(video => { video.currentTime = 0; return video.play(); }); await page.waitForFunction(() => document.querySelector('video').currentTime > .1); await page.locator('video').evaluate(video => video.pause()); checks.push('Video decodes and plays');
 const downloadPromise = page.waitForEvent('download'); await page.locator('a[download="季度报告.pdf"]').click(); const download = await downloadPromise;
 assert.equal(download.suggestedFilename(), '季度报告.pdf'); await download.saveAs(path.join(output, 'downloaded-report.pdf')); assert((await readFile(path.join(output, 'downloaded-report.pdf'), 'utf8')).startsWith('%PDF-1.4')); checks.push('Real local PDF download succeeds');
 await page.locator('[data-slot="image-preview"] img').click(); await page.getByRole('dialog').waitFor(); await page.screenshot({ path: path.join(output, 'image-zoom.png'), fullPage: true, animations: 'disabled' }); await page.keyboard.press('Escape'); checks.push('Image zoom opens and closes');
 await page.getByLabel('深色', { exact: true }).check(); await page.screenshot({ path: path.join(output, 'desktop-dark.png'), fullPage: true, animations: 'disabled' }); checks.push('Dark theme');
 await page.getByLabel('English', { exact: true }).check(); assert(await page.getByRole('button', { name: /Play/ }).count() > 0); checks.push('English player accessibility labels');
 await page.getByLabel('English', { exact: true }).uncheck(); await page.getByLabel('深色', { exact: true }).uncheck();
 await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true, animations: 'disabled' });
 assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks.push('390px mobile layout has no page horizontal overflow');
 await page.getByLabel('启用插件', { exact: true }).uncheck(); assert.equal(await page.locator('audio').count(), 0); await page.getByLabel('启用插件', { exact: true }).check(); await page.locator('audio').waitFor({ state: 'attached' }); checks.push('Disable and re-enable restores default and rich rendering');
 await page.getByLabel('自定义 UI', { exact: true }).check(); await page.locator('[data-custom-tool]').waitFor(); assert.equal(await page.locator('audio').count(), 0); await page.getByLabel('自定义 UI', { exact: true }).uncheck(); checks.push('Named custom renderer has priority without duplicate media');
 await page.setViewportSize({ width: 1100, height: 1100 }); await page.goto(url + '/?snapshot=1'); await page.locator('audio').waitFor({ state: 'attached' }); await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2); await page.screenshot({ path: path.join(output, 'history-snapshot.png'), fullPage: true, animations: 'disabled' }); checks.push('MESSAGES_SNAPSHOT history restores all five types');
 assert.deepEqual(errors, []);
 const modules = new Set();
 await build({ ...config, plugins: [...config.plugins, { name: 'production-boundary', generateBundle(_options, bundle) { for (const entry of Object.values(bundle)) if (entry.type === 'chunk') for (const [id, module] of Object.entries(entry.modules)) if (module.renderedLength > 0) modules.add(id.replaceAll('\\', '/')); } }] });
 assert(![...modules].some(id => id.includes('/packages/creator/') || /\/plugins\/dist\/(sources|resources|catalog)\//u.test(id))); checks.push('Standalone production build contains no Creator or catalog/snapshot modules');
 await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, root, checks, pageErrors: errors, screenshots: ['desktop-light.png', 'desktop-dark.png', 'mobile.png', 'image-zoom.png', 'history-snapshot.png'] }, null, 2));
 console.log(JSON.stringify({ output, root, checks }, null, 2));
} finally { await page.close(); await browser.close(); await server.close(); }
