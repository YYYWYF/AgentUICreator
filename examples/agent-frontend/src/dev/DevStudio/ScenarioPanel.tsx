import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  MockScenarioAudience,
  MockScenarioCapability,
  MockScenarioCategory,
  MockScenarioSummary,
} from "@agent-ui/mock-agent";

import { Badge, Button, Input } from "@agent-ui/react";
import {
  isMockAgentEndpoint,
  type MockScenarioSelection,
} from "../../agent-endpoint";
import styles from "../scenario-studio.module.css";

interface ScenarioCatalogResponse {
  defaultScenarioId: string;
  scenarios: MockScenarioSummary[];
}

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: ScenarioCatalogResponse };

const categoryOrder: MockScenarioCategory[] = [
  "basics",
  "tools",
  "human-in-loop",
  "state",
  "multi-agent",
  "presentation",
  "advanced",
];

const categoryLabels: Record<MockScenarioCategory, string> = {
  basics: "Basics",
  tools: "Tools",
  "human-in-loop": "Human in the Loop",
  state: "State",
  "multi-agent": "Multi-Agent",
  presentation: "Presentation Patterns",
  advanced: "Advanced",
};

const capabilityLabels: Record<MockScenarioCapability, string> = {
  reasoning: "Reasoning",
  tool: "Tool",
  "parallel-tool": "Parallel Tool",
  "run-error": "Run Error",
  approval: "Approval",
  plan: "Plan",
  "agent-status": "Status",
  subagent: "Subagent",
  sources: "Sources",
  "state-sync": "State Sync",
};

const speedOptions = [
  { value: 0, label: "Instant" },
  { value: 0.1, label: "Fast test" },
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Slow" },
];

const referenceLevelLabels = {
  recommended: "Recommended",
  advanced: "Advanced",
  edge: "Edge case",
  protocol: "Protocol",
} as const;

const scenarioAudienceLabels: Record<MockScenarioAudience, string> = {
  backend: "Backend Reference",
  frontend: "Frontend Presentation",
  internal: "Internal Regression",
};

function scenarioAudience(
  scenario: MockScenarioSummary,
): string | undefined {
  const audience = scenario.reference?.audience;
  return audience === undefined ? undefined : scenarioAudienceLabels[audience];
}

function scenarioMarker(scenario: MockScenarioSummary): string | undefined {
  const level = scenario.reference?.level;
  return level === undefined ? undefined : referenceLevelLabels[level];
}

function readScenarioCatalog(value: unknown): ScenarioCatalogResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("Mock Agent returned an invalid scenario catalog.");
  }

  const response = value as Partial<ScenarioCatalogResponse>;
  if (
    typeof response.defaultScenarioId !== "string" ||
    !Array.isArray(response.scenarios)
  ) {
    throw new Error("Mock Agent returned an invalid scenario catalog.");
  }

  return {
    defaultScenarioId: response.defaultScenarioId,
    scenarios: response.scenarios,
  };
}

export interface ScenarioPanelProps {
  currentSelection?: MockScenarioSelection | undefined;
  endpoint: string;
  onRun?: ((selection: MockScenarioSelection) => void) | undefined;
}

export function scenarioCatalogEndpoint(endpoint: string): string {
  const url = new URL(endpoint, window.location.origin);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/scenarios`;
  url.search = "";
  url.hash = "";
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}`
    : url.toString();
}

