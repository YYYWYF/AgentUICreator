# Agent UI documentation website

This standalone private package owns the public documentation source, screenshots and
component demos. Root `docs/` retains internal architecture/design records.
Each article has one sidebar entry in its owning topic, with one group level.
Plugin and capability pages use local screenshots of the project's templates and
Mock services. Provenance and image hashes are recorded under
`docs/public/images/{plugins,agent-ui,start}/sources.json`. Mock screenshots do
not establish real-backend acceptance. Images enlarge in place when clicked.

Public documentation has two working paths: Creator guides explain how to request
and verify changes; developer guides explain where to edit, how to integrate, and
which public props, methods and events to use. Plugin references serve both paths
with screenshots, Creator requests and concrete manual development seams. Keep
shared instructions in their owning guide, and verify APIs against current public
exports. Keep internal design history, provenance and release authoring out of the
public site. Preserve the generated frontend's independence from development tools.

From the repository root:

```sh
pnpm docs:install
pnpm docs:dev
pnpm docs:build
pnpm --dir website check:docs --built
pnpm docs:preview
pnpm docs:package
pnpm docs:check
pnpm test:documentation
```

`docs:dev` binds to `127.0.0.1`; open `http://127.0.0.1:3000/` (or the port
printed by Rspress if 3000 is occupied). It remains local to this computer.

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

`website/` has its own workspace and lockfile. Root `pnpm install` and product
builds do not install or invoke Rspress/Rspack. Only documentation
builders run `docs:install`; the site's existing React resolution is pinned
locally rather than inherited from the product workspace.

`docs:package` explicitly builds the site and generates a portable handoff at
`artifacts/creator-documentation/`. It contains generated Markdown, text indexes,
and local images, with `index.json` recording package versions, source digest
and file hashes. It also stages a copy under `packages/creator/dist/documentation/`.

To prepare documentation for release packaging:

1. In the documentation build environment, finish documentation and package metadata changes,
   then run `pnpm docs:install` and `pnpm docs:package`.
2. Copy the source repository **together with `artifacts/creator-documentation/`**.
   This generated directory is ignored by Git, so a Git checkout alone is not a
   complete handoff. `pnpm package:repo` includes it when present. Keep `website/`
   source for integrity checks; the package build uses the generated handoff.
3. In the package build environment, run the normal root dependency install and `pnpm build:package`.
   Creator build/prepack validates and copies the handoff into its fresh `dist/`;
   it never runs a documentation compiler. `pnpm docs:check` verifies both the
   handoff and the staged package copy. Publish preparation performs the same
   checks without rebuilding documentation.
4. Run `pnpm verify:package`; it verifies documentation inside the actual Creator
   tarball, including file hashes and the package version.

Missing, modified or outdated documentation fails packaging with instructions
to regenerate in the documentation build environment; it is never silently omitted. Root/website lockfiles
are excluded from the documentation source digest so mirror-specific resolution
or lockfile omission during transfer does not invalidate the static content.
Changing documentation source or any public package manifest requires a new
documentation snapshot. `artifacts/` survives Creator's `dist/` cleanup.

The installed Creator package reads neither this repository nor a live website.
The search/read tool for consuming its snapshot is a separate future task.
Do not hand-edit or commit generated snapshots. Keep screenshots under
`docs/public/images/`.

Plugin screenshots use the official templates and the violet theme by default.
Check light, dark and violet themes when changing Plugin presentation; use the
shared semantic theme tokens rather than fixed colors. Theme comparison examples
may show the corresponding light or dark preset.
