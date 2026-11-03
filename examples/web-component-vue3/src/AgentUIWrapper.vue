<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import "@za38.03/agent-ui-web-component/register";
import type { AgentUIConfig, AgentUIElement, AgentUIEventDetails } from "@za38.03/agent-ui-web-component";
const props = defineProps<{ config: AgentUIConfig }>();
const emit = defineEmits<{
  ready: [detail: AgentUIEventDetails["agent-ready"]];
  "thread-change": [detail: AgentUIEventDetails["thread-change"]];
  "theme-change": [detail: AgentUIEventDetails["theme-change"]];
  error: [detail: AgentUIEventDetails["agent-error"]];
}>();
const container = ref<HTMLDivElement>();
let element: AgentUIElement | undefined;
const onReady = (event: Event) => emit("ready", (event as CustomEvent<AgentUIEventDetails["agent-ready"]>).detail);
const onThread = (event: Event) => emit("thread-change", (event as CustomEvent<AgentUIEventDetails["thread-change"]>).detail);
const onTheme = (event: Event) => emit("theme-change", (event as CustomEvent<AgentUIEventDetails["theme-change"]>).detail);
const onError = (event: Event) => emit("error", (event as CustomEvent<AgentUIEventDetails["agent-error"]>).detail);
onMounted(() => {
  element = document.createElement("agent-ui");
  element.config = props.config;
  element.addEventListener("agent-ready", onReady);
  element.addEventListener("thread-change", onThread);
  element.addEventListener("theme-change", onTheme);
  element.addEventListener("agent-error", onError);
  container.value?.append(element);
});
watch(() => props.config, config => { if (element) element.config = config; });
onBeforeUnmount(() => {
  element?.removeEventListener("agent-ready", onReady);
  element?.removeEventListener("thread-change", onThread);
  element?.removeEventListener("theme-change", onTheme);
  element?.removeEventListener("agent-error", onError);
  element?.remove();
  element = undefined;
});
</script>
<template><div ref="container" /></template>
