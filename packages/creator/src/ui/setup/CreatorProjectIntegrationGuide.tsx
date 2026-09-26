import { useState } from "react";

import type { CreatorProjectMode } from "../../workspace/types.js";

const placementByMode: Record<CreatorProjectMode, string> = {
  assistant: "建议放在应用的根布局或需要显示助手的位置。",
  embedded: "建议放在需要 Agent 能力的业务页面或区域。",
  platform: "建议放在应用的主页面或工作台区域。",
};

/** Import path from a Host-owned component placed directly under src/. */
export function agentImportPathFromSrc(sourceRoot: string): string {
  if (sourceRoot === "src") return ".";
  if (sourceRoot.startsWith("src/")) return `./${sourceRoot.slice(4)}`;
  return `../${sourceRoot}`;
}

export function agentIntegrationSnippet(sourceRoot: string): string {
  return [
    `import { Agent } from "${agentImportPathFromSrc(sourceRoot)}";`,
    "",
    "export function AgentMount() {",
    "  return <Agent />;",
    "}",
  ].join("\n");
}

export function CreatorProjectIntegrationGuide({ sourceRoot, mode }: {
  sourceRoot: string;
  mode: CreatorProjectMode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const snippet = agentIntegrationSnippet(sourceRoot);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="creator-project-integration-guide" aria-label="接入 Agent UI">
      <header>
        <div>
          <strong>Agent UI 已创建</strong>
          <span>接下来把它引入你自己的应用。</span>
        </div>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? "收起" : "查看接入方法"}
        </button>
      </header>
      {expanded ? (
        <div className="creator-project-integration-guide-body">
          <p>从公共入口 <code>{sourceRoot}/index.ts</code> 引入。以下以你项目中的组件为例：</p>
          <div className="creator-project-integration-code-header">
            <code>src/AgentMount.tsx</code>
            <button type="button" className="creator-project-integration-copy" onClick={() => void copySnippet()}>
              {copyState === "copied" ? "已复制" : "复制代码"}
            </button>
          </div>
          <pre><code>{snippet}</code></pre>
          {copyState === "failed" ? <span role="alert">复制失败，请手动选择代码。</span> : null}
          <p>在已有页面或布局中渲染 <code>{'<AgentMount />'}</code>。{placementByMode[mode]}</p>
          <details>
            <summary>导入路径与接口地址</summary>
            <p>如果组件不在 <code>src/</code> 目录，请按该文件的位置调整相对导入路径。</p>
            <p>AG-UI 接口默认读取 <code>VITE_AGENT_ENDPOINT</code>，否则使用 <code>/agent</code>；地址不同时可传入 <code>endpoint</code>，例如 <code>{'<Agent endpoint="/api/agent" />'}</code>。保存组件后，你自己的开发服务器会更新页面。</p>
            <p>使用环境变量时，在你自己的前端项目根目录（与 <code>package.json</code> 同级）创建或编辑 <code>.env.local</code>，填写下面这一行，并将地址替换为真实后端或 Mock 面板复制的完整地址：</p>
            <pre><code>VITE_AGENT_ENDPOINT=你的完整 AG-UI 地址</code></pre>
            <p>保存后重启这个前端项目的开发服务。如果已在组件中显式传入 <code>endpoint</code>，则组件中的地址优先。</p>
          </details>
        </div>
      ) : null}
    </section>
  );
}
