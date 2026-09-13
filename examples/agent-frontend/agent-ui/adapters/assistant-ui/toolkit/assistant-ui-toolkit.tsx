import { defineToolkit } from "@assistant-ui/react";

import { SearchFilesToolUI } from "./SearchFilesToolUI";

export const assistantUiToolkit = defineToolkit({
  search_files: {
    type: "backend",
    display: "standalone",
    render: SearchFilesToolUI,
  },
});
