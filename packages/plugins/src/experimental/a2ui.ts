/** Workspace-only A2UI experiment. Excluded from distribution. */
import { createElement } from "react";
import { JSONGenerativeUI } from "@assistant-ui/react-generative-ui";
import { applyA2uiOperations, convertSurfaceToUISpec } from "@assistant-ui/react-generative-ui/a2ui";
import { styledGenerativeUILibrary } from "../internal/vendor-generated/assistant-ui/generative-ui/styled-generative-ui.js";
import { createAgentUIGenerativeUI, type AgentUIGenerativeUIOptions } from "../generative-ui.js";
/** A2UI uses the native upstream path unless a registered custom component is
 * present. The public converter's opt-in retention keeps custom component names
 * available to the same schema-validated component library. */
/** A2UI is deferred; ordinary JSON Generative UI remains available. */
export function createAgentUIA2ui(_options: AgentUIGenerativeUIOptions = {}): Pick<JSONGenerativeUI, "present"> {
  // Preserve the signature for existing adapters without rendering a Surface
  // or accepting actions while the feature is deferred.
  const ui = createAgentUIGenerativeUI();
  return { present: options => ({ ...ui.present(options), render: () => null }) };
}

/** Retained internally for the future unified binding implementation. */
function createDeferredAgentUIA2ui(options: AgentUIGenerativeUIOptions = {}): Pick<JSONGenerativeUI, "present"> {
  const ui = createAgentUIGenerativeUI(options);
  return {
    present(presentation?: Parameters<typeof ui.present>[0]) {
      const tool = ui.present(presentation);
      const NativeRender = tool.render!;
      const Render: typeof NativeRender = props => {
        const surfaceId = props.toolCallId?.startsWith("a2ui:") ? props.toolCallId.slice(5) : undefined;
        const artifact = props.artifact as Record<string, unknown> | undefined;
        const operations = artifact?.a2ui;
        if (!surfaceId || !Array.isArray(operations) || !options.components) return createElement(NativeRender, props);
        const surface = applyA2uiOperations(new Map(), operations).state.get(surfaceId);
        const hasCustom = surface && [...surface.components.values()].some(node =>
          typeof node.component === "string" && Object.hasOwn(options.components!, node.component) && !Object.hasOwn(styledGenerativeUILibrary, node.component));
        if (!surface || !hasCustom) return createElement(NativeRender, props);
        const { spec } = convertSurfaceToUISpec(surface, { keepUnknownComponents: true });
        // Remove the native artifact route after conversion; the renderer still
        // validates every retained type against the caller's explicit library.
        return createElement(NativeRender, { ...props, args: (spec ?? {}) as typeof props.args, artifact: undefined });
      };
      return { ...tool, render: Render };
    },
  };
}
