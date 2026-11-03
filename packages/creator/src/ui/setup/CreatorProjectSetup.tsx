import { formatLocaleMessage, localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "../i18n/locale.js";
import { useEffect, useRef } from "react";
import type {
  CreatorProjectIssue,
  CreatorProjectMode,
  CreatorProjectSetupValidation,
  CreatorWorkspaceSetupInfo,
} from "../../workspace/types.js";
import { CreatorModeCard } from "./CreatorModeCard.js";
import { Button } from "../components/button.js";
import { Input } from "../components/input.js";
import { CheckCircle2, FileJson, Folder, Layers, Terminal } from "lucide-react";
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
  AGENT_UI_SETUP_PLAN_STALE: localeMessages.setup.dependencyPlanStale,
  AGENT_UI_SETUP_DEPENDENCY_PREPARATION_FAILED: localeMessages.setup.dependencyPreparationFailed,
  AGENT_UI_SETUP_INSTALL_REQUIRED: localeMessages.setup.manualInstallInstructions,
  AGENT_UI_SETUP_INSTALL_REVIEW_REQUIRED: localeMessages.setup.dependencyInstallReviewRequired,
  AGENT_UI_SETUP_DEPENDENCY_CONFLICT: localeMessages.setup.dependencyConflict,
  AGENT_UI_SETUP_WORKSPACE_UNSUPPORTED: localeMessages.setup.dependencyWorkspaceUnsupported,
  AGENT_UI_SETUP_MANAGER_UNSUPPORTED: localeMessages.setup.compatibilityManagerUnsupported,
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
  const dependencyPlan = validation.status === "valid" ? validation.result.dependencyPlan : undefined;
  const preparingDependencies = dependencyPlan !== undefined &&
    (Object.keys(dependencyPlan.dependencies).length > 0 || Object.keys(dependencyPlan.devDependencies).length > 0);
  const waitingForInstallation = dependencyPlan !== undefined && dependencyPlan.installRequired && !preparingDependencies;
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (waitingForInstallation && contentRef.current) contentRef.current.scrollTop = 0;
  }, [waitingForInstallation]);
  const packageGroups = dependencyPlan ? (preparingDependencies ? [
    { label: localeMessages.setup.runtimeDependencies, entries: Object.entries(dependencyPlan.dependencies) },
    { label: localeMessages.setup.buildDependencies, entries: Object.entries(dependencyPlan.devDependencies) },
  ] : [{ label: localeMessages.setup.pendingDependencies, entries: dependencyPlan.packages
    .filter(item => item.action === "install").map(item => [item.name, item.version] as [string, string]) }])
    .filter(group => group.entries.length > 0) : [];
  const packageCount = packageGroups.reduce((count, group) => count + group.entries.length, 0);
  const fileNameOffset = dependencyPlan ? Math.max(dependencyPlan.packageJsonPath.lastIndexOf("/"), dependencyPlan.packageJsonPath.lastIndexOf("\\")) + 1 : 0;
  const compatibility = infoState.info?.hostFramework === "vue";
  const validTarget = validation.status === "valid" ? validation.result.sourceRoot.targetState : null;
  const targetPath = validation.status === "valid"
    ? validation.result.sourceRoot.absolutePath ?? validation.result.sourceRoot.normalized
    : null;
  return (
    <section className="creator-project-setup creator-ui-scope" aria-label={localeMessages.setup.createAgentUI}>
      <div className="creator-project-setup-content" ref={contentRef}>
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
            {waitingForInstallation && dependencyPlan ? <section className="creator-install-step" role="status" aria-label={localeMessages.setup.installManually}>
              <div className="creator-install-step-heading"><CheckCircle2 aria-hidden="true" /><h3>{localeMessages.setup.dependencyDeclarationsReady}</h3></div>
              <p className="creator-install-step-next">{localeMessages.setup.manualInstallNextStep}</p>
              <div className="creator-dependency-file">
                <div className="creator-dependency-file-label"><Folder aria-hidden="true" /><span>{localeMessages.setup.dependencyInstallDirectory}</span></div>
                <code className="creator-dependency-file-path">{dependencyPlan.projectRoot}</code>
              </div>
              <div className="creator-install-step-command"><Terminal aria-hidden="true" /><code>{dependencyPlan.installCommand}</code></div>
              <p className="creator-install-step-hint">{localeMessages.setup.recheckAfterManualInstall}</p>
            </section> : null}
            <div className="creator-project-setup-fields" hidden={waitingForInstallation}>
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
            {dependencyPlan && !waitingForInstallation ? <section className="creator-dependency-plan" aria-label={localeMessages.setup.dependencyPlanTitle}>
              <header className="creator-dependency-heading">
                <h3>{localeMessages.setup.dependencyPlanTitle}</h3>
                {packageCount > 0 ? <span className="creator-dependency-count">{formatLocaleMessage(
                  preparingDependencies ? localeMessages.setup.dependenciesToAdd : localeMessages.setup.dependenciesToInstall, packageCount,
                )}</span> : null}
              </header>
              <div className="creator-dependency-file">
                <div className="creator-dependency-file-label"><FileJson aria-hidden="true" /><span>{preparingDependencies ? localeMessages.setup.dependencyTargetFile : localeMessages.setup.dependencyFile}</span></div>
                <code className="creator-dependency-file-path">{dependencyPlan.packageJsonPath.slice(0, fileNameOffset)}<strong>{dependencyPlan.packageJsonPath.slice(fileNameOffset)}</strong></code>
              </div>
              <div className="creator-dependency-groups">
                {packageGroups.map(group => <div className="creator-dependency-group" key={group.label}>
                  <h4>{group.label}</h4>
                  <ul>{[...group.entries].sort(([left], [right]) => left.localeCompare(right)).map(([name, version]) => <li key={name}>
                    <code className="creator-dependency-name">{name}</code>
                    <code className="creator-dependency-version">{version}</code>
                  </li>)}</ul>
                </div>)}
              </div>
              {!preparingDependencies && <div className="creator-dependency-ready" role="status">
                <CheckCircle2 aria-hidden="true" /><span>{dependencyPlan.installRequired ? localeMessages.setup.dependencyDeclarationsReady : localeMessages.setup.dependenciesReady}</span>
              </div>}
              {preparingDependencies || dependencyPlan.installRequired ? <footer className="creator-dependency-manual">
                <div className="creator-dependency-manual-title"><Terminal aria-hidden="true" /><span>{preparingDependencies ? localeMessages.setup.installManuallyAfterAdding : localeMessages.setup.installManually}</span></div>
                <pre><code>{dependencyPlan.installCommand}</code></pre>
                <p>{localeMessages.setup.installFromManifestDirectory}</p>
              </footer> : null}
            </section> : null}
            </div>
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
            {draft.initializing ? <p role="status">{preparingDependencies ? localeMessages.setup.preparingDependencyDeclarations : localeMessages.setup.creatingAgentUISourceAndValidatingTheProject}</p> : null}
          </>
        )}
      </div>
      {infoState.status === "ready" && infoState.info !== undefined ? (
        <div className="creator-project-setup-actions">
          <Button size="sm" type="button" disabled={!canInitialize} onClick={onInitialize}>
            {draft.initializing ? localeMessages.setup.initializing : compatibility ? localeMessages.setup.vueInitialize : preparingDependencies ? localeMessages.setup.confirmDependencyDeclarations : dependencyPlan?.installRequired ? localeMessages.setup.recheckDependencies : localeMessages.setup.initializeAgentUI}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
