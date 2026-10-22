# Examples

Only `web-component-vue3` is maintained here: a Vue 3/Vite Host consuming the React Agent UI through its compiled Web Component.

From the workspace root:

```sh
pnpm dev:vue-host
```

The demo listens on http://127.0.0.1:5180. `pnpm dev` starts this demo alongside the Creator Workbench on port 5174. Vue customization targets the React Web Component producer; Creator does not generate native Vue Agent UI implementations.

See [the demo README](web-component-vue3/README.md) for integration details.
