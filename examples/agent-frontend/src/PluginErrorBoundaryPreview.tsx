import { Component, useMemo, useState } from "react";
import { createAgentRuntime } from "@agent-ui/runtime-core";
import { MockAgentTransport } from "@agent-ui/runtime-core/testing";

import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import {
  parseAppUIModel,
  type AppUIPluginNode,
} from "../framework/contracts/app-ui-model";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  createPluginCompositionCatalog,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import {
  AgentRuntimeProvider,
} from "../runtime/context";
import { App } from "./App";

import "./plugin-error-boundary-preview.css";

type PreviewState =
  | "none"
  | "render-error"
  | "mount-error"
  | "both"
  | "repaired";

function RenderFailurePreviewPlugin(_props: UIPluginComponentProps) {
  throw new Error("The dynamically loaded insights plugin failed to render.");
}

function RenderRecoveredPreviewPlugin(_props: UIPluginComponentProps) {
  return (
    <section className="plugin-boundary-recovered">
      <span>Runtime insights</span>
      <strong>Plugin recovered in its original slot</strong>
      <p>The Agent UI stayed mounted while this plugin was repaired.</p>
    </section>
  );
}

class MountFailurePreviewPlugin extends Component<UIPluginComponentProps> {
  componentDidMount(): void {
    throw new Error("The dynamically loaded activity plugin failed to mount.");
  }

  render() {
    return <div>Activity plugin mount fixture</div>;
  }
}

const renderFailurePlugin: UIPluginDefinition = {
  manifest: {
    id: "preview-render-failure",
    name: "Runtime Insights Plugin",
    description: "Development fixture that throws while rendering",
    version: "1.0.0",
  },
  Component: RenderFailurePreviewPlugin,
};

const renderRecoveredPlugin: UIPluginDefinition = {
  manifest: {
    id: "preview-render-recovered",
    name: "Runtime Insights Plugin",
    description: "Development fixture that renders after repair",
    version: "1.0.0",
  },
  Component: RenderRecoveredPreviewPlugin,
};

const mountFailurePlugin: UIPluginDefinition = {
  manifest: {
    id: "preview-mount-failure",
    name: "Runtime Activity Plugin",
    description: "Development fixture that throws during mount",
    version: "1.0.0",
  },
  Component: MountFailurePreviewPlugin,
};

const previewPlugins = [
  renderFailurePlugin,
  renderRecoveredPlugin,
  mountFailurePlugin,
] as const;
const previewRegistry = createPluginRegistry(previewPlugins);
const previewActions: UIPluginRuntimeActions = {
  abortRun: () => undefined,
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
};
const previewAgentRuntime = createAgentRuntime({
  transport: new MockAgentTransport(),
});

function createPreviewModel(state: PreviewState) {
  const plugins: AppUIPluginNode[] = [];
  if (state === "render-error" || state === "both" || state === "repaired") {
    plugins.push({
      id: "preview-render-failure-main",
      pluginId: state === "repaired"
        ? "preview-render-recovered"
        : "preview-render-failure",
      enabled: true,
    });
  }
  if (state === "mount-error" || state === "both") {
    plugins.push({
      id: "preview-mount-failure-main",
      pluginId: "preview-mount-failure",
      enabled: true,
    });
  }

  return compileAppUIModel(parseAppUIModel({
    root: {
      type: "slot",
      id: "runtime-fault-fixture",
      description: "Development-only Plugin Error Boundary fixture.",
      plugins,
    },
  }), createPluginCompositionCatalog(previewRegistry));
}

function RuntimeFaultFixture({ model }: { model: ReturnType<typeof createPreviewModel> }) {
  return (
    <div className="plugin-boundary-runtime-fixture">
      <AgentRuntimeProvider runtime={previewAgentRuntime}>
        <UIPluginRuntime
          actions={previewActions}
          className="plugin-boundary-runtime-fixture-layout"
          model={model}
          registry={previewRegistry}
        />
      </AgentRuntimeProvider>
    </div>
  );
}

export function PluginErrorBoundaryPreview() {
  const [previewState, setPreviewState] = useState<PreviewState>("none");
  const [controlsOpen, setControlsOpen] = useState(true);
  const model = useMemo(() => createPreviewModel(previewState), [previewState]);
  const selectPreview = (state: PreviewState): void => {
    setPreviewState(state);
    setControlsOpen(false);
  };

  return (
    <>
      <App />
      <RuntimeFaultFixture model={model} />

      <aside
        className="plugin-boundary-preview-toolbar"
        data-open={controlsOpen}
      >
        <button
          aria-expanded={controlsOpen}
          className="plugin-boundary-preview-toggle"
          type="button"
          onClick={() => setControlsOpen((open) => !open)}
        >
          DEV · 插件热加载
        </button>
        {controlsOpen ? (
          <div className="plugin-boundary-preview-controls">
            <button
              type="button"
              onClick={() => selectPreview("render-error")}
            >
              插入渲染失败插件
            </button>
            <button
              type="button"
              onClick={() => selectPreview("mount-error")}
            >
              插入挂载失败插件
            </button>
            <button type="button" onClick={() => selectPreview("both")}>
              同时插入两个
            </button>
            <button type="button" onClick={() => selectPreview("repaired")}>
              修复渲染插件
            </button>
            <button type="button" onClick={() => selectPreview("none")}>
              移除失败插件
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
