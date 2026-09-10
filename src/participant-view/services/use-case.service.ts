import { inject, Injectable } from '@angular/core';

import { UseCase } from '../models/redline-data.model';
import { ParticipantConfigService } from './participant-config.service';

@Injectable({ providedIn: 'root' })
export class UseCaseService {
  private readonly config = inject(ParticipantConfigService);

  async getUseCases(): Promise<UseCase[]> {
    return this.config.getUseCases();
  }

  async getUseCaseLabel(id: string | undefined): Promise<string> {
    if (!id) {
      return 'N/A';
    }
    const useCase = (await this.getUseCases()).find(item => item.id === id);
    return useCase?.label ?? id;
  }
}
