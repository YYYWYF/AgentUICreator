import { expect, it } from "vitest";
import { parseAppUIModel } from "../src/framework/contracts/app-ui-model";
import { stringifyAppUIModel } from "../src/project/app-ui-serialization";

it("omits default enablement at every depth while preserving false and normalized state", () => {
  const model = parseAppUIModel({
    applicationPlugins: [{ id: "provider", pluginId: "provider", enabled: true }],
    root: { type: "slot", plugins: [{ id: "surface", pluginId: "surface", slots: {
      actions: [{ id: "action", pluginId: "action" }, { id: "disabled", pluginId: "action", enabled: false }],
    } }] },
  });
  const before = structuredClone(model);
  const source = stringifyAppUIModel(model);
  expect(source).not.toMatch(/"enabled"\s*:\s*true/u);
  expect(source).toMatch(/"enabled"\s*:\s*false/u);
  expect(parseAppUIModel(JSON.parse(source))).toEqual(model);
  expect(model).toEqual(before);
  expect(source.endsWith("\n")).toBe(true);
});
