import Ajv, { ValidateFunction } from 'ajv/dist/2019';
import addFormats from 'ajv-formats';

export interface SchemaNode {
  [key: string]: unknown;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  if?: SchemaNode;
  then?: SchemaNode;
  else?: SchemaNode;
  examples?: unknown[];
  default?: unknown;
  format?: string;
  pattern?: string;
  minItems?: number;
  'x-jad-evaluation-scopes'?: string[];
}

export type PolicyPurpose = 'usage' | 'access';
// Local editor classification, not an ODRL action or a runtime profile assignment.
export const POLICY_PURPOSE_PROPERTY = 'jad:policyPurpose';
export type RuleKind = 'permission' | 'prohibition' | 'obligation';
export type ValueType = 'string' | 'array' | 'number' | 'integer' | 'boolean';
export interface ValueChoice {
  id: string;
  type: ValueType;
  label: string;
  schema: SchemaNode;
  choices: string[];
  fixed: boolean;
  initial: string;
  placeholder: string;
}
export interface AtomicBlock {
  id: string;
  kind: 'atomic';
  title: string;
  description: string;
  operand: string;
  operators: string[];
  evaluationScopes: string[];
  values: Record<string, ValueChoice[]>;
}
export interface LogicalBlock {
  id: string;
  kind: 'logical';
  title: string;
  description: string;
  operand: string;
  minItems: number;
}
export type BuildingBlock = AtomicBlock | LogicalBlock;
export interface RuleDefinition {
  kind: RuleKind;
  title: string;
  actions: string[];
  blocks: BuildingBlock[];
  duty?: RuleDefinition;
}
export interface ConstraintDraft {
  id: string;
  blockId: string;
  operator: string;
  valueChoice: string;
  value: string;
  children: ConstraintDraft[];
}
export interface RuleDraft {
  id: string;
  kind: RuleKind;
  name: string;
  action: string;
  constraints: ConstraintDraft[];
  duties: RuleDraft[];
}
export interface PolicyCreateRequest {
  '@context': string[];
  '@type': 'PolicyDefinition';
  '@id': string;
  privateProperties?: Record<string, unknown>;
  policy: { '@type': string; profile?: string; [key: string]: unknown };
}

// Standard ODRL vocabulary candidates are filtered through the operator schema.
// Enumerated custom operators are read directly from the schema, not this list.
const ODRL_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gteq',
  'lt',
  'lteq',
  'isAnyOf',
  'isAllOf',
  'isNoneOf',
  'isPartOf',
  'hasPart',
  'isA',
];
const RULE_TITLES: Record<RuleKind, string> = {
  permission: 'Permission',
  prohibition: 'Prohibition',
  obligation: 'Obligation',
};

function compactTerm(value: string): string {
  return value.replace(
    /^(odrl:|edc:|http:\/\/www\.w3\.org\/ns\/odrl\/2\/|https:\/\/w3id\.org\/edc\/v0\.0\.1\/ns\/)/,
    '',
  );
}
function merge(a: SchemaNode, b: SchemaNode): SchemaNode {
  const properties = { ...a.properties };
  for (const [key, value] of Object.entries(b.properties ?? {})) {
    properties[key] = properties[key] ? merge(properties[key], value) : value;
  }
  return { ...a, ...b, properties };
}
function types(node: SchemaNode): string[] {
  if (node.type) return Array.isArray(node.type) ? node.type : [node.type];
  if (node.const !== undefined) return [Array.isArray(node.const) ? 'array' : typeof node.const];
  if (node.enum?.length) return [...new Set(node.enum.map((value) => typeof value))];
  return [];
}
function valueText(value: unknown, type: ValueType): string {
  return type === 'array' && Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
    : typeof value === 'string'
      ? value
      : (JSON.stringify(value) ?? '');
}

/** Interprets the reachable rule/constraint graph, not a hard-coded operand catalog. */
export class PolicySchema {
  readonly rules: RuleDefinition[];
  readonly title: string;
  readonly policyType: string;
  readonly profile: string;
  private readonly ajv = new Ajv({ strict: false, allErrors: true });
  private readonly validator: ValidateFunction;
  private readonly fragmentValidators = new WeakMap<SchemaNode, ValidateFunction>();
  private readonly blockSchemas = new WeakMap<BuildingBlock, SchemaNode>();

