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

export interface PartnerReferenceRequest {
  identifier: string;
  nickname?: string;
  properties?: Record<string, unknown>;
}

export interface TenantParticipantResource {
  id: number;
  identifier: string;
}

export interface TenantResource {
  id: number;
  providerId: number;
  name: string;
  participants?: TenantParticipantResource[];
  properties?: Record<string, unknown>;
}
