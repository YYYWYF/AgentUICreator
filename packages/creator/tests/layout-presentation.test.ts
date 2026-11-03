// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { collectRuntimePresentation } from "../src/host-preview/layoutPresentation.js";
import { agentContracts } from "../src/agent/contracts.js";
import path from "node:path";

afterEach(() => { document.body.innerHTML = ""; });
const request = { requestId: "12345678-1234-1234-1234-123456789abc", currentHash: "a".repeat(64), threadId: "thread" };
it("returns bounded structure and computed style facts within published semantic regions without text, values or unrelated attributes", async () => {
  document.body.innerHTML = '<div id="outside" data-layout-node-id="outside">outside secret</div><main id="root"><section data-layout-node-id="layout-node:root"><div class="agent-ui-sidebar-frame" data-sidebar-mode="inline"><div class="agent-ui-sidebar-provider" style="--sidebar-width:280px;display:flex"><div data-slot="sidebar-gap" style="width:0px"></div><textarea data-slot="aui_composer-input" placeholder="private placeholder" data-token="private token">private draft</textarea></div></div></section></main>';
  const root = document.getElementById("root")!;
  const result = collectRuntimePresentation(root, { layoutNodes: [{ nodeId: "layout-node:root" }, { nodeId: "outside" }] }, request);
  expect(result.status).toBe("available");
  expect(result.regions[0]!.nodes.find(node => node.slot === "sidebar-gap")?.styles.width).toBe("0px");
  expect(result.regions[0]!.nodes.find(node => node.sidebarMode === "inline")).toBeDefined();
  expect(result.regions[0]!.nodes.find(node => node.classes.includes("agent-ui-sidebar-provider"))?.styles.sidebarWidth).toBe("280px");
  const frame = root.querySelector<HTMLElement>(".agent-ui-sidebar-frame")!;
  frame.style.borderRadius = "16px";
  frame.style.borderColor = "rgb(37, 99, 235)";
  frame.style.backgroundColor = "rgb(255, 255, 255)";
  frame.dataset.state = "expanded"; frame.dataset.side = "left"; frame.setAttribute("aria-expanded", "true");
  const states = collectRuntimePresentation(root, { layoutNodes: [{ nodeId: "layout-node:root" }] }, request);
  expect(states.regions[0]!.nodes.find(node => node.sidebarMode === "inline")).toMatchObject({ state: "expanded", expanded: true, side: "left" });
  expect(states.regions[0]!.nodes.find(node => node.sidebarMode === "inline")?.styles).toMatchObject({ borderRadius: "16px", borderColor: "rgb(37, 99, 235)", backgroundColor: "rgb(255, 255, 255)" });
  const text = JSON.stringify(result);
  expect(text).not.toContain("private"); expect(text).not.toContain("outside secret"); expect(text).not.toContain("data-token");
  const contract = await agentContracts(path.resolve("contracts/creator"));
  expect(() => contract.validate("RuntimeDiagnosticEnvelope", { threadId: "thread", observationRequestId: request.requestId, presentation: states })).not.toThrow();
  expect(() => contract.validate("RuntimeDiagnosticEnvelope", { threadId: "thread", presentation: { ...result, textContent: "private" } })).toThrow();
});
it("intersects requested identities with published identities and keeps ancestors inside the Agent root", () => {
  document.body.innerHTML = '<main id="root"><div data-plugin-instance-id="known"><div data-slot="known-slot"></div></div><div data-plugin-instance-id="unpublished">private</div></main><div data-plugin-instance-id="outside"></div>';
  const root = document.getElementById("root")!;
  const result = collectRuntimePresentation(root, { instances: [{ instanceId: "known" }] }, { ...request, instanceIds: ["known", "unpublished", "outside"] });
  expect(result.regions.map(region => region.id)).toEqual(["known"]);
  expect(result.regions[0]!.nodes.filter(node => node.relation === "ancestor").map(node => node.tag)).toEqual(["main"]);
  expect(collectRuntimePresentation(root, { instances: [] }, { ...request, instanceIds: ["outside"] })).toMatchObject({ status: "unavailable", regions: [] });
});
it("reports truncation and remains within its output budget", () => {
  document.body.innerHTML = '<main id="root" data-layout-node-id="layout-node:root">'+Array.from({length:1000},()=>'<div data-slot="item" style="display:flex"></div>').join('')+'</main>';
  const result = collectRuntimePresentation(document.getElementById("root")!, { layoutNodes: [{ nodeId: "layout-node:root" }] }, request);
  expect(result.truncated).toBe(true); expect(result.regions[0]!.nodes.length).toBeLessThanOrEqual(24); expect(JSON.stringify(result).length).toBeLessThan(20_000);
});
