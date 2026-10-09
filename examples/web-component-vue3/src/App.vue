<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import AgentUIWrapper from "./AgentUIWrapper.vue";
import type { AgentUIConfig } from "@agentui/web-component";
const config = shallowRef<AgentUIConfig>({ attachmentAdapter: new DemoAttachmentAdapter(), endpoint: "/agent", conversationDataEndpoint: "/api", locale: "zh-CN", theme: "violet" });
const threadId = ref("");
const error = ref("");
</script>
<template>
  <main>
    <div class="controls">
      <button @click="config = { ...config, locale: config.locale === 'zh-CN' ? 'en-US' : 'zh-CN' }">zh-CN / en-US</button>
      <button @click="config = { ...config, theme: config.theme === 'dark' ? 'violet' : 'dark' }">violet / dark</button>
      <code>{{ threadId }}</code><output>{{ error }}</output>
    </div>
    <AgentUIWrapper :config="config" @thread-change="threadId = $event.threadId" @error="error = $event.error.message" />
  </main>
</template>
<style>
/* Deliberately hostile Host styles; the bridge owns its Shadow DOM CSS. */
* { box-sizing: content-box; }
button { background: #ffc; color: #900; border: 10px solid red; }
input { font-size: 40px; background: yellow; }
p { color: red; font-size: 32px; }
body { margin: 24px; background: #f3f3f3; }
.controls { margin-bottom: 16px; display: flex; gap: 16px; align-items: center; }
</style>
