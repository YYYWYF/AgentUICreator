import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
import { AgentMount } from "./AgentMount";
import "./host.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");
createRoot(root).render(<StrictMode><AgentUILocaleProvider locale="zh-CN"><AgentMount /></AgentUILocaleProvider></StrictMode>);
