import { AgentMount } from "./AgentMount";
import { RunResumeDemo } from "./RunResumeDemo";
import { RunResumeProductionDemo } from "./RunResumeProductionDemo";

export function App() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("run-resume-production")) {
    return <RunResumeProductionDemo />;
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("run-resume-demo")) {
    return <RunResumeDemo />;
  }
  return <AgentMount />;
}
