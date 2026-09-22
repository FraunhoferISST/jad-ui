import { inject, Injectable } from '@angular/core';

import {
  PartnerReference,
  PartnerReferenceRequest,
  TenantResource,
} from '../models/redline-data.model';
import { DataspaceService } from './dataspace.service';
import { RedlineApiService } from './redline-api.service';

@Injectable({ providedIn: 'root' })
export class PartnerService {
  private readonly dataspaces = inject(DataspaceService);
  private readonly redline = inject(RedlineApiService);

  async getPartners(): Promise<PartnerReference[]> {
    try {
      const dataspace = await this.dataspaces.getPrimaryDataspace();
      return await this.redline.getPartners(dataspace.id);
    } catch {
      return [];
    }
  }

  async addPartner(partner: PartnerReferenceRequest): Promise<PartnerReference> {
    const dataspace = await this.dataspaces.getPrimaryDataspace();
    return this.redline.createPartner(dataspace.id, partner);
  }

  async getAllTenants(): Promise<TenantResource[]> {
    try {
      return await this.redline.getTenants();
    } catch {
      return [];
    }
  }
}
