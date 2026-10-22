import { creatorDockIntegration, type CreatorDockHtmlTag, type CreatorDockIntegrationOptions } from "./integration.js";

const PLUGIN_NAME = "agent-ui-creator-dock";
const SCRIPT_MARKER = "data-creator-webpack-dock";

interface WebpackCompilerHost {
  options: { mode?: string; context?: string; devServer?: false | Record<string, unknown> };
  hooks: { thisCompilation: { tap(name: string, handler: (compilation: unknown) => void): void } };
  webpack: {
    Compilation: { PROCESS_ASSETS_STAGE_REPORT: number };
    sources: { RawSource: new (source: string) => unknown };
  };
}
interface WebpackCompilationHost {
  hooks: { processAssets: { tap(options: { name: string; stage: number }, handler: () => void): void } };
  getAssets(): Array<{ name: string; source: { source(): string | Uint8Array } }>;
  updateAsset(name: string, source: unknown): void;
}

/** For webpack-dev-server's Node API, pass this result as the server options. */
export function createCreatorDockWebpackDevServerOptions<T extends object>(
  devServer: T,
  options: CreatorDockIntegrationOptions = {},
): Omit<T, "proxy"> & { proxy: Array<Record<string, unknown>> } {
  const integration = creatorDockIntegration(options);
  const previous = (devServer as { proxy?: unknown }).proxy;
  const existing: Array<Record<string, unknown>> = Array.isArray(previous) ? previous :
    previous && typeof previous === "object" ? Object.entries(previous).map(([route, value]) => ({
      context: [route], pathFilter: route,
      ...(typeof value === "string" ? { target: value } : value as object),
    })) : [];
  const proxies = Object.entries(integration.proxies).map(([route, proxy]) => ({
    // dev-server 5 uses context; dev-server 6 uses pathFilter. The other field is ignored.
    context: [route], pathFilter: route, ...proxy,
  }));
  return { ...devServer, proxy: [...proxies, ...existing] };
}

function scriptHtml(tag: CreatorDockHtmlTag) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const attributes = Object.entries(tag.attrs).map(([key, value]) =>
    value === true ? key : value === false ? "" : `${key}="${escape(value)}"`,
  ).filter(Boolean).join(" ");
  return `<script ${SCRIPT_MARKER} ${attributes}></script>`;
}

/** Uses the host compiler's API and sources; no second Webpack is installed. */
export function createCreatorDockWebpackPlugin(options: CreatorDockIntegrationOptions = {}) {
  return {
    apply(compiler: unknown) {
      const host = compiler as WebpackCompilerHost;
      if (host.options.mode !== "development") return;
      if (!host.webpack?.Compilation || !host.webpack.sources?.RawSource) throw new Error("CREATOR_DOCK_WEBPACK_5_REQUIRED");
      const resolved = { ...options, projectRoot: options.projectRoot ?? host.options.context ?? process.cwd() };
      const integration = creatorDockIntegration(resolved);
      if (host.options.devServer !== false) {
        host.options.devServer = createCreatorDockWebpackDevServerOptions(host.options.devServer ?? {}, resolved);
      }
      const script = scriptHtml(integration.script);
      host.hooks.thisCompilation.tap(PLUGIN_NAME, value => {
        const compilation = value as WebpackCompilationHost;
        // After HtmlWebpackPlugin / copied HTML assets have been emitted. This
        // avoids resolving or depending on a separate HtmlWebpackPlugin version.
        compilation.hooks.processAssets.tap({ name: PLUGIN_NAME, stage: host.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, () => {
          for (const asset of compilation.getAssets()) {
            if (!/\.html?$/iu.test(asset.name.replaceAll("\\", "/"))) continue;
            const content = asset.source.source();
            const html = typeof content === "string" ? content : Buffer.from(content).toString("utf8");
            if (html.includes(SCRIPT_MARKER)) continue;
            const closingTag = /<\/body\s*>/iu.test(html) ? /<\/body\s*>/iu : /<\/html\s*>/iu;
            const injected = closingTag.test(html) ? html.replace(closingTag, match => `${script}${match}`) : `${html}${script}`;
            compilation.updateAsset(asset.name, new host.webpack.sources.RawSource(injected));
          }
        });
      });
    },
  };
}
