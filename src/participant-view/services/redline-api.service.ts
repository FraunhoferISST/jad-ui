import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { REDLINE_CONFIG } from '../../operator-view/redline.config';
import {
  DataspaceResource,
  PartnerReferenceRequest,
  PartnerReference,
  TenantResource,
} from '../models/redline-data.model';
import { ParticipantContextService } from './participant-context.service';

@Injectable({ providedIn: 'root' })
export class RedlineApiService {
  private readonly http = inject(HttpClient);
  private readonly redlineConfig = inject(REDLINE_CONFIG);
  private readonly contextService = inject(ParticipantContextService);

  private get apiUrl(): string {
    const base = this.redlineConfig.baseUrl.replace(/\/$/, '');
    return `${base}/api/ui`;
  }

  async getParticipantDataspaces(): Promise<DataspaceResource[]> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.get<DataspaceResource[]>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/dataspaces`,
      ),
    );
  }

  async getPartners(dataspaceId: number): Promise<PartnerReference[]> {
    const context = await this.contextService.resolve();
    const response = await firstValueFrom(
      this.http.get<PartnerReference[] | PartnerReference>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/partners/${dataspaceId}`,
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }

  async createPartner(
    dataspaceId: number,
    partner: PartnerReferenceRequest,
  ): Promise<PartnerReference> {
    const context = await this.contextService.resolve();

    return firstValueFrom(
      this.http.post<PartnerReference>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/partners/${dataspaceId}`,
        partner,
      ),
    );
  }

  async getTenants(serviceProviderId?: number): Promise<TenantResource[]> {
    const context = await this.contextService.resolve();
    const providerId = serviceProviderId ?? context.providerId;
    const response = await firstValueFrom(
      this.http.get<TenantResource[] | TenantResource>(
        `${this.apiUrl}/service-providers/${providerId}/tenants`,
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }
}
