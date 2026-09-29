import { inject, Injectable } from '@angular/core';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { AssetInput, ContractDefinitionInput, CriterionInput } from '@think-it-labs/edc-connector-client';

import { asString } from '../utils/cast.utils';
import { ExtendedEdcClient } from '../models/edc.model';
import { FileSharingApiService } from './file-sharing-api.service';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly edcClientService = inject(EdcClientService);

  async uploadFile(file: File, contractDefinitionId: string): Promise<void> {
    if (!contractDefinitionId) {
      throw new Error('Select a contract definition before uploading.');
    }

    const client = (await this.edcClientService.getClient()) as ExtendedEdcClient;
    // Resolve the definition before storing anything; its policies are owned by the admin.
    await client.management.contractDefinitions.get(contractDefinitionId);

    const uid = crypto.randomUUID();
    const uploadMarker = `upload-${uid}`;
    const assetId = `asset-${uid}`;
    const formData = new FormData();
    formData.append('metadata', JSON.stringify({
      size: file.size,
      type: file.type,
      assetId,
      originalFilename: file.name,
      uploadMarker,
      origin: 'owned',
      contractDefinitionId,
    }));
    formData.append('file', file, file.name);

    await this.fileSharing.uploadFile(formData);

    let fileId: string | undefined;
    let assetCreateAttempted = false;
    let definitionUpdateAttempted = false;
    try {
      fileId = (await this.resolveUploadedFile(uploadMarker, file.name)).id;
      if (!fileId) {
        throw new Error('Uploaded file could not be resolved from file-sharing storage.');
      }

      const assetInput: AssetInput = {
        '@type': 'Asset',
        '@id': assetId,
        properties: {
          name: file.name,
          contenttype: file.type || 'application/octet-stream',
          fileId,
          originalFilename: file.name,
          size: String(file.size),
        },
        dataplaneMetadata: {
          '@type': 'DataplaneMetadata',
          properties: { fileId },
        },
      };
      assetCreateAttempted = true;
      await client.management.assets.create(assetInput);

      // Fetch again immediately before updating so edits made after selection are preserved.
      const definition = await client.management.contractDefinitions.get(contractDefinitionId);
      const assetsSelector: CriterionInput[] = definition.assetsSelector.map(criterion => ({
        '@type': 'Criterion',
        operandLeft: criterion.operandLeft,
        operator: criterion.operator,
        operandRight: criterion.operandRight,
      }));
      assetsSelector.push({ '@type': 'Criterion', operandLeft: 'id', operator: '=', operandRight: assetId });
      const input: ContractDefinitionInput = {
        '@type': 'ContractDefinition',
        '@id': definition.id,
        accessPolicyId: definition.accessPolicyId,
        contractPolicyId: definition.contractPolicyId,
        assetsSelector,
      };
      definitionUpdateAttempted = true;
      await client.management.contractDefinitions.update(input);
    } catch (error) {
      if (assetCreateAttempted) {
        if (definitionUpdateAttempted) {
          // A failed response to an update may still mean the definition changed.
          // Check before deleting an asset that might already be referenced.
          const updatedDefinition = await client.management.contractDefinitions
            .get(contractDefinitionId).catch(() => null);
          if (!updatedDefinition || updatedDefinition.assetsSelector.some(criterion =>
            criterion.operandLeft === 'id' && criterion.operandRight === assetId,
          )) {
            throw error;
          }
        }
        try {
          await client.management.assets.delete(assetId);
        } catch {
          // If the asset still exists, retain its backing file.
          throw error;
        }
      }
      // Resolution can time out after the storage accepted the upload. Make one
      // final best-effort lookup before cleanup so the stored file is not orphaned.
      if (!fileId) {
        fileId = (await this.fileSharing.listFiles().catch(() => []))
          .find(file => asString(file.metadata?.['uploadMarker']) === uploadMarker)?.id;
      }
      if (fileId) {
        await this.fileSharing.deleteFile(fileId).catch(() => undefined);
      }
      throw error;
    }
  }

  private async resolveUploadedFile(uploadMarker: string, originalFilename: string): Promise<{ id?: string }> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const files = await this.fileSharing.listFiles();
      const uploaded = files.find(file => asString(file.metadata?.['uploadMarker']) === uploadMarker);
      if (uploaded?.id) {
        return uploaded;
      }
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 200));
    }
    throw new Error(`Could not resolve uploaded file id for "${originalFilename}".`);
  }
}
