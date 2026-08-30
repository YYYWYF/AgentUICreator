import { Component, useMemo, useState } from "react";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import { App } from "./App";

import "./plugin-error-boundary-preview.css";

type PreviewState =
  | "none"
  | "render-error"
  | "mount-error"
  | "both"
  | "repaired";

function RenderFailurePreviewPlugin({ context }: UIPluginComponentProps) {
  if (context.instance.props?.shouldFail !== false) {
    throw new Error("The dynamically loaded insights plugin failed to render.");
  }

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

const mountFailurePlugin: UIPluginDefinition = {
  manifest: {
    id: "preview-mount-failure",
    name: "Runtime Activity Plugin",
    description: "Development fixture that throws during mount",
    version: "1.0.0",
  },
  Component: MountFailurePreviewPlugin,
};

const previewPlugins = [renderFailurePlugin, mountFailurePlugin] as const;
const previewRegistry = createPluginRegistry(previewPlugins);
const previewActions: UIPluginRuntimeActions = {
  abortRun: () => undefined,
  sendMessage: async () => undefined,
  updateInstanceProps: () => undefined,
};

function createPreviewModel(state: PreviewState) {
  if (state === "none") {
    return parseAppUIModel({
      version: "1",
      root: {
        type: "slot",
        id: "runtime-fault-fixture-slot-node",
        slotId: "runtime-fault-fixture",
        pluginInstanceIds: [],
      },
      pluginInstances: {},
    });
  }

  const pluginInstanceIds: string[] = [];

  if (state === "render-error" || state === "both" || state === "repaired") {
    pluginInstanceIds.push("preview-render-failure-main");
  }
  if (state === "mount-error" || state === "both") {
    pluginInstanceIds.push("preview-mount-failure-main");
  }

  return parseAppUIModel({
    version: "1",
    root: {
      type: "slot",
      id: "runtime-fault-fixture-slot-node",
      slotId: "runtime-fault-fixture",
      pluginInstanceIds,
    },
    pluginInstances: {
      "preview-render-failure-main": {
        id: "preview-render-failure-main",
        pluginId: "preview-render-failure",
        enabled: true,
        props: { shouldFail: state !== "repaired" },
      },
      "preview-mount-failure-main": {
        id: "preview-mount-failure-main",
        pluginId: "preview-mount-failure",
        enabled: true,
      },
    },
  });
}

function RuntimeFaultFixture({ model }: { model: ReturnType<typeof createPreviewModel> }) {
  return (
    <div className="plugin-boundary-runtime-fixture">
      <UIPluginRuntime
        actions={previewActions}
        className="plugin-boundary-runtime-fixture-layout"
        messages={[]}
        model={model}
        registry={previewRegistry}
        run={{ status: "idle", errorMessage: undefined }}
        state={null}
      />
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
