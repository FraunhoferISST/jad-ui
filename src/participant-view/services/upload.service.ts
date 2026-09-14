import { inject, Injectable } from '@angular/core';
import { EdcConfig } from '@eclipse-edc/dashboard-core';
import {
    AssetInput,
    ContractDefinitionInput, CriterionInput,
    EdcConnectorClient,
    EdcConnectorClientError,
    EdcConnectorClientErrorType,
    EdcController,
    PolicyBuilder,
    PolicyDefinitionInput
} from '@think-it-labs/edc-connector-client';

import { AuthService } from '../../app/auth/auth.service';
import { CelExpression } from '../models/redline-data.model';
import { asString } from '../utils/cast.utils';
import { PARTNER_ACCESS_EXPRESSION } from '../utils/policy.utils';
import { FileSharingApiService } from './file-sharing-api.service';
import { ParticipantConfigService } from './participant-config.service';

class CelExpressionsController extends EdcController {
  async create(expressions: CelExpression[]): Promise<void> {
    if (!this.context) {
      throw new Error('No EDC context available while creating policy functions.');
    }

    for(const exp of expressions) {
      exp['@context'] = ['https://w3id.org/edc/connector/management/v2'];
      await this.inner.request(this.context.management, {
        path: `/v5/celexpressions`,
        method: 'POST',
        authorization: this.context.authorization,
        body: exp,
      });
    }
  }
}

type UploadClient = EdcConnectorClient & { celExpressions: CelExpressionsController };

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

  async uploadFile(
    file: File,
    useCaseId: string,
    partnerIds: string[],
  ): Promise<void> {
    const ids = this.createResourceIds();
    const normalizedPartnerIds = [...new Set(partnerIds.filter(partnerId => partnerId.trim().length > 0))];

    const formData = new FormData();

    const publicMetadata = {
      useCase: useCaseId,
      size: file.size,
      assetId: ids.assetId,
      originalFilename: file.name,
      uploadMarker: ids.uploadMarker,
    };

    const privateMetadata = {
      partnerIds: normalizedPartnerIds,
      origin: 'owned',
      policyId: ids.policyId,
      contractDefinitionId: ids.contractDefinitionId,
    };

    formData.append(
      'publicMetadata',
      new Blob([JSON.stringify(publicMetadata)], { type: 'application/json' }),
    );
    formData.append(
      'privateMetadata',
      new Blob([JSON.stringify(privateMetadata)], { type: 'application/json' }),
    );

    formData.append('file', file, file.name);

    await this.fileSharing.uploadFile(formData);

    // const uploadedFile = await this.resolveUploadedFile(ids.uploadMarker, file.name);
    // var fileId = uploadedFile.id;
    const fileId = 'testId';
    if (!fileId) {
      throw new Error('Uploaded file could not be resolved from file-sharing storage.');
    } else {
    }

    const client = this.createUploadClient();
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
        useCaseId,
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

  private createUploadClient(): UploadClient {
    const config = this.resolveParticipantEdcConfig();
    const builder = new EdcConnectorClient.Builder()
      .managementUrl(config.managementUrl)
      .defaultUrl(config.defaultUrl)
      .protocolUrl(config.protocolUrl)
      .managementApiVersion(config.managementApiVersion)
      .use('celExpressions', CelExpressionsController);

    if (config.protocolVersion) {
      builder.protocolVersion(config.protocolVersion);
    }
    if (config.identityUrl) {
      builder.identityUrl(config.identityUrl);
    }
    if (config.identityApiVersion) {
      builder.identityApiVersion(config.identityApiVersion);
    }
    if (config.presentationUrl) {
      builder.presentationUrl(config.presentationUrl);
    }

    const token = this.auth.session()?.token;
    if (token) {
      const key = config.authorization?.key ?? 'Authorization';
      builder.authorization(key, `Bearer ${token}`);
    } else if (config.authorization?.key && config.authorization.value) {
      builder.authorization(config.authorization.key, config.authorization.value);
    }

    return builder.build() as UploadClient;
  }

  private resolveParticipantEdcConfig(): EdcConfig {
    const config = this.auth.user()?.participantEdcConfig;
    if (!config) {
      throw new Error('Participant EDC connector config is unavailable for upload.');
    }
    return config;
  }

  private async ensurePartnerAccessExpression(client: UploadClient): Promise<void> {
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
    useCaseId: string;
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
        'edc:assetId': params.assetId,
        'edc:fileId': params.fileId,
        'edc:useCase': params.useCaseId,
        'edc:originalFilename': params.file.name,
        'edc:size': String(params.file.size),
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
    client: UploadClient,
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
