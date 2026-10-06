import { Fragment, useEffect, useRef, useState } from "react";
import { FlaskConical, Copy, Check } from "lucide-react";
import { Badge } from "./components/badge.js";
import { Button } from "./components/button.js";
import { Card } from "./components/card.js";
import { Input } from "./components/input.js";
import { NativeSelect } from "./components/native-select.js";
import { CREATOR_MOCK_API_PATH, type CreatorMockState } from "../mock/types.js";
import type { MockDemoCompatibility } from "../mock/demo-compatibility.js";

const demoTitles: Record<string, string> = {
  "multimodal-input": "发送文字、图片与文件",
  "file-output": "工具生成文件并提供下载",
  "a2ui-form-controls": "A2UI 交互表单",
  "a2ui-interactive-order": "A2UI 订单确认卡片",
  "frontend-tool-fill-form": "前端工具填写表单",
  "frontend-tool-open-dialog": "前端工具打开弹窗",
  "ask-user-question": "向用户提问并继续回答",
  "concurrent-conversations": "多个会话同时运行",
  "multi-message-response": "一次回复包含多条消息",
  "cancel-before-first-output": "首次回复前取消运行",
  "agent-plan": "通过工具参数展示执行计划",
  "agent-status": "通过工具参数展示 Agent 状态",
  "data-message-chart": "在消息中展示自定义图表",
  "agent-state-sync": "Agent 状态实时更新任务进度",
  "approval-resume": "工具调用等待人工审批",
  "multi-tool": "依次调用多个工具",
  "nested-subagent-conversation": "子智能体任务卡片",
  "nested-subagent-error": "子智能体运行错误",
  "nested-subagent-recursive": "子智能体递归委托任务",
  "nested-subagent-task-group": "多个子智能体组成任务组",
  "parallel-tools": "并行调用多个工具",
  "reasoning-chat": "思考后回复",
  "reasoning-long-preview": "长篇思考内容预览",
  "reasoning-tool-success": "思考、调用工具并回答",
  "simple-chat": "纯文本流式回复",
  "markdown-showcase": "流式展示 Markdown 内容",
  "subagent-lifecycle": "子智能体运行生命周期",
  "tool-error": "工具调用期间发生错误",
  "tool-long-running": "耗时工具运行与等待",
};

