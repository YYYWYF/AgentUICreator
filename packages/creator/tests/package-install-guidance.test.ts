import { expect, it } from "vitest";
import { packageInstallCommand } from "../src/ui/package-install-guidance.js";
it("renders actual package names and ranges without resource-specific assumptions", () => {
  expect(packageInstallCommand([{ name: "react-hook-form", required: "^7" }, { name: "@assistant-ui/react-hook-form", required: "0.12.34" }])).toBe("pnpm add react-hook-form@^7 @assistant-ui/react-hook-form@0.12.34");
  expect(packageInstallCommand([{ name: "example", required: ">=1 <2" }])).toBe("pnpm add 'example@>=1 <2'");
});
