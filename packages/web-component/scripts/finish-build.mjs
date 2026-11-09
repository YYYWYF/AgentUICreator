import { finalizeShadowStyles } from '../../plugins/resources/registry/items/integration/web-component-bridge/files/integrations/web-component-bridge/build-styles.mjs';
import { fileURLToPath } from 'node:url';
import { copyFile, readFile, writeFile } from "node:fs/promises";
const dist = new URL("../dist/", import.meta.url);
await finalizeShadowStyles(fileURLToPath(dist), ['agent-ui.js', 'agent-ui.es.js']);
// CSS is embedded in the runtime bundle, so its build-only import must not
// become an unresolved side-effect import in consumers' public declarations.
const elementDeclaration = new URL('types/src/AgentUIElement.d.ts', dist);
await writeFile(elementDeclaration, (await readFile(elementDeclaration, 'utf8')).replace(/^import ["']\.\/styles\.css["'];\r?\n/mu, ''));
await writeFile(new URL("types.d.ts", dist), 'export * from "./types/src/register.js";\n');
await copyFile(new URL("../../plugins/THIRD_PARTY_NOTICES.md", import.meta.url), new URL("THIRD_PARTY_NOTICES.md", dist));
