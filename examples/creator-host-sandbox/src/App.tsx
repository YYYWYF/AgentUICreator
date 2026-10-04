import { lazy, Suspense } from "react";
import { AgentMount } from "./AgentMount";
import { RunResumeDemo } from "./RunResumeDemo";

const RunResumeProductionDemo = lazy(() => import("./RunResumeProductionDemo")
  .then(module => ({ default: module.RunResumeProductionDemo })));

export function App() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("run-resume-production")) {
    return <Suspense fallback={null}><RunResumeProductionDemo /></Suspense>;
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("run-resume-demo")) {
    return <RunResumeDemo />;
  }
  return <AgentMount />;
}
