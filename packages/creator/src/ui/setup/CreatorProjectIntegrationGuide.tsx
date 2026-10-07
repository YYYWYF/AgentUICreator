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

export function agentIntegrationSnippet(sourceRoot: string): string {
  return [
    `import { Agent } from "${agentImportPathFromSrc(sourceRoot)}";`,
    "",
    "export function AgentMount() {",
    "  return <Agent />;",
    "}",
  ].join("\n");
}

export function CreatorProjectIntegrationGuide({ sourceRoot, mode }: {
  sourceRoot: string;
  mode: CreatorProjectMode;
}) {
  const localeMessages = useAgentUILocale();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const snippet = agentIntegrationSnippet(sourceRoot);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
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
          <p>{localeMessages.integration.importFromThePublicEntryPoint} <code>{sourceRoot}/index.ts</code>  {localeMessages.integration.theExampleBelowUsesAComponentInYour}</p>
          <div className="creator-project-integration-code-header">
            <code>src/AgentMount.tsx</code>
            <Button size="xs" variant="ghost" type="button" className="creator-project-integration-copy" onClick={() => void copySnippet()}>
              {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.copyCode}
            </Button>
          </div>
          <pre><code>{snippet}</code></pre>
          {copyState === "failed" ? <span role="alert">{localeMessages.integration.copyFailedSelectTheCodeAndCopyManually}</span> : null}
          <p>{localeMessages.integration.renderInAnExistingPageOrLayout} <code>{'<AgentMount />'}</code>{localeMessages.integration.sentenceSeparator}{getPlacementByMode(localeMessages)[mode]}</p>
          <details>
            <summary>{localeMessages.integration.importPathsAndAPIAddress}</summary>
            <p>{localeMessages.integration.ifTheComponentIsOutside} <code>src/</code>  {localeMessages.integration.adjustTheRelativeImportPathToMatchIts}</p>
            <p>{localeMessages.integration.theAGUIEndpointReads} <code>VITE_AGENT_ENDPOINT</code>{localeMessages.integration.byDefaultOtherwiseItUses} <code>/agent</code>{localeMessages.integration.forAnotherAddressPass} <code>endpoint</code>{localeMessages.integration.forExample} <code>{'<Agent endpoint="/api/agent" />'}</code>{localeMessages.integration.saveTheComponentAndYourDevelopmentServerWill}</p>
            <p>{localeMessages.integration.whenUsingEnvironmentVariablesCreateOrEditThis} <code>package.json</code>  {localeMessages.integration.message} <code>.env.local</code>{localeMessages.integration.enterTheLineBelowAndReplaceTheAddress}</p>
            <pre><code>{localeMessages.integration.vITEAGENTENDPOINTYourCompleteAGUIURL}</code></pre>
            <p>{localeMessages.integration.saveAndRestartYourFrontendDevelopmentServerIf} <code>endpoint</code>{localeMessages.integration.toTheComponentThatAddressTakesPriority}</p>
          </details>
        </div>
      ) : null}
    </section>
  );
}
