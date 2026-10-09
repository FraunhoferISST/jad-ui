import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { REDLINE_CONFIG } from '../../operator-view/redline.config';
import { SERVICE_PROVIDER_ID } from '../../operator-view/redline.constants';
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

  private get tenantsUrl(): string {
    return `${this.apiUrl}/service-providers/${SERVICE_PROVIDER_ID}/tenants`;
  }

  async getParticipantDataspaces(): Promise<DataspaceResource[]> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.get<DataspaceResource[]>(
        `${this.tenantsUrl}/${context.tenantId}/participants/${context.participantId}/dataspaces`,
      ),
    );
  }

  async getPartners(dataspaceId: number): Promise<PartnerReference[]> {
    const context = await this.contextService.resolve();
    const response = await firstValueFrom(
      this.http.get<PartnerReference[] | PartnerReference>(
        `${this.tenantsUrl}/${context.tenantId}/participants/${context.participantId}/partners/${dataspaceId}`,
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
        `${this.tenantsUrl}/${context.tenantId}/participants/${context.participantId}/partners/${dataspaceId}`,
        partner,
      ),
    );
  }

  async getTenants(): Promise<TenantResource[]> {
    const response = await firstValueFrom(
      this.http.get<TenantResource[] | TenantResource>(this.tenantsUrl),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }
}
