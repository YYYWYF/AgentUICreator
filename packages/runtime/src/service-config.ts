import type { ConversationFeedbackAdapter } from "./feedback.js";

export interface ServiceDataSourceOptions {
  signal?: AbortSignal | undefined;
}

export interface AttachmentDataSource {
  /** Return the uploaded file's HTTP(S) URL, resolved against the page for relative URLs. */
  upload(file: File, options?: ServiceDataSourceOptions): Promise<string>;
}

export interface DictationDataSourceOptions extends ServiceDataSourceOptions {
  language?: string | undefined;
}

export interface DictationDataSource {
  /** Return the decoded transcript; recording and Composer integration remain built in. */
  transcribe(audio: File, options?: DictationDataSourceOptions): Promise<string>;
}

export type FeedbackDataSource = ConversationFeedbackAdapter;

/** Browser requests use user-scoped credentials; server secrets belong behind a gateway. */
export interface ServiceRequestConfig {
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
}

/** Files are embedded as Base64 unless dataSource or uploadUrl is configured. */
export interface AttachmentConfig extends ServiceRequestConfig {
  /** Custom upload implementation; takes precedence over uploadUrl and HTTP options. */
  dataSource?: AttachmentDataSource | undefined;
  accept?: string | undefined;
  maxSizeBytes?: number | undefined;
  uploadUrl?: string | undefined;
  /** Multipart field name. Default: file. */
  fieldName?: string | undefined;
  /** Dotted path to the URL in the JSON response. Default: url. */
  urlField?: string | undefined;
}

/** Without dataSource or url, use browser speech recognition when supported. */
export interface DictationConfig extends ServiceRequestConfig {
  /** Custom transcription implementation; takes precedence over url and HTTP options. */
  dataSource?: DictationDataSource | undefined;
  url?: string | undefined;
  language?: string | undefined;
  /** Multipart field name. Default: file. */
  fieldName?: string | undefined;
  /** Dotted path to the transcript in the JSON response. Default: text. */
  textField?: string | undefined;
}

/** Without dataSource or url, feedback stays in the current conversation UI only. */
export interface FeedbackConfig extends ServiceRequestConfig {
  /** Custom persistence implementation; takes precedence over url and HTTP options. */
  dataSource?: FeedbackDataSource | undefined;
  url?: string | undefined;
}
