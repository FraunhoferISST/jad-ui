import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { REDLINE_CONFIG } from '../redline.config';
import {
  DataspaceRequest,
  DataspaceResponse,
  HealthResponse,
  Participant,
  ParticipantDeployment,
  ServiceProvider,
  ServiceProviderResponse,
  Tenant,
  TenantRegistration,
} from '../models/redline.models';

/**
 * Service to manage dataspaces, service providers, tenants and participants
 * via the Redline "Tenant operations" backend API.
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

  // --- Server info ---------------------------------------------------------

  /**
   * Calls the Redline health endpoint (`GET /api/public/health`).
   * @returns A promise resolving to the raw health response.
   */
  getHealth(): Promise<HealthResponse> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    return firstValueFrom(this.http.get<HealthResponse>(`${baseUrl}/api/public/health`));
  }

  /**
   * Checks whether the Redline backend is healthy by calling its health
   * endpoint and inspecting the reported `status`.
   * @returns A promise resolving to `true` when the status is `UP`, and
   *   `false` when the status is anything else or the request fails.
   */
  async checkHealth(): Promise<boolean> {
    console.log('health check');
    try {
      const health = await this.getHealth();
      return health.status?.toUpperCase() === 'UP';
    } catch {
      return false;
    }
  }

  // --- Service providers ---------------------------------------------------

  /**
   * Retrieves all registered service providers.
   * @returns A promise resolving to the list of service providers.
   */
  getServiceProviders(): Promise<ServiceProviderResponse[]> {
    return firstValueFrom(
      this.http.get<ServiceProviderResponse[]>(`${this.apiUrl}/service-providers`),
    );
  }

  /**
   * Registers a new service provider.
   * @param provider - The service provider to create.
   * @returns A promise resolving to the created service provider.
   */
  createServiceProvider(provider: ServiceProvider): Promise<ServiceProviderResponse> {
    return firstValueFrom(
      this.http.post<ServiceProviderResponse>(`${this.apiUrl}/service-providers`, provider),
    );
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
   * Lists all tenants under a specific service provider.
   * @param serviceProviderId - Database ID of the service provider.
   * @returns A promise resolving to the tenants of the service provider.
   */
  listTenants(serviceProviderId: number): Promise<Tenant[]> {
    return firstValueFrom(
      this.http.get<Tenant[]>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants`,
      ),
    );
  }

  /**
   * Retrieves a single tenant.
   * @param serviceProviderId - Database ID of the service provider.
   * @param tenantId - Database ID of the tenant.
   * @returns A promise resolving to the requested tenant.
   */
  getTenant(serviceProviderId: number, tenantId: number): Promise<Tenant> {
    return firstValueFrom(
      this.http.get<Tenant>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants/${tenantId}`,
      ),
    );
  }

  /**
   * Registers a new tenant under a service provider. A participant profile is
   * also created by the backend.
   * @param serviceProviderId - Database ID of the service provider.
   * @param registration - The tenant registration payload.
   * @returns A promise resolving to the registered tenant.
   */
  registerTenant(
    serviceProviderId: number,
    registration: TenantRegistration,
  ): Promise<Tenant> {
    return firstValueFrom(
      this.http.post<Tenant>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants`,
        registration,
      ),
    );
  }

  // --- Participants --------------------------------------------------------

  /**
   * Retrieves a single participant of a tenant.
   * @param serviceProviderId - Database ID of the service provider.
   * @param tenantId - Database ID of the tenant.
   * @param participantId - Database ID of the participant.
   * @returns A promise resolving to the requested participant.
   */
  getParticipant(
    serviceProviderId: number,
    tenantId: number,
    participantId: number,
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.get<Participant>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants/${tenantId}/participants/${participantId}`,
      ),
    );
  }

  /**
   * Deploys a participant. This triggers the creation of resources in the
   * dataspace.
   * @param serviceProviderId - Database ID of the service provider.
   * @param tenantId - Database ID of the tenant.
   * @param participantId - Database ID of the participant.
   * @param deployment - The deployment payload.
   * @returns A promise resolving to the deployed participant.
   */
  deployParticipant(
    serviceProviderId: number,
    tenantId: number,
    participantId: number,
    deployment: ParticipantDeployment,
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.post<Participant>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants/${tenantId}/participants/${participantId}/deployments`,
        deployment,
      ),
    );
  }

  /**
   * Registers a data plane for a participant.
   * @param serviceProviderId - Database ID of the service provider.
   * @param tenantId - Database ID of the tenant.
   * @param participantId - Database ID of the participant.
   * @returns A promise that resolves when the data plane is registered.
   */
  registerDataPlane(
    serviceProviderId: number,
    tenantId: number,
    participantId: number,
  ): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.apiUrl}/service-providers/${serviceProviderId}/tenants/${tenantId}/participants/${participantId}/dataplanes`,
        {},
      ),
    );
  }
}
