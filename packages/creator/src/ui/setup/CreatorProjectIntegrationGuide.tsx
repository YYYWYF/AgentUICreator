import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "../i18n/locale.js";
import { useState } from "react";
import { Check, ChevronDown, Code2, Copy } from "lucide-react";
import { Button } from "../components/button.js";

import type { CreatorProjectMode } from "../../workspace/types.js";

function getPlacementByMode(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<CreatorProjectMode, string> { return {
  assistant: localeMessages.integration.placeItInTheRootLayoutOrWherever,
  embedded: localeMessages.integration.placeItOnAPageOrRegionThat,
  platform: localeMessages.integration.placeItOnTheMainPageOrWorkbench,
}; }

/** Import path from a Host-owned component placed directly under src/. */
export function agentImportPathFromSrc(sourceRoot: string): string {
  if (sourceRoot === "src") return ".";
  if (sourceRoot.startsWith("src/")) return `./${sourceRoot.slice(4)}`;
  return `../${sourceRoot}`;
}

export function agentIntegrationSnippet(sourceRoot: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  const messages = localeMessages.integration;
  return [
    `import { Agent } from "${agentImportPathFromSrc(sourceRoot)}";`,
    "",
    "export default function SelfPage() {",
    "  return (",
    "    <div>",
    `      {/* ${messages.exampleBusinessComment} */}`,
    `      {/* ${messages.exampleAgentComment} */}`,
    "      <Agent />",
    "    </div>",
    "  );",
    "}",
  ].join("\n");
}

export function agentProviderIntegrationSnippet(sourceRoot: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  const messages = localeMessages.integration;
  return [
    `import { Agent, AgentUIProvider } from "${agentImportPathFromSrc(sourceRoot)}";`,
    "",
    `// ${messages.providerStructureHint}`,
    "<AgentUIProvider>",
    `  {/* ${messages.providerBusinessComment} */}`,
    "  <YourBusinessComponents />",
    `  {/* ${messages.providerAgentComment} */}`,
    "  <Agent />",
    "</AgentUIProvider>",
  ].join("\n");
}

export function CreatorProjectIntegrationGuide({ sourceRoot, mode, hostFramework, onBuild, buildDisabled = false }: {
  sourceRoot: string;
  mode: CreatorProjectMode;
  hostFramework?: "vue" | undefined;
  onBuild?: (() => Promise<unknown>) | undefined;
  buildDisabled?: boolean;
}) {
  const localeMessages = useAgentUILocale();
  const [framework, setFramework] = useState<"react" | "bridge">(hostFramework === "vue" ? "bridge" : "react");
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [bridgeCopyState, setBridgeCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [providerCopyState, setProviderCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [buildState, setBuildState] = useState<"idle" | "building" | "passed" | "failed">("idle");
  const snippet = agentIntegrationSnippet(sourceRoot, localeMessages);
  const providerSnippet = agentProviderIntegrationSnippet(sourceRoot, localeMessages);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const copyProviderSnippet = async () => {
    try { await navigator.clipboard.writeText(providerSnippet); setProviderCopyState("copied"); }
    catch { setProviderCopyState("failed"); }
  };

  const copyBridgePrompt = async () => {
    try { await navigator.clipboard.writeText(localeMessages.integration.bridgePrompt); setBridgeCopyState("copied"); }
    catch { setBridgeCopyState("failed"); }
  };

  return (
    <section className="creator-project-integration-guide creator-ui-scope" aria-label={localeMessages.integration.integrateAgentUI}>
      <header>
        <div className="creator-integration-icon"><Code2 aria-hidden="true" /></div>
        <div>
          <strong>{localeMessages.integration.agentUICreated}</strong>
          <span>{localeMessages.integration.addItToYourApplicationNext}</span>
        </div>
        <Button size="xs" variant="ghost" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? localeMessages.integration.collapse : localeMessages.integration.viewIntegrationInstructions}
          <ChevronDown aria-hidden="true" className={expanded ? "cui:rotate-180" : undefined} />
        </Button>
      </header>
      {expanded ? (
        <div className="creator-project-integration-guide-body">
          <div className="creator-integration-frameworks" role="group" aria-label={localeMessages.integration.frameworkChoice}>
            <Button size="sm" variant={framework === "react" ? "default" : "outline"} type="button" aria-pressed={framework === "react"} onClick={() => setFramework("react")}>
              {localeMessages.integration.reactIntegration}
            </Button>
            <Button size="sm" variant={framework === "bridge" ? "default" : "outline"} type="button" aria-pressed={framework === "bridge"} onClick={() => setFramework("bridge")}>
              {localeMessages.integration.bridgeIntegration}
            </Button>
          </div>
          {framework === "react" ? <>
          <section className="creator-integration-step">
          <h3>{localeMessages.integration.reactDisplayStep}</h3>
          <p>{localeMessages.integration.importFromThePublicEntryPoint} <code>{sourceRoot}/index.ts</code>  {localeMessages.integration.theExampleBelowUsesAComponentInYour}</p>
          <div className="creator-project-integration-code-header">
            <span>{localeMessages.integration.useInExistingComponent}</span>
            <Button size="xs" variant="ghost" type="button" className="creator-project-integration-copy" onClick={() => void copySnippet()}>
              {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.copyCode}
            </Button>
          </div>
          <pre><code>{snippet}</code></pre>
          {copyState === "failed" ? <span role="alert">{localeMessages.integration.copyFailedSelectTheCodeAndCopyManually}</span> : null}
          <p>{getPlacementByMode(localeMessages)[mode]} {localeMessages.integration.exampleImportPathRelativeToSrc}</p>
          </section>
          <section className="creator-integration-step">
          <h3>{localeMessages.integration.reactConnectStep}</h3>
          <p>{localeMessages.integration.providerDescription}</p>
          <details>
          <summary>{localeMessages.integration.providerStructureDetails}</summary>
          <p>{localeMessages.integration.providerConfiguration}</p>
          <div className="creator-project-integration-code-header">
            <span>{localeMessages.integration.providerHeading}</span>
            <Button size="xs" variant="ghost" type="button" className="creator-project-integration-copy" onClick={() => void copyProviderSnippet()}>
              {providerCopyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {providerCopyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.copyCode}
            </Button>
          </div>
          <pre><code>{providerSnippet}</code></pre>
          {providerCopyState === "failed" ? <span role="alert">{localeMessages.integration.copyFailedSelectTheCodeAndCopyManually}</span> : null}
          </details>
          </section>
          </> : <>
            {onBuild ? <div>
              <p>{localeMessages.integration.boundProducerDescription}</p>
              <Button size="sm" type="button" disabled={buildDisabled || buildState === "building"} onClick={async () => {
                setBuildState("building");
                try { await onBuild(); setBuildState("passed"); } catch { setBuildState("failed"); }
              }}>{buildState === "building" ? localeMessages.integration.buildingProducer : localeMessages.integration.buildProducer}</Button>
              {buildState === "passed" ? <p role="status">{localeMessages.integration.producerPublished}</p> : null}
              {buildState === "failed" ? <p role="alert">{localeMessages.integration.producerBuildFailed}</p> : null}
            </div> : null}
            <p>{localeMessages.integration.bridgeCopyInstruction}</p>
            <div className="creator-project-integration-code-header">
              <span>{localeMessages.integration.bridgeCopyPrompt}</span>
              <Button size="xs" variant="ghost" type="button" className="creator-project-integration-copy" onClick={() => void copyBridgePrompt()}>
                {bridgeCopyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {bridgeCopyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.bridgeCopyButton}
              </Button>
            </div>
            <pre className="creator-integration-prompt"><code>{localeMessages.integration.bridgePrompt}</code></pre>
            {bridgeCopyState === "failed" ? <span role="alert">{localeMessages.integration.copyFailedSelectTheCodeAndCopyManually}</span> : null}
            <details>
              <summary>{localeMessages.integration.bridgeManualHeading}</summary>
              <p>{localeMessages.integration.bridgeManualDescription}</p>
              <pre className="creator-integration-prompt"><code>{localeMessages.integration.bridgeManualPrompt}</code></pre>
            </details>
            <p><strong>{localeMessages.integration.bridgeLimitationsHeading}</strong></p>
            <p>{localeMessages.integration.bridgeLimitations}</p>
          </>}
        </div>
      ) : null}
    </section>
  );
}
