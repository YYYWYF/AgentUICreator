import { createRoot, type Root } from "react-dom/client";
import { AgentUIBridgeRoot } from "./AgentUIBridgeRoot";
import { configAttributes, resolveConfig, type AgentUIConfig } from "./config";
import { dispatchAgentUIEvent, type AgentUIEmit } from "./events";
import styles from "./styles.css?inline";

export class AgentUIElement extends HTMLElement {
  static observedAttributes = [...configAttributes];
  #config: AgentUIConfig = {};
  #root: Root | undefined;
  #mount: HTMLDivElement;
  #revision = 0;
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const pluginStyle = document.createElement("style");
    pluginStyle.textContent = "__AGENT_UI_BUNDLED_PLUGIN_CSS__";
    this.#mount = document.createElement("div");
    this.#mount.className = "agent-ui-bridge-mount";
    shadow.append(style, pluginStyle, this.#mount);
  }
  get config(): AgentUIConfig { return { ...this.#config }; }
  set config(value: AgentUIConfig) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      this.#emit("error", { code: "AGENT_UI_CONFIG_ERROR", error: new Error("Agent UI config must be an object.") });
      return;
    }
    this.#config = { ...value };
    this.#schedule();
  }
  connectedCallback(): void {
    // Upgrade properties assigned before the bundle registered the element.
    if (Object.hasOwn(this, "config")) {
      const value = this.config;
      delete (this as { config?: AgentUIConfig }).config;
      this.config = value;
    }
    this.#schedule();
  }
  disconnectedCallback(): void {
    const revision = ++this.#revision;
    queueMicrotask(() => {
      // DOM moves in the same turn retain the mounted session.
      if (this.isConnected || revision !== this.#revision) return;
      this.#root?.unmount();
      this.#root = undefined;
    });
  }
  attributeChangedCallback(): void { this.#schedule(); }
  #emit: AgentUIEmit = (type, detail) => {
    if (this.isConnected) dispatchAgentUIEvent(this, type, detail);
  };
  #schedule(): void {
    const revision = ++this.#revision;
    queueMicrotask(() => {
      if (!this.isConnected || revision !== this.#revision) return;
      try {
        const config = resolveConfig(this.#config, Object.fromEntries(configAttributes.map(name => [name, this.getAttribute(name)])));
        this.#root ??= createRoot(this.#mount, {
          onUncaughtError: error => this.#emit("error", { code: "AGENT_UI_RUNTIME_ERROR", error: error instanceof Error ? error : new Error(String(error)) }),
        });
        this.#root.render(<AgentUIBridgeRoot config={config} emit={this.#emit} />);
      } catch (error) {
        this.#emit("error", { code: "AGENT_UI_CONFIG_ERROR", error: error instanceof Error ? error : new Error(String(error)) });
      }
    });
  }
}
