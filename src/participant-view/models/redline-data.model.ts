export interface DataspaceResource {
  id: number;
  name: string;
  properties?: Record<string, unknown>;
}

export interface PartnerReference {
  identifier: string;
  nickname?: string;
  properties?: Record<string, unknown>;
}

export interface Constraint {
  leftOperand?: string;
  operator?: string;
  rightOperand?: unknown;
}

export interface CelExpression {
  '@type': string;
  '@context'?: string[];
  '@id'?: string;
  leftOperand?: string;
  description?: string;
  scopes?: string[];
  actions?: string[];
  expression?: string;
}

export interface PolicySet {
  permission?: Array<{
    action?: string;
    constraint?: Constraint[];
  }>;
  '@type'?: string;
}
