import { type CreatorLocaleMessages } from "../i18n/locale.js";
import type { CreatorProjectMode } from "../../workspace/types.js";
/** Import path from a Host-owned component placed directly under src/. */
export declare function agentImportPathFromSrc(sourceRoot: string): string;
export declare function agentIntegrationSnippet(sourceRoot: string, localeMessages?: CreatorLocaleMessages): string;
export declare function agentProviderIntegrationSnippet(sourceRoot: string, localeMessages?: CreatorLocaleMessages): string;
export declare function CreatorProjectIntegrationGuide({ sourceRoot, mode, hostFramework, onBuild, buildDisabled }: {
    sourceRoot: string;
    mode: CreatorProjectMode;
    hostFramework?: "vue" | undefined;
    onBuild?: (() => Promise<unknown>) | undefined;
    buildDisabled?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=CreatorProjectIntegrationGuide.d.ts.map