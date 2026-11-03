import path from "node:path";
import { fileURLToPath } from "node:url";
let configuredRoot: string | undefined;
export function configureCreatorDistribution(root: string): void { configuredRoot = path.resolve(root); }
export function creatorDistributionRoot(): string { return configuredRoot ?? fileURLToPath(new URL("../", import.meta.url)); }
