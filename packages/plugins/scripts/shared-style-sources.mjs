import path from "node:path";

// Shared Runtime/facade presentation remains in the base stylesheet. Plugin
// implementations get their own utility CSS instead of a package-wide scan.
export const sharedStyleSources = [
  "./internal/conversation-surface.tsx", "./internal/conversation-thread-list-item.tsx", "./internal/primitives",
  "./internal/composable-thread.tsx", "./internal/conversation-transient-messages.tsx",
  // ComposableThread renders message images directly, without a Plugin entry
  // importing utility CSS. Include the shared image states and zoom UI here.
  "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/image.tsx",
  // ConversationToolCall is also used directly by project toolkit renderers,
  // without a Plugin entry importing CSS. Its shared label/transition helpers
  // must be scanned together with the component in both base CSS build paths.
  "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-call.tsx",
  "./internal/vendor-generated/assistant-ui/components/assistant-ui/elements/surfaces.tsx",
  "./internal/conversation-question-flow.tsx", "./internal/conversation-composer-triggers.tsx",
  "./internal/conversation-quote.tsx", "./internal/composer-input-host-context.tsx",
  // The application shell does not import a Plugin utility bundle. Its sidebar,
  // narrow-container Sheet and Tooltip primitives must ship in the base CSS.
  "./internal/sidebar-frame.tsx",
  "./internal/adapters-generated/assistant-ui/components/ui/sidebar.tsx",
  "./internal/adapters-generated/assistant-ui/components/ui/sheet.tsx",
  "./internal/adapters-generated/assistant-ui/components/ui/tooltip.tsx",
  "./internal/style-boundary", "./public.tsx",
];

export function emittedStyleSource(source) {
  return source.replace(/\.tsx?$/u, ".js");
}

export function sharedStyleScanSources(distRoot) {
  return sharedStyleSources.map(source => {
    const emitted = emittedStyleSource(source).replace(/^\.\//u, "");
    return { base: distRoot, pattern: emitted.endsWith(".js") ? emitted : path.posix.join(emitted, "**/*.js"), negated: false };
  });
}
