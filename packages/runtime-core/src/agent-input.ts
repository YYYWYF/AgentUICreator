export interface AgentTextInputPart {
  type: "text";
  text: string;
}

export type AgentInputSource =
  | {
      type: "data";
      value: string;
      mimeType: string;
    }
  | {
      type: "url";
      value: string;
      mimeType?: string | undefined;
    };

export interface AgentMediaInputPart {
  type: "image" | "audio" | "video" | "document";
  source: AgentInputSource;
  name?: string | undefined;
}

export type AgentInputPart = AgentTextInputPart | AgentMediaInputPart;

export interface AgentUserInput {
  content: string | AgentInputPart[];
}
