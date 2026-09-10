import { inject, Injectable } from '@angular/core';

import { PartnerReference } from '../models/redline-data.model';
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
}
