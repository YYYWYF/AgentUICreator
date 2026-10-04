# Frontend Tool capability consumers


A Plugin capability consumed by an application-owned Frontend Tool is a valid
cross-boundary reason for a public Service seam: Plugin provides Service,
Frontend Tool consumes Service. Follow existing Service ownership and authorization
rules; Service existence does not grant Agent exposure permission.

Plugin Component effects manage UI/component lifecycle only. They must never
simulate Frontend Tool execution by opening a dialog, navigating or mutating a
capability when a Tool renderer mounts. Follow the `ag-ui-frontend` skill's
Frontend Tool execution and replay contract. For integration details, read the
packaged [Frontend Tool lifecycle reference](../ag-ui-frontend/references/frontend-tool-lifecycle.md).
