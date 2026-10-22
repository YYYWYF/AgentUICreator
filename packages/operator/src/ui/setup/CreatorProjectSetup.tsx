import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "../i18n/locale.js";
import type {
  CreatorProjectIssue,
  CreatorProjectMode,
  CreatorProjectSetupValidation,
  CreatorWorkspaceSetupInfo,
} from "../../workspace/types.js";
import { CreatorModeCard } from "./CreatorModeCard.js";
import { Button } from "../components/button.js";
import { Input } from "../components/input.js";
import { Layers } from "lucide-react";
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

function getIssueMessages(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<string, string> { return {
  AGENT_UI_COMPATIBILITY_DIRECTORY_INVALID: localeMessages.setup.compatibilityDirectoryInvalid,
  AGENT_UI_COMPATIBILITY_PLAN_STALE: localeMessages.setup.compatibilityPlanStale,
  AGENT_UI_COMPATIBILITY_INSTALL_FAILED: localeMessages.setup.compatibilityInstallFailed,
  AGENT_UI_COMPATIBILITY_WORKSPACE_UNSUPPORTED: localeMessages.setup.compatibilityWorkspaceUnsupported,
  AGENT_UI_COMPATIBILITY_MANAGER_UNSUPPORTED: localeMessages.setup.compatibilityManagerUnsupported,
  AGENT_UI_SOURCE_PARENT_NOT_FOUND: localeMessages.setup.parentDirectoryDoesNotExistChooseAnExisting,
  AGENT_UI_SOURCE_ROOT_NOT_EMPTY: localeMessages.setup.thisDirectoryContainsFilesChooseAnEmptyOr,
  AGENT_UI_SOURCE_ROOT_INVALID: localeMessages.setup.invalidSourceLocationUseARelativePathWithin,
  AGENT_UI_PROJECT_ALREADY_INITIALIZED: localeMessages.setup.agentUIIsAlreadyInitializedInThisProject,
  AGENT_UI_MODE_INVALID: localeMessages.setup.chooseAValidProductMode,
}; }

export function setupIssueMessage(issue: CreatorProjectIssue, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  return getIssueMessages(localeMessages)[issue.code] ?? issue.message;
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
  const localeMessages = useAgentUILocale();
  const validation = draft.validation;
  const compatibility = infoState.info?.hostFramework === "vue";
  const validTarget = validation.status === "valid" ? validation.result.sourceRoot.targetState : null;
  const targetPath = validation.status === "valid"
    ? validation.result.sourceRoot.absolutePath ?? validation.result.sourceRoot.normalized
    : null;
  return (
    <section className="creator-project-setup creator-ui-scope" aria-label={localeMessages.setup.createAgentUI}>
      <div className="creator-project-setup-content">
        <div className="creator-setup-heading"><Layers aria-hidden="true" /><h2>{localeMessages.setup.createAgentUI}</h2></div>
        <p className="creator-setup-description">{compatibility ? localeMessages.setup.vueProducerDescription : localeMessages.setup.chooseAProductModeToIntegrateAgentUI}</p>
        {infoState.status === "loading" || infoState.status === "idle" ? (
          <p role="status">{localeMessages.setup.loadingInitializationOptions}</p>
        ) : infoState.status === "failed" || infoState.info === undefined ? (
          <div className="creator-project-setup-error" role="alert">
            <p>{localizeCreatorPresentation(infoState.error, localeMessages) ?? localeMessages.setup.couldNotLoadInitializationOptions}</p>
            <Button size="sm" variant="outline" type="button" onClick={onRetryInfo}>{localeMessages.setup.retry}</Button>
          </div>
        ) : (
          <>
            <fieldset className="creator-project-setup-modes" disabled={draft.initializing}>
              <legend>{localeMessages.setup.chooseProductMode}</legend>
              <div className="creator-project-setup-mode-grid">
                {infoState.info.modes.map((mode) => (
                  <CreatorModeCard key={mode.id} mode={mode} selected={draft.mode === mode.id}
                    disabled={draft.initializing} onSelect={onModeChange} />
                ))}
              </div>
            </fieldset>
            <div className="creator-project-setup-field">
              <label htmlFor="creator-setup-source-root">{compatibility ? localeMessages.setup.vueProducerDirectory : localeMessages.setup.agentUISourceLocation}</label>
              <Input id="creator-setup-source-root" type="text" value={draft.sourceRoot}
                disabled={draft.initializing} onChange={(event) => onSourceRootChange(event.target.value)} />
              <small>{compatibility ? localeMessages.setup.vueProducerDirectoryHint : localeMessages.setup.enterARelativeProjectPathCreatorManagesAgent}</small>
            </div>
            <div className="creator-project-setup-validation" aria-live="polite">
              {validation.status === "validating" ? <p>{localeMessages.setup.checkingDirectory}</p> : null}
              {validTarget === "missing" ? <p>{localeMessages.setup.newDirectoryWillBeCreated}<span className="creator-setup-target-path">{targetPath}</span></p> : null}
              {validTarget === "empty" ? <p>{localeMessages.setup.existingEmptyDirectoryWillBeUsed}<span className="creator-setup-target-path">{targetPath}</span></p> : null}
              {validation.status === "invalid" ? (
                <ul>{validation.result.issues.length === 0 ? <li>{localeMessages.setup.theCurrentDirectoryCannotBeInitializedRefreshProject}</li> : null}
                  {validation.result.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{setupIssueMessage(issue, localeMessages)}{debug ? <code> {issue.code}</code> : null}</li>
                ))}</ul>
              ) : null}
            </div>
            {validation.status === "valid" && validation.result.compatibilityPlan ? <details>
              <summary>{localeMessages.setup.vueDependencyPlan}</summary>
              <p>{validation.result.compatibilityPlan.manager} · {validation.result.compatibilityPlan.producerRoot}</p>
              <ul>{Object.entries({ ...validation.result.compatibilityPlan.dependencies, ...validation.result.compatibilityPlan.devDependencies }).map(([name, version]) => <li key={name}><code>{name} {version}</code></li>)}</ul>
            </details> : null}
            {draft.error === null ? null : (
              <div className="creator-project-setup-error" role="alert">
                <strong>{draft.error.code === "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET"
                  ? localeMessages.setup.missingOrIncompatibleAgentUIDependencies : getIssueMessages(localeMessages)[draft.error.code ?? ""] ?? localizeCreatorPresentation(draft.error.message, localeMessages)}</strong>
                {draft.error.details === undefined ? null : (
                  <ul>{draft.error.details.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>{setupIssueMessage(issue, localeMessages)}{debug ? <code> {issue.code}</code> : null}</li>
                  ))}</ul>
                )}
                {debug && draft.error.code !== undefined ? <code>{draft.error.code}</code> : null}
              </div>
            )}
            {draft.initializing ? <p role="status">{localeMessages.setup.creatingAgentUISourceAndValidatingTheProject}</p> : null}
          </>
        )}
      </div>
      {infoState.status === "ready" && infoState.info !== undefined ? (
        <div className="creator-project-setup-actions">
          <Button size="sm" type="button" disabled={!canInitialize} onClick={onInitialize}>
            {draft.initializing ? localeMessages.setup.initializing : compatibility ? localeMessages.setup.vueInitialize : localeMessages.setup.initializeAgentUI}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
