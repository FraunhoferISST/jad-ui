import { PolicyDefinition } from '@think-it-labs/edc-connector-client';

import { getContractSharing } from './contract-sharing';

describe('contract sharing preview', () => {
  const alice = { identifier: 'did:web:alice', nickname: 'Alice Ltd' };
  const bob = { identifier: 'did:web:bob', nickname: 'Bob Ltd' };
  const partners = [alice, bob];
  const unrestricted = { '@type': 'Set' };
  const constraint = (ids: string[]) => ({
    leftOperand: 'CounterPartyId',
    operator: ids.length === 1 ? 'eq' : 'isAnyOf',
    rightOperand: ids.length === 1 ? ids[0] : ids,
  });
  const policy = (...constraints: unknown[]) => ({
    '@type': 'Set',
    permission: [{ action: 'use', constraint: constraints }],
  });

  it('resolves names and intersects access and contract partner restrictions', () => {
    const sharing = getContractSharing(
      policy(constraint([alice.identifier, bob.identifier])),
      policy(constraint([bob.identifier])),
      partners,
    );
    expect(sharing.partners).toEqual([bob]);
    expect(sharing.summary).toBe('1 partner');
  });

  it('uses the restricted policy when the other policy is unrestricted', () => {
    for (const [access, contract] of [
      [policy(constraint([alice.identifier])), unrestricted],
      [unrestricted, policy(constraint([alice.identifier]))],
    ]) {
      expect(getContractSharing(access, contract, partners).partners).toEqual([alice]);
    }
  });

  it('retains identifiers for partners missing from the partner directory', () => {
    const sharing = getContractSharing(
      policy(constraint(['did:web:unknown', 'did:web:unknown'])),
      unrestricted,
      [],
    );
    expect(sharing.partners).toEqual([{ identifier: 'did:web:unknown' }]);
    expect(sharing.summary).toBe('1 partner');
  });

  it('reports the count for multiple partners', () => {
    const sharing = getContractSharing(
      policy(constraint([alice.identifier, bob.identifier])),
      unrestricted,
      partners,
    );
    expect(sharing.summary).toBe('2 partners');
    expect(sharing.partners).toEqual(partners);
  });

  it('reports an unrestricted audience without limiting it to the partner directory', () => {
    expect(getContractSharing(unrestricted, policy(), partners)).toEqual({
      summary: 'All partners',
      partners: [],
    });
  });

  it('does not treat empty rule collections as additional conditions', () => {
    const sharing = getContractSharing(
      {
        ...unrestricted,
        permission: [],
        prohibition: [],
        obligation: [],
      },
      {
        ...unrestricted,
        permission: [{ action: 'use', constraint: [], duty: [] }],
      },
      partners,
    );
    expect(sharing.summary).toBe('All partners');
  });

  it('supports prefixed policy terms', () => {
    const sharing = getContractSharing(
      {
        '@type': 'odrl:Set',
        'odrl:permission': [
          {
            'odrl:action': 'odrl:use',
            'odrl:constraint': [
              {
                'odrl:leftOperand': 'edc:CounterPartyId',
                'odrl:operator': 'odrl:eq',
                'odrl:rightOperand': alice.identifier,
              },
            ],
          },
        ],
      },
      unrestricted,
      partners,
    );
    expect(sharing.partners).toEqual([alice]);
  });

  it('reports disjoint policies without suggesting that all partners have access', () => {
    const sharing = getContractSharing(
      policy(constraint([alice.identifier])),
      policy(constraint([bob.identifier])),
      partners,
    );
    expect(sharing.summary).toBe('0 partners');
    expect(sharing.partners).toEqual([]);
  });

  it('supports expanded JSON-LD returned by the management client', () => {
    const odrl = 'http://www.w3.org/ns/odrl/2/';
    const edc = 'https://w3id.org/edc/v0.0.1/ns/';
    const definition = Object.assign(new PolicyDefinition(), {
      [edc + 'policy']: [
        {
          '@type': [odrl + 'Set'],
          [odrl + 'permission']: [
            {
              [odrl + 'action']: [{ '@id': odrl + 'use' }],
              [odrl + 'constraint']: [
                {
                  [odrl + 'leftOperand']: [{ '@id': edc + 'CounterPartyId' }],
                  [odrl + 'operator']: [{ '@id': odrl + 'isAnyOf' }],
                  [odrl + 'rightOperand']: [
                    { '@list': [{ '@value': alice.identifier }, { '@value': bob.identifier }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(getContractSharing(definition.policy, unrestricted, partners).partners).toEqual(
      partners,
    );
  });

  it('supports nested and/or constraints without flattening their meaning', () => {
    const sharing = getContractSharing(
      policy({
        and: [
          { or: [constraint([alice.identifier]), constraint([bob.identifier])] },
          constraint([bob.identifier]),
        ],
      }),
      unrestricted,
      partners,
    );
    expect(sharing.partners).toEqual([bob]);
  });

  it('retains known partner IDs alongside other policy conditions', () => {
    const sharing = getContractSharing(
      {
        ...policy(constraint([alice.identifier]), {
          leftOperand: 'MembershipCredential',
          operator: 'eq',
          rightOperand: 'active',
        }),
        prohibition: [{ action: 'use', constraint: [] }],
      },
      {
        '@type': 'Set',
        permission: [{ action: 'use', duty: [{ action: 'use' }] }],
      },
      partners,
    );
    expect(sharing).toEqual({ summary: '1 partner', partners: [alice] });
  });

  it('does not call policies unrestricted when other conditions apply', () => {
    for (const [access, contract] of [
      [{ ...unrestricted, prohibition: [{ action: 'use' }] }, unrestricted],
      [
        unrestricted,
        { '@type': 'Set', permission: [{ action: 'use', duty: [{ action: 'use' }] }] },
      ],
      [
        policy({ leftOperand: 'MembershipCredential', operator: 'eq', rightOperand: 'active' }),
        unrestricted,
      ],
    ]) {
      expect(getContractSharing(access, contract, partners)).toEqual({
        summary: 'Partners depend on policy conditions',
        partners: [],
      });
    }
  });

  it('does not present an unknown OR branch as a finite partner audience', () => {
    const sharing = getContractSharing(
      policy({
        or: [
          constraint([alice.identifier]),
          { leftOperand: 'MembershipCredential', operator: 'eq', rightOperand: 'active' },
        ],
      }),
      unrestricted,
      partners,
    );
    expect(sharing.summary).toBe('Partners depend on policy conditions');
    expect(sharing.partners).toEqual([]);
  });

  it('does not treat unsupported, malformed, or ambiguous policies as public', () => {
    for (const value of [
      {},
      { '@type': 'Set', permission: [null] },
      { '@type': 'Set', permission: [''] },
      policy({ ...constraint([alice.identifier]), operator: 'neq' }),
      policy(constraint([])),
      policy({ leftOperand: 'CounterPartyId', operator: 'eq', rightOperand: 123 }),
      { '@type': 'Set', permission: [{ action: 'read' }] },
      { '@type': 'Set', permission: [{ action: 'use' }, { action: 'use' }] },
    ]) {
      expect(getContractSharing(value, unrestricted, partners).summary).toBe(
        'Partners depend on policy conditions',
      );
    }
  });

  it('reports unavailable policies instead of assuming unrestricted access', () => {
    for (const [access, contract] of [
      [undefined, unrestricted],
      [unrestricted, undefined],
    ]) {
      expect(getContractSharing(access, contract, partners).summary).toBe(
        'Partner access unavailable',
      );
    }
  });
});
