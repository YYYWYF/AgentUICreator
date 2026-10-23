# Agent UI documentation website

This private workspace owns the public documentation source, screenshots and
component demos. Root `docs/` retains internal architecture/design records.
All 136 planned articles have text drafts, with additional Agent configuration
and Plugin development guides. The Plugin navigation covers 39 UI guides;
configuration guides live with application integration or customization. Every
article has one sidebar entry in its owning topic; sidebars use one group level.
The 39 Plugin UI guides include locally bundled screenshots: 17 from assistant-ui
Elements and 22 from this project with Mock services. Each page labels its source;
`docs/public/images/plugins/sources.json` records origins, scenarios and image hashes.
Remaining screenshot requirements are recorded inline; visual and real-backend
acceptance are separate. Track per-article status in
`../docs/plans/public-documentation-progress.md`.

From the repository root:

```sh
pnpm docs:dev
pnpm docs:build
pnpm --filter @za38.03/agent-ui-docs check:docs --built
pnpm docs:preview
pnpm docs:package
pnpm docs:check
pnpm test:documentation
```

`check:docs` checks every article's menu ownership, orphan pages, duplicate entries,
navigation depth and local links. Add `--built` after building to check generated
pages, sidebar entries and link anchors as well.

`docs:build` generates `website/doc_build/`, including HTML, per-page Markdown,
`llms.txt` and `llms-full.txt` (Rspress SSG-MD). Deploy the **whole directory** to
a static server. The default base is `/`; configure Rspress `base` before building
for a subdirectory. Serve `.md` and `.txt` files directly rather than routing
them to HTML. No Node.js or npm installation is required on the static server.
Use bundled local assets and local search; future demos must not require an
external CDN or real Agent endpoint for the documentation to be readable offline.
Interactive examples need descriptive text/code for their Markdown representation.
SSG-MD is experimental and its generated output must be checked when upgrading.

`docs:package` builds the site and stages only generated Markdown, text indexes,
and referenced local images under `packages/creator/dist/documentation/`.
It adds `index.json` with package versions, source digest and file hashes.
Creator build, prepack and publish preparation run this step automatically;
prepack does not include the website runtime or Rspress in Creator dependencies.
`docs:check` rejects missing, stale or modified documentation without rebuilding.
The Creator tarball check verifies the packaged files after extraction as well.

The installed Creator package contains a release-specific offline snapshot. It
does not read this repository or a live website at runtime. The search/read tool
for consuming that snapshot is a separate future task. No generated snapshot
should be hand-edited or committed. Keep screenshots under `docs/public/images/`.
