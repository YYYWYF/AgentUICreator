import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { creatorDistributionRoot } from "../creatorRuntimeDistribution.js";

interface Section { id: string; title: string; level: number; start: number; end: number }
interface DocumentEntry { id: string; title: string; source: "public" | "internal"; topic: string; path: string; summary: string; sha256: string; sections: Section[] }
export interface DocumentationInput {
  action?: "index" | "read"; query?: string; topic?: string; source?: "public" | "internal";
  documentId?: string; sectionId?: string; offset?: number; limit?: number;
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pageSize = 8, tocSize = 32;
const metadata = (document: DocumentEntry) => ({ documentId: document.id, title: document.title, source: document.source,
  topic: document.topic, path: document.path, summary: document.summary, sha256: document.sha256 });
const nextRead = (documentId: string, sectionId?: string) => ({ tool: "read_creator_documentation", input: {
  action: "read" as const, documentId, ...(sectionId ? { sectionId } : {}),
} });

async function resource(root: string, name: string) {
  if (!name || /[\\:?#]/u.test(name) || name.startsWith("/") || name.split("/").some(part => !part || part === "." || part === "..")) throw new Error("INVALID_DOCUMENT_PATH");
  const target = await realpath(path.join(root, ...name.split("/")));
  const relative = path.relative(root, target);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("INVALID_DOCUMENT_PATH");
  return readFile(target);
}

function terms(query: string) {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("en-US");
  const words = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(normalized)]
    .filter(part => part.isWordLike).map(part => part.segment);
  // Chinese compounds are often segmented differently in prose and headings.
  for (const sequence of normalized.match(/\p{Script=Han}{2,}/gu) ?? []) {
    for (let i = 0; i < sequence.length - 1; i++) words.push(sequence.slice(i, i + 2));
  }
  return [...new Set(words)].filter(word => word.length > 1 || /[a-z0-9]/u.test(word));
}
const matchScore = (text: string, words: string[], weights: Map<string, number>) => {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en-US");
  return words.reduce((score, word) => score + (normalized.includes(word) ? word.length * (weights.get(word) ?? 1) : 0), 0);
};

/** Packaged reference material only: never creates source observations or authority. */
export async function readCreatorDocumentation(input: DocumentationInput = {}, directory = path.join(creatorDistributionRoot(), "dist", "documentation")) {
  const offset = input.offset ?? 0, limit = input.limit ?? 4000;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 2 || limit > 8000) throw new Error("DOCUMENTATION_RANGE_INVALID");
  let root: string, manifest: any, documents: DocumentEntry[];
  try {
    root = await realpath(directory);
    manifest = JSON.parse((await resource(root, "index.json")).toString("utf8"));
    const bytes = await resource(root, "agent-index.json");
    const expected = manifest.files?.find((file: any) => file.path === "agent-index.json");
    const catalog = JSON.parse(bytes.toString("utf8"));
    if (manifest.schemaVersion !== 1 || manifest.packageName !== "@za38.03/agent-ui-creator" || expected?.sha256 !== hash(bytes) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.documents)) throw new Error("INVALID_DOCUMENT_INDEX");
    documents = catalog.documents;
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "unavailable" : "invalid", referenceOnly: true,
      reason: "Packaged documentation is missing or invalid. Repair the Creator installation; continue using inspected project files and installed declarations when available." };
  }
  const base = { status: "available", referenceOnly: true, creatorVersion: manifest.packageVersion, versions: manifest.versions,
    sourceDigest: manifest.sourceDigest };
  async function documentText(document: DocumentEntry) {
    const bytes = await resource(root, document.path);
    const record = manifest.files.find((file: any) => file.path === document.path);
    if (hash(bytes) !== document.sha256 || record?.sha256 !== document.sha256) throw new Error("DOCUMENT_HASH_MISMATCH");
    return bytes.toString("utf8");
  }
  if ((input.action ?? "index") === "index") {
    if (input.topic && !documents.some(document => document.topic === input.topic && (!input.source || document.source === input.source))) {
      const { topic: _topic, ...retry } = input;
      return { ...base, status: "invalid_filter", reason: "The topic does not exist in the selected source; this is not evidence that the requested documentation is absent.",
        requestedTopic: input.topic, availableTopics: [...new Set(documents.filter(document => !input.source || document.source === input.source).map(document => document.topic))].sort(),
        nextRead: { tool: "read_creator_documentation", input: { ...retry, offset: 0 } } };
    }
    const filtered = documents.filter(document => (!input.source || document.source === input.source) && (!input.topic || document.topic === input.topic));
    if (!input.query?.trim() && !input.source && !input.topic) {
      const topics = new Map<string, { source: string; topic: string; count: number }>();
      for (const document of filtered) {
        const key = `${document.source}:${document.topic}`;
        const item = topics.get(key) ?? { source: document.source, topic: document.topic, count: 0 };
        item.count++; topics.set(key, item);
      }
      return { ...base, totalDocuments: documents.length, topics: [...topics.values()],
        navigation: "Search with query or list a source/topic. Read a documentId for its table of contents, then read a sectionId. Installed target-project APIs take precedence over these versioned references." };
    }
    const words = terms(input.query ?? "");
    const identifiers = [...new Set((input.query?.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/gu) ?? [])
      .filter(word => /[a-z][A-Z]|[_.]/u.test(word)).map(word => word.toLowerCase()))];
    let candidates;
    try {
      // Full text stays inside the tooling process. API identifiers in code
      // examples remain searchable; only metadata and section links are returned.
      const corpus = await Promise.all(filtered.map(async document => ({ document, text: words.length ? await documentText(document) : "" })));
      const weights = new Map(words.map(word => [word, Math.log(1 + corpus.length / (1 + corpus.filter(({ document, text }) =>
        `${document.title} ${document.id} ${document.summary} ${text}`.toLowerCase().includes(word)).length))]));
      const identifierMatches = (text: string) => identifiers.filter(word => text.toLowerCase().includes(word)).length;
      const codeMatches = (text: string) => {
        const codeTokens = new Set((text.match(/```[\s\S]*?```|`[^`\n]+`/gu) ?? [])
          .flatMap(block => block.match(/[A-Za-z_$][\w$]*/gu) ?? []).map(word => word.toLowerCase()));
        return words.reduce((score, word) => score + (codeTokens.has(word) ? word.length * (weights.get(word) ?? 1) : 0), 0);
      };
      candidates = corpus.map(({ document, text }) => {
        // Rank the section that actually contains the answer, rather than an
        // ancestor whose range happens to include every descendant chapter.
        const sections = document.sections.map((section, index) => {
          const body = text.slice(section.start, Math.min(section.end, document.sections[index + 1]?.start ?? section.end));
          return { section, identifiers: identifierMatches(section.title + " " + body), codeScore: codeMatches(body), score: matchScore(section.title, words, weights) * 4 + matchScore(body, words, weights) };
        }).sort((a, b) => b.identifiers - a.identifiers || b.codeScore - a.codeScore || b.score - a.score || (a.section.end - a.section.start) - (b.section.end - b.section.start));
        const score = matchScore(`${document.title} ${document.id}`, words, weights) * 4 + matchScore(document.summary, words, weights) * 2 + (sections[0]?.score ?? 0);
        return { document, score, codeScore: codeMatches(text), sections, identifiers: identifierMatches(`${document.title} ${document.id} ${document.summary} ${text}`) };
      });
    } catch {
      return { ...base, status: "invalid", reason: "An indexed document is missing, unsafe or changed; repair the Creator documentation bundle." };
    }
    const ranked = candidates.filter(item => !input.query?.trim() || item.score > 0)
      .sort((a, b) => b.identifiers - a.identifiers || b.codeScore - a.codeScore || b.score - a.score || (a.document.source === b.document.source ? a.document.id.localeCompare(b.document.id) : a.document.source === "public" ? -1 : 1));
    return { ...base, query: input.query ?? "", total: ranked.length, offset,
      entries: ranked.slice(offset, offset + pageSize).map(({ document, sections }) => ({ ...metadata(document),
        nextRead: nextRead(document.id), matchingSections: words.length ? sections.filter(item => item.score > 0).slice(0, 3).map(({ section }) => ({ sectionId: section.id, title: section.title, nextRead: nextRead(document.id, section.id) })) : [] })),
      nextOffset: offset + pageSize < ranked.length ? offset + pageSize : null };
  }
  const document = documents.find(entry => entry.id === input.documentId);
  if (!document) return { ...base, status: "not_found", reason: "Unknown documentId. Search the index for a full documentId." };
  let text: string;
  try {
    text = await documentText(document);
  } catch {
    return { ...base, status: "invalid", documentId: document.id, reason: "Document is missing, unsafe or changed; repair the Creator documentation bundle." };
  }
  if (!input.sectionId) return { ...base, ...metadata(document), totalSections: document.sections.length, offset,
    sections: document.sections.slice(offset, offset + tocSize).map(section => ({ sectionId: section.id, title: section.title, level: section.level, characters: section.end - section.start, nextRead: nextRead(document.id, section.id) })),
    nextOffset: offset + tocSize < document.sections.length ? offset + tocSize : null };
  const section = document.sections.find(entry => entry.id === input.sectionId);
  if (!section) return { ...base, status: "not_found", reason: "Unknown sectionId. Read the document table of contents.", nextRead: nextRead(document.id) };
  const sectionIndex = document.sections.indexOf(section);
  const following = document.sections.slice(sectionIndex + 1);
  // An ancestor heading's indexed range includes descendants for searching.
  // Reading it should return its own introduction and navigation, not page the
  // entire API book before reaching the relevant child chapter.
  const content = text.slice(section.start, Math.min(section.end, following[0]?.start ?? section.end));
  const children = following.filter(entry => entry.start < section.end && entry.level > section.level);
  if (offset > content.length || (offset > 0 && /[\uDC00-\uDFFF]/u.test(content[offset]!))) throw new Error("DOCUMENTATION_RANGE_INVALID");
  let end = Math.min(offset + limit, content.length);
  if (end < content.length && /[\uDC00-\uDFFF]/u.test(content[end]!)) end--;
  const nextOffset = end < content.length ? end : null;
  return { ...base, ...metadata(document), sectionId: section.id, title: section.title, offset, totalCharacters: content.length,
    ...(children.length ? { childSections: children.slice(0, tocSize).map(entry => ({ sectionId: entry.id, title: entry.title, level: entry.level, nextRead: nextRead(document.id, entry.id) })),
      ...(children.length > tocSize ? { moreSections: { tool: "read_creator_documentation", input: { action: "read", documentId: document.id, offset: sectionIndex + 1 + tocSize } } } : {}) } : {}),
    content: content.slice(offset, end), nextOffset,
    ...(nextOffset === null ? {} : { nextRead: { tool: "read_creator_documentation", input: { action: "read" as const, documentId: document.id, sectionId: section.id, offset: nextOffset, limit } } }) };
}

/** Small navigation hints in an editing bundle; article bodies remain on demand. */
export async function editingDocumentation(pluginId: string | undefined, focus: string, directory?: string) {
  if (!focus.trim()) {
    // Custom Plugin IDs have no public page. Broadly searching their words can
    // send a card edit to unrelated backend/architecture documents.
    let selected = pluginId ? await readCreatorDocumentation({ action: "read", documentId: `public:plugins/${pluginId}` }, directory) : undefined;
    if (!selected || selected.status === "not_found") selected = await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api" }, directory);
    if (!("documentId" in selected) || !("title" in selected) || !("source" in selected)) return { status: selected.status, referenceOnly: true };
    return { status: selected.status, referenceOnly: true, creatorVersion: selected.creatorVersion,
      entries: [{ documentId: selected.documentId, title: selected.title, source: selected.source, nextRead: nextRead(selected.documentId), matchingSections: [] }] };
  }
  const result = await readCreatorDocumentation({ query: focus.slice(0, 300) }, directory);
  if (!("entries" in result)) return { status: result.status, referenceOnly: true };
  const entries = result.entries.slice(0, 3).map(entry => ({ documentId: entry.documentId, title: entry.title, source: entry.source,
    nextRead: entry.nextRead, matchingSections: entry.matchingSections.slice(0, 2) }));
  return { status: result.status, referenceOnly: true, creatorVersion: result.creatorVersion, entries,
    interpretation: "Versioned documentation navigation, not source reads, installed target API facts or permission. Read relevant sections on demand; ordinary coding and inspection remain available." };
}
