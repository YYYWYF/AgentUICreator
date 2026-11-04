/** Supported development API: official scenarios and local copied/timed recordings. */
export { listOfficialMockScenarios, runOfficialMockScenario, createMockAgentHttpHandler, createMockAgentVitePlugin, type OfficialMockOptions, type OfficialMockVitePluginOptions, } from "./official.js";
export { createMockConversationApiVitePlugin } from "./conversations/vite-plugin.js";
export { parseMockRecording, validateMockRecording, MAX_MOCK_RECORDING_BYTES, MAX_MOCK_RECORDING_EVENTS, type MockRecording, type MockRecordingEvent } from "./recording.js";
export { runMockRecording, type MockRecordingRunnerOptions } from "./recording-runner.js";
//# sourceMappingURL=index.d.ts.map