const demoGroups = [
  { title: "对话与消息", ids: ["simple-chat", "multi-message-response", "markdown-showcase", "multimodal-input"] },
  { title: "思考与回答", ids: ["reasoning-chat", "reasoning-long-preview", "reasoning-tool-success"] },
  { title: "工具调用", ids: ["multi-tool", "parallel-tools", "tool-long-running", "tool-error", "file-output"] },
  { title: "前端工具", ids: ["frontend-tool-open-dialog", "frontend-tool-fill-form"] },
  { title: "提问与审批", ids: ["ask-user-question", "approval-resume"] },
  { title: "状态与计划", ids: ["agent-state-sync", "agent-plan", "agent-status"] },
  { title: "内容组件", ids: ["data-message-chart"] },
  { title: "A2UI 交互界面", ids: ["a2ui-form-controls", "a2ui-interactive-order"] },
  { title: "子智能体", ids: ["nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error", "subagent-lifecycle"] },
  { title: "运行与会话", ids: ["concurrent-conversations", "cancel-before-first-output"] },
] as const;
const demoGroupIndex = new Map<string, number>(demoGroups.flatMap((group, index) => group.ids.map(id => [id, index] as const)));
const demoOrderIndex = new Map<string, number>(demoGroups.flatMap(group => group.ids.map((id, index) => [id, index] as const)));
const groupIndexFor = (id: string) => demoGroupIndex.get(id) ?? demoGroups.length;
const groupTitleFor = (id: string) => demoGroups[groupIndexFor(id)]?.title ?? "其他示例";

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

  const [resourceSelection, setResourceSelection] = useState<string | null>(null);

  async function installRequirements(scenarioId: string) {
    if (inFlight.current || !compatibility?.projectId) return;
    const requirements = requirementsFor(scenarioId);
    if (!requirements.length || requirements.some(item => !item.installable)) return;
    inFlight.current = true;
    const current = ++compatibilityVersion.current;
    setBusy(true); setError(null); setNotice("");
    let latest = compatibility;
    let resourceId = requirements[0]!.id;
    let projectedError = "资源安装失败，请重试。";
    try {
      for (const requirement of requirements) {
        if (current !== compatibilityVersion.current) return;
        if (latest.requirements.some(item => item.id === requirement.id && item.status === "ready")) continue;
        resourceId = requirement.id;
        projectedError = `${requirement.name} 资源安装失败，请重试。`;
        setInstallation({ scenarioId, resourceId, status: "installing", message: `正在安装 ${requirement.name} 资源…` });
        const response = await fetch(`${CREATOR_MOCK_API_PATH}/install-resources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: compatibility.projectId, resourceId }),
        });
        const result = await response.json();
        if (current !== compatibilityVersion.current) return;
        if (!response.ok) {
          if (result.code === "RESOURCE_CONFLICT") {
            projectedError = `${requirement.name} 资源与当前项目存在兼容性冲突。`;
            setCompatibility(previous => previous === null ? null : ({ ...previous, requirements: previous.requirements.map(item => item.id === resourceId ? { ...item, status: "conflict", installable: false, issue: { code: "RESOURCE_CONFLICT", message: projectedError } } : item) }));
          }
          throw new Error(projectedError);
        }
        latest = result as MockDemoCompatibility;
        setCompatibility(latest);
        if (latest.status !== "checked" || latest.projectId !== compatibility.projectId ||
            !latest.requirements.some(item => item.id === resourceId && item.status === "ready")) throw new Error(projectedError);
      }
      if (latest.requirements.some(item => item.scenarioIds.includes(scenarioId) && item.status !== "ready")) throw new Error(projectedError);
      setInstallation({ scenarioId, resourceId, status: "success", message: "资源已安装并就绪，可以运行场景。" });
    } catch {
      if (current === compatibilityVersion.current) setInstallation({ scenarioId, resourceId, status: "error", message: projectedError });
    } finally { inFlight.current = false; setBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    compatibilityVersion.current += 1;
    setCompatibility(null);
    setInstallation(null);
    setResourceSelection(null);
    async function refresh() {
      if (inFlight.current) return;
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
  const titleFor = (scenario: { id: string; title: string }) => demoTitles[scenario.id] ?? scenario.title;
  const search = query.trim().toLocaleLowerCase();
  const scenarios = state?.scenarios.filter((scenario) =>
    `${scenario.id} ${titleFor(scenario)} ${scenario.title} ${scenario.description ?? ""}`.toLocaleLowerCase().includes(search),
  ).sort((first, second) => groupIndexFor(first.id) - groupIndexFor(second.id)
    || (demoOrderIndex.get(first.id) ?? 0) - (demoOrderIndex.get(second.id) ?? 0)) ?? [];

  return (
    <section className="creator-mock-panel creator-ui-scope" id="creator-mock-panel" aria-label="Mock Agent 开发服务" aria-busy={busy}>
      <header>
        <div className="creator-mock-heading"><FlaskConical aria-hidden="true" /><h2>Mock Agent</h2></div>
        <p>在本机运行预置 Demo，供你的 Agent UI 通过 AG-UI API 连接。</p>
      </header>
      {error === null ? null : <div className="creator-mock-error" role="alert">{error}<Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>重试连接</Button></div>}
      {state === null ? <p role="status">正在读取 Mock 服务状态…</p> : <>
        <Card className="creator-mock-service" role="region" aria-label="服务控制">
          <div className="creator-mock-service-actions">
            <Badge variant="secondary" className="creator-mock-status" data-running={state.status === "running"}>
              {state.status === "running" ? "运行中" : "未运行"}
            </Badge>
            <Button size="sm" variant={state.status === "running" ? "outline" : "default"} type="button" disabled={busy} onClick={() => void act(
              state.status === "running" ? "/stop" : "/start", {},
              state.status === "running" ? "Mock 服务已停止。" : "Mock 服务已启动，请将前端 endpoint 配置为下方地址。",
            )}>{busy ? "处理中…" : state.status === "running" ? "停止服务" : "启动服务"}</Button>
          </div>
          {state.endpoint === null ? <p>启动后会显示本机地址。系统自动分配可用端口。</p> : <>
            <div className="creator-mock-address-row">
            <label className="creator-mock-address">AG-UI 地址<Input readOnly value={state.endpoint} onFocus={(event) => event.target.select()} /></label>
            <Button size="sm" variant="outline" type="button" className="creator-mock-copy" data-copied={copiedEndpoint === state.endpoint} onClick={() => void copyAddress()}>
              {copiedEndpoint === state.endpoint ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copiedEndpoint === state.endpoint ? "已复制" : "复制地址"}
            </Button>
            </div>
            <details className="creator-mock-integration">
              <summary>如何接入这个地址</summary>
              <p>将接入组件的 endpoint 或前端环境变量改成这个地址：</p>
              <pre><code>{`<Agent endpoint="${state.endpoint}" />\n\nVITE_AGENT_ENDPOINT=${state.endpoint}`}</code></pre>
              <p>使用环境变量时，在你自己的前端项目根目录（与 package.json 同级）创建或编辑 <code>.env.local</code>，填写上面的 <code>VITE_AGENT_ENDPOINT</code>。</p>
              <p>保存后重启这个前端项目的开发服务。组件中显式传入的 endpoint 优先于环境变量。服务停止后此地址不可用，再次启动请复制新地址。</p>
            </details>
          </>}
          <p>关闭面板后服务继续运行；退出 Creator 后服务停止。</p>
        </Card>
        <p className="creator-mock-notice" role="status">{notice}</p>
        <section aria-label="选择预置 Demo">
          <h3>预置 Demo</h3>
          <p className="creator-mock-current-demo">当前：<strong>{selected ? titleFor(selected) : state.scenarioId}</strong></p>
          <details className="creator-mock-demo-help"><summary>Demo 使用说明</summary>
            <p>选择后，在已接入的 Agent UI 中发送一条消息来播放。正在运行的请求保持原场景。</p>
            <p>部分 Demo 需要额外的 Agent UI 资源，Creator 会在运行前检查并提示安装。</p>
          </details>
          {compatibility?.status !== "checked" ? <p className="creator-mock-requirement" role="status">{compatibility === null ? "正在检查当前项目的 Demo 支持…" : "无法检查当前项目的资源，请确认已选择并初始化项目。"}</p> : null}
          <label className="creator-mock-speed">播放时长倍率
            <NativeSelect disabled={busy} value={state.speed} onChange={(event) => void act("/select", { scenarioId: state.scenarioId, speed: Number(event.target.value) }, "播放时长已更新，下一次请求生效。") }>
              <option value={0}>立即完成</option><option value={0.1}>快速测试（0.1×）</option><option value={0.5}>较快（0.5×）</option><option value={1}>正常（1×）</option><option value={2}>较慢（2×）</option>
            </NativeSelect>
          </label>
          <label className="creator-mock-search">搜索 Demo<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、描述或场景 ID" /></label>
          <div className="creator-mock-scenarios">
            {scenarios.map((scenario, index) => <Fragment key={scenario.id}>
              {index === 0 || groupIndexFor(scenario.id) !== groupIndexFor(scenarios[index - 1]!.id)
                ? <h4 className="creator-mock-group-heading">{groupTitleFor(scenario.id)}</h4> : null}
              <div className="creator-mock-scenario" data-selected={scenario.id === state.scenarioId}>
              <label className="creator-mock-scenario-choice">
              <input type="radio" name="creator-mock-scenario" checked={scenario.id === (resourceSelection ?? state.scenarioId)} disabled={busy} onChange={() => { if (scenario.resources?.length) setResourceSelection(scenario.id); else { setResourceSelection(null); void act("/select", { scenarioId: scenario.id, speed: state.speed }, `已选择 ${titleFor(scenario)}，下一次请求生效。`); } }} />
              <span><strong>{titleFor(scenario)}</strong>{scenario.description ? <span>{scenario.description}</span> : null}
              </span></label>
              {requirementsFor(scenario.id).length > 0 ? <div className="creator-mock-scenario-footer">
                <div className="creator-mock-resource-actions">
                  <Button size="sm" variant="outline" type="button" disabled={busy || requirementsFor(scenario.id).some(item => !item.installable)} onClick={() => void installRequirements(scenario.id)}>
                    安装资源
                  </Button>
                </div>
                {compatibility?.projectId ? requirementsFor(scenario.id)
                  .filter(requirement => requirement.status === "conflict" || (installation?.resourceId === requirement.id && installation.status === "error"))
                  .map(requirement => <MockResourceDiagnostics key={`${compatibility.projectId}:${requirement.id}:${installation?.status}`} projectId={compatibility.projectId!} resourceId={requirement.id} />) : null}
              </div> : null}
              {scenario.resources?.length && resourceSelection === scenario.id ? <div>
                <p>{compatibility?.status === "checked" && requirementsFor(scenario.id).length === 0 ? "所需资源已就绪" : "此场景需要额外的 Agent UI 资源，请先安装资源。"}</p>
                <Button size="sm" variant="outline" type="button" disabled={busy || compatibility?.status !== "checked" || requirementsFor(scenario.id).length > 0}
                  onClick={() => void act("/select", { scenarioId: scenario.id, speed: state.speed }, `已启用 ${titleFor(scenario)}，在 Agent UI 中发送消息运行。`)}>运行场景</Button>
              </div> : null}
              {installation?.scenarioId === scenario.id ? <div className="creator-mock-install-status" data-status={installation.status} role={installation.status === "error" ? "alert" : "status"}>{installation.message}</div> : null}
              {requirementsFor(scenario.id).some(requirement => !requirement.installable && requirement.status !== "conflict") ? <div className="creator-mock-install-status">当前 Creator 宿主尚未配置一键引入。</div> : null}
              </div>
            </Fragment>)}
          </div>
          {scenarios.length === 0 ? <p>没有匹配的 Demo。</p> : null}
        </section>
      </>}
    </section>
  );
}

/** Fetch implementation data only after the developer explicitly opens diagnostics. */
function MockResourceDiagnostics({ projectId, resourceId }: { projectId: string; resourceId: string }) {
  const [details, setDetails] = useState<string | null>(null);
  const loading = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(open: boolean) {
    if (!open || loading.current || details !== null) return;
    loading.current = true;
    controller.current = new AbortController();
    try {
      const response = await fetch(`${CREATOR_MOCK_API_PATH}/resource-diagnostics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, resourceId }), signal: controller.current.signal });
      const result = await response.json();
      if (!response.ok) throw new Error("无法读取技术详情，请刷新后重试。");
      if (!controller.current.signal.aborted) setDetails(JSON.stringify(result, null, 2));
    } catch {
      if (!controller.current?.signal.aborted) setDetails("无法读取技术详情，请刷新后重试。");
    } finally { loading.current = false; }
  }
  return <details className="creator-mock-resource-diagnostics" onToggle={event => void load(event.currentTarget.open)}>
    <summary>查看技术详情</summary>
    <pre>{details ?? "正在读取技术详情…"}</pre>
  </details>;
}
