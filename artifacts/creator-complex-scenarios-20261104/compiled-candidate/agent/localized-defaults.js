import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { API } from "typescript/unstable/sync";
import { SyntaxKind } from "typescript/unstable/ast";
import { isBinaryExpression, isBindingElement, isIdentifier, isImportDeclaration, isJsxAttribute, isJsxExpression, isJsxOpeningElement, isJsxSelfClosingElement, isNamedImports, isNoSubstitutionTemplateLiteral, isParenthesizedExpression, isStringLiteral, isVariableDeclaration, isObjectLiteralExpression, isPropertyAssignment, isShorthandPropertyAssignment, isPropertyAccessExpression, isElementAccessExpression, isAsExpression, isSatisfiesExpression, isNonNullExpression } from "typescript/unstable/ast/is";
export function snapshotPath(file, paths = path, realpath = realpathSync.native) {
    try {
        return paths.normalize(realpath(file));
    }
    catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes(error.code ?? ""))
            throw error;
        return paths.resolve(file);
    }
}
function copies(source, checker, contracts) {
    const components = new Map();
    for (const statement of source.statements) {
        if (!isImportDeclaration(statement) || !isStringLiteral(statement.moduleSpecifier))
            continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !isNamedImports(bindings))
            continue;
        for (const binding of bindings.elements) {
            const defaults = contracts[statement.moduleSpecifier.text]?.[(binding.propertyName ?? binding.name).text]?.localizedDefaults;
            if (defaults)
                components.set(binding.name.text, defaults);
        }
    }
    const literal = (expression, members = [], seen = new Set()) => {
        if (seen.has(expression))
            return undefined;
        seen.add(expression);
        if (!members.length && (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)))
            return expression.text;
        if (isParenthesizedExpression(expression) || isAsExpression(expression) || isSatisfiesExpression(expression) || isNonNullExpression(expression))
            return literal(expression.expression, members, seen);
        if (isPropertyAccessExpression(expression))
            return literal(expression.expression, [expression.name.text, ...members], seen);
        if (isElementAccessExpression(expression) && expression.argumentExpression && isStringLiteral(expression.argumentExpression))
            return literal(expression.expression, [expression.argumentExpression.text, ...members], seen);
        if (isBinaryExpression(expression) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(expression.operatorToken.kind))
            return literal(expression.right, members, seen);
        if (members.length && isObjectLiteralExpression(expression)) {
            const property = expression.properties.find(property => (isPropertyAssignment(property) || isShorthandPropertyAssignment(property)) &&
                (isStringLiteral(property.name) ? property.name.text : property.name.getText(source)) === members[0]);
            if (property && isPropertyAssignment(property))
                return literal(property.initializer, members.slice(1), seen);
            if (property && isShorthandPropertyAssignment(property) && isIdentifier(property.name))
                return literal(property.name, members.slice(1), seen);
            return undefined;
        }
        if (!isIdentifier(expression))
            return undefined;
        const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration?.resolve();
        if (!declaration || declaration.getSourceFile() !== source)
            return undefined;
        return (isVariableDeclaration(declaration) || isBindingElement(declaration)) && declaration.initializer
            ? literal(declaration.initializer, members, seen) : undefined;
    };
    const found = [];
    const visit = (node) => {
        if (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) {
            const defaults = components.get(node.tagName.getText(source));
            if (defaults)
                for (const attribute of node.attributes.properties) {
                    if (!isJsxAttribute(attribute))
                        continue;
                    const attributeName = attribute.name.getText(source);
                    if (!attribute.initializer)
                        continue;
                    const expression = isJsxExpression(attribute.initializer) ? attribute.initializer.expression : attribute.initializer;
                    for (const [property, namespace] of Object.entries(defaults)) {
                        const [head, ...members] = property.split(".");
                        if (head !== attributeName)
                            continue;
                        const value = expression ? literal(expression, members) : undefined;
                        if (value?.trim())
                            found.push({ property, namespace, value, line: source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1 });
                    }
                }
        }
        node.forEachChild(visit);
    };
    visit(source);
    return found;
}
/** Delta check for package-declared locale defaults, not a ban on UI/business strings. */
export async function inspectLocalizedDefaults(root, changes) {
    const files = changes.filter(file => /\.[jt]sx$/iu.test(file.path) && file.before !== file.after);
    if (!files.length)
        return [];
    let contracts;
    try {
        const catalog = createRequire(path.join(root, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
        contracts = JSON.parse(await readFile(catalog, "utf8")).publicComponents?.modules ?? {};
    }
    catch (error) {
        if (["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"].includes(error.code ?? ""))
            return [];
        throw error;
    }
    if (!Object.values(contracts).some(module => Object.values(module).some(component => component.localizedDefaults)))
        return [];
    const paths = files.map(file => path.resolve(root, file.path));
    const collect = (before) => {
        const contents = new Map(files.map((file, index) => [snapshotPath(paths[index]), before ? file.before : file.after]));
        // In-memory snapshots preserve the user's filesystem and include the exact
        // baseline text, even for newly created files. Native paths stay native.
        const api = new API({ cwd: root, fs: { readFile: file => contents.get(snapshotPath(file)),
                fileExists: file => contents.has(snapshotPath(file)) ? true : undefined } });
        try {
            const snapshot = api.updateSnapshot({ openFiles: paths });
            try {
                return paths.map(file => {
                    const project = snapshot.getDefaultProjectForFile(file), source = project?.program.getSourceFile(file);
                    if (!project || !source || source.text !== contents.get(snapshotPath(file)))
                        throw new Error("LOCALIZED_DEFAULT_INSPECTION_UNAVAILABLE");
                    return copies(source, project.checker, contracts);
                });
            }
            finally {
                snapshot.dispose();
            }
        }
        finally {
            api.close();
        }
    };
    const baseline = collect(true), current = collect(false), issues = [];
    for (const [index, observed] of current.entries()) {
        const counts = new Map();
        const key = (copy) => JSON.stringify([copy.property, copy.namespace, copy.value]);
        for (const copy of baseline[index] ?? [])
            counts.set(key(copy), (counts.get(key(copy)) ?? 0) + 1);
        for (const copy of observed) {
            const remaining = counts.get(key(copy)) ?? 0;
            if (remaining) {
                counts.set(key(copy), remaining - 1);
                continue;
            }
            issues.push({ ...copy, path: files[index].path, code: "LOCALIZED_DEFAULT_REQUIRED",
                message: `New fixed ${copy.property} overrides the existing ${copy.namespace} locale default, including language changes and Host locale overrides. Put project defaults in the existing domain locale configuration with en-US/zh-CN parity; preserve Host field overrides. Dynamic controlled values and ordinary business data are not rejected by this check.` });
        }
    }
    return issues;
}
//# sourceMappingURL=localized-defaults.js.map