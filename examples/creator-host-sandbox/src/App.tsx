import { lazy, Suspense } from "react";
import { AgentMount } from "./AgentMount";
import { RunResumeDemo } from "./RunResumeDemo";

const RunResumeProductionDemo = lazy(() => import("./RunResumeProductionDemo")
  .then(module => ({ default: module.RunResumeProductionDemo })));

export function App() {
  const productionResumeScenario = new URLSearchParams(window.location.search).get("run-resume-production");
  if (import.meta.env.DEV && productionResumeScenario !== null) {
    return <Suspense fallback={null}><RunResumeProductionDemo
      scenarioId={productionResumeScenario === "agent-plan" ? "resumable-agent-plan" : "resumable-long-run"}
    /></Suspense>;
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("run-resume-demo")) {
    return <RunResumeDemo />;
  }
  return <AgentMount />;
}
