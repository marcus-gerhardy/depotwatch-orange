// Minimal JSON-Schema validator: the subset the schemas under `config/` use
// (type, enum, const, required, properties, additionalProperties,
// propertyNames, minProperties, items, minItems, uniqueItems, minLength,
// maxLength, pattern, and $ref into $defs).
//
// Shared by the config validators (`npm run presets:validate`,
// `npm run feeds:validate`) so that each schema stays the single source of
// truth for its own files rather than being restated in JavaScript once per
// script. A validator library would be a build dependency for a few hundred
// lines of JSON; this stays in the repository, where it can be read.

export function resolveRef(ref, schema) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => node[key], schema);
}

export function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

/** Collect every violation (not just the first): a contributor wants the list. */
export function validate(value, node, root, path, errors) {
  if (node.$ref) {
    validate(value, resolveRef(node.$ref, root), root, path, errors);
    // A sibling of $ref (description) carries no constraints in this schema.
  }

  if (node.const !== undefined && value !== node.const) {
    errors.push(`${path || "/"}: must be ${JSON.stringify(node.const)}`);
    return;
  }
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path || "/"}: must be one of ${node.enum.map((v) => JSON.stringify(v)).join(", ")}`);
    return;
  }
  if (node.type && !matchesType(value, node.type)) {
    errors.push(`${path || "/"}: expected ${node.type}, got ${typeOf(value)}`);
    return;
  }

  if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) {
      errors.push(`${path}: shorter than ${node.minLength} characters`);
    }
    if (node.maxLength !== undefined && value.length > node.maxLength) {
      errors.push(`${path}: longer than ${node.maxLength} characters`);
    }
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      errors.push(`${path}: does not match ${node.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${path}: needs at least ${node.minItems} entries`);
    }
    if (node.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(`${path}: has duplicate entries`);
    }
    if (node.items) {
      value.forEach((item, i) => validate(item, node.items, root, `${path}[${i}]`, errors));
    }
  }

  if (typeOf(value) === "object") {
    for (const key of node.required ?? []) {
      if (value[key] === undefined) errors.push(`${path || "/"}: missing "${key}"`);
    }
    if (node.minProperties !== undefined && Object.keys(value).length < node.minProperties) {
      errors.push(`${path || "/"}: needs at least ${node.minProperties} entries`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (node.propertyNames) {
        validate(key, node.propertyNames, root, `${childPath} (key)`, errors);
      }
      const propSchema = node.properties?.[key];
      if (propSchema) {
        validate(child, propSchema, root, childPath, errors);
      } else if (node.additionalProperties === false) {
        errors.push(`${childPath}: unknown field`);
      } else if (typeOf(node.additionalProperties) === "object") {
        validate(child, node.additionalProperties, root, childPath, errors);
      }
    }
  }
}
