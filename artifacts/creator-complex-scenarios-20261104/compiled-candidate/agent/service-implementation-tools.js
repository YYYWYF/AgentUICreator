import path from "node:path";
import { API, ModifierFlags } from "typescript/unstable/sync";
import { isInterfaceDeclaration, isTypeAliasDeclaration, isModuleDeclaration, isEnumDeclaration, isFunctionDeclaration, isVariableStatement, isStringLiteral, isExportDeclaration, isExportAssignment, isClassDeclaration } from "typescript/unstable/ast/is";
import { sourceRoot, walk } from "./activity.js";
import { creatorContentHash as hash, readCreatorFileState as read } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { applyEdits, commitBatch } from "./source-tools.js";
const plans = new WeakMap();
function store(context) {
    let value = plans.get(context);
    if (!value) {
        value = new Map();
        plans.set(context, value);
    }
    return value;
}
// Public declarations cannot be changed through the implementation channel,
// even in older files which mix declarations with implementation.
function withSource(root, file, content, inspect) {
    const absolute = path.resolve(root, file);
    const api = new API({ cwd: root, fs: { readFile: candidate => path.resolve(candidate) === absolute ? content : undefined } });
    try {
        const snapshot = api.updateSnapshot({ openFiles: [absolute] });
        try {
            const source = snapshot.getDefaultProjectForFile(absolute)?.program.getSourceFile(absolute);
            if (!source)
                throw new Error("SERVICE_IMPLEMENTATION_PARSE_FAILED");
            return inspect(source);
        }
        finally {
            snapshot.dispose();
        }
    }
    finally {
        api.close();
    }
}
function declarations(root, file, content) {
    return withSource(root, file, content, source => {
        const result = [];
        const visit = (node) => {
            if (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isModuleDeclaration(node) || isEnumDeclaration(node)) {
                result.push(node.getText(source));
                return;
            }
            const exported = "modifierFlags" in node && (node.modifierFlags & ModifierFlags.Export) !== 0;
            if (exported && isFunctionDeclaration(node)) {
                result.push(source.text.slice(node.getStart(source), node.body?.getStart(source) ?? node.end).trim());
            }
            else if (exported && isVariableStatement(node)) {
                for (const declaration of node.declarationList.declarations) {
                    result.push(JSON.stringify({ name: declaration.name.getText(source), type: declaration.type?.getText(source) ?? null,
                        serviceId: declaration.initializer && isStringLiteral(declaration.initializer) ? declaration.initializer.text : null }));
                }
            }
            else if (isExportDeclaration(node) || isExportAssignment(node) || (exported && isClassDeclaration(node)))
                result.push(node.getText(source));
            node.forEachChild(visit);
        };
        visit(source);
        return JSON.stringify(result);
    });
}
async function inspectImplementation(context, relative) {
    const source = await sourceRoot(context.root);
    if (!/^services\/.+\.tsx?$/u.test(relative) || /[\\:\x00]/u.test(relative) || relative.endsWith(".d.ts") ||
        relative.split("/").some(part => !part || [".", "..", "upstream", "vendor", "vendors", "runtime", "framework", "node_modules"].includes(part))) {
        throw new Error("SERVICE_IMPLEMENTATION_PATH_INVALID");
    }
    const file = path.posix.join(source, relative);
    context.debugging?.assertPath(file, source);
    const topology = await requestOperator(context.root, "inspect_ui_services", {}, context.signal);
    // The Operator reports project-relative declaration paths, not service-directory paths.
    const services = topology.services ?? [];
    if (services.some((service) => service.contractPaths?.some((item) => item.replaceAll("\\", "/").replace(/^\//u, "") === file))) {
        throw new Error("SERVICE_CONTRACT_TOOL_REQUIRED: use prepare_ui_service_contract_change for public declarations");
    }
    const before = await read(context.root, file);
    if (!before.exists)
        throw new Error("SERVICE_IMPLEMENTATION_NOT_FOUND");
    await context.activity.observations.assertFreshForEdit(file);
    const files = (await walk(context.root, source)).filter(item => /\.[cm]?[jt]sx?$/u.test(item)).sort();
    const inventory = new Set(files);
    const reverse = new Map();
    const states = new Map();
    const unresolved = [];
    for (const owner of files)
        states.set(owner, (await read(context.root, owner)).hash);
    const api = new API({ cwd: context.root });
    try {
        const snapshot = api.updateSnapshot({ openFiles: files.map(owner => path.resolve(context.root, owner)) });
        try {
            for (const owner of files) {
                context.signal.throwIfAborted();
                const absolute = path.resolve(context.root, owner);
                const project = snapshot.getDefaultProjectForFile(absolute);
                const parsed = project?.program.getSourceFile(absolute);
                if (!parsed || !project)
                    throw new Error("SERVICE_IMPLEMENTATION_PARSE_FAILED");
                for (const imported of parsed.imports.filter(isStringLiteral)) {
                    const specifier = imported.text;
                    const targets = project.checker.getSymbolAtLocation(imported)?.declarations.map(declaration => path.relative(context.root, declaration.resolve(project)?.getSourceFile().fileName ?? declaration.path).split(path.sep).join("/")).filter(candidate => inventory.has(candidate)) ?? [];
                    if (targets.length === 0 && specifier.startsWith(".")) {
                        const base = path.posix.normalize(path.posix.join(path.posix.dirname(owner), specifier));
                        const stem = base.replace(/\.[cm]?jsx?$/u, "");
                        const target = [base, ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", "/index.ts", "/index.tsx"].map(suffix => stem + suffix)].find(candidate => inventory.has(candidate));
                        if (target)
                            targets.push(target);
                    }
                    for (const target of targets)
                        reverse.set(target, [...(reverse.get(target) ?? []), owner]);
                    if (!targets.length && (specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("~/")))
                        unresolved.push({ file: owner, specifier });
                }
            }
        }
        finally {
            snapshot.dispose();
        }
    }
    finally {
        api.close();
    }
    const affected = new Set([file]);
    for (const owner of affected)
        for (const consumer of reverse.get(owner) ?? [])
            affected.add(consumer);
    const affectedFiles = [...affected].sort();
    const affectedPlugins = [...new Set(affectedFiles.flatMap(item => {
            const match = /^plugins\/([^/]+)\//u.exec(item.slice(source.length + 1));
            return match ? [match[1]] : [];
        }))].sort();
    const evidence = { services, affectedFiles: affectedFiles.map(item => ({ path: item, hash: states.get(item) })), unresolved };
    return { file, before, evidenceHash: hash(JSON.stringify(evidence)), affectedFiles, affectedPlugins, unresolvedImports: unresolved };
}
export async function prepareServiceImplementation(context, input) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    const inspected = await inspectImplementation(context, input.implementationPath);
    const content = applyEdits(inspected.before.content, input.edits);
    if (declarations(context.root, inspected.file, inspected.before.content) !== declarations(context.root, inspected.file, content))
        throw new Error("SERVICE_CONTRACT_TOOL_REQUIRED: implementation edits must preserve public declarations");
    if (content === inspected.before.content)
        return { status: "already_current", changed: false };
    const id = hash(JSON.stringify({ project: context.root, thread: context.threadId, run: context.activity.runId, file: inspected.file,
        sourceHash: inspected.before.hash, content, evidenceHash: inspected.evidenceHash, impactSummary: input.impactSummary }));
    let plan = store(context).get(id);
    if (!plan) {
        plan = { id, file: inspected.file, content, sourceHash: inspected.before.hash, evidenceHash: inspected.evidenceHash, status: "ready" };
        store(context).set(id, plan);
    }
    if (plan.status === "applied")
        throw new Error("SERVICE_IMPLEMENTATION_PLAN_CONSUMED");
    return { status: "ready", planId: id, implementationPath: input.implementationPath,
        affectedFiles: inspected.affectedFiles, affectedPlugins: inspected.affectedPlugins,
        unresolvedImports: inspected.unresolvedImports, verificationRequired: true };
}
export async function applyServiceImplementation(context, input) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    const plan = store(context).get(input.planId);
    if (!plan || plan.status !== "ready")
        throw new Error("SERVICE_IMPLEMENTATION_PLAN_INVALID");
    const source = await sourceRoot(context.root);
    const inspected = await inspectImplementation(context, plan.file.slice(source.length + 1));
    if (inspected.file !== plan.file || inspected.before.hash !== plan.sourceHash || inspected.evidenceHash !== plan.evidenceHash)
        throw new Error("SERVICE_IMPLEMENTATION_PLAN_STALE: inspect and propose again");
    await context.validation.ensureBaseline();
    const result = await commitBatch(context, [{ path: plan.file, before: inspected.before, content: plan.content }]);
    plan.status = "applied";
    return { ...result, status: "applied", verificationRequired: true };
}
//# sourceMappingURL=service-implementation-tools.js.map