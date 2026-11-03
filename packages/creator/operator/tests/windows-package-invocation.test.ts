import { expect, it } from "vitest";
import { resourcePackageInvocation } from "../src/project/ensure-resource-packages";

it("uses the inherited package manager JS entry on Windows", () => {
  const invocation = resourcePackageInvocation("pnpm", ["add", "react@19.1.1"], "win32", { npm_execpath: "C:/Program Files/pnpm/pnpm.cjs" });
  expect(invocation).toEqual({ command: process.execPath, args: ["C:/Program Files/pnpm/pnpm.cjs", "add", "react@19.1.1"], shell: false });
});
it("quotes Windows fallback ranges and rejects cmd expansion", () => {
  expect(resourcePackageInvocation("npm", ["install", "react@>=18 <20 || >=21"], "win32", {})).toEqual({ command: "npm.cmd", args: ['"install"', '"react@>=18 <20 || >=21"'], shell: true });
  expect(() => resourcePackageInvocation("npm", ["react@%TOKEN%"], "win32", {})).toThrow();
});

it("does not reuse pnpm when an independent Host selects npm", () => {
  expect(resourcePackageInvocation("npm", ["install"], "win32", { npm_execpath: "C:/pnpm/pnpm.cjs" }).command).toBe("npm.cmd");
});

it("supports standalone Windows package manager executables", () => {
  expect(resourcePackageInvocation("pnpm", ["add", "react@19.1.1"], "win32", { npm_execpath: "C:/Tools/pnpm.exe" })).toEqual({ command: "C:/Tools/pnpm.exe", args: ["add", "react@19.1.1"], shell: false });
});
