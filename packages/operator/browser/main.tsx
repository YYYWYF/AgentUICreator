import { installCreatorDock } from "../src/dock/creatorDock.js";
import { creatorDockMessages } from "../src/dock/messages.js";
import "./shell.css";

const root = document.getElementById("root");
const messages = creatorDockMessages(document.documentElement.lang);
if (root) {
  const heading = document.createElement("h1");
  const hint = document.createElement("p");
  heading.textContent = messages.started;
  hint.textContent = messages.hint;
  root.append(heading, hint);
}
installCreatorDock({ creatorUrl: location.origin, messages, initiallyOpen: true });
