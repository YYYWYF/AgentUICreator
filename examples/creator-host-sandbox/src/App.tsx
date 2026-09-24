import { AgentMount } from "./AgentMount";

export function App() {
  return (
    <>
      <main className="host-page">
        <h1>Host Application Sandbox</h1>
        <p>This page belongs to the host application.</p>
      </main>
      <AgentMount />
    </>
  );
}
