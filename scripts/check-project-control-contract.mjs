import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
export async function checkProjectControlContract() {
  const [inventoryText, schemaText, handler, models, readTools, mutationTool, policy] = await Promise.all([
    read('contracts/creator/project-control.operations.json'),
    read('contracts/creator/project-control.schema.json'),
    read('packages/project-control/src/handler.ts'),
    read('packages/creator-python/agent_ui_creator/project_control/models.py'),
    read('packages/creator-python/agent_ui_creator/domain_tools/project_control_tools.py'),
    read('packages/creator-python/agent_ui_creator/app_ui_model/mutation_tool.py'),
    read('packages/creator-python/agent_ui_creator/domain_agent/tool_policy.py'),
  ]);
  const inventory = JSON.parse(inventoryText);
  const schema = JSON.parse(schemaText);
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.protocolVersion, 3);
  const names = inventory.operations.map(entry => entry.name).sort();
  assert.equal(new Set(names).size, names.length, 'Duplicate inventory operation');
  const setEqual = (actual, label) => assert.deepEqual([...new Set(actual)].sort(), names, label);
  const branches = schema.$defs.request.oneOf;
  setEqual(branches.flatMap(branch => branch.properties.operation.enum ?? [branch.properties.operation.const]), 'JSON Schema operation drift');
  const requestBlock = handler.split('export const requestSchema =')[1]?.split('type UIProjectControlRequest')[0] ?? '';
  setEqual([...requestBlock.matchAll(/operation:\s*z\.literal\("([^"]+)"\)/g)].map(match => match[1]), 'Zod operation drift');
  const execution = handler.split('async function executeRequest(')[1]?.split('function failure(')[0] ?? '';
  setEqual([...execution.matchAll(/case "([^"]+)":/g)].map(match => match[1]), 'Host execution coverage drift');
  const literalGroups = [...models.matchAll(/(Read|Mutation|Internal)ProjectControlOperation: TypeAlias = Literal\[([\s\S]*?)\]/g)];
  setEqual(literalGroups.flatMap(match => [...match[2].matchAll(/"([^"]+)"/g)].map(value => value[1])), 'Python operation drift');
  const mutations = literalGroups.find(match => match[1] === 'Mutation')?.[2] ?? '';
  for (const entry of inventory.operations) {
    assert(['read', 'mutation'].includes(entry.kind));
    assert.equal(typeof entry.agentExposed, 'boolean');
    assert(schema.$defs[entry.inputDef], `Missing input def ${entry.inputDef}`);
    assert(schema.$defs[entry.resultDef], `Missing result def ${entry.resultDef}`);
    const branch = branches.find(branch => branch.properties.operation.const === entry.name);
    assert.equal(branch?.properties.input.$ref, `#/$defs/${entry.inputDef}`, `Input binding drift: ${entry.name}`);
    assert.equal(mutations.includes(`"${entry.name}"`), entry.kind === 'mutation', `Operation kind drift: ${entry.name}`);
    assert(schema.$defs.response.oneOf[0].properties.result.anyOf.some(ref => ref.$ref === `#/$defs/${entry.resultDef}`), `Missing response result def: ${entry.name}`);
  }
  const exposed = [...(readTools + mutationTool).matchAll(/@tool\(\s*"([^"]+)"/g)].map(match => match[1]).filter(name => names.includes(name)).sort();
  assert.deepEqual(exposed, inventory.operations.filter(entry => entry.agentExposed).map(entry => entry.name).sort(), 'Agent Tool exposure drift');
  const writeNames = policy.split('DOMAIN_WRITE_TOOL_NAMES = (')[1]?.split(')')[0] ?? '';
  assert(!writeNames.includes('remove_agent_ui_source_items'), 'Internal remove capability must not be an Agent write tool');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkProjectControlContract();
  process.stdout.write('ProjectControl v3 inventory is aligned.\n');
}
