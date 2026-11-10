import { PartnerReference } from '../../models/redline-data.model';

export interface ContractSharing {
  summary: string;
  partners: PartnerReference[];
}

type Audience = string[] | 'all' | 'unknown';
const ODRL = 'http://www.w3.org/ns/odrl/2/';
const EDC = 'https://w3id.org/edc/v0.0.1/ns/';

/** A static partner preview, not a replacement for the connector's policy evaluation. */
export function getContractSharing(
  accessPolicy: unknown,
  contractPolicy: unknown,
  partners: PartnerReference[],
): ContractSharing {
  if (!accessPolicy || !contractPolicy) {
    return { summary: 'Partner access unavailable', partners: [] };
  }
  const audience = intersect(policyAudience(accessPolicy), policyAudience(contractPolicy));
  if (!Array.isArray(audience)) {
    return {
      summary: audience === 'all' ? 'All partners' : 'Partners depend on policy conditions',
      partners: [],
    };
  }
  return {
    summary: `${audience.length} partner${audience.length === 1 ? '' : 's'}`,
    partners: audience.map(
      (identifier) =>
        partners.find((partner) => partner.identifier === identifier) ?? { identifier },
    ),
  };
}

function policyAudience(policy: unknown): Audience {
  if (!list(property(policy, '@type')).some((type) => term(type) === 'Set')) return 'unknown';
  const permissions = list(property(policy, 'permission'));
  const permission = permissions[0];
  if (
    permissions.length > 1 ||
    (permissions.length && term(property(permission, 'action')) !== 'use')
  ) {
    return 'unknown';
  }
  const audience = list(property(permission, 'constraint'))
    .map(constraintAudience)
    .reduce(intersect, 'all');
  if (audience !== 'all') return audience;
  // Only inspect other conditions when there are no partner IDs to display.
  const conditional =
    [
      'prohibition',
      'obligation',
      'assignee',
      'assigner',
      'target',
      'inheritFrom',
      'inheritsFrom',
    ].some((key) => list(property(policy, key)).length > 0) ||
    ['duty', 'assignee', 'assigner', 'target'].some(
      (key) => list(property(permission, key)).length > 0,
    );
  return conditional ? 'unknown' : 'all';
}

function constraintAudience(value: unknown): Audience {
  if (['xone', 'andSequence'].some((key) => property(value, key) !== undefined)) return 'unknown';
  const logical = ['and', 'or'].filter((key) => property(value, key) !== undefined);
  if (logical.length === 1 && property(value, 'leftOperand') === undefined) {
    const children = list(property(value, logical[0])).map(constraintAudience);
    if (!children.length) return 'unknown';
    if (logical[0] === 'and') return children.reduce(intersect);
    return children.every((child) => Array.isArray(child))
      ? [...new Set(children.flat())]
      : 'unknown';
  }
  if (logical.length || term(property(value, 'leftOperand')) !== 'CounterPartyId') return 'unknown';
  const operator = term(property(value, 'operator'));
  const ids = list(property(value, 'rightOperand')).map(text);
  if (!ids.length || ids.some((id) => !id?.trim())) return 'unknown';
  return operator === 'isAnyOf' || (operator === 'eq' && ids.length === 1)
    ? [...new Set(ids as string[])]
    : 'unknown';
}

function intersect(a: Audience, b: Audience): Audience {
  if (Array.isArray(a)) return Array.isArray(b) ? a.filter((id) => b.includes(id)) : a;
  if (Array.isArray(b)) return b;
  return a === 'unknown' || b === 'unknown' ? 'unknown' : 'all';
}

// Read both compact policy terms and the management client's expanded JSON-LD.
function property(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const node = value as Record<string, unknown>;
  return (
    node[key] ?? node[`odrl:${key}`] ?? node[ODRL + key] ?? node[`edc:${key}`] ?? node[EDC + key]
  );
}

function list(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(list);
  const items = property(value, '@list');
  return items === undefined ? [value] : list(items);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length === 1 ? text(value[0]) : undefined;
  const literal = property(value, '@id') ?? property(value, '@value');
  return typeof literal === 'string' ? literal : undefined;
}

function term(value: unknown): string | undefined {
  return text(value)?.replace(
    /^(odrl:|edc:|http:\/\/www\.w3\.org\/ns\/odrl\/2\/|https:\/\/w3id\.org\/edc\/v0\.0\.1\/ns\/)/,
    '',
  );
}
