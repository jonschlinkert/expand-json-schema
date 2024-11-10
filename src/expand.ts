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

      for (const key of order) {
        if (obj.hasOwnProperty(key)) {
          sortedObj[key] = walk(obj[key]);
        }
      }

      for (const [key, value] of Object.entries(obj)) {
        if (!order.includes(key)) {
          sortedObj[key] = walk(value);
        }
      }

      return sortedObj;
    }

    return obj;
  };

  const keys = Object.keys(schema.properties).sort();
  const properties = {};

  for (const key of keys) {
    properties[key] = schema.properties[key];
  }

  schema.properties = properties;
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

export const convertToDefRef = (ref: string) => {
  if (ref.startsWith('#/components/')) {
    const defName = getDefName(ref);
    return `#/definitions/${defName}`;
  }
  return ref;
};

export const resolveRef = (schema, ref: string) => {
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

export const expandSchema = (prop: any, schema: any, options) => {
  const cache = new Map();
  const defs = {};

  // eslint-disable-next-line complexity
  const expand = (prop: any, isRoot = false) => {
    if (!prop || typeof prop !== 'object') {
      return prop;
    }

    // Handle nullable properties
    if (prop.nullable) {
      if (prop.oneOf) {
        let hasNull = false;
        for (let i = 0; i < prop.oneOf.length; i++) {
          if (prop.oneOf[i].type === 'null') {
            hasNull = true;
            break;
          }
        }
        if (!hasNull) {
          prop.oneOf.unshift({ type: 'null' });
        }
      } else if (prop.anyOf) {
        let hasNull = false;
        for (let i = 0; i < prop.anyOf.length; i++) {
          if (prop.anyOf[i].type === 'null') {
            hasNull = true;
            break;
          }
        }
        if (!hasNull) {
          prop.anyOf.unshift({ type: 'null' });
        }
      } else if (prop.type) {
        const types = Array.isArray(prop.type) ? [...prop.type] : [prop.type];
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
        prop.type = types;
      }
      delete prop.nullable;
    }

    // Handle discriminator mappings
    if (prop.discriminator?.mapping) {
      const newMapping = {};
      const keys = Object.keys(prop.discriminator.mapping);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        newMapping[key] = convertToDefRef(prop.discriminator.mapping[key]);
      }
      prop.discriminator.mapping = newMapping;
    }

    // Handle additional mapping property
    if (prop.mapping) {
      const newMapping = {};
      const keys = Object.keys(prop.mapping);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        newMapping[key] = convertToDefRef(prop.mapping[key]);
      }
      prop.mapping = newMapping;
    }

    // Handle $ref resolution
    if (prop.$ref) {
      const originalRef = prop.$ref;

      // For root object, expand it fully
      if (isRoot) {
        const resolvedRef = resolveRef(schema, originalRef);
        const rest = { ...prop };
        delete rest.$ref;
        return expand({ ...rest, ...resolvedRef }, true);
      }

      // Convert to definition ref
      const newRef = convertToDefRef(originalRef);

      // For nested refs, check cache or create new definition
      if (cache.has(originalRef)) {
        return { $ref: cache.get(originalRef) };
      }

      cache.set(originalRef, newRef);

      // Only create the definition if it doesn't exist
      const defName = getDefName(originalRef);
      if (!defs[defName]) {
        const resolvedRef = resolveRef(schema, originalRef);
        const rest = { ...prop };
        delete rest.$ref;
        defs[defName] = expand({ ...rest, ...resolvedRef });
      }

      return { $ref: newRef };
    }

    // Handle arrays
    if (Array.isArray(prop)) {
      const result = [];
      for (let i = 0; i < prop.length; i++) {
        const item = prop[i];
        if (item && typeof item === 'object') {
          result.push(expand(item));
        } else {
          result.push(item);
        }
      }
      return result;
    }

    // Handle nested objects
    const result = { ...prop };
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

  const expanded = expand(prop, true);

  if (Object.keys(defs).length > 0) {
    expanded.definitions = { ...expanded.definitions, ...defs };
  }

  return sortKeys(expanded, options?.sortOrder);
};
