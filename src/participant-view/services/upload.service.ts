import { inject, Injectable } from '@angular/core';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import {
    AssetInput,
    ContractDefinitionInput, CriterionInput,
    EdcConnectorClientError,
    EdcConnectorClientErrorType,
    PolicyBuilder,
    PolicyDefinitionInput
} from '@think-it-labs/edc-connector-client';

import { AuthService } from '../../app/auth/auth.service';
import { asString } from '../utils/cast.utils';
import { PARTNER_ACCESS_EXPRESSION } from '../utils/policy.utils';
import { FileSharingApiService } from './file-sharing-api.service';
import { ParticipantConfigService } from './participant-config.service';
import { ExtendedEdcClient } from '../models/edc.model';


interface UploadResourceIds {
  uploadMarker: string;
  assetId: string;
  policyId: string;
  contractDefinitionId: string;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly auth = inject(AuthService);
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly participantConfig = inject(ParticipantConfigService);
  private readonly edcClientService = inject(EdcClientService);

  async uploadFile(
    file: File,
    partnerIds: string[],
  ): Promise<void> {
    const ids = this.createResourceIds();
    const normalizedPartnerIds = [...new Set(partnerIds.filter(partnerId => partnerId.trim().length > 0))];

    const formData = new FormData();

    const metadata = {
      size: file.size,
      type: file.type,
      assetId: ids.assetId,
      originalFilename: file.name,
      uploadMarker: ids.uploadMarker,
      partnerIds: normalizedPartnerIds,
      origin: 'owned',
      policyId: ids.policyId,
      contractDefinitionId: ids.contractDefinitionId,
    };

    formData.append( 'metadata', JSON.stringify(metadata));
    formData.append('file', file, file.name);

    await this.fileSharing.uploadFile(formData);

    // const uploadedFile = await this.resolveUploadedFile(ids.uploadMarker, file.name);
    // var fileId = uploadedFile.id;
    const fileId = 'testId';
    if (!fileId) {
      throw new Error('Uploaded file could not be resolved from file-sharing storage.');
    } else {
    }

    const client = (await this.edcClientService.getClient()) as ExtendedEdcClient;
    let policyCreated = false;
    let assetCreated = false;
    let contractDefinitionCreated = false;

    try {
      await this.ensurePartnerAccessExpression(client);

      const policyInput = this.createPolicyDefinitionInput(ids.policyId, normalizedPartnerIds);
      await client.management.policyDefinitions.create(policyInput);
      policyCreated = true;

      const assetInput = await this.createAssetInput({
        assetId: ids.assetId,
        file,
        fileId,
        partnerIds: normalizedPartnerIds,
      });
      await client.management.assets.create(assetInput);
      assetCreated = true;

      const contractDefinitionInput = this.createContractDefinitionInput(
        ids.contractDefinitionId,
        ids.policyId,
        ids.assetId,
      );
      await client.management.contractDefinitions.create(contractDefinitionInput);
      contractDefinitionCreated = true;
    } catch (error) {
      await this.rollbackFailedUpload(client, {
        fileId,
        assetId: ids.assetId,
        policyId: ids.policyId,
        contractDefinitionId: ids.contractDefinitionId,
        policyCreated,
        assetCreated,
        contractDefinitionCreated,
      });

      throw error;
    }
  }

  private createResourceIds(): UploadResourceIds {
    const uid = crypto.randomUUID();
    return {
      uploadMarker: `upload-${uid}`,
      assetId: `asset-${uid}`,
      policyId: `policy-${uid}`,
      contractDefinitionId: `contract-definition-${uid}`,
    };
  }

