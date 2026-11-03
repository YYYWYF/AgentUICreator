/** Browser requests use user-scoped credentials; server secrets belong behind a gateway. */
export interface ServiceRequestConfig {
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
}

/** Files are embedded as Base64 unless uploadUrl is configured. */
export interface AttachmentConfig extends ServiceRequestConfig {
  accept?: string | undefined;
  maxSizeBytes?: number | undefined;
  uploadUrl?: string | undefined;
  /** Multipart field name. Default: file. */
  fieldName?: string | undefined;
  /** Dotted path to the URL in the JSON response. Default: url. */
  urlField?: string | undefined;
}

/** Without url, use browser speech recognition when supported. */
export interface DictationConfig extends ServiceRequestConfig {
  url?: string | undefined;
  language?: string | undefined;
  /** Multipart field name. Default: file. */
  fieldName?: string | undefined;
  /** Dotted path to the transcript in the JSON response. Default: text. */
  textField?: string | undefined;
}

/** Without url, feedback stays in the current conversation UI only. */
export interface FeedbackConfig extends ServiceRequestConfig {
  url?: string | undefined;
}
