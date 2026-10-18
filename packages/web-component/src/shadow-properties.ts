/** Tailwind's document @property registrations do not initialize Shadow DOM.
 * Keep these non-inheriting defaults local and below component/utility layers.
 * Both the standalone element and project-built bridges use this Host factory.
 */
export const shadowPropertyDefaults = `
@layer properties {
  :where(.agent-ui-bridge-mount, .agent-ui-bridge-mount::before, .agent-ui-bridge-mount::after,
    .agent-ui-bridge-mount *, .agent-ui-bridge-mount *::before, .agent-ui-bridge-mount *::after) {
    --tw-border-style: solid;
    --tw-outline-style: solid;
    --tw-shadow: 0 0 #0000;
    --tw-shadow-alpha: 100%;
    --tw-inset-shadow: 0 0 #0000;
    --tw-inset-shadow-alpha: 100%;
    --tw-ring-shadow: 0 0 #0000;
    --tw-inset-ring-shadow: 0 0 #0000;
    --tw-ring-offset-width: 0px;
    --tw-ring-offset-color: #fff;
    --tw-ring-offset-shadow: 0 0 #0000;
  }
}
`;

/** Same inherited typography as a native React mount. Host CSS can set height
 * directly or use --agent-ui-height for both native and compatibility roots. */
export const shadowMountStyles = `
:host { display: block; height: var(--agent-ui-height, 100dvh); min-width: 0; }
.agent-ui-bridge-mount { all: initial; display: block; height: 100%; font: inherit; color-scheme: inherit; }
.agent-ui-bridge-mount > .agent-ui-root, .agent-ui-embedded-shell { height: 100%; min-height: 0; }
`;