  private async ensurePartnerAccessExpression(client: ExtendedEdcClient): Promise<void> {
    try {
      await client.celExpressions.create([PARTNER_ACCESS_EXPRESSION]);
    } catch (error) {
      if (this.isDuplicateError(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown policy function error.';
      throw new Error(`Failed to create policy expression: ${message}`);
    }
  }

  private isDuplicateError(error: unknown): boolean {
    if (!(error instanceof EdcConnectorClientError)) {
      return false;
    }

    if (error.type === EdcConnectorClientErrorType.Duplicate) {
      return true;
    }

    return (error.message ?? '').toLowerCase().includes('already');
  }

  private createPolicyDefinitionInput(
    policyId: string,
    partnerIds: string[],
  ): PolicyDefinitionInput {
    const policyRaw: Record<string, unknown> = { '@type': 'Set' };

    if (partnerIds.length === 0) {
      policyRaw['permission'] = [{ action: 'use' }];
    } else {
      policyRaw['permission'] = [
        {
          action: 'use',
          constraint: [
            {
              leftOperand: PARTNER_ACCESS_EXPRESSION.leftOperand,
              operator: partnerIds.length > 1 ? 'isAnyOf' : 'eq',
              rightOperand: partnerIds.length > 1 ? partnerIds : partnerIds[0],
            },
          ],
        },
      ];
    }

    return {
      '@type': 'PolicyDefinition',
      '@id': policyId,
      id: policyId,
      policy: new PolicyBuilder().type('Set').raw(policyRaw).build(),
    };
  }

  private async createAssetInput(params: {
    assetId: string;
    file: File;
    fileId: string;
    partnerIds: string[];
  }): Promise<AssetInput> {
    const participantContextId = this.auth.user()?.participantContextId;
    if (!participantContextId) {
      throw new Error('Participant context id is unavailable while creating the asset.');
    }

    const fileSharingConfig = await this.participantConfig.getFileSharingConfig();
    const fileSourceUrl = `${fileSharingConfig.baseUrl.replace(/\/$/, '')}/api/files/${encodeURIComponent(participantContextId)}/${encodeURIComponent(params.fileId)}`;

    return {
      '@type': 'Asset',
      '@id': params.assetId,
      properties: {
        name: params.file.name,
        contenttype: params.file.type || 'application/octet-stream',
        'fileId': params.fileId,
        'originalFilename': params.file.name,
        'size': String(params.file.size),
      },
      privateProperties: {
        partnerIds: params.partnerIds,
      },
      dataAddress: {
        type: 'HttpData',
        method: 'GET',
        baseUrl: fileSourceUrl,
        name: `upload-${params.assetId}`,
      },
    };
  }

  private createContractDefinitionInput(
    contractDefinitionId: string,
    policyId: string,
    assetId: string,
  ): ContractDefinitionInput {
    return {
      '@type': 'ContractDefinition',
      '@id': contractDefinitionId,
      accessPolicyId: policyId,
      contractPolicyId: policyId,
      assetsSelector: [{'@type': 'Criterion', operandLeft: 'id', operator: '=', operandRight: assetId } as CriterionInput],
    };
  }

  private async resolveUploadedFile(
    uploadMarker: string,
    originalFilename: string,
  ): Promise<{ id?: string; metadata?: Record<string, unknown> }> {
    const attempts = 5;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const files = await this.fileSharing.listFiles();
      const uploaded = files.find(file => {
        const metadata = file.metadata ?? {};
        const marker = asString(metadata['uploadMarker']);
        return marker === uploadMarker;
      });

      if (uploaded?.id) {
        return uploaded;
      }

      await this.delay((attempt + 1) * 200);
    }

    throw new Error(`Could not resolve uploaded file id for "${originalFilename}".`);
  }

  private async rollbackFailedUpload(
    client: ExtendedEdcClient,
    params: {
      fileId: string;
      assetId: string;
      policyId: string;
      contractDefinitionId: string;
      policyCreated: boolean;
      assetCreated: boolean;
      contractDefinitionCreated: boolean;
    },
  ): Promise<void> {
    if (params.contractDefinitionCreated) {
      await client.management.contractDefinitions
        .delete(params.contractDefinitionId)
        .catch(() => undefined);
    }

    if (params.assetCreated) {
      await client.management.assets.delete(params.assetId).catch(() => undefined);
    }

    if (params.policyCreated) {
      await client.management.policyDefinitions.delete(params.policyId).catch(() => undefined);
    }

    await this.fileSharing.deleteFile(params.fileId).catch(() => undefined);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}
