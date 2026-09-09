export const LEGACY_PLUGIN_ID_MIGRATIONS = {
  "antd-x-sender": "agent-composer",
} as const;

export interface PersistedAppUIModelMigration {
  type: "plugin-id";
  instanceId: string;
  from: string;
  to: string;
}

export interface PersistedAppUIModelMigrationResult {
  input: unknown;
  migrations: PersistedAppUIModelMigration[];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function migratePersistedAppUIModelInput(
  input: unknown,
): PersistedAppUIModelMigrationResult {
  if (!isRecord(input) || !isRecord(input.pluginInstances)) {
    return { input, migrations: [] };
  }

  const migrations: PersistedAppUIModelMigration[] = [];
  let migratedPluginInstances: Record<string, unknown> | undefined;

  for (const [instanceId, instance] of Object.entries(input.pluginInstances)) {
    if (!isRecord(instance) || typeof instance.pluginId !== "string") {
      continue;
    }
    const canonicalPluginId =
      LEGACY_PLUGIN_ID_MIGRATIONS[
        instance.pluginId as keyof typeof LEGACY_PLUGIN_ID_MIGRATIONS
      ];
    if (canonicalPluginId === undefined) {
      continue;
    }

    migratedPluginInstances ??= { ...input.pluginInstances };
    migratedPluginInstances[instanceId] = {
      ...instance,
      pluginId: canonicalPluginId,
    };
    migrations.push({
      type: "plugin-id",
      instanceId,
      from: instance.pluginId,
      to: canonicalPluginId,
    });
  }

  return migratedPluginInstances === undefined
    ? { input, migrations }
    : {
        input: { ...input, pluginInstances: migratedPluginInstances },
        migrations,
      };
}
