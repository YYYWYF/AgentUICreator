import path from "node:path";

import type { AppUIModel } from "../../framework/contracts/app-ui-model";
import type { Node, ObjectLiteralExpression } from "typescript/unstable/ast";
import {
  isArrayLiteralExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteralLikeNode,
} from "typescript/unstable/ast/is";
import { API, SymbolFlags, type Project } from "typescript/unstable/sync";

import type {
  InspectedServicePlugin,
  PluginAsset,
  PluginServiceDeclaration,
  ProjectIssue,
  UIServiceDependencyInspection,
} from "./types";

type ServiceProperty = "provides" | "inject" | "optionalInject";

interface AnalyzedDeclarations {
  plugins: PluginServiceDeclaration[];
  issues: ProjectIssue[];
  seamPaths: Map<string, Set<string>>;
}

function projectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function propertyName(node: Node): string | undefined {
  return isIdentifier(node) || isStringLiteralLikeNode(node)
    ? node.text
    : undefined;
}

function findPluginDefinition(
  sourceFile: Node,
): ObjectLiteralExpression | undefined {
  let match: ObjectLiteralExpression | undefined;
  const visit = (node: Node): void => {
    if (match !== undefined) return;
    if (isObjectLiteralExpression(node)) {
      const names = new Set(
        node.properties.map((property) =>
          "name" in property ? propertyName(property.name) : undefined,
        ),
      );
      if (names.has("manifest") && names.has("Component")) {
        match = node;
        return;
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return match;
}

function recordServiceSeam(
  projectRoot: string,
  project: Project,
  node: Node,
  serviceName: string,
  seamPaths: Map<string, Set<string>>,
): void {
  const symbol = project.checker.getSymbolAtLocation(node);
  if (symbol === undefined) return;
  const resolved = (symbol.flags & SymbolFlags.Alias) === 0
    ? symbol
    : project.checker.getAliasedSymbol(symbol);
  const paths = seamPaths.get(serviceName) ?? new Set<string>();
  for (const declaration of resolved.declarations) {
    const relativePath = projectPath(projectRoot, declaration.path);
    if (relativePath.startsWith("services/")) {
      paths.add(relativePath);
    }
  }
  if (paths.size > 0) seamPaths.set(serviceName, paths);
}

function parseServiceProperty(
  projectRoot: string,
  project: Project,
  definition: ObjectLiteralExpression,
  pluginId: string,
  property: ServiceProperty,
  seamPaths: Map<string, Set<string>>,
  issues: ProjectIssue[],
): string[] {
  const member = definition.properties.find(
    (candidate) =>
      "name" in candidate && propertyName(candidate.name) === property,
  );
  if (member === undefined) return [];
  if (!isPropertyAssignment(member) || !isArrayLiteralExpression(member.initializer)) {
    issues.push({
      code: "plugin-service-declaration-unresolved",
      message: `UI plugin "${pluginId}" has a ${property} declaration that TypeScript static analysis cannot resolve.`,
      pluginId,
      property,
    });
    return [];
  }

  const names: string[] = [];
  for (const element of member.initializer.elements) {
    const type = project.checker.getTypeAtLocation(element);
    if (type === undefined || !type.isStringLiteralType()) {
      issues.push({
        code: "plugin-service-declaration-unresolved",
        message: `UI plugin "${pluginId}" has a ${property} entry that TypeScript static analysis cannot resolve to a Service Name literal.`,
        pluginId,
        property,
      });
      return [];
    }
    names.push(type.value);
    recordServiceSeam(projectRoot, project, element, type.value, seamPaths);
  }
  return names;
}

export function analyzePluginServiceDeclarations(
  projectRoot: string,
  assets: readonly PluginAsset[],
): AnalyzedDeclarations {
  const definitionPaths = assets.map((asset) =>
    path.join(projectRoot, asset.definitionPath),
  );
  const api = new API();
  const configFilePath = path.join(projectRoot, "tsconfig.json");
  const snapshot = api.updateSnapshot({
    openProjects: [configFilePath],
    openFiles: definitionPaths,
  });
  const plugins: PluginServiceDeclaration[] = [];
  const issues: ProjectIssue[] = [];
  const seamPaths = new Map<string, Set<string>>();

  try {
    assets.forEach((asset, index) => {
      const definitionPath = definitionPaths[index];
      if (definitionPath === undefined) return;
      const project = snapshot.getDefaultProjectForFile(definitionPath);
      const sourceFile = project?.program.getSourceFile(definitionPath);
      if (project === undefined || sourceFile === undefined) {
        issues.push({
          code: "plugin-service-definition-unresolved",
          message: `${asset.definitionPath} is not part of the TypeScript project.`,
          pluginId: asset.pluginId,
        });
        return;
      }
      if (project.program.getSyntacticDiagnostics(definitionPath).length > 0) {
        issues.push({
          code: "plugin-service-definition-unresolved",
          message: `${asset.definitionPath} contains TypeScript syntax errors.`,
          pluginId: asset.pluginId,
        });
        return;
      }
      const definition = findPluginDefinition(sourceFile);
      if (definition === undefined) {
        issues.push({
          code: "plugin-service-definition-unresolved",
          message: `${asset.definitionPath} does not contain a statically analyzable UIPluginDefinition.`,
          pluginId: asset.pluginId,
        });
        return;
      }
      const provides = parseServiceProperty(
          projectRoot,
          project,
          definition,
          asset.pluginId,
          "provides",
          seamPaths,
          issues,
        );
      const inject = parseServiceProperty(
          projectRoot,
          project,
          definition,
          asset.pluginId,
          "inject",
          seamPaths,
          issues,
        );
      const optionalInject = parseServiceProperty(
          projectRoot,
          project,
          definition,
          asset.pluginId,
          "optionalInject",
          seamPaths,
          issues,
        );
      const pairs: Array<readonly [ServiceProperty, string[], ServiceProperty, string[]]> = [
        ["provides", provides, "inject", inject],
        ["provides", provides, "optionalInject", optionalInject],
        ["inject", inject, "optionalInject", optionalInject],
      ];
      for (const [leftName, left, rightName, right] of pairs) {
        const overlap = left.find((name) => right.includes(name));
        if (overlap !== undefined) {
          issues.push({
            code: "plugin-service-declaration-overlap",
            message: `UI plugin "${asset.pluginId}" cannot both ${leftName === "provides" ? "provide" : leftName} and ${rightName} "${overlap}".`,
            pluginId: asset.pluginId,
            service: overlap,
          });
        }
      }
      plugins.push({
        pluginId: asset.pluginId,
        provides,
        inject,
        optionalInject,
      });
    });
  } finally {
    snapshot.dispose();
    api.close();
  }

  plugins.sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  return { plugins, issues, seamPaths };
}

function pluginState(
  pluginId: string,
  model: AppUIModel,
  asset: PluginAsset,
): InspectedServicePlugin {
  const instances = Object.values(model.pluginInstances)
    .filter((instance) => instance.pluginId === pluginId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((instance) => ({
      instanceId: instance.id,
      enabled: instance.enabled,
      activeCandidate:
        instance.enabled &&
        (instance.mount !== undefined || asset.capabilities.includes("headless")),
    }));
  return {
    pluginId,
    selected: instances.length > 0,
    instances,
  };
}

function hasActiveCandidate(plugin: InspectedServicePlugin): boolean {
  return plugin.instances.some((instance) => instance.activeCandidate);
}

export function inspectUIServiceDependencies(
  projectRoot: string,
  model: AppUIModel,
  assets: readonly PluginAsset[],
): UIServiceDependencyInspection {
  const declarations = analyzePluginServiceDeclarations(projectRoot, assets);
  const assetsByPluginId = new Map(
    assets.map((asset) => [asset.pluginId, asset]),
  );
  const serviceNames = new Set<string>();
  for (const plugin of declarations.plugins) {
    plugin.provides.forEach((name) => serviceNames.add(name));
    plugin.inject.forEach((name) => serviceNames.add(name));
    plugin.optionalInject.forEach((name) => serviceNames.add(name));
  }
  const issues = [...declarations.issues];
  const services = [...serviceNames].sort().map((name) => {
    const participants = (
      property: ServiceProperty,
    ): InspectedServicePlugin[] => declarations.plugins
      .filter((plugin) => plugin[property].includes(name))
      .flatMap((plugin) => {
        const asset = assetsByPluginId.get(plugin.pluginId);
        return asset === undefined
          ? []
          : [pluginState(plugin.pluginId, model, asset)];
      });
    const providers = participants("provides");
    const requiredConsumers = participants("inject");
    const optionalConsumers = participants("optionalInject");
    const activeProviderInstances = providers.flatMap((provider) =>
      provider.instances
        .filter((instance) => instance.activeCandidate)
        .map((instance) => instance.instanceId),
    );
    const hasActiveRequiredConsumer = requiredConsumers.some(hasActiveCandidate);
    const hasActiveOptionalConsumer = optionalConsumers.some(hasActiveCandidate);
    let status: UIServiceDependencyInspection["services"][number]["status"] =
      activeProviderInstances.length === 1 ? "available" : "inactive";
    if (activeProviderInstances.length > 1) {
      status = "provider-collision";
      issues.push({
        code: "service-provider-collision",
        message: `Service "${name}" has multiple active Provider candidates: ${activeProviderInstances.join(", ")}.`,
        service: name,
        providerInstances: activeProviderInstances,
      });
    } else if (activeProviderInstances.length === 0 && hasActiveRequiredConsumer) {
      status = "required-missing";
      issues.push({
        code: "required-service-missing",
        message: `Required Service "${name}" has no active Provider candidate.`,
        service: name,
      });
    } else if (activeProviderInstances.length === 0 && hasActiveOptionalConsumer) {
      status = "optional-unavailable";
    }

    const crossPlugin = providers.some((provider) =>
      [...requiredConsumers, ...optionalConsumers].some(
        (consumer) => consumer.pluginId !== provider.pluginId,
      ),
    );
    if (crossPlugin && (declarations.seamPaths.get(name)?.size ?? 0) === 0) {
      issues.push({
        code: "shared-service-seam-location",
        message: `Shared Service "${name}" must declare its stable Service Name and types under services/**.`,
        service: name,
      });
    }

    return {
      name,
      status,
      providers,
      requiredConsumers,
      optionalConsumers,
    };
  });

  return {
    services,
    plugins: declarations.plugins,
    issues,
  };
}
