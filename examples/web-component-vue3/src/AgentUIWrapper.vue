<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import "@agentui/web-component";
import type { AgentUIConfig, AgentUIElement, AgentUIEventDetails } from "@agentui/web-component";
const props = defineProps<{ config: AgentUIConfig }>();
const emit = defineEmits<{
  ready: [detail: AgentUIEventDetails["ready"]];
  "thread-change": [detail: AgentUIEventDetails["thread-change"]];
  error: [detail: AgentUIEventDetails["error"]];
}>();
const container = ref<HTMLDivElement>();
let element: AgentUIElement | undefined;
const onReady = (event: Event) => emit("ready", (event as CustomEvent<AgentUIEventDetails["ready"]>).detail);
const onThread = (event: Event) => emit("thread-change", (event as CustomEvent<AgentUIEventDetails["thread-change"]>).detail);
const onError = (event: Event) => emit("error", (event as CustomEvent<AgentUIEventDetails["error"]>).detail);
onMounted(() => {
  element = document.createElement("agent-ui");
  element.config = props.config;
  element.addEventListener("ready", onReady);
  element.addEventListener("thread-change", onThread);
  element.addEventListener("error", onError);
  container.value?.append(element);
});
watch(() => props.config, config => { if (element) element.config = config; });
onBeforeUnmount(() => {
  element?.removeEventListener("ready", onReady);
  element?.removeEventListener("thread-change", onThread);
  element?.removeEventListener("error", onError);
  element?.remove();
  element = undefined;
});
</script>
<template><div ref="container" /></template>
