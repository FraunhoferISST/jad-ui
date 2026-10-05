import document from '../../../public/config/jad-profile.json';
import { AtomicBlock, POLICY_PURPOSE_PROPERTY, PolicySchema, SchemaNode } from './policy-schema';

function testPolicySchema(): PolicySchema {
  return new PolicySchema(structuredClone(document) as SchemaNode);
}

// Fixtures use the actual served schema, not a separately maintained copy.
function testAtomic(schema: PolicySchema, id: string, kind = 'permission'): AtomicBlock {
  return schema.rules
    .find((rule) => rule.kind === kind)!
    .blocks.find((block) => block.id === id) as AtomicBlock;
}

describe('PolicySchema', () => {
  let schema: PolicySchema;
  beforeEach(() => {
    schema = testPolicySchema();
  });

  it('derives rule types, titles, actions, operators and constants from the document', () => {
    expect(schema.rules.map((rule) => rule.kind)).toEqual([
      'permission',
      'prohibition',
      'obligation',
    ]);
    expect(schema.policyType).toBe('Set');
    expect(schema.profile).toBe(document.$id);
    expect(schema.rules[0].actions).toEqual(['use']);
    const membership = testAtomic(schema, 'MembershipCredential');
    expect(membership.title).toBe('Active membership credential');
    expect(membership.operators).toEqual(['eq']);
    expect(membership.values['eq'][0].initial).toBe('active');
    expect(membership.values['eq'][0].fixed).toBeTrue();
    expect(testAtomic(schema, 'inForceDate').operators).toEqual([
      'eq',
      'neq',
      'gt',
      'gteq',
      'lt',
      'lteq',
    ]);
  });

  it('restricts inForceDate to permissions, including attached duties and logical groups', () => {
    expect(schema.rules[0].blocks.some((block) => block.id === 'inForceDate')).toBeTrue();
    for (const rule of [...schema.rules.slice(1), schema.rules[0].duty!]) {
      expect(rule.blocks.some((block) => block.id === 'inForceDate')).toBeFalse();
      const draft = schema.createRule(rule);
      const group = schema.createConstraint(rule.blocks.find((block) => block.id === 'group:and')!);
      group.children.push(schema.createConstraint(testAtomic(schema, 'inForceDate')));
      draft.constraints.push(group);
      expect(() => schema.toRequest('test', [draft])).toThrowError(/not allowed/);
    }
  });

  it('derives scalar/list value controls from the conditional counterparty schema', () => {
    const block = testAtomic(schema, 'CounterPartyId');
    expect(block.operators).toEqual(['eq', 'isAnyOf']);
    expect(block.values['eq'].map((value) => value.type)).toEqual(['string']);
    expect(block.values['isAnyOf'].map((value) => value.type)).toEqual(['array']);
    const rule = schema.createRule(schema.rules[0]);
    const constraint = schema.createConstraint(block);
    constraint.operator = 'isAnyOf';
    constraint.valueChoice = block.values['isAnyOf'][0].id;
    constraint.value = 'did:web:one\n\ndid:web:two\n';
    rule.constraints.push(constraint);
    const request = schema.toRequest('Partners', [rule]);
    expect(request.policy['permission']).toEqual([
      {
        action: 'use',
        constraint: [
          {
            leftOperand: 'CounterPartyId',
            operator: 'isAnyOf',
            rightOperand: ['did:web:one', 'did:web:two'],
          },
        ],
      },
    ]);
    expect(schema.validationErrors(request)).toEqual([]);
    constraint.value = 'did:web:one\ndid:web:one';
    expect(schema.validationErrors(schema.toRequest('Partners', [rule])).length).toBeGreaterThan(0);
  });

  it('validates fixed timestamps with calendar checks and agreement-relative strings', () => {
    const block = testAtomic(schema, 'inForceDate');
    expect(block.values['eq'].length).toBe(2);
    const rule = schema.createRule(schema.rules[0]);
    const constraint = schema.createConstraint(block);
    rule.constraints.push(constraint);
    constraint.value = '2026-02-30T00:00:00Z';
    expect(schema.validationErrors(schema.toRequest('test', [rule])).length).toBeGreaterThan(0);
    constraint.value = '2027-01-01T00:00:00Z';
    expect(schema.validationErrors(schema.toRequest('test', [rule]))).toEqual([]);
    constraint.valueChoice = block.values['eq'][1].id;
    constraint.value = 'contractAgreement+-5m';
    expect(schema.validationErrors(schema.toRequest('test', [rule]))).toEqual([]);
  });

  it('serializes nested logical groups and validates empty groups', () => {
    const definition = schema.rules[0];
    const rule = schema.createRule(definition);
    const and = schema.createConstraint(
      definition.blocks.find((block) => block.id === 'group:and')!,
    );
    const or = schema.createConstraint(definition.blocks.find((block) => block.id === 'group:or')!);
    and.children.push(or);
    rule.constraints.push(and);
    expect(schema.validationErrors(schema.toRequest('test', [rule])).length).toBeGreaterThan(0);
    or.children.push(schema.createConstraint(testAtomic(schema, 'MembershipCredential')));
    expect(schema.toRequest('test', [rule]).policy['permission']).toEqual([
      {
        action: 'use',
        constraint: [
          {
            and: [
              {
                or: [
                  { leftOperand: 'MembershipCredential', operator: 'eq', rightOperand: 'active' },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(schema.validationErrors(schema.toRequest('test', [rule]))).toEqual([]);
  });

  it('serializes duties and strips editor-only labels and IDs', () => {
    const definition = schema.rules[0];
    const rule = schema.createRule(definition, 'Editor label');
    const duty = schema.createRule(definition.duty!, 'Editor duty');
    duty.constraints.push(schema.createConstraint(testAtomic(schema, 'ManufacturerCredential')));
    rule.duties.push(duty);
    const request = schema.toRequest('  Named policy  ', [rule]);
    expect(request['@id']).toBe('Named policy');
    expect(request['@type']).toBe('PolicyDefinition');
    expect(Object.keys(request)).toEqual(['@context', '@type', '@id', 'policy']);
    expect(JSON.stringify(request)).not.toContain('Editor');
    expect(JSON.stringify(request)).not.toContain(rule.id);
    expect(request.policy['prohibition']).toBeUndefined();
    expect(schema.validationErrors(request)).toEqual([]);
  });

  it('preserves unconstrained policies and rejects missing names', () => {
    const request = schema.toRequest('Unrestricted', []);
    expect(Object.keys(request.policy)).toEqual(['@type', 'profile']);
    expect(schema.validationErrors(request)).toEqual([]);
    expect(schema.validationErrors(schema.toRequest('  ', [])).length).toBeGreaterThan(0);
  });

  it('detects invalid operator/value pairs even if a draft was modified outside the UI', () => {
    const rule = schema.createRule(schema.rules[0]);
    const block = testAtomic(schema, 'CounterPartyId');
    const constraint = schema.createConstraint(block);
    constraint.operator = 'gteq';
    rule.constraints.push(constraint);
    expect(() => schema.toRequest('test', [rule])).toThrowError(/supported operator/);
  });

  it('adds new operands and number controls when only the schema is extended', () => {
    const changed = structuredClone(document) as SchemaNode;
    const defs = changed['$defs'] as Record<string, SchemaNode>;
    defs['NewConstraint'] = {
      title: 'Dynamic threshold',
      type: 'object',
      additionalProperties: false,
      required: ['leftOperand', 'operator', 'rightOperand'],
      properties: {
        leftOperand: { const: 'DynamicThreshold' },
        operator: { enum: ['eq'] },
        rightOperand: { type: 'integer', minimum: 1 },
      },
    };
    defs['PermissionConstraint'].oneOf!.push({ $ref: '#/$defs/NewConstraint' });
    const dynamic = new PolicySchema(changed);
    const block = testAtomic(dynamic, 'DynamicThreshold');
    expect(block.title).toBe('Dynamic threshold');
    expect(block.values['eq'][0].type).toBe('integer');
    const rule = dynamic.createRule(dynamic.rules[0]);
    const constraint = dynamic.createConstraint(block);
    constraint.value = '3';
    rule.constraints.push(constraint);
    expect(dynamic.validationErrors(dynamic.toRequest('test', [rule]))).toEqual([]);
    constraint.value = '3.5';
    expect(dynamic.validationErrors(dynamic.toRequest('test', [rule])).length).toBeGreaterThan(0);
    constraint.value = 'not a number';
    expect(() => dynamic.toRequest('test', [rule])).toThrowError(/valid integer/);
    expect(dynamic.rules[1].blocks.some((block) => block.id === 'DynamicThreshold')).toBeFalse();
  });

  it('supports schemas that enumerate only expanded operands and operators', () => {
    const changed = structuredClone(document) as SchemaNode;
    const defs = changed['$defs'] as Record<string, SchemaNode>;
    defs['InForceDateConstraint'].properties!['leftOperand'] = {
      const: 'https://w3id.org/edc/v0.0.1/ns/inForceDate',
    };
    defs['InForceDateConstraint'].properties!['operator'] = {
      const: 'http://www.w3.org/ns/odrl/2/eq',
    };
    const dynamic = new PolicySchema(changed);
    const block = testAtomic(dynamic, 'https://w3id.org/edc/v0.0.1/ns/inForceDate');
    expect(block.operators).toEqual(['http://www.w3.org/ns/odrl/2/eq']);
  });

  it('derives the access palette from evaluation-scope annotations, not operand names', () => {
    const definition = schema.definitions('access')[0];
    expect(schema.definitions('access').map((rule) => rule.kind)).toEqual(['permission']);
    expect(definition.duty).toBeUndefined();
    expect(definition.blocks.map((block) => block.id)).toContain('CounterPartyId');
    expect(definition.blocks.map((block) => block.id)).not.toContain('inForceDate');
    expect(schema.definitions('usage')[0].blocks.map((block) => block.id)).toContain('inForceDate');
    const changed = structuredClone(document) as SchemaNode;
    const defs = changed['$defs'] as Record<string, SchemaNode>;
    defs['InForceDateConstraint']['x-jad-evaluation-scopes'] = ['catalog'];
    const adapted = new PolicySchema(changed);
    expect(adapted.definitions('access')[0].blocks.map((block) => block.id)).toContain(
      'inForceDate',
    );
  });

  it('persists purpose as private metadata while keeping both modes schema-valid use policies', () => {
    for (const purpose of ['access', 'usage'] as const) {
      const definition = schema.definitions(purpose)[0];
      const request = schema.toRequest('Named policy', [schema.createRule(definition)], purpose);
      expect(request.privateProperties?.[POLICY_PURPOSE_PROPERTY]).toBe(purpose);
      expect(request.policy['permission']).toEqual([{ action: 'use' }]);
      expect(schema.validationErrors(request)).toEqual([]);
    }
    expect(() =>
      schema.toRequest('test', [schema.createRule(schema.rules[1])], 'access'),
    ).toThrowError(/only support permissions/);
  });

  it('validates popup drafts before committing, including nested access restrictions', () => {
    const definition = schema.definitions('access')[0];
    const counterparty = schema.createConstraint(
      definition.blocks.find((block) => block.id === 'CounterPartyId')!,
    );
    expect(schema.constraintErrors(counterparty, definition).length).toBeGreaterThan(0);
    counterparty.value = 'did:web:partner';
    expect(schema.constraintErrors(counterparty, definition)).toEqual([]);
    const group = schema.createConstraint(
      definition.blocks.find((block) => block.id === 'group:and')!,
    );
    expect(schema.constraintErrors(group, definition).length).toBeGreaterThan(0);
    group.children.push(counterparty);
    expect(schema.constraintErrors(group, definition)).toEqual([]);
    const date = schema.createConstraint(
      schema.rules[0].blocks.find((block) => block.id === 'inForceDate')!,
    );
    date.value = 'contractAgreement+1d';
    group.children.push(date);
    expect(schema.constraintErrors(group, definition).join(' ')).toContain('not allowed');
    const requestRule = schema.createRule(definition);
    requestRule.constraints.push(group);
    expect(() => schema.toRequest('test', [requestRule], 'access')).toThrowError(/not allowed/);
  });

  it('creates compact summaries without dropping stored descriptions or list values', () => {
    const definition = schema.rules[0];
    const draft = schema.createConstraint(
      definition.blocks.find((block) => block.id === 'CounterPartyId')!,
    );
    draft.operator = 'isAnyOf';
    draft.valueChoice = '0';
    draft.value = 'did:web:one\ndid:web:two';
    const summary = schema.constraintSummary(draft, definition);
    expect(summary).toContain('IS ANY OF');
    expect(summary).toContain('did:web:one');
    expect(summary).toContain('did:web:two');
  });

  it('keeps ambiguous root oneOf failures invalid even when branch noise is hidden', () => {
    const changed = structuredClone(document) as SchemaNode;
    changed.oneOf!.unshift({ $ref: '#/$defs/PolicyDefinition' });
    const ambiguous = new PolicySchema(changed);
    expect(ambiguous.validationErrors(ambiguous.toRequest('test', []))).toEqual([
      'Policy does not match the loaded schema.',
    ]);
  });

  it('reports malformed schemas rather than falling back to a hard-coded builder', () => {
    expect(() => new PolicySchema({})).toThrowError(/\$id/);
    const changed = structuredClone(document) as SchemaNode;
    changed.oneOf = [{ $ref: '#/$defs/DoesNotExist' }];
    expect(() => new PolicySchema(changed)).toThrow();
  });
});
