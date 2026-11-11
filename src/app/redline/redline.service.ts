import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { REDLINE_CONFIG } from './redline.config';
import {
  DataspaceInfo,
  DataspaceRequest,
  DataspaceResponse,
  HealthResponse,
  Participant,
  ParticipantDeployment,
  PartnerReference,
  Tenant,
  TenantRegistration,
} from './redline.models';

/** The seeded Redline service provider is the only provider supported by JAD. */
const SERVICE_PROVIDER_ID = 1;

/**
 * Service to manage dataspaces, tenants and participants under the seeded
 * service provider via the Redline "Tenant operations" backend API.
 *
 * Communication is performed over plain HTTP (the Redline backend is a REST
 * API separate from the EDC management API used by the EDC connector client).
 */
@Injectable({ providedIn: 'root' })
export class RedlineService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(REDLINE_CONFIG);

  /** Base URL of the Redline UI API (without trailing slash). */
  private get apiUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/api/ui`;
  }

  /** Tenant operations are always scoped to the seeded service provider. */
  private get tenantsUrl(): string {
    return `${this.apiUrl}/service-providers/${SERVICE_PROVIDER_ID}/tenants`;
  }

  // --- Server info ---------------------------------------------------------

  /**
   * Checks whether the Redline backend is healthy by calling its health
   * endpoint and inspecting the reported `status`.
   * @returns A promise resolving to `true` when the status is `UP`, and
   *   `false` when the status is anything else or the request fails.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl.replace(/\/$/, '');
      const health = await firstValueFrom(
        this.http.get<HealthResponse>(`${baseUrl}/api/public/health`),
      );
      return health.status?.toUpperCase() === 'UP';
    } catch {
      return false;
    }
  }

  // --- Dataspaces ----------------------------------------------------------

  /**
   * Retrieves all registered dataspaces.
   * @returns A promise resolving to the list of dataspaces.
   */
  getDataspaces(): Promise<DataspaceResponse[]> {
    return firstValueFrom(this.http.get<DataspaceResponse[]>(`${this.apiUrl}/dataspaces`));
  }

  /**
   * Creates a new dataspace.
   * @param dataspace - The dataspace to create.
   * @returns A promise resolving to the created dataspace.
   */
  createDataspace(dataspace: DataspaceRequest): Promise<DataspaceResponse> {
    return firstValueFrom(
      this.http.post<DataspaceResponse>(`${this.apiUrl}/dataspaces`, dataspace),
    );
  }

  // --- Tenants -------------------------------------------------------------

  /**
   * Lists all tenants under the seeded service provider.
   * @returns A promise resolving to the tenants of the service provider.
   */
  listTenants(): Promise<Tenant[]> {
    return firstValueFrom(this.http.get<Tenant[]>(this.tenantsUrl));
  }

  /**
   * Retrieves a single tenant under the seeded service provider.
   * @param tenantId - Database ID of the tenant.
   * @returns A promise resolving to the requested tenant.
   */
  getTenant(tenantId: number): Promise<Tenant> {
    return firstValueFrom(this.http.get<Tenant>(`${this.tenantsUrl}/${tenantId}`));
  }

  /**
   * Registers a new tenant under the seeded service provider. A participant
   * profile is also created by the backend.
   * @param registration - The tenant registration payload.
   * @returns A promise resolving to the registered tenant.
   */
  registerTenant(registration: TenantRegistration): Promise<Tenant> {
    // Explicitly send an empty list: registration must never assign membership,
    // including on backends that expect dataspaceInfos to be present.
    return firstValueFrom(
      this.http.post<Tenant>(this.tenantsUrl, {
        tenantName: registration.tenantName,
        ...(registration.properties ? { properties: registration.properties } : {}),
        dataspaceInfos: [],
      }),
    );
  }

  /**
   * Adds or updates local tenant membership metadata, preserving partner references.
   * This does not deploy participant resources.
   */
  onboardTenantToDataspace(tenantId: number, info: DataspaceInfo): Promise<Tenant> {
    return firstValueFrom(
      this.http.post<Tenant>(`${this.tenantsUrl}/${tenantId}/dataspaces`, info),
    );
  }

  /**
   * Removes membership and partner references from all participants of the tenant.
   * This does not deprovision participant resources.
   */
  offboardTenantFromDataspace(tenantId: number, dataspaceId: number): Promise<Tenant> {
    return firstValueFrom(
      this.http.delete<Tenant>(`${this.tenantsUrl}/${tenantId}/dataspaces/${dataspaceId}`),
    );
  }

  // --- Participant dataspaces and partners ----------------------------------

  private participantUrl(tenantId: number, participantId: number): string {
    return `${this.tenantsUrl}/${tenantId}/participants/${participantId}`;
  }

  getParticipantDataspaces(tenantId: number, participantId: number): Promise<DataspaceResponse[]> {
    return firstValueFrom(
      this.http.get<DataspaceResponse[]>(
        `${this.participantUrl(tenantId, participantId)}/dataspaces`,
      ),
    );
  }

  getPartners(
    tenantId: number,
    participantId: number,
    dataspaceId: number,
  ): Promise<PartnerReference[]> {
    return firstValueFrom(
      this.http.get<PartnerReference[]>(
        `${this.participantUrl(tenantId, participantId)}/partners/${dataspaceId}`,
      ),
    );
  }

  createPartner(
    tenantId: number,
    participantId: number,
    dataspaceId: number,
    partner: PartnerReference,
  ): Promise<PartnerReference> {
    return firstValueFrom(
      this.http.post<PartnerReference>(
        `${this.participantUrl(tenantId, participantId)}/partners/${dataspaceId}`,
        partner,
      ),
    );
  }

  // --- Participants --------------------------------------------------------

  /**
   * Retrieves a single participant of a tenant under the seeded service provider.
   * @param tenantId - Database ID of the tenant.
   * @param participantId - Database ID of the participant.
   * @returns A promise resolving to the requested participant.
   */
  getParticipant(tenantId: number, participantId: number): Promise<Participant> {
    return firstValueFrom(
      this.http.get<Participant>(`${this.tenantsUrl}/${tenantId}/participants/${participantId}`),
    );
  }

  /**
   * Deploys a participant. This triggers the creation of resources in the
   * dataspace under the seeded service provider.
   * @param tenantId - Database ID of the tenant.
   * @param participantId - Database ID of the participant.
   * @param deployment - The deployment payload.
   * @returns A promise resolving to the deployed participant.
   */
  deployParticipant(
    tenantId: number,
    participantId: number,
    deployment: ParticipantDeployment,
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.post<Participant>(
        `${this.tenantsUrl}/${tenantId}/participants/${participantId}/deployments`,
        deployment,
      ),
    );
  }
}
