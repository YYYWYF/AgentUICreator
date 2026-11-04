import { creatorDockIntegration } from "./integration.js";
const PLUGIN_NAME = "agent-ui-creator-dock";
const SCRIPT_MARKER = "data-creator-webpack-dock";
/** For webpack-dev-server's Node API, pass this result as the server options. */
export function createCreatorDockWebpackDevServerOptions(devServer, options = {}) {
    const integration = creatorDockIntegration(options);
    const previous = devServer.proxy;
    const existing = Array.isArray(previous) ? previous :
        previous && typeof previous === "object" ? Object.entries(previous).map(([route, value]) => ({
            context: [route], pathFilter: route,
            ...(typeof value === "string" ? { target: value } : value),
        })) : [];
    const proxies = Object.entries(integration.proxies).map(([route, proxy]) => ({
        // dev-server 5 uses context; dev-server 6 uses pathFilter. The other field is ignored.
        context: [route], pathFilter: route, ...proxy,
    }));
    return { ...devServer, proxy: [...proxies, ...existing] };
}
function scriptHtml(tag) {
    const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const attributes = Object.entries(tag.attrs).map(([key, value]) => value === true ? key : value === false ? "" : `${key}="${escape(value)}"`).filter(Boolean).join(" ");
    return `<script ${SCRIPT_MARKER} ${attributes}></script>`;
}
/** Uses the host compiler's API and sources; no second Webpack is installed. */
export function createCreatorDockWebpackPlugin(options = {}) {
    return {
        apply(compiler) {
            const host = compiler;
            if (host.options.mode !== "development")
                return;
            if (!host.webpack?.Compilation || !host.webpack.sources?.RawSource)
                throw new Error("CREATOR_DOCK_WEBPACK_5_REQUIRED");
            const resolved = { ...options, projectRoot: options.projectRoot ?? host.options.context ?? process.cwd() };
            const integration = creatorDockIntegration(resolved);
            if (host.options.devServer !== false) {
                host.options.devServer = createCreatorDockWebpackDevServerOptions(host.options.devServer ?? {}, resolved);
            }
            const script = scriptHtml(integration.script);
            host.hooks.thisCompilation.tap(PLUGIN_NAME, value => {
                const compilation = value;
                // After HtmlWebpackPlugin / copied HTML assets have been emitted. This
                // avoids resolving or depending on a separate HtmlWebpackPlugin version.
                compilation.hooks.processAssets.tap({ name: PLUGIN_NAME, stage: host.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, () => {
                    for (const asset of compilation.getAssets()) {
                        if (!/\.html?$/iu.test(asset.name.replaceAll("\\", "/")))
                            continue;
                        const content = asset.source.source();
                        const html = typeof content === "string" ? content : Buffer.from(content).toString("utf8");
                        if (html.includes(SCRIPT_MARKER))
                            continue;
                        const closingTag = /<\/body\s*>/iu.test(html) ? /<\/body\s*>/iu : /<\/html\s*>/iu;
                        const injected = closingTag.test(html) ? html.replace(closingTag, match => `${script}${match}`) : `${html}${script}`;
                        compilation.updateAsset(asset.name, new host.webpack.sources.RawSource(injected));
                    }
                });
            });
        },
    };
}
//# sourceMappingURL=webpack.js.map