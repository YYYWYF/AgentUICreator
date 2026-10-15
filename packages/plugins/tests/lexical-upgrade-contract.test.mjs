import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { LEXICAL_PEERS, resolveLexicalPeerVersions } from "../scripts/lexical-integration-contract.mjs";

const manifest = (range = "^0.52.0") => ({
  name: "@assistant-ui/react-lexical", version: "0.3.0",
  peerDependencies: { "@assistant-ui/react": "^0.16.0", ...Object.fromEntries(LEXICAL_PEERS.map(name => [name, range])) },
});

it("keeps the optional upstream integration in the frozen upgrade target", async () => {
  const target = JSON.parse(await readFile(new URL("../../../assistant-ui-upgrade-target.json", import.meta.url), "utf8"));
  expect(target.packages["@assistant-ui/react-lexical"]).toBe("0.2.15");
  expect(target.packageRevisions["@assistant-ui/react-lexical"]).toMatch(/^[a-f0-9]{40}$/);
  const boundary = await readFile(new URL("../scripts/check-lexical-boundary.mjs", import.meta.url), "utf8");
  expect(boundary).not.toMatch(/0\.2\.15|0\.51\.0/);
});

it.each(["^0.52.0", "~0.52.1", ">=0.52.0 <0.53.0", "0.52.0 - 0.52.2", "^0.51.0 || ^0.52.0"])("resolves the highest compatible exact release for %s", async range => {
  const result = await resolveLexicalPeerVersions(manifest(range), "0.16.1", async (_name, requested) => {
    expect(requested).toBe(range);
    return ["0.52.0", "0.53.0", "0.52.2", "0.52.1", "0.52.3-beta.1"];
  });
  expect(result).toEqual(Object.fromEntries(LEXICAL_PEERS.map(name => [name, "0.52.2"])));
});

it("rejects an incompatible assistant-ui React target", async () => {
  await expect(resolveLexicalPeerVersions(manifest(), "0.15.23", async () => ["0.52.1"]))
    .rejects.toThrow("requires @assistant-ui/react");
});

it("rejects mismatched patch releases instead of installing multiple Lexical versions", async () => {
  await expect(resolveLexicalPeerVersions(manifest(), "0.16.1", async name => [name === "lexical" ? "0.52.1" : "0.52.2"]))
    .rejects.toThrow("one supported Lexical release family");
});

it("rejects missing, invalid and unsatisfiable upstream peer requirements", async () => {
  for (const range of ["workspace:^", "^0.54.0"]) {
    await expect(resolveLexicalPeerVersions(manifest(range), "0.16.1", async () => ["0.52.1"]))
      .rejects.toThrow();
  }
  const missing = manifest();
  delete missing.peerDependencies.lexical;
  await expect(resolveLexicalPeerVersions(missing, "0.16.1", async () => ["0.52.1"]))
    .rejects.toThrow("Missing or unsupported lexical peer requirement");
});
