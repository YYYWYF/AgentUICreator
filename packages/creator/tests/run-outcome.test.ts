import { expect, it } from "vitest";
import { creatorRunOutcomeText } from "../src/ui/run-outcome.js";
import { zhCN } from "../src/ui/i18n/zh-CN.js";
import { enUS } from "../src/ui/i18n/en-US.js";

it("describes a stopped run without inventing committed changes, in either locale", () => {
  const metadata = {creatorRunOutcome:{status:"stopped",changeStatus:"none",lastToolName:"read_file",
    toolErrors:[{toolName:"read_file",reason:"File /bad/path not found"}]}};
  expect(creatorRunOutcomeText(metadata,"old generic stop message",zhCN)).toContain("没有修改项目文件");
  expect(creatorRunOutcomeText(metadata,"old generic stop message",zhCN)).toContain("/bad/path");
  expect(creatorRunOutcomeText(metadata,"old generic stop message",enUS)).toContain("No project files were changed");
});
it("keeps committed changes distinct from success and preserves failure reasons", () => {
  const text=creatorRunOutcomeText({creatorRunOutcome:{status:"failed",changeStatus:"committed"}},"E_CHECK_FAILED",enUS);
  expect(text).toContain("changes were kept"); expect(text).toContain("E_CHECK_FAILED");
  expect(text).not.toContain("No project files");
  expect(creatorRunOutcomeText({},"legacy failure",enUS)).toBe("legacy failure");
});
