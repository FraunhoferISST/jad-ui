/**
 * TypeScript models for the Redline "Tenant operations" backend API.
 *
 * These interfaces mirror the schemas defined in `redline-api.json` and are
 * used by the {@link RedlineService} for communication with the Redline
 * backend.
 */

/** Runtime configuration for the Redline backend, loaded from a config file. */
export interface RedlineConfig {
  /** Base URL of the Redline backend (e.g. `http://localhost:8081`). */
  baseUrl: string;
}

/** Request body to create a new service provider. */
export interface ServiceProvider {
  name: string;
}

/** A registered service provider. */
export interface ServiceProviderResponse {
  id: number;
  name: string;
}

/** Request body to create a new dataspace. */
export interface DataspaceRequest {
  name: string;
  properties?: Record<string, unknown>;
}

/** A registered dataspace. */
export interface DataspaceResponse {
  id: number;
  name: string;
  properties?: Record<string, unknown>;
}

/**
 * Describes a participant's relationship to a dataspace, including the roles
 * it takes and the agreement types it supports.
 */
export interface DataspaceInfo {
  dataspaceId: number;
  agreementTypes?: string[];
  roles?: string[];
  properties?: Record<string, unknown>;
  id?: number;
}

/** A virtual agent of a participant (e.g. a connector) and its current state. */
export interface VirtualParticipantAgent {
  id: number;
  type: string;
  state: string;
}

/** A participant profile belonging to a tenant. */
export interface Participant {
  id: number;
  identifier: string;
  agents?: VirtualParticipantAgent[];
  dataspaceInfos?: DataspaceInfo[];
}

/** A tenant registered under a service provider. */
export interface Tenant {
  id: number;
  providerId: number;
  name: string;
  participants?: Participant[];
  properties?: Record<string, unknown>;
}

/** Request body to register a new tenant under a service provider. */
export interface TenantRegistration {
  tenantName: string;
  dataspaceInfos?: DataspaceInfo[];
  properties?: Record<string, unknown>;
}

/** Request body to deploy a participant into the dataspace. */
export interface ParticipantDeployment {
  participantId: number;
  identifier: string;
}
