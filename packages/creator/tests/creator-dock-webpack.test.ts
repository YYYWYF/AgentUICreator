import { expect, it, vi } from "vitest";
import { createCreatorDockWebpackPlugin, createCreatorDockWebpackDevServerOptions } from "../src/dock/webpack.js";

function compilerFixture(mode = "development") {
  const assets = new Map<string, string>([
    ["index.html", '<!doctype html><html><body><main id="app">Host</main></body></html>'],
    ["pages\\extra.htm", "<HTML><BODY>Other</BODY></HTML>"],
    ["bundle.js", "console.log('Host');"],
  ]);
  let compile!: (compilation: unknown) => void;
  let process!: () => void;
  class RawSource { constructor(public content: string) {} }
  const host = {
    options: { mode, context: globalThis.process.cwd(), devServer: { proxy: [{ context: ["/existing"], target: "http://existing.test" }] } },
    webpack: { Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 }, sources: { RawSource } },
    hooks: { thisCompilation: { tap: vi.fn((_name: string, callback: typeof compile) => { compile = callback; }) } },
  };
  const run = () => {
    compile({
      hooks: { processAssets: { tap(_options: object, callback: typeof process) { process = callback; } } },
      getAssets: () => [...assets].map(([name, content]) => ({ name, source: { source: () => Buffer.from(content) } })),
      updateAsset: (name: string, source: RawSource) => { assets.set(name, source.content); },
    });
    process();
  };
  return { host, assets, run };
}

it("injects into emitted HTML and preserves the application and JavaScript assets", () => {
  const fixture = compilerFixture();
  createCreatorDockWebpackPlugin({ creatorUrl: "http://127.0.0.1:48112", locale: "en-US" }).apply(fixture.host);
  fixture.run();
  const html = fixture.assets.get("index.html")!;
  expect(html).toContain('<main id="app">Host</main>');
  expect(html).toContain('src="http://127.0.0.1:48112/dock-client.js"');
  expect(html).toContain('data-creator-locale="en-US"');
  expect(html).not.toContain(fixture.host.options.context);
  expect(html.indexOf("dock-client.js")).toBeLessThan(html.indexOf("</body>"));
  expect(fixture.assets.get("pages\\extra.htm")).toContain("dock-client.js");
  expect(fixture.assets.get("bundle.js")).toBe("console.log('Host');");
  fixture.run();
  expect(fixture.assets.get("index.html")!.match(/data-creator-webpack-dock/g)).toHaveLength(1);
  expect(fixture.host.options.devServer.proxy).toHaveLength(5);
  expect(fixture.host.options.devServer.proxy.at(-1)).toMatchObject({ target: "http://existing.test" });
});

it.each(["production", "none", ""])("does nothing outside explicit development mode (%s)", mode => {
  const fixture = compilerFixture(mode);
  fixture.host.options.context = "C:\\missing\\production-project";
  createCreatorDockWebpackPlugin().apply(fixture.host);
  expect(fixture.host.hooks.thisCompilation.tap).not.toHaveBeenCalled();
  expect(fixture.host.options.devServer.proxy).toHaveLength(1);
  expect(fixture.assets.get("index.html")).not.toContain("Creator");
});

it("preserves dev server settings and accepts object-style proxies", () => {
  const options = createCreatorDockWebpackDevServerOptions({
    port: 8080, hot: true, proxy: { "/old": "http://old.test" },
  });
  expect(options.port).toBe(8080);
  expect(options.hot).toBe(true);
  expect(options.proxy[0]).toMatchObject({ context: ["/__agent-ui/agent-proxy"], pathFilter: "/__agent-ui/agent-proxy" });
  expect(options.proxy.at(-1)).toMatchObject({ context: ["/old"], target: "http://old.test" });
});
