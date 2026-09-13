import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  MockScenarioCapability,
  MockScenarioCategory,
  MockScenarioSummary,
} from "@agent-ui/mock-agent";

import { Badge } from "../../agent-ui/primitives/badge";
import { Button } from "../../agent-ui/primitives/button";
import { Input } from "../../agent-ui/primitives/input";
import {
  isMockAgentEndpoint,
  MOCK_SCENARIO_AUTORUN_STORAGE_KEY,
  MOCK_SCENARIO_AUTORUN_TRIGGER,
  resolveMockScenarioSearchParams,
} from "../agent-endpoint";
import { useAgentRuntimeActions } from "../../runtime/context";
import styles from "./scenario-studio.module.css";

interface ScenarioCatalogResponse {
  defaultScenarioId: string;
  scenarios: MockScenarioSummary[];
}

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: ScenarioCatalogResponse };

const categoryOrder: MockScenarioCategory[] = [
  "agent",
  "tool",
  "approval",
  "reasoning",
  "conversation",
];

const categoryLabels: Record<MockScenarioCategory, string> = {
  agent: "Agent",
  tool: "Tools",
  approval: "Approval",
  reasoning: "Reasoning",
  conversation: "Conversation",
};

const capabilityLabels: Record<MockScenarioCapability, string> = {
  reasoning: "Reasoning",
  tool: "Tool",
  "parallel-tool": "Parallel Tool",
  "tool-error": "Tool Error",
  approval: "Approval",
  plan: "Plan",
  "agent-status": "Status",
  subagent: "Subagent",
  sources: "Sources",
};

const speedOptions = [
  { value: 0, label: "Instant" },
  { value: 0.1, label: "Fast test" },
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Slow" },
];

function clampSpeed(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(0, parsed));
}

function formatSpeed(value: number): string {
  return value === 0 ? "Instant" : `${value}×`;
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

export function buildScenarioSelectionUrl(
  scenarioId: string,
  speed: number,
): string {
  const params = new URLSearchParams(window.location.search);
  params.set("mockScenario", scenarioId);
  params.set("mockSpeed", String(speed));
  const queryString = params.toString();
  return `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
}

export function writeMockScenarioAutorunMarker(
  storage: Pick<Storage, "setItem"> = window.sessionStorage,
): void {
  storage.setItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY, "1");
}

export function consumeMockScenarioAutorunMarker(
  storage: Pick<Storage, "getItem" | "removeItem"> = window.sessionStorage,
): boolean {
  if (storage.getItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY) === null) {
    return false;
  }
  storage.removeItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY);
  return true;
}

function scenarioMarker(scenario: MockScenarioSummary): string | undefined {
  if (scenario.id === "subagents") return "Recommended";
  if (scenario.id === "subagents-out-of-order") return "Edge case";
  if (scenario.id === "subagent-lifecycle") return "Protocol validation";
  return undefined;
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

export interface ScenarioStudioProps {
  endpoint: string;
  navigate?: ((url: string) => void) | undefined;
}

export function ScenarioStudio({ endpoint, navigate }: ScenarioStudioProps) {
  const { sendMessage } = useAgentRuntimeActions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [catalogRequestKey, setCatalogRequestKey] = useState(0);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | undefined>(
    () => resolveMockScenarioSearchParams(window.location.search).scenario,
  );
  const [selectedSpeed, setSelectedSpeed] = useState(() =>
    clampSpeed(resolveMockScenarioSearchParams(window.location.search).speed),
  );

  const loadCatalog = useCallback(() => {
    setCatalogRequestKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalog({ status: "loading" });

    void fetch(scenarioCatalogEndpoint(endpoint), {
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
  }, [catalogRequestKey, endpoint]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!isMockAgentEndpoint(endpoint)) return;
    if (!consumeMockScenarioAutorunMarker()) return;

    const timeout = window.setTimeout(() => {
      void sendMessage(MOCK_SCENARIO_AUTORUN_TRIGGER);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [endpoint, sendMessage]);

  const scenarios = catalog.status === "ready" ? catalog.value.scenarios : [];
  const defaultScenarioId = catalog.status === "ready"
    ? catalog.value.defaultScenarioId
    : undefined;
  const currentScenarioId = selectedScenarioId ?? defaultScenarioId;
  const currentScenario = scenarios.find(({ id }) => id === currentScenarioId);
  const currentUrlParams = resolveMockScenarioSearchParams(window.location.search);
  const currentUrlSpeed = clampSpeed(currentUrlParams.speed);
  const selectionChanged =
    currentScenarioId !== currentUrlParams.scenario &&
    !(currentScenarioId === defaultScenarioId && currentUrlParams.scenario === undefined)
      || selectedSpeed !== currentUrlSpeed;

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
    writeMockScenarioAutorunMarker();
    (navigate ?? ((url: string) => window.location.assign(url)))
      (buildScenarioSelectionUrl(currentScenarioId, selectedSpeed));
  };

  const triggerLabel = currentScenario === undefined
    ? `Mock · ${currentScenarioId ?? "loading"} · ${formatSpeed(currentUrlSpeed)}`
    : `Mock · ${currentScenario.title} · ${formatSpeed(currentUrlSpeed)}`;

  return (
    <>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open Mock Scenario Studio"
        className={styles.entry}
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <span className={styles.entryDot} aria-hidden="true" />
        {triggerLabel}
        <span aria-hidden="true">⌄</span>
      </Button>

      {open ? (
        <>
          <div
            aria-hidden="true"
            className={styles.scrim}
            onMouseDown={() => setOpen(false)}
          />
          <aside
            aria-label="Mock Scenario Studio"
            aria-modal="true"
            className={styles.drawer}
            role="dialog"
          >
            <header className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Development tools</p>
                <h2>Mock Scenario Studio</h2>
              </div>
              <Button
                aria-label="Close Mock Scenario Studio"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
                size="icon"
                variant="ghost"
              >
                ×
              </Button>
            </header>

            <div className={styles.content}>
              <Input
                aria-label="Search scenarios"
                className={styles.search}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search scenarios..."
                type="search"
                value={query}
              />

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
                                {marker ? <Badge variant="outline">{marker}</Badge> : null}
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
                  </div>
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
          </aside>
        </>
      ) : null}
    </>
  );
}
