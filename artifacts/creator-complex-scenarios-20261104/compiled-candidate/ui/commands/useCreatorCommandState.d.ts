import { type KeyboardEvent } from "react";
import { type CreatorCommandCatalog } from "../../commands/types.js";
import type { CreatorCommandMenuItem } from "./creator-command-types.js";
export declare function useCreatorCommandState(input: string, workspaceId: string | undefined): {
    parsed: import("../../commands/parser.js").ParsedCreatorCommand;
    catalog: CreatorCommandCatalog;
    open: boolean;
    items: CreatorCommandMenuItem[];
    active: number;
    menuKey: string;
    optionDomId: (index: number) => string;
    select: import("react").Dispatch<import("react").SetStateAction<number>>;
    keyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
        input?: never;
        handled: boolean;
        execute?: never;
    } | {
        input?: never;
        execute: string;
        handled: boolean;
    } | {
        execute?: never;
        input: string;
        handled: boolean;
    } | undefined;
    pick: (id: string) => {
        input?: never;
        handled: boolean;
        execute?: never;
    } | {
        input?: never;
        handled?: never;
        execute: string;
    } | {
        handled?: never;
        execute?: never;
        input: string;
    };
    refresh: (signal?: AbortSignal) => Promise<void>;
    show: () => void;
    notice: string | undefined;
    optionLabel: (commandId: string, id: string, fallback?: string) => string;
    title: string;
};
//# sourceMappingURL=useCreatorCommandState.d.ts.map