export function ScenarioPanel({
  currentSelection,
  endpoint,
  onRun,
}: ScenarioPanelProps) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [catalogRequestKey, setCatalogRequestKey] = useState(0);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | undefined>(
    () => currentSelection?.scenarioId,
  );
  const [selectedSpeed, setSelectedSpeed] = useState(() => currentSelection?.speed ?? 1);

  const loadCatalog = useCallback(() => {
    setCatalogRequestKey((current) => current + 1);
  }, []);
  const catalogEndpoint = scenarioCatalogEndpoint(endpoint);

  useEffect(() => {
    const controller = new AbortController();
    setCatalog({ status: "loading" });

    void fetch(catalogEndpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Scenario catalog request failed (${response.status}).`);
        }
        return readScenarioCatalog(await response.json());
      })
      .then((value) => setCatalog({ status: "ready", value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalog({
          status: "error",
          message: error instanceof Error
            ? error.message
            : "Unable to load the Mock Agent scenario catalog.",
        });
      });

    return () => controller.abort();
  }, [catalogEndpoint, catalogRequestKey]);

  const scenarios = catalog.status === "ready"
    ? catalog.value.scenarios.filter(
      (scenario) => scenario.reference?.audience !== "internal",
    )
    : [];
  const defaultScenarioId = catalog.status === "ready"
    ? catalog.value.defaultScenarioId
    : undefined;
  const currentScenarioId = selectedScenarioId ?? defaultScenarioId;
  const currentScenario = scenarios.find(({ id }) => id === currentScenarioId);
  const selectionChanged = currentSelection === undefined ||
    currentSelection.scenarioId !== currentScenarioId ||
    currentSelection.speed !== selectedSpeed;

  const filteredScenarios = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery === "") return scenarios;
    return scenarios.filter((scenario) =>
      [
        scenario.id,
        scenario.title,
        scenario.description,
        scenario.category,
        ...(scenario.capabilities ?? []),
        scenario.reference?.audience,
        scenario.reference?.protocol,
        scenario.reference?.pattern,
        scenario.reference?.presentation,
        ...(scenario.reference?.eventFlow ?? []),
        ...(scenario.reference?.notes ?? []),
      ]
        .filter((value): value is string => value !== undefined)
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [query, scenarios]);

  const groupedScenarios = useMemo(() => {
    const knownCategories = new Set(categoryOrder);
    const categories = [
      ...categoryOrder,
      ...Array.from(
        new Set(
          filteredScenarios
            .map(({ category }) => category)
            .filter(
              (category): category is MockScenarioCategory =>
                category !== undefined && !knownCategories.has(category),
            ),
        ),
      ),
      ...(filteredScenarios.some(({ category }) => category === undefined)
        ? [undefined]
        : []),
    ];

    return categories
      .map((category) => ({
        category,
        scenarios: filteredScenarios.filter((scenario) =>
          category === undefined
            ? scenario.category === undefined
            : scenario.category === category,
        ),
      }))
      .filter(({ scenarios: group }) => group.length > 0);
  }, [filteredScenarios]);

  const applySelection = () => {
    if (currentScenarioId === undefined || !isMockAgentEndpoint(endpoint)) return;
    onRun?.({ scenarioId: currentScenarioId, speed: selectedSpeed });
  };

  return (
    <>
      <div className={styles.content}>
        <Input
          aria-label="Search scenarios"
          className={styles.search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search scenarios..."
          type="search"
          value={query}
        />

        <section className={styles.profileNote} aria-label="Backend Reference Profile">
          <div className={styles.profileNoteHeader}>
            <strong>Backend Reference Profile</strong>
            <Badge variant="outline">AG-UI 0.0.59</Badge>
          </div>
          <p>Transport: HTTP SSE · Consumer: @assistant-ui/react-ag-ui</p>
          <p>
            Backend Reference scenarios are intended as backend implementation
            references. Application-defined presentation scenarios are marked
            separately.
          </p>
          <ul>
            <li>TOOL_CALL_ARGS.delta is streamed text containing JSON arguments.</li>
            <li>TOOL_CALL_END ends argument streaming; it does not end execution.</li>
            <li>TOOL_CALL_RESULT.content is a string in this 0.0.59 profile.</li>
            <li>subagentRunId attributes events; it does not isolate shared state.</li>
          </ul>
        </section>

        {catalog.status === "loading" ? (
          <p className={styles.status}>Loading scenarios…</p>
        ) : catalog.status === "error" ? (
          <div className={styles.errorState}>
            <p>{catalog.message}</p>
            <Button onClick={loadCatalog} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        ) : groupedScenarios.length === 0 ? (
          <p className={styles.status}>No scenarios match “{query}”.</p>
        ) : (
          <div className={styles.groups}>
            {groupedScenarios.map(({ category, scenarios: group }) => (
              <section className={styles.group} key={category ?? "uncategorized"}>
                <h3>{category === undefined ? "Other" : categoryLabels[category]}</h3>
                <div className={styles.scenarioList}>
                  {group.map((scenario) => {
                    const selected = scenario.id === currentScenarioId;
                    const marker = scenarioMarker(scenario);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`${styles.scenarioCard}${selected ? ` ${styles.scenarioCardSelected}` : ""}`}
                        key={scenario.id}
                        onClick={() => setSelectedScenarioId(scenario.id)}
                        type="button"
                      >
                        <span className={styles.scenarioCardHeader}>
                          <strong>{scenario.title}</strong>
                          <span className={styles.scenarioMarkers}>
                            {scenarioAudience(scenario) ? (
                              <Badge variant="outline">
                                {scenarioAudience(scenario)}
                              </Badge>
                            ) : null}
                            {marker ? <Badge variant="outline">{marker}</Badge> : null}
                          </span>
                        </span>
                        <span className={styles.scenarioDescription}>
                          {scenario.description ?? "No description provided."}
                        </span>
                        <span className={styles.scenarioId}>{scenario.id}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {currentScenario ? (
          <section className={styles.detail} aria-live="polite">
            <p className={styles.eyebrow}>Selected scenario</p>
            <div className={styles.detailHeader}>
              <h3>{currentScenario.title}</h3>
              <span className={styles.currentState}>
                {selectionChanged ? "Pending" : "Current"}
              </span>
            </div>
            <p className={styles.detailDescription}>
              {currentScenario.description ?? "No description provided."}
            </p>
            <div className={styles.detailGrid}>
              <div>
                <span className={styles.detailLabel}>Capabilities</span>
                <div className={styles.capabilities}>
                  {(currentScenario.capabilities ?? []).length > 0
                    ? currentScenario.capabilities?.map((capability) => (
                      <Badge key={capability} variant="secondary">
                        {capabilityLabels[capability] ?? capability}
                      </Badge>
                    ))
                    : <span className={styles.muted}>None declared</span>}
                </div>
              </div>
              <div>
                <span className={styles.detailLabel}>Scenario ID</span>
                <code>{currentScenario.id}</code>
              </div>
              {currentScenario.reference?.audience ? (
                <div>
                  <span className={styles.detailLabel}>Audience</span>
                  <span>{scenarioAudience(currentScenario)}</span>
                </div>
              ) : null}
            </div>
            {currentScenario.reference ? (
              <div className={styles.reference}>
                <span className={styles.detailLabel}>Reference</span>
                <div className={styles.referenceGrid}>
                  {currentScenario.reference.protocol ? (
                    <div>
                      <span className={styles.detailLabel}>Protocol</span>
                      <span className={styles.referenceValue}>
                        {currentScenario.reference.protocol}
                      </span>
                    </div>
                  ) : null}
                  {currentScenario.reference.pattern ? (
                    <div>
                      <span className={styles.detailLabel}>Pattern</span>
                      <span className={styles.referenceValue}>
                        {currentScenario.reference.pattern}
                      </span>
                    </div>
                  ) : null}
                  {currentScenario.reference.presentation ? (
                    <div>
                      <span className={styles.detailLabel}>Presentation</span>
                      <span className={styles.referenceValue}>
                        {currentScenario.reference.presentation}
                      </span>
                    </div>
                  ) : null}
                </div>
                {currentScenario.reference.eventFlow?.length ? (
                  <div className={styles.referenceSection}>
                    <span className={styles.detailLabel}>Protocol Flow</span>
                    <div className={styles.protocolFlow}>
                      {currentScenario.reference.eventFlow.map((step, index) => (
                        <span className={styles.protocolFlowItem} key={`${step}-${index}`}>
                          {index > 0 ? (
                            <span className={styles.protocolArrow} aria-hidden="true">
                              →
                            </span>
                          ) : null}
                          <code className={styles.protocolStep}>{step}</code>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {currentScenario.reference.notes?.length ? (
                  <div className={styles.referenceSection}>
                    <span className={styles.detailLabel}>Notes</span>
                    <ul className={styles.referenceNotes}>
                      {currentScenario.reference.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <label className={styles.speedField}>
          <span>Speed</span>
          <select
            aria-label="Mock scenario speed"
            onChange={(event) => {
              if (event.target.value !== "custom") {
                setSelectedSpeed(Number(event.target.value));
              }
            }}
            value={speedOptions.some(({ value }) => value === selectedSpeed) ? selectedSpeed : "custom"}
          >
            {speedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}× · {option.label}
              </option>
            ))}
            {!speedOptions.some(({ value }) => value === selectedSpeed) ? (
              <option disabled value="custom">{selectedSpeed}× · Custom</option>
            ) : null}
          </select>
        </label>
        <Button
          className={styles.runButton}
          disabled={currentScenarioId === undefined}
          onClick={applySelection}
        >
          {selectionChanged ? "Run Scenario" : "Restart Scenario"}
        </Button>
      </footer>
    </>
  );
}
