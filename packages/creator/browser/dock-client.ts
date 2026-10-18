import { installCreatorDock } from "../src/dock/creatorDock.js";
import { watchCreatorConnection } from "../src/dock/creatorConnection.js";
import { creatorDockMessages } from "../src/dock/messages.js";
import "../src/host-preview/hostPreviewClient.js";

// A classic script can load from the local Creator without granting cross-origin API access.
const script = document.currentScript as HTMLScriptElement | null;
if (script?.src) {
  const install = () => installCreatorDock({
    creatorUrl: script.dataset.creatorUrl ?? script.src,
    workspaceId: script.dataset.creatorWorkspace,
    messages: creatorDockMessages(script.dataset.creatorLocale ?? document.documentElement.lang),
  });
  const start = () => {
    if (script.dataset.creatorStatus) watchCreatorConnection(script.dataset.creatorStatus, install);
    else install();
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
