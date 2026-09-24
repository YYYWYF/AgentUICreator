import type {
  CreatorProjectIssue,
  CreatorProjectMode,
  CreatorProjectSetupValidation,
  CreatorWorkspaceSetupInfo,
} from "../../workspace/types.js";
import { CreatorModeCard } from "./CreatorModeCard.js";
import "./creator-project-setup.css";

export interface CreatorSetupError {
  code?: string;
  message: string;
  details?: readonly CreatorProjectIssue[];
}

export interface CreatorSetupDraft {
  mode: CreatorProjectMode | null;
  sourceRoot: string;
  validation:
    | { status: "idle" }
    | { status: "validating" }
    | { status: "valid"; result: CreatorProjectSetupValidation }
    | { status: "invalid"; result: CreatorProjectSetupValidation };
  initializing: boolean;
  error: CreatorSetupError | null;
}

export interface CreatorSetupInfoState {
  status: "idle" | "loading" | "ready" | "failed";
  info?: CreatorWorkspaceSetupInfo;
  error?: string;
}

const issueMessages: Record<string, string> = {
  AGENT_UI_SOURCE_PARENT_NOT_FOUND: "上级目录不存在，请选择项目中已经存在的目录。",
  AGENT_UI_SOURCE_ROOT_NOT_EMPTY: "这个目录已有文件，请选择一个空目录或新的 Agent UI 目录。",
  AGENT_UI_SOURCE_ROOT_INVALID: "Agent UI 源码位置无效，请使用项目内的相对路径。",
  AGENT_UI_PROJECT_ALREADY_INITIALIZED: "这个项目已经初始化了 Agent UI。",
  AGENT_UI_MODE_INVALID: "请选择有效的产品形态。",
};

export function setupIssueMessage(issue: CreatorProjectIssue): string {
  return issueMessages[issue.code] ?? issue.message;
}

interface CreatorProjectSetupProps {
  infoState: CreatorSetupInfoState;
  draft: CreatorSetupDraft;
  canInitialize: boolean;
  debug: boolean;
  onModeChange(mode: CreatorProjectMode): void;
  onSourceRootChange(value: string): void;
  onInitialize(): void;
  onRetryInfo(): void;
}

export function CreatorProjectSetup({
  infoState, draft, canInitialize, debug, onModeChange, onSourceRootChange,
  onInitialize, onRetryInfo,
}: CreatorProjectSetupProps) {
  const validation = draft.validation;
  const validTarget = validation.status === "valid" ? validation.result.sourceRoot.targetState : null;
  return (
    <section className="creator-project-setup" aria-label="创建 Agent UI">
      <h2>创建 Agent UI</h2>
      {infoState.status === "loading" || infoState.status === "idle" ? (
        <p role="status">正在加载项目初始化选项…</p>
      ) : infoState.status === "failed" || infoState.info === undefined ? (
        <div className="creator-project-setup-error" role="alert">
          <p>{infoState.error ?? "无法加载项目初始化选项。"}</p>
          <button type="button" onClick={onRetryInfo}>重试</button>
        </div>
      ) : (
        <>
          <fieldset className="creator-project-setup-modes" disabled={draft.initializing}>
            <legend>选择产品形态</legend>
            <div className="creator-project-setup-mode-grid">
              {infoState.info.modes.map((mode) => (
                <CreatorModeCard key={mode.id} mode={mode} selected={draft.mode === mode.id}
                  disabled={draft.initializing} onSelect={onModeChange} />
              ))}
            </div>
          </fieldset>
          <div className="creator-project-setup-field">
            <label htmlFor="creator-setup-source-root">Agent UI 源码位置</label>
            <input id="creator-setup-source-root" type="text" value={draft.sourceRoot}
              disabled={draft.initializing} onChange={(event) => onSourceRootChange(event.target.value)} />
            <small>相对于当前 Project Root。AgentUICreator 将主要管理这个目录中的 Agent UI 源码。</small>
            <small>根据当前项目结构建议：{infoState.info.suggestedSourceRoot}</small>
          </div>
          <div className="creator-project-setup-validation" aria-live="polite">
            {validation.status === "validating" ? <p>正在检查目录…</p> : null}
            {validTarget === "missing" ? <p>✓ 将创建新目录：{draft.sourceRoot}</p> : null}
            {validTarget === "empty" ? <p>✓ 将使用现有空目录：{draft.sourceRoot}</p> : null}
            {validation.status === "invalid" ? (
              <ul>{validation.result.issues.length === 0 ? <li>当前目录状态不允许初始化，请刷新项目状态。</li> : null}
                {validation.result.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{setupIssueMessage(issue)}{debug ? <code> {issue.code}</code> : null}</li>
              ))}</ul>
            ) : null}
          </div>
          {draft.error === null ? null : (
            <div className="creator-project-setup-error" role="alert">
              <strong>{draft.error.code === "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET"
                ? "缺少或不兼容的 Agent UI 依赖" : draft.error.message}</strong>
              {draft.error.details === undefined ? null : (
                <ul>{draft.error.details.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{setupIssueMessage(issue)}{debug ? <code> {issue.code}</code> : null}</li>
                ))}</ul>
              )}
              {debug && draft.error.code !== undefined ? <code>{draft.error.code}</code> : null}
            </div>
          )}
          {draft.initializing ? <p role="status">正在创建 Agent UI 源码并验证项目…</p> : null}
          <div className="creator-project-setup-actions">
            <button type="button" disabled={!canInitialize} onClick={onInitialize}>
              {draft.initializing ? "正在初始化…" : "初始化 Agent UI"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
