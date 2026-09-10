import { inject, Injectable } from '@angular/core';

import { CelExpression, PolicySet } from '../models/redline-data.model';
import { PARTNER_ACCESS_EXPRESSION, getAccessRestrictionPolicy } from '../utils/policy.utils';
import { FileSharingApiService } from './file-sharing-api.service';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly fileSharing = inject(FileSharingApiService);

  async uploadFile(
    file: File,
    useCaseId: string,
    partnerIds: string[],
  ): Promise<void> {
    const formData = new FormData();

    const publicMetadata = {
      useCase: useCaseId,
      size: file.size,
    };

    const privateMetadata = {
      partnerIds,
      origin: 'owned',
    };

    formData.append(
      'publicMetadata',
      new Blob([JSON.stringify(publicMetadata)], { type: 'application/json' }),
    );
    formData.append(
      'privateMetadata',
      new Blob([JSON.stringify(privateMetadata)], { type: 'application/json' }),
    );

    if (partnerIds.length > 0) {
      const celExpressions: CelExpression[] = [PARTNER_ACCESS_EXPRESSION];
      const policySet: PolicySet = getAccessRestrictionPolicy(partnerIds);

      formData.append(
        'celExpressions',
        new Blob([JSON.stringify(celExpressions)], { type: 'application/json' }),
      );
      formData.append(
        'policySet',
        new Blob([JSON.stringify(policySet)], { type: 'application/json' }),
      );
    }

    formData.append('file', file, file.name);

    await this.fileSharing.uploadFile(formData);
  }
}
