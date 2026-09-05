import { describe, expect, it } from "vitest";

import { mapAgentUserInput } from "../src/input-mapper.js";

describe("mapAgentUserInput", () => {
  it("maps string and text input", () => {
    expect(mapAgentUserInput({ content: "  hello  " }, "user-1")).toEqual({
      id: "user-1",
      role: "user",
      content: "hello",
    });
    expect(mapAgentUserInput({
      content: [{ type: "text", text: "Describe these files" }],
    }, "user-2")).toMatchObject({
      content: [{ type: "text", text: "Describe these files" }],
    });
  });

  it("maps image and document sources with mime types", () => {
    expect(mapAgentUserInput({
      content: [
        {
          type: "image",
          source: {
            type: "url",
            value: "https://example.test/image.png",
            mimeType: "image/png",
          },
          name: "image.png",
        },
        {
          type: "document",
          source: {
            type: "data",
            value: "base64-data",
            mimeType: "application/pdf",
          },
          name: "report.pdf",
        },
      ],
    }, "user-media")).toMatchObject({
      content: [
        {
          type: "image",
          source: {
            type: "url",
            value: "https://example.test/image.png",
            mimeType: "image/png",
          },
          metadata: { name: "image.png" },
        },
        {
          type: "document",
          source: {
            type: "data",
            value: "base64-data",
            mimeType: "application/pdf",
          },
          metadata: { name: "report.pdf" },
        },
      ],
    });
  });
});
