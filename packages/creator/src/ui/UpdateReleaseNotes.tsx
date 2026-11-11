import type { ReactNode } from "react";
import { useAgentUILocale, formatLocaleMessage } from "./i18n/locale.js";

export interface UpdateReleaseEntry { version: string; content: ReactNode; pluginId?: string; pluginName?: string }

/** Shared presentation for official packages and independently updated Plugins. */
export function UpdateReleaseNotes({ entries, targetVersion, versions = [], historyOnly = false, emptyMessage }: {
  entries: UpdateReleaseEntry[]; targetVersion: string; versions?: string[]; historyOnly?: boolean; emptyMessage?: string | undefined;
}) {
  const messages = useAgentUILocale().pluginUpdates;
  const ordered = [...new Set([targetVersion, ...versions, ...entries.map(entry => entry.version)])]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const release = (version: string, latest = false) => {
    const groups = new Map<string, UpdateReleaseEntry[]>();
    for (const entry of entries.filter(entry => entry.version === version)) {
      const key = entry.pluginId ?? "";
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return <section className="creator-release" key={version} aria-label={version}>
    <div className="creator-release-heading"><strong>{version}</strong>{latest ? <span className="creator-release-latest">{messages.latestVersion}</span> : null}</div>
    {groups.size ? [...groups].map(([id, changes]) => <div key={id} className="creator-release-plugin" data-plugin-id={id || undefined}>
      {id ? <h4>{changes[0]!.pluginName ?? id}</h4> : null}
      <ul className="creator-release-notes">{changes.map((entry, index) => <li key={index}>{entry.content}</li>)}</ul>
    </div>) : <p className="creator-update-muted">{emptyMessage ?? messages.noVersionNotes}</p>}
  </section>; };
  const older = ordered.filter(version => version !== targetVersion);
  if (historyOnly) return <details className="creator-update-details creator-release-history"><summary>{messages.viewVersionRecord}</summary>{ordered.map(version => release(version))}</details>;
  return <div className="creator-release-list">
    {release(targetVersion, true)}
    {older.length ? <details className="creator-update-details creator-release-history"><summary>{formatLocaleMessage(messages.previousVersions, older.length)}</summary>{older.map(version => release(version))}</details> : null}
  </div>;
}