  constructor(readonly document: SchemaNode) {
    if (!document.$id) throw new Error('The policy schema must have a $id.');
    addFormats(this.ajv);
    this.validator = this.ajv.compile(document);
    this.title = document.title ?? document.$id;
    const envelope = this.alternatives(document).find((node) => node.properties?.['policy']);
    if (!envelope?.properties?.['policy'])
      throw new Error('No PolicyDefinition branch found in schema.');
    const policy = this.resolve(envelope.properties['policy']);
    this.policyType = this.strings(policy.properties?.['@type'] ?? {})[0] ?? '';
    if (!this.policyType) throw new Error('The policy type must be defined by the schema.');
    this.profile = this.strings(policy.properties?.['profile'] ?? {})[0] ?? '';
    this.rules = (Object.keys(RULE_TITLES) as RuleKind[]).flatMap((kind) => {
      const item = this.resolve(policy.properties?.[kind] ?? {}).items;
      return item ? [this.ruleDefinition(kind, item)] : [];
    });
    if (!this.rules.length)
      throw new Error('The policy schema contains no supported rule collections.');
  }

  resolve(node: SchemaNode, visited = new Set<string>()): SchemaNode {
    let resolved = node;
    if (node.$ref) {
      if (visited.has(node.$ref)) throw new Error(`Circular schema alias: ${node.$ref}`);
      const prefix = this.document.$id ?? '';
      const ref = node.$ref.startsWith(prefix + '#') ? node.$ref.slice(prefix.length) : node.$ref;
      if (!ref.startsWith('#/'))
        throw new Error(`Only local schema references are supported: ${ref}`);
      let target: unknown = this.document;
      for (const segment of ref.slice(2).split('/')) {
        const key = decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~');
        target =
          target && typeof target === 'object'
            ? (target as Record<string, unknown>)[key]
            : undefined;
      }
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new Error(`Schema reference not found: ${ref}`);
      }
      resolved = merge(this.resolve(target as SchemaNode, new Set([...visited, node.$ref])), node);
    }
    for (const part of resolved.allOf ?? [])
      resolved = merge(resolved, this.resolve(part, visited));
    return resolved;
  }

  private alternatives(node: SchemaNode): SchemaNode[] {
    const resolved = this.resolve(node);
    const branches = resolved.oneOf ?? resolved.anyOf;
    return branches ? branches.flatMap((branch) => this.alternatives(branch)) : [resolved];
  }

  private strings(node: SchemaNode): string[] {
    const resolved = this.resolve(node);
    if (typeof resolved.const === 'string') return [resolved.const];
    return [
      ...new Set(
        (resolved.enum ?? []).filter((value): value is string => typeof value === 'string'),
      ),
    ];
  }

  private accepts(node: SchemaNode, value: unknown): boolean {
    let validator = this.fragmentValidators.get(node);
    if (!validator) {
      // Fragments retain access to the original document's local definitions.
      const qualify = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(qualify);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(
          Object.entries(value).map(([key, child]) => [
            key,
            key === '$ref' && typeof child === 'string' && child.startsWith('#')
              ? this.document.$id + child
              : qualify(child),
          ]),
        );
      };
      validator = this.ajv.compile(qualify(node) as SchemaNode);
      this.fragmentValidators.set(node, validator);
    }
    return !!validator(value);
  }

  private ruleDefinition(
    kind: RuleKind,
    node: SchemaNode,
    title = RULE_TITLES[kind],
  ): RuleDefinition {
    const rule = this.resolve(node);
    const action = rule.properties?.['action'] ?? {};
    const actions = [...new Set(this.strings(action).map(compactTerm))].filter((value) =>
      this.accepts(action, value),
    );
    if (!actions.length) throw new Error(`${title} has no supported action choices.`);
    const constraint = this.resolve(rule.properties?.['constraint'] ?? {}).items;
    const duty = this.resolve(rule.properties?.['duty'] ?? {}).items;
    return {
      kind,
      title,
      actions,
      blocks: constraint ? this.buildingBlocks(constraint) : [],
      ...(duty ? { duty: this.ruleDefinition('obligation', duty, 'Duty') } : {}),
    };
  }

  private buildingBlocks(node: SchemaNode): BuildingBlock[] {
    const blocks = new Map<string, BuildingBlock>();
    const visited = new Set<SchemaNode>();
    const visit = (source: SchemaNode): void => {
      if (visited.has(source)) return;
      visited.add(source);
      const resolved = this.resolve(source);
      const properties = resolved.properties ?? {};
      if (properties['leftOperand']) {
        const operands = this.strings(properties['leftOperand']);
        const term = operands
          .map((value) =>
            this.accepts(properties['leftOperand'], compactTerm(value))
              ? compactTerm(value)
              : value,
          )
          .find((value) => this.accepts(properties['leftOperand'], value));
        if (!term) throw new Error('Each atomic building block must declare a finite leftOperand.');
        const operatorSchema = properties['operator'] ?? {};
        const candidates = this.strings(operatorSchema);
        const vocabulary = ODRL_OPERATORS.flatMap((value) => [
          value,
          `odrl:${value}`,
          `http://www.w3.org/ns/odrl/2/${value}`,
        ]);
        const operators = [
          ...new Set(
            (candidates.length ? candidates : vocabulary).map((value) =>
              this.accepts(operatorSchema, compactTerm(value)) ? compactTerm(value) : value,
            ),
          ),
        ].filter((value) => this.accepts(operatorSchema, value));
        if (!operators.length) throw new Error(`No supported operators for ${term}.`);
        const block: AtomicBlock = {
          id: term,
          kind: 'atomic',
          operand: term,
          title: resolved.title ?? term,
          description: resolved.description ?? '',
          operators,
          evaluationScopes: resolved['x-jad-evaluation-scopes'] ?? [],
          values: Object.fromEntries(
            operators.map((operator) => [
              operator,
              this.valueChoices(source, properties['rightOperand'] ?? {}, operator),
            ]),
          ),
        };
        blocks.set(term, block);
        this.blockSchemas.set(block, source);
        return;
      }
      for (const [key, property] of Object.entries(properties)) {
        const list = this.resolve(property);
        if (list.type !== 'array' || !list.items) continue;
        const block: LogicalBlock = {
          id: `group:${key}`,
          kind: 'logical',
          operand: key,
          title: key.toUpperCase(),
          description: resolved.description ?? '',
          minItems: list.minItems ?? 0,
        };
        blocks.set(block.id, block);
        this.blockSchemas.set(block, source);
        visit(list.items);
      }
      for (const branch of resolved.oneOf ?? resolved.anyOf ?? []) visit(branch);
    };
    visit(node);
    return [...blocks.values()];
  }

  private valueChoices(block: SchemaNode, value: SchemaNode, operator: string): ValueChoice[] {
    let restriction: SchemaNode = {};
    for (const condition of this.resolve(block).allOf ?? []) {
      if (!condition.if) continue;
      const branch = this.accepts(condition.if, { operator }) ? condition.then : condition.else;
      restriction = merge(restriction, branch?.properties?.['rightOperand'] ?? {});
    }
    const requiredTypes = types(restriction);
    const choices: ValueChoice[] = [];
    for (const branch of this.alternatives(value)) {
      for (const type of types(branch).filter(
        (type) => !requiredTypes.length || requiredTypes.includes(type),
      )) {
        if (!['string', 'array', 'number', 'integer', 'boolean'].includes(type)) continue;
        const schema = merge(branch, restriction);
        const valueType = type as ValueType;
        const initial = schema.const ?? schema.default ?? '';
        const options = schema.enum ?? (schema.const !== undefined ? [schema.const] : []);
        choices.push({
          id: String(choices.length),
          type: valueType,
          schema,
          label:
            schema.title ??
            schema.format ??
            (type === 'array' ? 'List (one value per line)' : type),
          choices: options.map((option) => valueText(option, valueType)),
          fixed: schema.const !== undefined,
          initial: valueText(initial, valueType),
          placeholder: valueText(schema.examples?.[0] ?? '', valueType),
        });
      }
    }
    if (!choices.length)
      throw new Error(`Unsupported rightOperand schema for operator ${operator}.`);
    return choices;
  }

  createConstraint(block: BuildingBlock): ConstraintDraft {
    const operator = block.kind === 'atomic' ? block.operators[0] : '';
    const choice = block.kind === 'atomic' ? block.values[operator][0] : undefined;
    return {
      id: crypto.randomUUID(),
      blockId: block.id,
      operator,
      valueChoice: choice?.id ?? '',
      value: choice?.initial ?? '',
      children: [],
    };
  }

  createRule(definition: RuleDefinition, name = definition.title): RuleDraft {
    return {
      id: crypto.randomUUID(),
      kind: definition.kind,
      name,
      action: definition.actions[0],
      constraints: [],
      duties: [],
    };
  }

  definitions(purpose: PolicyPurpose): RuleDefinition[] {
    if (purpose === 'usage') {
      const order: Record<RuleKind, number> = { permission: 0, obligation: 1, prohibition: 2 };
      return [...this.rules].sort((a, b) => order[a.kind] - order[b.kind]);
    }
    return this.rules
      .filter((rule) => rule.kind === 'permission')
      .map((rule) => ({
        ...rule,
        duty: undefined,
        blocks: rule.blocks.filter(
          (block) =>
            block.kind === 'logical' ||
            !block.evaluationScopes.length ||
            block.evaluationScopes.includes('catalog'),
        ),
      }));
  }

  constraintErrors(draft: ConstraintDraft, definition: RuleDefinition): string[] {
    try {
      const block = definition.blocks.find((block) => block.id === draft.blockId);
      const schema = block && this.blockSchemas.get(block);
      if (!schema) return ['Choose a supported constraint.'];
      const value = this.serializeConstraint(draft, definition);
      if (this.accepts(schema, value)) return [];
      const errors = [
        ...new Set(
          (this.fragmentValidators.get(schema)?.errors ?? [])
            .filter((error) => error.keyword !== 'oneOf' && error.keyword !== 'anyOf')
            .map((error) => `${error.instancePath || '/'}: ${error.message ?? 'invalid value'}`),
        ),
      ];
      return errors.length ? errors : ['Complete the constraint to match the schema.'];
    } catch (error) {
      return [error instanceof Error ? error.message : 'Invalid constraint.'];
    }
  }

  constraintSummary(draft: ConstraintDraft, definition: RuleDefinition): string {
    const block = definition.blocks.find((block) => block.id === draft.blockId);
    if (!block) return draft.blockId;
    if (block.kind === 'logical') return `${block.title} · ${draft.children.length} constraint(s)`;
    const value = block.values[draft.operator]?.find((choice) => choice.id === draft.valueChoice);
    const text =
      value?.type === 'array'
        ? `[${draft.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => JSON.stringify(item))
            .join(', ')}]`
        : JSON.stringify(draft.value);
    const operator = compactTerm(draft.operator)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toUpperCase();
    return `${block.title} — ${operator} — ${text}`;
  }

  toRequest(name: string, rules: RuleDraft[], purpose?: PolicyPurpose): PolicyCreateRequest {
    if (purpose === 'access' && rules.some((rule) => rule.kind !== 'permission')) {
      throw new Error('Access policies only support permissions.');
    }
    const policy: PolicyCreateRequest['policy'] = { '@type': this.policyType };
    if (this.profile) policy.profile = this.profile;
    for (const definition of this.definitions(purpose ?? 'usage')) {
      const selected = rules.filter((rule) => rule.kind === definition.kind);
      if (selected.length)
        policy[definition.kind] = selected.map((rule) => this.serializeRule(rule, definition));
    }
    return {
      '@context': ['https://w3id.org/edc/connector/management/v2'],
      '@type': 'PolicyDefinition',
      '@id': name.trim(),
      ...(purpose ? { privateProperties: { [POLICY_PURPOSE_PROPERTY]: purpose } } : {}),
      policy,
    };
  }

  private serializeRule(rule: RuleDraft, definition: RuleDefinition): Record<string, unknown> {
    const result: Record<string, unknown> = { action: rule.action };
    if (rule.constraints.length)
      result['constraint'] = rule.constraints.map((value) =>
        this.serializeConstraint(value, definition),
      );
    if (rule.duties.length) {
      if (!definition.duty) throw new Error('This rule does not support duties.');
      result['duty'] = rule.duties.map((duty) => this.serializeRule(duty, definition.duty!));
    }
    return result;
  }

  private serializeConstraint(
    draft: ConstraintDraft,
    definition: RuleDefinition,
  ): Record<string, unknown> {
    const block = definition.blocks.find((block) => block.id === draft.blockId);
    if (!block)
      throw new Error(`Building block ${draft.blockId} is not allowed in ${definition.title}.`);
    if (block.kind === 'logical') {
      return {
        [block.operand]: draft.children.map((child) => this.serializeConstraint(child, definition)),
      };
    }
    const choice = block.values[draft.operator]?.find((choice) => choice.id === draft.valueChoice);
    if (!choice) throw new Error(`Choose a supported operator and value type for ${block.title}.`);
    const parse = (text: string, type: string): unknown => {
      if (type === 'string') return text;
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Enter a valid ${type} value for ${block.title}.`);
      }
    };
    const itemType = types(this.resolve(choice.schema.items ?? {}))[0] ?? 'string';
    const rightOperand =
      choice.type === 'array'
        ? draft.value
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => parse(value, itemType))
        : parse(draft.value, choice.type);
    return { leftOperand: block.operand, operator: draft.operator, rightOperand };
  }

  validationErrors(request: PolicyCreateRequest): string[] {
    if (this.validator(request)) return [];
    // Hide errors from the alternate standalone-policy branch of the root oneOf.
    const errors = [
      ...new Set(
        (this.validator.errors ?? [])
          .filter(
            (error) =>
              error.schemaPath !== '#/oneOf' &&
              !(error.instancePath === '/@type' && error.keyword === 'enum') &&
              !(
                error.instancePath === '' &&
                error.keyword === 'additionalProperties' &&
                error.params['additionalProperty'] === 'policy'
              ),
          )
          .map((error) => `${error.instancePath || '/'}: ${error.message ?? 'invalid value'}`),
      ),
    ];
    // Never enable creation merely because less-useful oneOf errors were hidden.
    return errors.length ? errors : ['Policy does not match the loaded schema.'];
  }
}
