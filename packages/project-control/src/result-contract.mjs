import contract from '../../../contracts/creator/project-control.schema.json' with { type: 'json' };
import inventory from '../../../contracts/creator/project-control.operations.json' with { type: 'json' };

const resultDefs = new Map(inventory.operations.map(entry => [entry.name, entry.resultDef]));
const supported = new Set(['$ref', 'description', 'type', 'const', 'enum', 'oneOf', 'anyOf', 'allOf', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);

// Deliberately limited to the canonical Result vocabulary. Fail closed when a
// contract author introduces a keyword this development-only validator lacks.
function assertSupported(schema, seen = new Set()) {
  if (typeof schema === 'boolean') return;
  for (const key of Object.keys(schema)) {
    if (!supported.has(key)) throw new Error(`Unsupported result contract keyword: ${key}`);
  }
  if (schema.$ref) {
    const name = schema.$ref.replace('#/$defs/', '');
    if (!schema.$ref.startsWith('#/$defs/') || !contract.$defs[name]) throw new Error(`Unknown result contract reference: ${schema.$ref}`);
    if (!seen.has(name)) {
      seen.add(name);
      assertSupported(contract.$defs[name], seen);
    }
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) for (const branch of schema[key] ?? []) assertSupported(branch, seen);
  for (const property of Object.values(schema.properties ?? {})) assertSupported(property, seen);
  if (schema.items) assertSupported(schema.items, seen);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') assertSupported(schema.additionalProperties, seen);
}
for (const name of resultDefs.values()) assertSupported(contract.$defs[name]);

function validate(schema, value, location = '$') {
  const fail = message => { throw new Error(`${location}: ${message}`); };
  if (schema === false) fail('value is forbidden');
  if (schema === true) return;
  if (schema.$ref) validate(contract.$defs[schema.$ref.replace('#/$defs/', '')], value, location);
  if ('const' in schema && value !== schema.const) fail('unexpected constant');
  if (schema.enum && !schema.enum.includes(value)) fail('unexpected enum value');
  for (const branch of schema.allOf ?? []) validate(branch, value, location);
  for (const keyword of ['oneOf', 'anyOf']) {
    if (!schema[keyword]) continue;
    let matches = 0;
    for (const branch of schema[keyword]) {
      try { validate(branch, value, location); matches++; } catch { /* Try the next alternative. */ }
    }
    if (matches === 0 || (keyword === 'oneOf' && matches !== 1)) fail(`does not match ${keyword}`);
  }
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  if (schema.type) {
    const matches = schema.type === 'object' ? isObject
      : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'integer' ? Number.isInteger(value)
      : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === schema.type;
    if (!matches) fail(`expected ${schema.type}`);
  }
  if (isObject) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties ?? {}, key)) validate(schema.properties[key], child, `${location}.${key}`);
      else if (schema.additionalProperties === false) fail(`unknown property ${key}`);
      else if (typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, child, `${location}.${key}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('too few items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('too many items');
    if (schema.items) value.forEach((child, index) => validate(schema.items, child, `${location}[${index}]`));
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) fail('string too short');
    if (schema.maxLength !== undefined && length > schema.maxLength) fail('string too long');
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail('string pattern mismatch');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('number too small');
    if (schema.maximum !== undefined && value > schema.maximum) fail('number too large');
  }
}

export function validateProjectControlResult(operation, result) {
  const definition = resultDefs.get(operation);
  if (!definition) throw new Error('Unknown ProjectControl operation.');
  // Match the serialized wire value: producers may have optional undefined
  // properties that JSON omits. Do not mutate the producer's result.
  validate(contract.$defs[definition], JSON.parse(JSON.stringify(result)));
}
