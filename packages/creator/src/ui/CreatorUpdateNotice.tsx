import type { PackageUpdateOverview } from "@za38.03/agent-ui-creator/project/updates";
import { useId, useState } from "react";
import { formatLocaleMessage, useCreatorLocale } from "./i18n/locale.js";
import { Button } from "./components/button.js";

/** Information only: never installs tools or changes Creator request admission. */
export function CreatorUpdateNotice({ overview }: { overview: PackageUpdateOverview }) {
  const messages = useCreatorLocale().pluginUpdates;
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const creator = overview.packages.find(pkg => pkg.scope === "tools" && pkg.name === "@za38.03/agent-ui-creator");
  if (!creator?.updateAvailable || !creator.targetVersion) return null;
  return <div className="creator-tool-update-notice" role="status" aria-live="polite"
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
    onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <Button className="creator-tool-update-trigger" variant="ghost" size="xs" type="button"
      aria-label={formatLocaleMessage(messages.creatorUpdateAvailable, creator.targetVersion)}
      aria-describedby={open ? tooltipId : undefined} onClick={() => setOpen(true)}>
      <span className="creator-tool-update-label">{messages.creatorNewVersion}</span>
    </Button>
    {open ? <div className="creator-tool-update-tooltip" id={tooltipId} role="tooltip">
      <strong>{formatLocaleMessage(messages.creatorUpdateAvailable, creator.targetVersion)}</strong>
      <p>{formatLocaleMessage(messages.creatorManualUpdateNotice, creator.currentVersion ?? messages.versionUntracked)}</p>
    </div> : null}
  </div>;
}
