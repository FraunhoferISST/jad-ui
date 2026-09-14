export interface DataspaceResource {
  id: number;
  name: string;
  properties?: Record<string, unknown>;
}

export interface UseCase {
  id: string;
  name: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface PartnerReference {
  identifier: string;
  nickname?: string;
  properties?: Record<string, unknown>;
}

export interface FileResource {
  fileId?: string;
  fileName?: string;
  contentType?: string;
  uploadDateIso?: string;
  metadata?: Record<string, unknown>;
}

export interface Constraint {
  leftOperand?: string;
  operator?: string;
  rightOperand?: unknown;
}

export interface Permission {
  '@type'?: string;
  action?: string;
  constraint?: Constraint[];
}

export interface Offer {
  '@id'?: string;
  '@type'?: string;
  permission?: Permission[];
}

export interface Distribution {
  format?: string;
}

export interface Dataset {
  '@id'?: string;
  'edc:properties'?: Record<string, unknown>;
  hasPolicy?: Offer[];
  distribution?: Distribution[];
}

export interface Catalog {
  dataset?: Dataset[];
}

export interface Contract {
  id?: string;
  counterParty?: string;
  assetId?: string;
  signingDate?: string;
  pending?: boolean;
}

export interface ContractRequest {
  offerId?: string;
  providerId?: string;
  assetId?: string;
  permissions?: Constraint[];
  prohibitions?: Constraint[];
  obligations?: Constraint[];
}

export interface ContractNegotiation {
  id?: string;
  state?: string;
}

export interface TransferProcessRequest {
  counterPartyId?: string;
  contractId?: string;
  transferType?: string;
  dataDestination?: Record<string, unknown>;
}

export interface TransferProcess {
  type?: string;
  correlationId?: string;
  contractId?: string;
  state?: string;
  stateTimestamp?: number;
  contentDataAddress?: Record<string, unknown>;
}

export interface PartnerReferenceRequest {
  identifier: string;
  nickname?: string;
  properties?: Record<string, unknown>;
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
