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
```

`docs:dev` binds to `127.0.0.1`; open `http://127.0.0.1:3000/` (or the port
printed by Rspress if 3000 is occupied). It remains local to this computer.

From the repository root, `pnpm --dir website check:docs` checks every article's
menu ownership, orphan pages, duplicate entries, navigation depth and local
links. After building, run `pnpm --dir website check:docs --built` to check
generated pages, sidebar entries and link anchors as well.

The locale reference in `docs/development/styling-and-localization.md` is generated
from `packages/plugins/src/locales/{zh-CN,en-US}.ts`. Run `pnpm docs:locales` from
the repository root after dictionary changes; the explicit `pnpm docs:locales:check`
and `check:docs` commands reject stale tables. Site builds compile without this
freshness check. Maintain only functional grouping in
`website/scripts/generate-locale-reference.mjs`, never the generated rows.
Run `pnpm test:locale-reference` for generator validation. These commands use the
website's existing TypeScript dependency installed by `docs:install`.

`docs:build` generates `website/doc_build/`, including HTML, per-page Markdown,
`llms.txt` and `llms-full.txt` (Rspress SSG-MD). Deploy the **whole directory** to
a static server. The default base is `/`; configure Rspress `base` before building
for a subdirectory. Serve `.md` and `.txt` files directly rather than routing
them to HTML. No Node.js or npm installation is required on the static server.
Use bundled local assets and local search; future demos must not require an
external CDN or real Agent endpoint for the documentation to be readable offline.
Interactive examples need descriptive text/code for their Markdown representation.
SSG-MD is experimental and its generated output must be checked when upgrading.

For a standalone intranet deployment ZIP, run `pnpm docs:zip` from the repository
root (or `pnpm docs:zip /path/to/website.zip` for a custom destination). It rebuilds
the site in the external source checkout, then writes
`../AgentUIWebsite.zip`. An intranet transfer already contains static files and
is packaged as-is without loading website scripts or checking a site manifest.
The archive contains
only a deployable `website/` directory with HTML, browser assets, local search,
Markdown, text indexes and `DEPLOY.txt`; no repository source or npm dependencies
are included, and no Creator offline documentation is generated. Copy the
contents of `website/` to the static server's site root.
`pnpm package:repo` continues to package the repository with the same static-only
`website/` replacement. Both commands leave the working website source intact.

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
   then run `pnpm docs:install`.
2. Run `pnpm package:repo` to create `../AgentUICreator.zip` (or pass an output
   path: `pnpm package:repo /path/to/transfer.zip`). It rebuilds the
   documentation before writing the archive. In the ZIP, `website/` contains
   only the complete static site, including local search, demos and assets;
   its source, package manifests, lockfile and compiler dependencies are omitted.
   The working checkout retains the original website source.
   `artifacts/creator-documentation/` is included so Creator builds can copy the
   offline snapshot. Keep it with the transfer when offline reference docs are
   needed; a Git checkout alone lacks this ignored handoff. An extracted
   transfer can be repackaged without Rspress.
3. In the intranet package build environment, run the normal root dependency
   install and `pnpm build:package`. Creator's existing asset-copy step copies
   `artifacts/creator-documentation/` into its fresh `dist/documentation/` when
   the handoff exists; otherwise it skips the copy.
   Install, build, prepack and publish do not load the website compiler, inspect
   website sources or run website freshness/hash checks.
4. `pnpm verify:package` checks public package ownership, tarballs and consumers.
   Documentation generation and resource-copy checks run separately through
   `pnpm test:documentation` in the external documentation build environment.

The prepared Creator documentation directory is optional for product builds;
intranet builds copy it when present and do not regenerate or audit it.
Use `pnpm docs:package`, `pnpm --dir website check:docs` and
`pnpm test:documentation` in the external documentation build environment to
prepare and check documentation resources.
Root `pnpm test` does not run those website checks. `artifacts/` survives
Creator's `dist/` cleanup.
Startup, package distribution and integration CI do not install or generate
documentation as a prerequisite.

For intranet deployment, copy the ZIP's entire `website/` directory to an existing
static server's site root and follow `website/DEPLOY.txt`. No Node.js, pnpm or
documentation npm dependencies are required on that server. Access it over
HTTP/HTTPS; opening HTML with `file://` is unsupported. Enable `index.html` as
the directory default and resolve extensionless article URLs to their `.html`
files. The default base is `/`, so deploy as a dedicated site; subpath deployment
requires rebuilding externally with the appropriate Rspress `base`.
`agent-ui-static-site.json` is external-build audit metadata. Intranet deployment,
project builds and ZIP repackaging do not require or validate it. To edit website
content, return to the external source checkout, rebuild and transfer a new ZIP.

The installed Creator Agent uses `read_creator_documentation` to browse, search
and read bounded sections from its packaged public and internal reference
snapshot. The tool reports unavailable when the snapshot is absent. Target
project code and installed API declarations remain authoritative for edits.
Do not hand-edit or commit generated snapshots. Keep screenshots under
`docs/public/images/`.

Plugin screenshots use the official templates and the violet theme by default.
Check light, dark and violet themes when changing Plugin presentation; use the
shared semantic theme tokens rather than fixed colors. Theme comparison examples
may show the corresponding light or dark preset.
