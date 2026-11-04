import { readFile } from "node:fs/promises";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
export async function agentContracts(directory) {
    const document = JSON.parse(await readFile(path.join(directory, "agent-tools.schema.json"), "utf8"));
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validators = new Map();
    function expanded(value, owner, stack = new Set()) {
        if (Array.isArray(value))
            return value.map(item => expanded(item, owner, stack));
        if (!value || typeof value !== "object")
            return value;
        if (value.$ref) {
            if (stack.has(value.$ref))
                throw new Error("CREATOR_AGENT_SCHEMA_RECURSIVE");
            const target = value.$ref.split("/").slice(1).reduce((item, key) => item[key], owner);
            if (!target)
                throw new Error("CREATOR_AGENT_SCHEMA_REFERENCE_INVALID");
            return expanded(target, owner, new Set([...stack, value.$ref]));
        }
        return Object.fromEntries(Object.entries(value).filter(([key]) => !["$schema", "$defs", "discriminator", "title"].includes(key)).map(([key, child]) => [key, expanded(child, owner, stack)]));
    }
    return {
        schema(name) {
            const schema = document.$defs[name];
            if (!schema)
                throw new Error(`CREATOR_AGENT_SCHEMA_MISSING: ${name}`);
            return expanded(schema, schema);
        },
        validate(name, value) {
            let validate = validators.get(name);
            if (!validate) {
                const schema = document.$defs[name];
                if (!schema)
                    throw new Error("CREATOR_AGENT_SCHEMA_MISSING");
                validate = ajv.compile(schema);
                validators.set(name, validate);
            }
            if (!validate(value))
                throw Object.assign(new Error("CREATOR_TOOL_INPUT_INVALID"), { details: validate.errors?.map(error => ({ path: error.instancePath, keyword: error.keyword })) });
        },
    };
}
//# sourceMappingURL=contracts.js.map