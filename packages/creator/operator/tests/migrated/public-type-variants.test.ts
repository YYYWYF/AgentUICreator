import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { inspectPluginSharedTypes, resolveSharedDeclaration } from "../../src/project/plugin-shared-types";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { inspectPluginApplication } from "../../src/project/plugin-application-inspector";
import { Ajv2020 } from "ajv/dist/2020";
import { prioritizePublicMembers } from "../../src/project/public-type-navigation";

it("prioritizes domain declarations on native Windows and Unix paths without hiding native props", () => {
  const symbol = (name: string, path: string) => ({ name, declarations: [{ path }] });
  const members = [symbol("onCopy", "C:\\host\\node_modules\\@types\\react\\index.d.ts"),
    symbol("maxLength", "C:\\host\\plugins\\composer.d.ts"), symbol("onDismiss", "/host/plugins/card.d.ts"),
    symbol("renderSlot", "/host/plugins/contracts.d.ts")];
  expect(prioritizePublicMembers(members as any).map(member => member.name)).toEqual(["maxLength", "onDismiss", "renderSlot", "onCopy"]);
});

it("makes composer configuration discoverable and queries the installed Runtime without implementation access", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const composer: any = await inspectPluginSharedTypes(root, ["ConversationComposerPlugin.$parameter0"], "@za38.03/agent-ui-plugins/composer");
  expect(composer.queryResolution.status).toBe("complete");
  expect(composer.symbols[0].members.map((member: any) => member.name)).toEqual(expect.arrayContaining(["placeholder", "maxLength", "inputProps"]));
  expect(composer.symbols[0].memberNames).toContain("onCopy");
  const scalar: any = await inspectPluginSharedTypes(root, ["ConversationCanonicalComposerProps.placeholder"], "@za38.03/agent-ui-plugins");
  expect(scalar.symbols[0].members).toEqual([]);
  expect(scalar.symbols[0].union.variants.every((variant: any) => variant.members.length === 0)).toBe(true);
  const runtime: any = await inspectPluginSharedTypes(root, ["AgentProps.locales", "AgentProps.defaultLocale"], "@za38.03/agent-ui-runtime/ui");
  expect(runtime.queryResolution.status).toBe("complete");
  expect(runtime.symbols[1].type).toContain("AgentUILocaleCode");
  const localized: any = await inspectPluginSharedTypes(root, ["AgentProps.locales.zh-CN.composer.placeholder"], "@za38.03/agent-ui-runtime/ui");
  expect(localized.queryResolution.status).toBe("complete");
  const nativeLabel: any = await inspectPluginSharedTypes(root, ["ConversationCanonicalComposerProps.inputProps.aria-label"], "@za38.03/agent-ui-plugins");
  expect(nativeLabel.queryResolution.status).toBe("complete");
  const types: any = await inspectPluginSharedTypes(root, ["UIPluginRenderScope", "UIPluginRenderSlotOptions"]);
  expect(types.queryResolution.status).toBe("complete");
  expect(await inspectPluginSharedTypes(root, ["AgentProps"], "@za38.03/agent-ui-runtime/../../private")).toMatchObject({ status: "unavailable" });
}, 30_000);

it("returns complete application prop names with relevant types before DOM event details", async () => {
  const root = await mkdtemp(fileURLToPath(new URL("../../../.public-api-", import.meta.url)));
  try {
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", skipLibCheck: true } }));
    await writeFile(path.join(root, "index.tsx"), 'import {ConversationComposerPlugin as Impl} from "@za38.03/agent-ui-plugins/composer"; import type {ComponentProps} from "react"; export function ConversationComposerPlugin(props:ComponentProps<typeof Impl>){return <Impl {...props}/>;}');
    const inspected: any = await inspectPluginApplication(root, { pluginId: "composer", application: { entryPath: "index.tsx", implementationOwnership: "npm", implementationImport: "@za38.03/agent-ui-plugins/composer" } } as any);
    expect(inspected.publicApi, JSON.stringify(inspected.publicApi)).toMatchObject({ status: "available", completePropNames: true });
    expect(inspected.publicApi.props.map((prop: any) => prop.name)).toEqual(expect.arrayContaining(["placeholder", "maxLength", "inputProps"]));
    expect(inspected.publicApi.propNames).toContain("onCopy");
    expect(inspected.publicApi.localizedDefaults).toMatchObject({ placeholder: "composer.placeholder" });
    expect(inspected.usageGuide.localizedDefaults).toEqual(inspected.publicApi.localizedDefaults);
    const contract = JSON.parse(await readFile(fileURLToPath(new URL("../../../contracts/creator/operator.schema.json", import.meta.url)), "utf8"));
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    ajv.addSchema(JSON.parse(await readFile(fileURLToPath(new URL("../../../contracts/creator/app-ui-model-operation.schema.json", import.meta.url)), "utf8")));
    ajv.addSchema(contract);
    const validate = ajv.getSchema(`${contract.$id}#/$defs/pluginApplicationInspection`)!;
    expect(validate(inspected), JSON.stringify(validate.errors)).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);

it("exposes installed union-specific members and queryable callable signatures without source access", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const inspected: any = await inspectPluginSharedTypes(root, ["ConversationSlashCommand"], "@za38.03/agent-ui-plugins");
  expect(inspected.queryResolution.status).toBe("complete");
  const symbol = inspected.symbols[0];
  expect(symbol.presentationContract.interaction).toContain("serialized");
  const contract = JSON.parse(await readFile(fileURLToPath(new URL("../../../contracts/creator/operator.schema.json", import.meta.url)), "utf8"));
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema(JSON.parse(await readFile(fileURLToPath(new URL("../../../contracts/creator/app-ui-model-operation.schema.json", import.meta.url)), "utf8")));
  ajv.addSchema(contract);
  const validate = ajv.getSchema(`${contract.$id}#/$defs/pluginSharedTypesInspection`)!;
  expect(validate(inspected), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...inspected, arbitrarySource: "must remain rejected" })).toBe(false);
  expect(symbol.union.commonMembersOnly).toBe(true);
  const action = symbol.union.variants.find((variant: any) => variant.discriminants.some((item: any) => item.name === "mode" && item.type === '"action"'));
  const directive = symbol.union.variants.find((variant: any) => variant.discriminants.some((item: any) => item.name === "mode" && item.type === '"directive"'));
  expect(action.members.some((item: any) => item.name === "execute")).toBe(true);
  expect(directive.members.some((item: any) => item.name === "execute")).toBe(false);
  const detail: any = await inspectPluginSharedTypes(root, [`${action.query}.execute.$return`], "@za38.03/agent-ui-plugins");
  expect(detail.queryResolution.status).toBe("complete");
  expect(validate(detail), JSON.stringify(validate.errors)).toBe(true);
  expect(detail.symbols[0].type).toContain("void");
  expect(await inspectPluginSharedTypes(root, ["ConversationSlashCommand"], "../../private")).toMatchObject({ status: "unavailable" });
}, 20_000);
it("preserves declaration package boundaries for Windows drive and UNC installations", () => {
  expect(resolveSharedDeclaration("C:\\project\\plugins", "./dist/public.d.ts", path.win32)).toBe("C:\\project\\plugins\\dist\\public.d.ts");
  expect(() => resolveSharedDeclaration("C:\\project\\plugins", "./../../secret.d.ts", path.win32)).toThrow();
  expect(resolveSharedDeclaration("\\\\server\\share\\plugins", "./dist/public.d.ts", path.win32)).toBe("\\\\server\\share\\plugins\\dist\\public.d.ts");
});
