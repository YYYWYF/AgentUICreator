import { expect, it } from "vitest";
import { applyProductStyleOwnership, checkProductAdapters, prepareProductAdapters } from "../scripts/sync-product-adapters.mjs";

it("marks product elements without rewriting custom business components or children", () => {
  const source = '<div className="[&>img]:block"><BusinessUI /><Input /><span data-slot="label">{children}</span></div>';
  const result = applyProductStyleOwnership(source);
  expect(result).toContain('<div data-agent-ui-owned=""');
  expect(result).toContain('<Input data-agent-ui-owned=""');
  expect(result).toContain('<span data-agent-ui-owned="" data-slot="label">{children}</span>');
  expect(result).toContain('<BusinessUI />');
  expect(applyProductStyleOwnership(result)).toBe(result);
});

it("keeps generated ownership reproducible, including official ToolTimeline controls", async () => {
  await checkProductAdapters();
  const { files } = await prepareProductAdapters();
  const timeline = files.find(file => file.localPath.endsWith('/tool-timeline.tsx'));
  expect(timeline?.source).toContain('<CollapsibleTrigger data-agent-ui-owned=""');
  expect(timeline?.source).toContain('<div data-agent-ui-owned=""');
});
