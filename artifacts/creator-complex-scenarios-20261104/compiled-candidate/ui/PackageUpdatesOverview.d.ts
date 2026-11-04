import type { PackageUpdateOverview, PackageUpgradePlan } from "@za38.03/agent-ui-creator/project/updates";
export declare function PackageUpdatesOverview({ overview, refresh, working, plan, onPlan, onCancel, onExecute, onRecover }: {
    overview: PackageUpdateOverview;
    refresh: () => void;
    working: boolean;
    plan?: PackageUpgradePlan | null;
    onPlan?: () => void;
    onCancel?: () => void;
    onExecute?: () => void;
    onRecover?: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=PackageUpdatesOverview.d.ts.map