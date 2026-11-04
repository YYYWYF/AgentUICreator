export const CREATOR_WORKSPACE_API_PATH = "/__agent-ui/creator/workspace";
export const CREATOR_WORKSPACE_ID_HEADER = "x-agent-ui-workspace-id";
export const CREATOR_PROJECT_MODES = ["assistant", "embedded", "platform"];
export function publicWorkspaceState(state) {
    if (state.status === "none")
        return state;
    const { projectRoot: _projectRoot, ...workspace } = state.workspace;
    if (state.status === "ready") {
        return { status: state.status, workspace, project: state.project, runtime: state.runtime, ...(state.warnings === undefined ? {} : { warnings: state.warnings }) };
    }
    if (state.status === "broken")
        return { status: "broken", workspace, issues: state.issues };
    return { status: "uninitialized", workspace };
}
//# sourceMappingURL=types.js.map