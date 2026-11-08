import { expect, it } from "vitest";
import { presentationImpact } from "../src/project/presentation-impact";

it("reports shared consumers and transitive module scope without claiming completeness", () => {
  const file = (path: string, pluginId: string | undefined, keys: string[], dependencies: string[] = []) => ({ path, pluginId, sha256: path, dependencies, references: keys.map(key => ({ key, line: 4 })) });
  const catalog = { package: { name: "@za38.03/agent-ui-plugins", version: "9.2.0" }, presentationUsage: {
    schemaVersion: 1, coverage: "partial-static-references", files: [
      file("sources/plugins/alpha/view.tsx", "alpha", ["common.save"], ["sources/shared/a.tsx"]),
      file("sources/shared/a.tsx", undefined, ["common.save"], ["sources/shared/b.css"]),
      file("sources/shared/b.css", undefined, [], ["sources/shared/a.tsx"]),
      file("sources/plugins/beta/view.tsx", "beta", ["common.save"]),
    ],
  } };
  const result = presentationImpact(catalog, "alpha");
  expect(result).toMatchObject({ status: "available", package: catalog.package, coverage: "partial-static-references" });
  expect(result.localeReads?.[0]?.references.map(r => r.owner)).toEqual(["alpha", "shared", "beta"]);
  expect(result.sharedDependencies).toEqual(["sources/shared/a.tsx", "sources/shared/b.css"]);
  expect(result.guidance).toContain("partial index");
  expect(presentationImpact({}, "alpha")).toMatchObject({ status: "unavailable", coverage: "unknown" });
});
