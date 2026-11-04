import { type ReactNode } from "react";
import { zhCN } from "./zh-CN.js";
export type CreatorLocaleCode = "en-US" | "zh-CN";
export type CreatorLocaleMessages = {
    [N in keyof typeof zhCN]: {
        [K in keyof (typeof zhCN)[N]]: string;
    };
};
export declare const CREATOR_LOCALES: Record<CreatorLocaleCode, CreatorLocaleMessages>;
export declare const DEFAULT_CREATOR_MESSAGES: CreatorLocaleMessages;
export declare function resolveCreatorLocaleMessages(locale: CreatorLocaleCode, warn?: (key: string) => void): CreatorLocaleMessages;
/** Tool-host presentation state; never passed to the generated application's protocol or model. */
export declare function CreatorLocaleProvider({ children, locale, onLocaleChange }: {
    children: ReactNode;
    locale?: CreatorLocaleCode | undefined;
    onLocaleChange?: ((locale: CreatorLocaleCode) => void) | undefined;
}): import("react").FunctionComponentElement<import("react").ProviderProps<{
    locale: CreatorLocaleCode;
    messages: CreatorLocaleMessages;
    setLocale: (_locale: CreatorLocaleCode) => void;
}>>;
export declare function useAgentUILocale(): CreatorLocaleMessages;
export declare function useAgentUILocale<N extends keyof CreatorLocaleMessages>(namespace: N): CreatorLocaleMessages[N];
export declare function useCreatorLocaleState(): {
    locale: CreatorLocaleCode;
    messages: CreatorLocaleMessages;
    setLocale: (_locale: CreatorLocaleCode) => void;
};
export declare function formatLocaleMessage(template: string, ...values: unknown[]): string;
/** Re-project transient product notices when locale changes; never touch Agent or user content. */
export declare function localizeCreatorPresentation(text: string | null | undefined, messages: CreatorLocaleMessages): string | null | undefined;
//# sourceMappingURL=locale.d.ts.map