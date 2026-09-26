import { useEffect, useRef, useState } from "react";
import { CREATOR_MOCK_API_PATH, type CreatorMockState } from "../mock/types.js";
import type { MockDemoCompatibility } from "../mock/demo-compatibility.js";
import { packageInstallCommand } from "./package-install-guidance.js";
import { mockResourcePreviews } from "./mock-demo-previews.js";

async function mockRequest(route = "", body?: unknown, signal?: AbortSignal): Promise<CreatorMockState> {
  const response = await fetch(`${CREATOR_MOCK_API_PATH}${route}`, {
    ...(body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Creator 服务端尚未提供 Mock 控制接口，请重启 Creator 开发服务。");
  }
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `Mock 请求失败（${response.status}）`);
  return value as CreatorMockState;
}

export function MockServicePanel({ projectId }: { projectId?: string } = {}) {
  const [state, setState] = useState<CreatorMockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const version = useRef(0);
  const inFlight = useRef(false);
  const [compatibility, setCompatibility] = useState<MockDemoCompatibility | null>(null);
  const compatibilityVersion = useRef(0);
  const [installation, setInstallation] = useState<{ scenarioId: string; resourceId: string; status: "installing" | "success" | "error"; message: string } | null>(null);
  const resourceLabels: Record<string, string> = { "assistant-ui-reasoning": "推理展示", "assistant-ui-tool-group": "工具分组", "assistant-ui-tool-fallback": "工具调用与审批", "chart-message": "图表", "task-group": "任务卡片", "job-progress-message": "进度展示", "agent-plan-message": "计划展示", "agent-status-message": "状态展示" };

  const [resourceSelection, setResourceSelection] = useState<string | null>(null);

  async function installRequirement(resourceId: string, scenarioId: string) {
    if (inFlight.current || !compatibility?.projectId) return;
    const requirement = compatibility.requirements.find(item => item.id === resourceId);
    if (!requirement || (!requirement.sourceItemId && !requirement.plugin)) return;
    inFlight.current = true;
    const current = ++compatibilityVersion.current;
    setBusy(true); setError(null); setNotice("");
    setInstallation({ scenarioId, resourceId, status: "installing", message: "正在引入资源…" });
    try {
      const response = await fetch(`${CREATOR_MOCK_API_PATH}${requirement.sourceItemId ? "/install-resources" : "/install-plugin"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: compatibility.projectId, ...(requirement.sourceItemId ? { sourceItemId: requirement.sourceItemId } : { pluginId: requirement.plugin!.id }) }),
      });
      const result = await response.json();
      if (current !== compatibilityVersion.current) return;
      if (!response.ok) throw new Error(result.error ?? "插件引入失败，请重试。");
      setCompatibility(result as MockDemoCompatibility);
      setInstallation({ scenarioId, resourceId, status: "success", message: "已引入并启用，可以发送消息测试。" });
    } catch (failure) {
      if (current === compatibilityVersion.current) setInstallation({ scenarioId, resourceId, status: "error", message: failure instanceof Error ? failure.message : "插件引入失败，请重试。" });
    } finally { inFlight.current = false; setBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    compatibilityVersion.current += 1;
    setCompatibility(null);
    setInstallation(null);
    setResourceSelection(null);
    async function refresh() {
      const current = compatibilityVersion.current;
      try {
        const response = await fetch(`${CREATOR_MOCK_API_PATH}/compatibility`, { signal: controller.signal });
        const result = await response.json() as MockDemoCompatibility;
        if (controller.signal.aborted || current !== compatibilityVersion.current) return;
        if (response.ok && (result.status === "checked" || result.status === "unknown") &&
            (projectId === undefined || result.projectId === projectId)) setCompatibility(result);
        else setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
      } catch {
        if (!controller.signal.aborted && current === compatibilityVersion.current) setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [projectId, retry]);

  function requirementsFor(scenarioId: string) {
    return compatibility?.status === "checked"
      ? compatibility.requirements.filter(requirement => requirement.scenarioIds.includes(scenarioId) && requirement.status !== "ready")
      : [];
  }

  useEffect(() => { setCopiedEndpoint(null); }, [state?.endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight.current) return;
      const current = version.current;
      try {
        const next = await mockRequest("", undefined, controller.signal);
        if (!controller.signal.aborted && current === version.current) {
          setState(next); setError(null);
        }
      } catch (failure) {
        if (!controller.signal.aborted && current === version.current) {
          setError(failure instanceof Error ? failure.message : "无法连接 Mock 服务控制端。");
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [retry]);

  async function act(route: string, body: unknown, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    version.current += 1;
    setBusy(true); setError(null); setNotice("");
    try {
      const next = await mockRequest(route, body);
      setState(next);
      if (route === "/start" && next.endpoint !== null) {
        // Verify the advertised independent URL from the browser, including CORS.
        const check = await fetch(`${next.endpoint}/scenarios`);
        if (!check.ok) throw new Error(`Mock 服务已启动，但连接检查失败（${check.status}）。`);
      }
      setNotice(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Mock 操作失败。");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function copyAddress() {
    if (!state?.endpoint) return;
    try {
      await navigator.clipboard.writeText(state.endpoint);
      setCopiedEndpoint(state.endpoint);
      setNotice("Mock 地址已复制。");
    } catch { setError("无法自动复制，请选中地址手动复制。"); }
  }

  const selected = state?.scenarios.find((scenario) => scenario.id === (resourceSelection ?? state.scenarioId));
  const search = query.trim().toLocaleLowerCase();
  const scenarios = state?.scenarios.filter((scenario) =>
    `${scenario.id} ${scenario.title} ${scenario.description ?? ""}`.toLocaleLowerCase().includes(search),
  ) ?? [];

  return (
    <section className="creator-mock-panel" id="creator-mock-panel" aria-label="Mock Agent 开发服务" aria-busy={busy}>
      <header>
        <h2>Mock Agent</h2>
        <p>在本机运行预置 Demo，供你的 Agent UI 通过 AG-UI API 连接。</p>
      </header>
      {error === null ? null : <div className="creator-mock-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>重试连接</button></div>}
      {state === null ? <p role="status">正在读取 Mock 服务状态…</p> : <>
        <section className="creator-mock-service" aria-label="服务控制">
          <div className="creator-mock-service-actions">
            <strong className="creator-mock-status" data-running={state.status === "running"}>
              {state.status === "running" ? "运行中" : "未运行"}
            </strong>
            <button type="button" disabled={busy} onClick={() => void act(
              state.status === "running" ? "/stop" : "/start", {},
              state.status === "running" ? "Mock 服务已停止。" : "Mock 服务已启动，请将前端 endpoint 配置为下方地址。",
            )}>{busy ? "处理中…" : state.status === "running" ? "停止服务" : "启动服务"}</button>
          </div>
          {state.endpoint === null ? <p>启动后会显示本机地址。系统自动分配可用端口。</p> : <>
            <label className="creator-mock-address">AG-UI 地址<input readOnly value={state.endpoint} onFocus={(event) => event.target.select()} /></label>
            <button type="button" className="creator-mock-copy" data-copied={copiedEndpoint === state.endpoint} onClick={() => void copyAddress()}>
              {copiedEndpoint === state.endpoint ? "✓ 已复制" : "复制地址"}
            </button>
            <details className="creator-mock-integration">
              <summary>如何接入这个地址</summary>
              <p>将接入组件的 endpoint 或前端环境变量改成这个地址：</p>
              <pre><code>{`<Agent endpoint="${state.endpoint}" />\n\nVITE_AGENT_ENDPOINT=${state.endpoint}`}</code></pre>
              <p>使用环境变量时，在你自己的前端项目根目录（与 package.json 同级）创建或编辑 <code>.env.local</code>，填写上面的 <code>VITE_AGENT_ENDPOINT</code>。</p>
              <p>保存后重启这个前端项目的开发服务。组件中显式传入的 endpoint 优先于环境变量。服务停止后此地址不可用，再次启动请复制新地址。</p>
            </details>
          </>}
          <p>关闭面板后服务继续运行；退出 Creator 后服务停止。</p>
        </section>
        <p className="creator-mock-notice" role="status">{notice}</p>
        <section aria-label="选择预置 Demo">
          <h3>预置 Demo</h3>
          <p>Demo 只提供模拟数据，不会自动安装前端插件。基础模板提供会话能力，扩展展示由 Creator 按需引入。</p>
          <p>当前：<strong>{selected?.title ?? state.scenarioId}</strong>。选择后，在已接入的 Agent UI 中发送一条消息来播放。正在运行的请求保持原场景。</p>
          {compatibility?.status !== "checked" ? <p className="creator-mock-requirement" role="status">{compatibility === null ? "正在检查当前项目的 Demo 支持…" : "无法检查当前项目的插件，请确认已选择并初始化项目。"}</p> : null}
          <label className="creator-mock-speed">播放时长倍率
            <select disabled={busy} value={state.speed} onChange={(event) => void act("/select", { scenarioId: state.scenarioId, speed: Number(event.target.value) }, "播放时长已更新，下一次请求生效。") }>
              <option value={0}>立即完成</option><option value={0.1}>快速测试（0.1×）</option><option value={0.5}>较快（0.5×）</option><option value={1}>正常（1×）</option><option value={2}>较慢（2×）</option>
            </select>
          </label>
          <label className="creator-mock-search">搜索 Demo<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、描述或场景 ID" /></label>
          <div className="creator-mock-scenarios">
            {scenarios.map((scenario) => <div className="creator-mock-scenario" key={scenario.id} data-selected={scenario.id === state.scenarioId}>
              <label className="creator-mock-scenario-choice">
              <input type="radio" name="creator-mock-scenario" checked={scenario.id === (resourceSelection ?? state.scenarioId)} disabled={busy} onChange={() => { if (scenario.resources?.length) setResourceSelection(scenario.id); else { setResourceSelection(null); void act("/select", { scenarioId: scenario.id, speed: state.speed }, `已选择 ${scenario.title}，下一次请求生效。`); } }} />
              <span><strong>{scenario.title}</strong>{scenario.description ? <span>{scenario.description}</span> : null}
              </span></label>
              <div className="creator-mock-scenario-footer">
                <code>{scenario.id}</code>
                {requirementsFor(scenario.id).map(requirement => <div className="creator-mock-resource-row" key={requirement.id}>
                  {requirement.missingPackages?.map(item => <p key={item.name}>缺少依赖：{item.name} {item.required}。</p>)}
                  {requirement.missingPackages?.length ? <p>请在项目中安装后重试：<code>{packageInstallCommand(requirement.missingPackages)}</code></p> : null}
                  <span className="creator-mock-requirement-label">{requirement.status === "missing" ? `当前项目缺少${requirement.name}` : `当前项目未启用或未正确放置${requirement.name}`}</span>
                  {(requirement.sourceItemId ? compatibility?.canInstallResources : compatibility?.canInstall) ? <div className="creator-mock-resource-actions">
                    <button type="button" disabled={busy || !!requirement.missingPackages?.length} onClick={() => void installRequirement(requirement.id, scenario.id)}>
                      {installation?.scenarioId === scenario.id && installation.resourceId === requirement.id && installation.status === "installing" ? "正在引入…"
                        : installation?.scenarioId === scenario.id && installation.resourceId === requirement.id && installation.status === "error" ? "重试引入"
                        : requirement.sourceItemId ? "安装资源" : `${requirement.status === "disabled" ? "启用" : "引入"}${resourceLabels[requirement.plugin?.id ?? requirement.id] ?? requirement.name}`}
                    </button>
                    {requirement.status === "missing" && mockResourcePreviews[requirement.plugin?.id ?? requirement.id] ? <span className="creator-mock-preview">
                      <button type="button" className="creator-mock-preview-help" aria-label={`查看${requirement.name}示意图`} aria-describedby={`mock-resource-preview-${scenario.id}-${requirement.id}`}>?</button>
                      <span className="creator-mock-preview-popover" id={`mock-resource-preview-${scenario.id}-${requirement.id}`} role="tooltip">
                        <strong>{requirement.name}</strong>
                        <img src={mockResourcePreviews[requirement.plugin?.id ?? requirement.id]} alt={`${requirement.name}示意图`} width="480" height="260" />
                        <span>即将引入此资源，实际展示取决于项目样式与 Agent 数据。</span>
                      </span>
                    </span> : null}
                  </div> : null}
                </div>)}
              </div>
              {scenario.resources?.length && resourceSelection === scenario.id ? <div>
                <p>{compatibility?.status === "checked" && requirementsFor(scenario.id).length === 0 ? "Demo 资源已安装" : "此场景使用 Frontend Tools，需要安装并启用 Demo 资源。"}</p>
                <button type="button" disabled={busy || compatibility?.status !== "checked" || requirementsFor(scenario.id).length > 0}
                  onClick={() => void act("/select", { scenarioId: scenario.id, speed: state.speed }, `已启用 ${scenario.title}，在 Agent UI 中发送消息运行。`)}>运行场景</button>
              </div> : null}
              {installation?.scenarioId === scenario.id ? <div className="creator-mock-install-status" data-status={installation.status} role={installation.status === "error" ? "alert" : "status"}>{installation.message}</div> : null}
              {requirementsFor(scenario.id).length > 0 && !(scenario.resources?.length ? compatibility?.canInstallResources : compatibility?.canInstall) ? <div className="creator-mock-install-status">当前 Creator 宿主尚未配置一键引入。</div> : null}
            </div>)}
          </div>
          {scenarios.length === 0 ? <p>没有匹配的 Demo。</p> : null}
        </section>
      </>}
    </section>
  );
}
