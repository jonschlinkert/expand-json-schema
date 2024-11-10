import assert from 'node:assert';
import { expandSchema, sortKeys, getDefName, convertToDefRef, resolveRef, isObject } from '~/expand';

describe('Schema Expansion', () => {
  describe('isObject', () => {
    it('should return true for plain objects', () => {
      assert.strictEqual(isObject({}), true);
      assert.strictEqual(isObject({ a: 1 }), true);
    });

    it('should return false for arrays', () => {
      assert.strictEqual(isObject([]), false);
      assert.strictEqual(isObject([1, 2, 3]), false);
    });

    it('should return false for null', () => {
      assert.strictEqual(isObject(null), false);
    });

    it('should return false for primitives', () => {
      assert.strictEqual(isObject(42), false);
      assert.strictEqual(isObject('string'), false);
      assert.strictEqual(isObject(true), false);
    });
  });

  describe('sortKeys', () => {
    it('should sort object keys according to default order', () => {
      const input = {
        properties: {
          description: 'test',
          type: 'string',
          $id: 'test-id'
        }
      };

      const result = sortKeys(input);
      const keys = Object.keys(result.properties);
      assert.deepStrictEqual(keys, ['$id', 'type', 'description']);
    });

    it('should sort using custom order', () => {
      const input = {
        properties: {
          c: 1,
          a: 2,
          b: 3
        }
      };

      const result = sortKeys(input, ['a', 'b', 'c']);
      const keys = Object.keys(result.properties);
      assert.deepStrictEqual(keys, ['a', 'b', 'c']);
    });

    it('should handle nested objects', () => {
      const input = {
        properties: {
          nested: {
            description: 'test',
            type: 'object',
            $id: 'nested-id'
          }
        }
      };

      const result = sortKeys(input);
      const nestedKeys = Object.keys(result.properties.nested);
      assert.deepStrictEqual(nestedKeys, ['$id', 'type', 'description']);
    });
  });

  describe('getDefName', () => {
    it('should convert kebab-case to PascalCase', () => {
      assert.strictEqual(getDefName('user-profile-data'), 'UserProfileData');
    });

    it('should convert snake_case to PascalCase', () => {
      assert.strictEqual(getDefName('user_profile_data'), 'UserProfileData');
    });

    it('should handle dots in names', () => {
      assert.strictEqual(getDefName('user.profile.data'), 'UserProfileData');
    });

    it('should extract name from full path', () => {
      assert.strictEqual(
        getDefName('#/components/schemas/user-profile'),
        'UserProfile'
      );
    });
  });

  describe('convertToDefRef', () => {
    it('should convert component refs to definition refs', () => {
      assert.strictEqual(
        convertToDefRef('#/components/schemas/UserProfile'),
        '#/definitions/UserProfile'
      );
    });

    it('should not modify non-component refs', () => {
      const ref = '#/other/path/UserProfile';
      assert.strictEqual(convertToDefRef(ref), ref);
    });
  });

  describe('resolveRef', () => {
    it('should resolve nested references', () => {
      const schema = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      };

      const result = resolveRef(schema, '#/definitions/User');
      assert.deepStrictEqual(result, schema.definitions.User);
    });

    it('should return undefined for invalid refs', () => {
      const schema = { definitions: {} };
      const result = resolveRef(schema, '#/definitions/NonExistent');
      assert.strictEqual(result, undefined);
    });
  });

  describe('expandSchema', () => {
    it('should handle nullable properties', () => {
      const input = {
        type: 'string',
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.type, ['string', 'null']);
      assert.strictEqual(result.nullable, undefined);
    });

    it('should handle discriminator mappings', () => {
      const input = {
        discriminator: {
          mapping: {
            user: '#/components/schemas/User',
            admin: '#/components/schemas/Admin'
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.discriminator.mapping, {
        user: '#/definitions/User',
        admin: '#/definitions/Admin'
      });
    });

    it('should expand nested references', () => {
      const schema = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      };

      const input = {
        $ref: '#/definitions/User'
      };

      const result = expandSchema(input, schema, {});
      assert.strictEqual(result.type, 'object');
      assert.deepStrictEqual(result.properties.name, { type: 'string' });
    });

    it('should handle arrays of refs', () => {
      const schema = {
        definitions: {
          Tag: {
            type: 'string',
            enum: ['a', 'b', 'c']
          }
        }
      };

      const input = {
        type: 'array',
        items: {
          $ref: '#/definitions/Tag'
        }
      };

      const result = expandSchema(input, schema, {});
      assert.strictEqual(result.type, 'array');
      assert.strictEqual(result.items.$ref, '#/definitions/Tag');
      assert.deepStrictEqual(result.definitions.Tag, schema.definitions.Tag);
    });

    it('should handle oneOf with nullable', () => {
      const input = {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ],
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.oneOf.length, 3);
      assert.deepStrictEqual(result.oneOf[0], { type: 'null' });
      assert.strictEqual(result.nullable, undefined);
    });

    it('should handle anyOf with nullable', () => {
      const input = {
        anyOf: [
          { type: 'string' },
          { type: 'number' }
        ],
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.anyOf.length, 3);
      assert.deepStrictEqual(result.anyOf[0], { type: 'null' });
      assert.strictEqual(result.nullable, undefined);
    });
  });
});
