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
      assert.strictEqual(getDefName('#/components/schemas/user-profile'), 'UserProfile');
    });
  });

  describe('convertToDefRef', () => {
    it('should convert component refs to definition refs', () => {
      assert.strictEqual(convertToDefRef('#/components/schemas/UserProfile'), '#/definitions/UserProfile');
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
        oneOf: [{ type: 'string' }, { type: 'number' }],
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.oneOf.length, 3);
      assert.deepStrictEqual(result.oneOf[0], { type: 'null' });
      assert.strictEqual(result.nullable, undefined);
    });

    it('should handle anyOf with nullable', () => {
      const input = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.anyOf.length, 3);
      assert.deepStrictEqual(result.anyOf[0], { type: 'null' });
      assert.strictEqual(result.nullable, undefined);
    });
  });

  describe('Complex Schema Structures', () => {
    it('should handle deeply nested objects', () => {
      const input = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'string',
                    nullable: true
                  }
                }
              }
            }
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.properties.level1.properties.level2.properties.level3.type, ['string', 'null']);
    });

    it('should handle arrays with multiple item types', () => {
      const input = {
        type: 'array',
        items: {
          oneOf: [
            { type: 'string' },
            { type: 'number' },
            {
              type: 'object',
              properties: {
                name: { type: 'string' }
              }
            }
          ]
        },
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.type[0], 'array');
      assert.strictEqual(result.type[1], 'null');
      assert.strictEqual(result.items.oneOf.length, 3);
    });
  });

  describe('Reference Resolution', () => {
    it('should handle circular references', () => {
      const schema = {
        definitions: {
          Person: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              friends: {
                type: 'array',
                items: {
                  $ref: '#/definitions/Person'
                }
              }
            }
          }
        }
      };

      const input = {
        $ref: '#/definitions/Person'
      };

      const result = expandSchema(input, schema, {});
      assert.strictEqual(result.type, 'object');
      assert.strictEqual(result.properties.friends.type, 'array');
      assert.strictEqual(result.properties.friends.items.$ref, '#/definitions/Person');
    });

    it('should handle multiple nested references', () => {
      const schema = {
        schemas: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' }
            }
          },
          Contact: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              address: { $ref: '#/schemas/Address' }
            }
          },
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              contact: { $ref: '#/schemas/Contact' }
            }
          }
        }
      };

      const input = {
        $ref: '#/schemas/User'
      };

      const result = expandSchema(input, schema, {});
      assert.ok(result.definitions.Address);
      assert.ok(result.definitions.Contact);
      assert.strictEqual(result.properties.contact.$ref, '#/definitions/Contact');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const input = {};
      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result, {});
    });

    it('should handle schemas with only additional properties', () => {
      const input = {
        additionalProperties: {
          type: 'string'
        }
      };
      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.additionalProperties, { type: 'string' });
    });

    it('should handle pattern properties', () => {
      const input = {
        type: 'object',
        patternProperties: {
          '^[a-z]+$': {
            type: 'string',
            nullable: true
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.patternProperties['^[a-z]+$'].type, ['string', 'null']);
    });
  });

  describe('Composition Keywords', () => {
    it('should handle allOf with references', () => {
      const schema = {
        components: {
          Timestamped: {
            type: 'object',
            properties: {
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      };

      const input = {
        allOf: [
          { $ref: '#/components/Timestamped' },
          {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        ]
      };

      const result = expandSchema(input, schema, {});
      assert.ok(result.definitions.Timestamped);
      assert.strictEqual(result.allOf.length, 2);
      assert.strictEqual(result.allOf[0].$ref, '#/definitions/Timestamped');
    });

    it('should handle nested oneOf/anyOf combinations', () => {
      const input = {
        oneOf: [
          {
            anyOf: [{ type: 'string' }, { type: 'number' }]
          },
          {
            type: 'object',
            properties: {
              value: {
                oneOf: [{ type: 'boolean' }, { type: 'null' }]
              }
            }
          }
        ]
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.oneOf.length, 2);
      assert.strictEqual(result.oneOf[0].anyOf.length, 2);
      assert.strictEqual(result.oneOf[1].properties.value.oneOf.length, 2);
    });
  });

  describe('Schema Format Features', () => {
    it('should preserve format specifications', () => {
      const input = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          birthday: { type: 'string', format: 'date' },
          timestamp: { type: 'string', format: 'date-time' },
          count: { type: 'integer', format: 'int64' }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.strictEqual(result.properties.email.format, 'email');
      assert.strictEqual(result.properties.birthday.format, 'date');
      assert.strictEqual(result.properties.timestamp.format, 'date-time');
      assert.strictEqual(result.properties.count.format, 'int64');
    });

    it('should handle custom formats with nullable', () => {
      const input = {
        type: 'string',
        format: 'custom-format',
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.type, ['string', 'null']);
      assert.strictEqual(result.format, 'custom-format');
    });
  });

  describe('If/Then/Else Schemas', () => {
    it('should handle basic if/then conditions', () => {
      const input = {
        if: {
          properties: {
            type: { enum: ['user'] }
          }
        },
        then: {
          properties: {
            userId: { type: 'string' }
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.if.properties.type, { enum: ['user'] });
      assert.deepStrictEqual(result.then.properties.userId, { type: 'string' });
    });

    it('should handle if/then/else with references', () => {
      const schema = {
        components: {
          schemas: {
            UserProperties: {
              type: 'object',
              properties: {
                userId: { type: 'string' }
              }
            },
            AdminProperties: {
              type: 'object',
              properties: {
                adminId: { type: 'string' }
              }
            }
          }
        }
      };

      const input = {
        if: {
          properties: {
            role: { enum: ['admin'] }
          }
        },
        then: {
          $ref: '#/components/schemas/AdminProperties'
        },
        else: {
          $ref: '#/components/schemas/UserProperties'
        }
      };

      const result = expandSchema(input, schema, {});
      assert.ok(result.definitions.AdminProperties);
      assert.ok(result.definitions.UserProperties);
      assert.deepStrictEqual(result.then.$ref, '#/definitions/AdminProperties');
      assert.deepStrictEqual(result.else.$ref, '#/definitions/UserProperties');
    });

    it('should handle nested if/then/else structures', () => {
      const input = {
        if: {
          properties: {
            type: { enum: ['user'] }
          }
        },
        then: {
          if: {
            properties: {
              status: { enum: ['active'] }
            }
          },
          then: {
            properties: {
              lastLogin: { type: 'string', format: 'date-time' }
            }
          }
        },
        else: {
          properties: {
            reason: { type: 'string' }
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.if.properties.type, { enum: ['user'] });
      assert.deepStrictEqual(result.then.if.properties.status, { enum: ['active'] });
      assert.deepStrictEqual(result.then.then.properties.lastLogin, { type: 'string', format: 'date-time' });
      assert.deepStrictEqual(result.else.properties.reason, { type: 'string' });
    });
  });

  describe('Custom Paths Resolution', () => {
    it('should resolve refs from custom paths', () => {
      const schema = {
        custom: {
          path: {
            UserType: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              }
            }
          }
        }
      };

      const input = {
        $ref: '#/custom/path/UserType'
      };

      // This resolves to the actual schema but doesn't add to definitions
      // since the ref pattern doesn't match the configured paths
      const result = expandSchema(input, schema, {
        paths: ['custom/path']
      });

      // Should return the resolved schema directly since it's the root object
      assert.strictEqual(result.type, 'object');
      assert.deepStrictEqual(result.properties.name, { type: 'string' });
    });

    it('should handle multiple custom paths', () => {
      const schema = {
        models: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            }
          }
        },
        types: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' }
            }
          }
        }
      };

      const input = {
        properties: {
          user: { $ref: '#/models/User' },
          address: { $ref: '#/types/Address' }
        }
      };

      const result = expandSchema(input, schema, {
        paths: ['models', 'types']
      });

      assert.ok(result.definitions.User);
      assert.ok(result.definitions.Address);
      assert.strictEqual(result.properties.user.$ref, '#/definitions/User');
      assert.strictEqual(result.properties.address.$ref, '#/definitions/Address');
    });
  });

  describe('Additional Features', () => {
    it('should handle mapping property conversion', () => {
      const input = {
        mapping: {
          user: '#/components/schemas/User',
          admin: '#/components/schemas/Admin'
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.mapping, {
        user: '#/definitions/User',
        admin: '#/definitions/Admin'
      });
    });

    it('should handle multiple type arrays with nullable', () => {
      const input = {
        type: ['string', 'number'],
        nullable: true
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.type, ['string', 'number', 'null']);
      assert.strictEqual(result.nullable, undefined);
    });

    it('should handle deeply nested nullable properties', () => {
      const input = {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              attributes: {
                type: 'object',
                properties: {
                  value: {
                    type: 'string',
                    nullable: true
                  }
                }
              }
            }
          }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result.properties.data.properties.attributes.properties.value.type, ['string', 'null']);
    });

    it('should preserve original schema when no transformations needed', () => {
      const input = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          age: { type: 'integer', minimum: 0 }
        }
      };

      const result = expandSchema(input, {}, {});
      assert.deepStrictEqual(result, input);
    });
  });
});
