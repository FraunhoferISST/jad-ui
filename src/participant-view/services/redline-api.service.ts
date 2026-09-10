import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { REDLINE_CONFIG } from '../../operator-view/redline.config';
import {
  Catalog,
  Contract,
  ContractNegotiation,
  ContractRequest,
  DataspaceResource,
  FileResource,
  PartnerReference,
  TransferProcess,
  TransferProcessRequest,
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

  async listFiles(): Promise<FileResource[]> {
    const context = await this.contextService.resolve();
    const response = await firstValueFrom(
      this.http.get<FileResource[] | FileResource>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/files`,
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }

  async uploadFile(formData: FormData): Promise<void> {
    const context = await this.contextService.resolve();
    await firstValueFrom(
      this.http.post<void>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/files`,
        formData,
      ),
    );
  }

  async listContracts(): Promise<Contract[]> {
    const context = await this.contextService.resolve();
    const response = await firstValueFrom(
      this.http.get<Contract[] | Contract>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/contracts`,
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }

  async requestContract(request: ContractRequest): Promise<string> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.post(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/contracts`,
        request,
        { responseType: 'text' },
      ),
    );
  }

  async getContractNegotiation(contractNegotiationId: string): Promise<ContractNegotiation> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.get<ContractNegotiation>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/contracts/${contractNegotiationId}`,
      ),
    );
  }

  async requestCatalog(counterPartyIdentifier: string): Promise<Catalog> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.post<Catalog>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/catalog`,
        { counterPartyIdentifier },
      ),
    );
  }

  async listTransferProcesses(): Promise<TransferProcess[]> {
    const context = await this.contextService.resolve();
    const response = await firstValueFrom(
      this.http.get<TransferProcess[] | TransferProcess>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/transfers`,
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }

  async requestTransfer(request: TransferProcessRequest): Promise<string> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.post(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/transfers`,
        request,
        { responseType: 'text' },
      ),
    );
  }

  async getTransferProcess(transferProcessId: string): Promise<TransferProcess> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.get<TransferProcess>(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/transfers/${transferProcessId}`,
      ),
    );
  }

  async downloadData(fileId: string, token: string): Promise<Blob> {
    const context = await this.contextService.resolve();
    return firstValueFrom(
      this.http.get(
        `${this.apiUrl}/service-providers/${context.providerId}/tenants/${context.tenantId}/participants/${context.participantId}/files/${fileId}`,
        {
          headers: new HttpHeaders({ Authorization: token }),
          responseType: 'blob',
        },
      ),
    );
  }
}
