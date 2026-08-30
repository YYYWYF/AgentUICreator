import type {
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";

import "./styles.css";

interface PreviewFile {
  content: string;
  language?: string | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPreviewFile(
  state: unknown,
  instanceProps: Record<string, unknown> | undefined,
): { path: string | undefined; file: PreviewFile | undefined } {
  const stateRecord = asRecord(state);
  const files = asRecord(stateRecord?.files);
  const propPath = instanceProps?.path;
  const statePath = stateRecord?.selectedFile;
  const path =
    typeof propPath === "string"
      ? propPath
      : typeof statePath === "string"
        ? statePath
        : undefined;

  if (path === undefined) {
    return { path, file: undefined };
  }

  const fileValue = files?.[path];

  if (typeof fileValue === "string") {
    return { path, file: { content: fileValue } };
  }

  const fileRecord = asRecord(fileValue);
  const content = fileRecord?.content;
  const language = fileRecord?.language;

  return {
    path,
    file:
      typeof content === "string"
        ? {
            content,
            language: typeof language === "string" ? language : undefined,
          }
        : undefined,
  };
}

export function FilePreviewPlugin({ context }: UIPluginComponentProps) {
  const preview = readPreviewFile(context.state, context.instance.props);
  const showHeader = context.instance.props?.showHeader !== false;

  return (
    <section
      aria-label="文件预览"
      className="file-preview-plugin"
      data-show-header={showHeader}
      data-ui-plugin="file-preview"
    >
      {showHeader ? (
        <header className="file-preview-plugin-header">
          <div>
            <span>文件</span>
            <h2>{preview.path ?? "未选择文件"}</h2>
          </div>
          {preview.file?.language === undefined ? null : (
            <strong>{preview.file.language}</strong>
          )}
        </header>
      ) : null}

      {preview.file === undefined ? (
        <p className="file-preview-plugin-empty">暂无可预览的数据。</p>
      ) : (
        <pre className="file-preview-plugin-content" tabIndex={0}>
          <code>{preview.file.content}</code>
        </pre>
      )}
    </section>
  );
}
