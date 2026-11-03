import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
export async function checkOperatorContract() {
  const [inventoryText, schemaText, handler] = await Promise.all([
    read('packages/creator/contracts/creator/operator.operations.json'),
    read('packages/creator/contracts/creator/operator.schema.json'),
    read('packages/creator/operator/src/handler.ts'),
  ]);
  const inventory = JSON.parse(inventoryText);
  const schema = JSON.parse(schemaText);
  const names = inventory.operations.map(entry => entry.name).sort();
  assert.equal(new Set(names).size, names.length, 'Duplicate inventory operation');
  const setEqual = (actual, label) => assert.deepEqual([...new Set(actual)].sort(), names, label);
  const branches = schema.$defs.request.oneOf;
  setEqual(branches.flatMap(branch => branch.properties.operation.enum ?? [branch.properties.operation.const]), 'JSON Schema operation drift');
  const requestBlock = handler.split('export const requestSchema =')[1]?.split('type UIOperatorRequest')[0] ?? '';
  setEqual([...requestBlock.matchAll(/operation:\s*z\.literal\("([^"]+)"\)/g)].map(match => match[1]), 'Zod operation drift');
  const execution = handler.split('async function executeRequest(')[1]?.split('function failure(')[0] ?? '';
  setEqual([...execution.matchAll(/case "([^"]+)":/g)].map(match => match[1]), 'Host execution coverage drift');
  for (const entry of inventory.operations) {
    assert(['read', 'mutation'].includes(entry.kind));
    assert.equal(typeof entry.agentExposed, 'boolean');
    assert(schema.$defs[entry.inputDef], `Missing input def ${entry.inputDef}`);
    assert(schema.$defs[entry.resultDef], `Missing result def ${entry.resultDef}`);
    const branch = branches.find(branch => branch.properties.operation.const === entry.name);
    assert.equal(branch?.properties.input.$ref, `#/$defs/${entry.inputDef}`, `Input binding drift: ${entry.name}`);
    assert(schema.$defs.response.oneOf[0].properties.result.anyOf.some(ref => ref.$ref === `#/$defs/${entry.resultDef}`), `Missing response result def: ${entry.name}`);
  }

}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkOperatorContract();
  process.stdout.write('Operator contract inventory is aligned.\n');
}
