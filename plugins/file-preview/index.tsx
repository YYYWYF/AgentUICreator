import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import manifestJson from "./manifest.json";

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
      className="file-preview-plugin"
      data-show-header={showHeader}
      data-ui-plugin="file-preview"
    >
      {showHeader ? (
        <header className="file-preview-plugin-header">
          <div>
            <span>File</span>
            <h2>{preview.path ?? "No file selected"}</h2>
          </div>
          {preview.file?.language === undefined ? null : (
            <strong>{preview.file.language}</strong>
          )}
        </header>
      ) : null}

      {preview.file === undefined ? (
        <p className="file-preview-plugin-empty">No preview data available.</p>
      ) : (
        <pre className="file-preview-plugin-content" tabIndex={0}>
          <code>{preview.file.content}</code>
        </pre>
      )}
    </section>
  );
}

export const filePreviewPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: FilePreviewPlugin,
};
