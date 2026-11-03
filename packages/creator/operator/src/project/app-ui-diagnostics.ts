import { z } from "zod";
import { AppUICompilerError } from "../framework/contracts/app-ui-compiler";
import { AppUICompositionError } from "../framework/contracts/app-ui-composition";

export type AppUIModelDiagnosticPhase = "syntax" | "schema" | "composition" | "workspace" | "candidate";
export interface AppUIModelDiagnostic {
  phase: AppUIModelDiagnosticPhase;
  path: string;
  code: string;
  message: string;
  expected?: string;
  actual?: string;
  pluginId?: string;
  instanceId?: string;
  slot?: string;
  details?: unknown;
}

function normalizeIssue(value: unknown, phase: AppUIModelDiagnosticPhase): AppUIModelDiagnostic {
  const issue = value as Record<string, unknown>;
  const diagnostic: AppUIModelDiagnostic = {
    phase,
    path: typeof issue.path === "string" ? issue.path : "",
    code: typeof issue.code === "string" ? issue.code : `${phase}_invalid`,
    message: typeof issue.message === "string" ? issue.message : String(value),
  };
  for (const key of ["expected", "actual", "pluginId", "instanceId", "slot"] as const) {
    if (typeof issue[key] === "string") diagnostic[key] = issue[key];
  }
  const extra = Object.fromEntries(Object.entries(issue).filter(([key]) =>
    !["phase", "path", "code", "message", "expected", "actual", "pluginId", "instanceId", "slot"].includes(key)));
  if (Object.keys(extra).length > 0) diagnostic.details = extra;
  return diagnostic;
}

export function appUIModelDiagnostics(error: unknown, phase: AppUIModelDiagnosticPhase, value?: unknown): AppUIModelDiagnostic[] {
  if (error instanceof z.ZodError) {
    const flatten = (issues: readonly z.core.$ZodIssue[], prefix: string[] = []): AppUIModelDiagnostic[] => issues.flatMap(issue => {
      const segments = [...prefix, ...issue.path.map(String)];
      if (issue.code === "invalid_union") {
        // Zod union branches carry relative paths. Report the closest grammar
        // branch instead of asserting every alternative discriminant is required.
        let node = value;
        for (const segment of segments) node = node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[segment] : undefined;
        const discriminant = node !== null && typeof node === "object"
          ? (node as Record<string, unknown>).type : undefined;
        const matching = typeof discriminant === "string"
          ? issue.errors.filter(branch => !branch.some(problem =>
              problem.code === "invalid_value" && problem.path.length === 1 &&
              problem.path[0] === "type" && !problem.values.includes(discriminant)))
          : issue.errors;
        if (matching.length === 0) return [{ phase, path: "/" + segments.join("/"),
          code: issue.code, message: issue.message, actual: "object" }];
        const branch = [...matching].sort((left, right) => left.length - right.length)[0] ?? [];
        return flatten(branch, segments);
      }
      let actual = value;
      for (const segment of segments) actual = actual !== null && typeof actual === "object"
        ? (actual as Record<string, unknown>)[segment] : undefined;
      return [{ phase, path: "/" + segments.map(s => s.replaceAll("~", "~0").replaceAll("/", "~1")).join("/"),
        code: issue.code, message: issue.message,
        ...("expected" in issue ? { expected: issue.expected } : {}),
        actual: actual === undefined ? "missing" : Array.isArray(actual) ? "array" : actual === null ? "null" : typeof actual }];
    });
    return flatten(error.issues);
  }
  if (error instanceof AppUICompilerError || error instanceof AppUICompositionError) {
    return error.issues.map(issue => normalizeIssue(issue, "composition"));
  }
  const detail = error as { code?: string; details?: { issues?: readonly unknown[] } };
  if (Array.isArray(detail?.details?.issues)) {
    return detail.details.issues.map(issue => normalizeIssue(issue, phase));
  }
  return [{ phase, path: "", code: detail?.code ?? `${phase}_invalid`,
    message: error instanceof Error ? error.message : String(error),
    ...(detail?.details === undefined ? {} : { details: detail.details }) }];
}
export class AppUIModelInvalidError extends Error {
  readonly code = "APP_UI_MODEL_INVALID";
  constructor(public details: { status: "syntax_invalid" | "schema_invalid" | "composition_invalid"; diagnostics: AppUIModelDiagnostic[] }) {
    super("Inspect AppUIModel source before recovery.");
  }
}
