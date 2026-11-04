import type { CreatorCommandMenuItem } from "./creator-command-types.js";
export declare function CreatorCommandMenu({ items, active, title, notice, optionDomId, onPick, onSelect }: {
    items: CreatorCommandMenuItem[];
    active: number;
    title: string;
    notice?: string | undefined;
    optionDomId: (index: number) => string;
    onPick: (id: string) => void;
    onSelect: (index: number) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=CreatorCommandMenu.d.ts.map