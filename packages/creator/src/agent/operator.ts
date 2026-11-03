import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { signalProcessTree } from "../processTree.js";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

export interface OperatorOperation { name: string; kind: "read" | "mutation"; inputDef: string; resultDef: string; agentExposed: boolean }
let resultValidators: Promise<Map<string, ReturnType<Ajv2020["compile"]>>> | undefined;
async function validators() {
  return resultValidators ??= (async () => {
    const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
    let directory = path.join(packageRoot, "contracts/creator");
    try { await readFile(path.join(directory, "operator.schema.json")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; directory = path.join(packageRoot, "dist/contracts/creator"); }
    const load = async (name: string) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
    const [contract, composition, inventory] = await Promise.all([load("operator.schema.json"), load("app-ui-model-operation.schema.json"), load("operator.operations.json")]);
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    ajv.addSchema(contract); ajv.addSchema(composition);
    return new Map(inventory.operations.map((entry: OperatorOperation) => {
      const validate = ajv.getSchema(`${contract.$id}#/$defs/${entry.resultDef}`);
      if (!validate) throw new Error("CREATOR_OPERATOR_RESULT_CONTRACT_MISSING");
      return [entry.name, validate];
    }));
  })();
}

// Keep the target's fixed entry and its validation/locking boundary. Being in
// the same language is not permission to bypass the target's Operator contract.
const requests = new Map<string, Promise<void>>();
export async function requestOperator(root: string, operation: string, input: object = {}, signal?: AbortSignal): Promise<Record<string, any>> {
  const key = path.resolve(root), previous = requests.get(key) ?? Promise.resolve();
  const result = previous.then(() => invokeOperator(root, operation, input, signal));
  const settled = result.then(() => undefined, () => undefined);
  requests.set(key, settled);
  try { return await result; } finally { if (requests.get(key) === settled) requests.delete(key); }
}
async function invokeOperator(root: string, operation: string, input: object, signal?: AbortSignal): Promise<Record<string, any>> {
  signal?.throwIfAborted();
  const entry = path.join(root, ".agent-ui", "operator", "entry.mjs");
  await readFile(entry, "utf8");
  const validate = (await validators()).get(operation);
  if (!validate) throw new Error("CREATOR_OPERATOR_OPERATION_INVALID");
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { cwd: root, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) reject(error); };
    let failure: Error | undefined;
    const terminate = (error: Error) => { failure ??= error; signalProcessTree(child, true); };
    const abort = () => terminate(new Error("CREATOR_RUN_STOPPED"));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => terminate(new Error("OPERATOR_TIMEOUT")), 60_000);
    for (const [stream, kind] of [[child.stdout, "out"], [child.stderr, "err"]] as const) stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1_048_576) { terminate(new Error("OPERATOR_OUTPUT_LIMIT")); return; }
      if (kind === "out") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
    });
    child.on("error", error => finish(error));
    child.on("close", code => {
      finish();
      if (failure) { reject(failure); return; }
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.ok === false) {
          const error = Object.assign(new Error(result.error?.message ?? stderr.slice(-2000) ?? "OPERATOR_FAILED"), result.error ?? {});
          reject(error);
        } else {
          const value = result.result ?? result;
          if (!validate(value)) throw new Error("CREATOR_OPERATOR_RESULT_CONTRACT_INVALID");
          resolve(value);
        }
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify({ operation, input }));
    child.stdin.on("error", error => { failure ??= error; });
    if (signal?.aborted) abort();
  });
}

export async function operatorContracts(directory: string) {
  const schema = JSON.parse(await readFile(path.join(directory, "operator.schema.json"), "utf8"));
  const composition = JSON.parse(await readFile(path.join(directory, "app-ui-model-operation.schema.json"), "utf8"));
  const operations: OperatorOperation[] = JSON.parse(await readFile(path.join(directory, "operator.operations.json"), "utf8")).operations;
  function resolve(value: any, owner = schema, stack: string[] = []): any {
    if (Array.isArray(value)) return value.map(item => resolve(item, owner, stack));
    if (!value || typeof value !== "object") return value;
    if (value.$ref) {
      const ref: string = value.$ref;
      if (stack.includes(ref)) return { type: "object" };
      const [file, fragment = ""] = ref.split("#");
      const target = file ? (file.includes("app-ui-model-operation") ? composition : schema) : owner;
      const pointed = fragment.split("/").slice(1).reduce((object: any, key: string) => object[key.replace(/~1/gu, "/").replace(/~0/gu, "~")], target);
      if (!pointed) throw new Error(`CREATOR_CONTRACT_REFERENCE_INVALID: ${ref}`);
      return resolve(pointed, target, [...stack, ref]);
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["$schema", "$id", "$defs"].includes(key)).map(([key, child]) => [key, resolve(child, owner, stack)]));
  }
  return { operations, inputSchema: (operation: OperatorOperation) => resolve(schema.$defs[operation.inputDef]) };
}
