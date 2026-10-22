import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The npm entry supplies its own installation. Operator never imports Creator
// or resolves Python packages from its own dependency tree (important for pnpm).
let defaultCreatorRoot: string | undefined;
export function configureCreatorDistribution(root: string): void {
  defaultCreatorRoot = path.resolve(root);
}

export function creatorDistributionRoot(): string {
  if (defaultCreatorRoot) return defaultCreatorRoot;
  const sourceRoot = fileURLToPath(new URL("../../creator/", import.meta.url));
  if (existsSync(path.join(sourceRoot, "python/pyproject.toml"))) return sourceRoot;
  throw Object.assign(new Error("Start Creator through @za38.03/agent-ui-creator, or configure its installation with configureCreatorDistribution()."), {
    code: "CREATOR_DISTRIBUTION_UNCONFIGURED",
  });
}
