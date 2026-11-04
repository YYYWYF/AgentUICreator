import path from "node:path";
import { fileURLToPath } from "node:url";
let configuredRoot;
export function configureCreatorDistribution(root) { configuredRoot = path.resolve(root); }
export function creatorDistributionRoot() { return configuredRoot ?? fileURLToPath(new URL("../", import.meta.url)); }
//# sourceMappingURL=creatorRuntimeDistribution.js.map