import { format } from "prettier";

// Tool-owned defaults for newly generated code. Never load or execute a target
// project's formatter configuration, or reformat existing project customizations.
export const projectCodeFormat = Object.freeze({
  parser: "typescript",
  singleQuote: true,
  jsxSingleQuote: true,
  trailingComma: "all",
  printWidth: 120,
  endOfLine: "lf",
});

// Placement preflight evaluates many layouts with identical Plugin catalogs.
// Bound this tool-local cache so formatting does not repeat for each candidate.
const formattedSources = new Map();
export const formatProjectCode = (source) => {
  const cached = formattedSources.get(source);
  if (cached) return cached;
  const pending = format(source, projectCodeFormat).catch(error => {
    if (formattedSources.get(source) === pending) formattedSources.delete(source);
    throw error;
  });
  formattedSources.set(source, pending);
  if (formattedSources.size > 64) formattedSources.delete(formattedSources.keys().next().value);
  return pending;
};
