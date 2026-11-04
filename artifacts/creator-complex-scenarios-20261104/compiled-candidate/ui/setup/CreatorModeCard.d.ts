import type { CreatorProjectMode, CreatorWorkspaceSetupInfo } from "../../workspace/types.js";
interface CreatorModeCardProps {
    mode: CreatorWorkspaceSetupInfo["modes"][number];
    selected: boolean;
    disabled: boolean;
    onSelect(mode: CreatorProjectMode): void;
}
export declare function CreatorModeCard({ mode, selected, disabled, onSelect }: CreatorModeCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=CreatorModeCard.d.ts.map