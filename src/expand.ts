export const default_paths = ['components', 'schemas'];

export const default_sort_order = [
  '$id',
  '$schema',
  'type',
  'role',
  'name',
  'title',
  'description'
];

export const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export const sortKeys = (schema: any, order: string[] = default_sort_order): any => {
  const walk = obj => {
    if (Array.isArray(obj)) {
      return obj.map(item => walk(item));
    }

    if (isObject(obj)) {
      const sortedObj = {};

      // Apply sort order first
      for (const key of order) {
        if (obj.hasOwnProperty(key)) {
          sortedObj[key] = walk(obj[key]);
        }
      }

      // Then add remaining keys
      for (const [key, value] of Object.entries(obj)) {
        if (!order.includes(key)) {
          sortedObj[key] = walk(value);
        }
      }

      return sortedObj;
    }

    return obj;
  };

  // Only sort properties if they exist
  if (schema.properties) {
    const keys = Object.keys(schema.properties).sort();
    const properties = {};

    for (const key of keys) {
      properties[key] = schema.properties[key];
    }

    schema.properties = properties;
  }

  return walk(schema);
};

export const getDefName = (ref: string) => {
  const parts = ref.split('/');
  const name = parts[parts.length - 1];
  return name
    .split(/[-_.]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
};

const escapePaths = (paths: string[]) => paths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export const convertToDefRef = (ref: string, regex = /^#\/(components|schemas)\//) => {
  if (regex.test(ref)) {
    return `#/definitions/${getDefName(ref)}`;
  }
  return ref;
};

export const resolveRef = (schema: any, ref: string) => {
  const parts = ref.slice(2).split('/');

  let value = schema;
  for (const part of parts) {
    value = value[part];

    if (!value) {
      break;
    }
  }

  return value;
};

export interface ExpandOptions {
  paths?: string[];
  sortOrder?: string[];
}

export const expandSchema = (schema: any, definitions: any = {}, options: ExpandOptions = {}) => {
  const paths = options?.paths || default_paths;
  const regex = new RegExp(`^#/(${escapePaths(paths).join('|')})/`);

  const cache = new Map();
  const defs = {};

  // eslint-disable-next-line complexity
  const expand = (schema: any, isRoot = false) => {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Handle if/then/else schemas
    if (schema.if && schema.then) {
      schema.if = expand(schema.if);
      schema.then = expand(schema.then);

      if (schema.else) {
        schema.else = expand(schema.else);
      }
    }

    // Handle nullable properties
    if (schema.nullable) {
      if (schema.oneOf) {
        let hasNull = false;
        for (let i = 0; i < schema.oneOf.length; i++) {
          if (schema.oneOf[i].type === 'null') {
            hasNull = true;
            break;
          }
        }
        if (!hasNull) {
          schema.oneOf.unshift({ type: 'null' });
        }
      } else if (schema.anyOf) {
        let hasNull = false;
        for (let i = 0; i < schema.anyOf.length; i++) {
          if (schema.anyOf[i].type === 'null') {
            hasNull = true;
            break;
          }
        }
        if (!hasNull) {
          schema.anyOf.unshift({ type: 'null' });
        }
      } else if (schema.type) {
        const types = Array.isArray(schema.type) ? [...schema.type] : [schema.type];
        let hasNull = false;
        for (let i = 0; i < types.length; i++) {
          if (types[i] === 'null') {
            hasNull = true;
            break;
          }
        }
        if (!hasNull) {
          types.push('null');
        }
        schema.type = types;
      }
      delete schema.nullable;
    }

    // Handle discriminator mappings
    if (schema.discriminator?.mapping) {
      const newMapping = {};
      const keys = Object.keys(schema.discriminator.mapping);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        newMapping[key] = convertToDefRef(schema.discriminator.mapping[key], regex);
      }
      schema.discriminator.mapping = newMapping;
    }

    // Handle additional mapping property
    if (schema.mapping) {
      const newMapping = {};
      const keys = Object.keys(schema.mapping);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        newMapping[key] = convertToDefRef(schema.mapping[key], regex);
      }
      schema.mapping = newMapping;
    }

    // Handle $ref resolution
    if (schema.$ref) {
      const originalRef = schema.$ref;

      // For root object, expand it fully
      if (isRoot) {
        const resolvedRef = resolveRef(definitions, originalRef);
        const rest = { ...schema };
        delete rest.$ref;
        return expand({ ...rest, ...resolvedRef }, true);
      }

      // Convert to definition ref
      const newRef = convertToDefRef(originalRef, regex);

      // Check cache or create new definition
      if (cache.has(originalRef)) {
        return { $ref: cache.get(originalRef) };
      }

      cache.set(originalRef, newRef);

      // Only create the definition if it doesn't exist
      const defName = getDefName(originalRef);
      if (!defs[defName]) {
        const resolvedRef = resolveRef(definitions, originalRef);
        const rest = { ...schema };
        delete rest.$ref;
        defs[defName] = expand({ ...rest, ...resolvedRef });
      }

      return { $ref: newRef };
    }

    // Handle arrays
    if (Array.isArray(schema)) {
      const result = [];
      for (let i = 0; i < schema.length; i++) {
        const item = schema[i];
        if (item && typeof item === 'object') {
          result.push(expand(item));
        } else {
          result.push(item);
        }
      }
      return result;
    }

    // Handle nested objects
    const result = { ...schema };
    const keys = Object.keys(result);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = result[key];

      if (value && typeof value === 'object') {
        result[key] = expand(value);
      }
    }

    return result;
  };

  const expanded = expand(schema, true);

  if (Object.keys(defs).length > 0) {
    expanded.definitions = { ...expanded.definitions, ...defs };
  }

  return sortKeys(expanded, options?.sortOrder);
};

export default expandSchema;
