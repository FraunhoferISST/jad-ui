import { inject, Injectable } from '@angular/core';

import { DataspaceResource } from '../models/redline-data.model';
import { RedlineApiService } from './redline-api.service';

@Injectable({ providedIn: 'root' })
export class DataspaceService {
  private readonly redline = inject(RedlineApiService);

  async getParticipantDataspaces(): Promise<DataspaceResource[]> {
    try {
      return await this.redline.getParticipantDataspaces();
    } catch {
      return [];
    }
  }

  async getPrimaryDataspace(): Promise<DataspaceResource> {
    const dataspaces = await this.getParticipantDataspaces();
    const catena = dataspaces.find(ds => ds.name.toLowerCase().includes('catena'));
    if (catena) {
      return catena;
    }

    if (dataspaces.length === 0) {
      throw new Error('No dataspaces found for the current participant.');
    }

    return dataspaces[0];
  }
}
