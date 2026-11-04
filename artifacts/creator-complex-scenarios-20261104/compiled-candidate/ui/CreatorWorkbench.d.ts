import { type CreatorLocaleCode } from "./i18n/locale.js";
import { type ReactNode } from "react";
import "./creator-workbench.css";
export interface CreatorWorkbenchContext {
    threadId: string;
    workspaceId: string;
}
interface CreatorWorkbenchProps {
    locale?: CreatorLocaleCode;
    onLocaleChange?: (locale: CreatorLocaleCode) => void;
    previewWorkspaceId?: string | undefined;
    layout?: "workbench" | "dock" | undefined;
    children: ReactNode | ((context: CreatorWorkbenchContext) => ReactNode);
}
export { CreatorLocaleProvider, useAgentUILocale } from "./i18n/locale.js";
export type { CreatorLocaleCode } from "./i18n/locale.js";
export declare function CreatorWorkbench(props: CreatorWorkbenchProps): import("react").JSX.Element;
//# sourceMappingURL=CreatorWorkbench.d.ts.map