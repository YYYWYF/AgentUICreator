import {
  CodeOutlined,
  FileTextOutlined,
  LinkOutlined,
  PartitionOutlined,
} from "@ant-design/icons";
import {
  CodeHighlighter,
  FileCard,
  Folder,
  Mermaid,
  Sources,
  type FileCardProps,
  type FolderTreeData,
} from "@ant-design/x";
import { Empty, Tabs, type TabsProps } from "antd";
import { useMemo, useState, type ReactNode } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

interface FileRecord {
  language: string;
  content: string;
}

interface SourceRecord {
  key: string;
  title: string;
  url: string | undefined;
  description: string | undefined;
}

interface AttachmentRecord {
  key: string;
  name: string;
  byte: number | undefined;
  description: string | undefined;
}

interface DiagramRecord {
  key: string;
  title: string;
  content: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function stateSurface(value: unknown): Record<string, unknown> {
  const state = asRecord(value) ?? {};
  return asRecord(state.agentUI) ?? state;
}

function readFiles(value: unknown): Record<string, FileRecord> {
  const record = asRecord(value);
  if (record === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([path, file]) => {
      const fileRecord = asRecord(file);
      const content = asString(fileRecord?.content);
      if (content === undefined) {
        return [];
      }
      return [
        [
          path,
          {
            content,
            language: asString(fileRecord?.language) ?? "text",
          },
        ],
      ];
    }),
  );
}

function readSources(value: unknown): SourceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const title = asString(record?.title);
    if (title === undefined) {
      return [];
    }
    return [
      {
        key: asString(record?.key) ?? `source-${index}`,
        title,
        url: asString(record?.url),
        description: asString(record?.description),
      },
    ];
  });
}

function readAttachments(value: unknown): AttachmentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const name = asString(record?.name);
    if (name === undefined) {
      return [];
    }
    return [
      {
        key: asString(record?.key) ?? `attachment-${index}`,
        name,
        byte: typeof record?.byte === "number" ? record.byte : undefined,
        description: asString(record?.description),
      },
    ];
  });
}

function readDiagrams(value: unknown): DiagramRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const content = asString(record?.content);
    if (content === undefined) {
      return [];
    }
    return [
      {
        key: asString(record?.key) ?? `diagram-${index}`,
        title: asString(record?.title) ?? `Diagram ${index + 1}`,
        content,
      },
    ];
  });
}

function buildFileTree(files: Record<string, FileRecord>): FolderTreeData[] {
  const root: FolderTreeData[] = [];

  Object.entries(files).forEach(([filePath, file]) => {
    const segments = filePath.split("/").filter(Boolean);
    let children = root;

    segments.forEach((segment, index) => {
      let node = children.find((candidate) => candidate.path === segment);
      const isFile = index === segments.length - 1;

      if (node === undefined) {
        node = {
          title: segment,
          path: segment,
          ...(isFile ? { content: file.content } : { children: [] }),
        };
        children.push(node);
      }

      if (!isFile) {
        node.children ??= [];
        children = node.children;
      }
    });
  });

  return root;
}

function iconForFile(name: string): FileCardProps["icon"] {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "tsx" || extension === "ts" || extension === "js") {
    return "javascript";
  }
  if (extension === "png" || extension === "jpg" || extension === "jpeg") {
    return "image";
  }
  return "default";
}

export function AntdXResourcesPlugin({ context }: UIPluginComponentProps) {
  const surface = stateSurface(context.state);
  const files = readFiles(surface.files);
  const sources = readSources(surface.sources);
  const attachments = readAttachments(surface.attachments);
  const diagrams = readDiagrams(surface.diagrams);
  const selectedFile =
    asString(surface.selectedFile) ?? Object.keys(files).at(0) ?? "";
  const [selectedPath, setSelectedPath] = useState<string[]>(
    selectedFile.split("/").filter(Boolean),
  );
  const treeData = useMemo(() => buildFileTree(files), [files]);
  const tabs: TabsProps["items"] = [
    {
      key: "files",
      label: (
        <span><CodeOutlined /> Files</span>
      ),
      children:
        treeData.length === 0 ? (
          <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Folder
            defaultExpandAll
            directoryTreeWith="42%"
            onSelectedFileChange={(file: { path: string[] }) =>
              setSelectedPath(file.path)
            }
            previewRender={(file: {
              content?: string;
              path: string[];
              title?: ReactNode;
              language: string;
            }) => (
              <CodeHighlighter
                header={file.title ?? file.path.at(-1)}
                lang={file.language}
                prismLightMode={false}
              >
                {file.content ?? ""}
              </CodeHighlighter>
            )}
            selectedFile={selectedPath}
            treeData={treeData}
          />
        ),
    },
    {
      key: "outputs",
      label: (
        <span><FileTextOutlined /> Outputs</span>
      ),
      children:
        attachments.length === 0 ? (
          <Empty description="暂无产物" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <FileCard.List
            items={attachments.map((attachment) => ({
              key: attachment.key,
              name: attachment.name,
              icon: iconForFile(attachment.name),
              ...(attachment.byte === undefined ? {} : { byte: attachment.byte }),
              ...(attachment.description === undefined
                ? {}
                : { description: attachment.description }),
            }))}
            overflow="wrap"
          />
        ),
    },
    {
      key: "sources",
      label: (
        <span><LinkOutlined /> Sources</span>
      ),
      children:
        sources.length === 0 ? (
          <Empty description="暂无引用" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Sources
            defaultExpanded
            items={sources}
            title={`${sources.length} 个来源`}
          />
        ),
    },
    {
      key: "diagrams",
      label: (
        <span><PartitionOutlined /> Diagrams</span>
      ),
      children:
        diagrams.length === 0 ? (
          <Empty description="暂无图表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="antd-x-resources-diagrams">
            {diagrams.map((diagram) => (
              <Mermaid
                actions={{ enableCopy: true, enableDownload: true, enableZoom: true }}
                header={diagram.title}
                key={diagram.key}
              >
                {diagram.content}
              </Mermaid>
            ))}
          </div>
        ),
    },
  ];

  return (
    <section
      aria-label="Agent 资源"
      className="antd-x-resources-plugin"
      data-ui-plugin="antd-x-resources"
    >
      <Tabs defaultActiveKey="files" items={tabs} size="small" />
    </section>
  );
}
