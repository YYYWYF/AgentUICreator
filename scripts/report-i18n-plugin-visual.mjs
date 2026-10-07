import { readFile, readdir, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(repository, "apps/creator-workbench/tests/support/i18n-plugin-visual-coverage.json");
const requiredProjects = ["zh-CN-desktop", "zh-CN-narrow", "en-US-desktop", "en-US-narrow"];
const gaps = {
  "conversation-suggestions": "All stock suggestions captured; custom Host suggestions remain data.",
  "assistant-ui-dictation-action": "Deterministic Host adapter; real microphone/browser permission behavior not tested.",
  "assistant-ui-copy-action": "Visible idle control; clipboard success/error not exercised.",
  "assistant-ui-reload-action": "Visible control; regeneration/branch persistence not exercised.",
  "assistant-ui-export-markdown-action": "Localized menu and viewport/theme boundary tested; downloaded file content not checked.",
  "assistant-ui-feedback-actions": "Host adapter makes controls available; persistence success/error not exercised.",
  "web-search": "Successful structured result captured; invalid-result and loading transitions not separately exercised.",
  "generated-file-message": "URL file card captured; encoded/media variants and downloads not tested.",
  "conversation-command-source": "Source/locale identities and command popover tested; executing /new not checked.",
  "assistant-ui-reasoning": "Known upstream localization seams are recorded in docs/i18n/upstream-localization-gaps.md; vendor remains unchanged.",
  "assistant-ui-tool-group": "Known upstream localization seams are recorded in docs/i18n/upstream-localization-gaps.md; vendor remains unchanged.",
};
function flatten(suites) {
  return suites.flatMap(suite => [...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => ({ title: spec.title, project: test.projectName, status: test.status, results: test.results }))), ...flatten(suite.suites ?? [])]);
}
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]))).flat();
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeI18nVisualReport({ output, resultsDirectory = path.join(repository, "apps/creator-workbench/test-results/i18n-plugin-visual") } = {}) {
  output ??= resultsDirectory;
  await mkdir(output, { recursive: true });
  if (path.resolve(output) !== path.resolve(resultsDirectory)) await cp(resultsDirectory, path.join(output, "evidence"), { recursive: true });
  const evidenceRoot = path.resolve(output) === path.resolve(resultsDirectory) ? resultsDirectory : path.join(output, "evidence");
  const result = JSON.parse(await readFile(path.join(evidenceRoot, "results.json"), "utf8"));
  const tests = flatten(result.suites);
  const projects = requiredProjects;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const release = JSON.parse(await readFile(path.join(repository, "packages/source-registry/registry/release.json"), "utf8"));
  const ids = Object.keys(release.plugins).sort();
  const missing = ids.filter(id => !Object.hasOwn(manifest, id));
  const unknown = Object.keys(manifest).filter(id => !ids.includes(id));
  const invalid = Object.entries(manifest).filter(([, entry]) => !["visual", "headless"].includes(entry.kind) || !Array.isArray(entry.scenarios) || !entry.scenarios.length).map(([id]) => id);
  const coverage = ids.map(id => ({ id, classification: manifest[id]?.kind === "headless" ? "headless-integration" : "visual", cases: manifest[id]?.scenarios ?? [],
    projects: Object.fromEntries(projects.map(project => {
      const scenarios = manifest[id]?.scenarios ?? [];
      const matches = name => tests.filter(test => test.project === project && (test.title === `surface evidence: ${name}` || test.title.startsWith(name)));
      const missingScenarios = scenarios.filter(name => matches(name).length === 0);
      const matched = [...new Set(scenarios.flatMap(matches))];
      return [project, {
        tests: matched.map(test => ({ title: test.title, status: test.status })), missingScenarios,
        status: matched.length === 0 || missingScenarios.length > 0 ? "MISSING"
          : matched.every(test => test.status === "expected") ? "AUTOMATED_CHECKS_PASSED" : "BLOCKED",
      }];
    })),
    limits: gaps[id] ?? "Scenario evidence only; no screenshot-diff baseline or exhaustive state acceptance.",
  }));
  const screenshots = (await files(evidenceRoot)).filter(file => file.endsWith(".png")).map(file => path.relative(output, file));
  const blocked = missing.length > 0 || unknown.length > 0 || invalid.length > 0
    || tests.length === 0 || tests.some(test => test.status !== "expected")
    || result.stats.unexpected > 0 || result.stats.skipped > 0 || (result.errors ?? []).length > 0
    || coverage.some(row => Object.values(row.projects).some(project => project.status !== "AUTOMATED_CHECKS_PASSED"));
  const summary = { date: new Date().toISOString(), verdict: blocked ? "BLOCKED" : "AUTOMATED_CHECKS_PASSED",
    visualAcceptance: "NOT_SIGNED", reason: "DOM and geometry assertions plus screenshot evidence; no pixel diff or manual visual acceptance.",
    missing, unknown, invalid, releasePlugins: ids.length,
    visualPlugins: coverage.filter(row => row.classification === "visual").length,
    headlessPlugins: coverage.filter(row => row.classification === "headless-integration").length,
    projects, testStats: result.stats, screenshotCount: screenshots.length,
    errors: result.errors ?? [],
    failures: tests.filter(test => test.status !== "expected").map(test => ({ title: test.title, project: test.project, status: test.status, errors: test.results.flatMap(row => row.errors ?? []) })), coverage };
  await writeFile(path.join(output, "coverage.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(output, "coverage.csv"), ["plugin,classification,"+projects.join(",")+",limits", ...coverage.map(row=>[row.id,row.classification,...projects.map(project=>row.projects[project].status),row.limits].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(","))].join("\n")+"\n");
  const html = `<!doctype html><meta charset="utf-8"><title>I18n Plugin Evidence</title><style>body{font:15px system-ui;margin:24px;background:#f6f5fa;color:#25202f}h1{font-size:24px}input{padding:10px;width:360px;max-width:90%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}figure{margin:0;padding:12px;background:white;border:1px solid #ddd;border-radius:10px}img{width:100%;max-height:500px;object-fit:contain;background:#eee}figcaption{word-break:break-word;font-size:12px;margin-bottom:8px}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{padding:8px;border:1px solid #ddd;text-align:left}.blocked{color:#a00}</style><h1>全插件 i18n 浏览器证据 — ${summary.verdict}</h1><p>${ids.length} release Plugins / ${summary.visualPlugins} visual / ${summary.headlessPlugins} headless. ${tests.length} tests, ${screenshots.length} screenshots. zh-CN / en-US × 1440×900 / 390×844. 自动检查通过不代表全状态视觉验收。</p><p>查看 <a href="coverage.json">coverage.json</a> / <a href="coverage.csv">CSV</a> / <a href="${path.relative(output,path.join(evidenceRoot,'results.json'))}">Playwright JSON</a>。</p><table><tr><th>Plugin</th><th>Scope</th>${projects.map(project=>`<th>${escape(project)}</th>`).join('')}</tr>${coverage.map(row=>`<tr><td>${escape(row.id)}</td><td>${row.classification}</td>${projects.map(project=>`<td>${escape(row.projects[project].status)}</td>`).join('')}</tr>`).join('')}</table><input id="filter" placeholder="筛选 locale、尺寸、场景、状态"><div class="grid">${screenshots.map(file=>`<figure data-name="${escape(file)}"><figcaption>${escape(file)}</figcaption><a href="${escape(file)}"><img loading="lazy" src="${escape(file)}"></a></figure>`).join('')}</div><script>document.querySelector('#filter').oninput=e=>document.querySelectorAll('figure').forEach(f=>f.hidden=!f.dataset.name.includes(e.target.value));</script>`;
  await writeFile(path.join(output, "gallery.html"), html);
  return summary;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--output");
  const summary = await writeI18nVisualReport({ output: index < 0 ? undefined : path.resolve(process.argv[index+1]) });
  if (summary.verdict === "BLOCKED") process.exitCode = 1;
  console.log(JSON.stringify({ verdict:summary.verdict,plugins:summary.releasePlugins,screenshots:summary.screenshotCount,testStats:summary.testStats,failures:summary.failures.map(row=>({title:row.title,project:row.project})) },null,2));
}
