import { inject, Injectable } from '@angular/core';

import { FileAsset } from '../models/file-asset.model';
import { FileSharingFileResource } from '../models/file-sharing-data.model';
import { asNumber, asString, asStringArray } from '../utils/cast.utils';
import { CatalogService } from './catalog.service';
import { FileSharingApiService } from './file-sharing-api.service';
import { PartnerService } from './partner.service';
import { UseCaseService } from './use-case.service';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly useCases = inject(UseCaseService);
  private readonly partners = inject(PartnerService);
  private readonly catalog = inject(CatalogService);

  async getAllFilesWithCatalogAccess(): Promise<FileAsset[]> {
    const [useCases, partnerList, localFiles] = await Promise.all([
      this.useCases.getUseCases(),
      this.partners.getPartners(),
      this.fileSharing.listFiles(),
    ]);

    const partnerNamesById = new Map(
      partnerList.filter(item => !!item.identifier).map(item => [item.identifier, item.nickname ?? '']),
    );

    const mappedLocal = localFiles.map(file =>
      this.mapFileSharingResource(file, useCases, partnerNamesById),
    );

    const catalogFiles = await this.catalog.getCatalogForAllPartners();
    const all = [...mappedLocal, ...catalogFiles];

    await this.catalog.matchContractsToFiles(all);

    const unique = new Map<string, FileAsset>();
    for (const file of all) {
      if (!unique.has(file.id)) {
        unique.set(file.id, file);
      }
    }

    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getFilesForFilesView(): Promise<FileAsset[]> {
    const files = await this.getAllFilesWithCatalogAccess();
    return files.filter(file => file.origin === 'owned' || (file.agreements?.length ?? 0) > 0);
  }

  async getFilesForExploreView(): Promise<FileAsset[]> {
    const files = await this.getAllFilesWithCatalogAccess();
    return files.filter(file => file.origin === 'remote');
  }

  async getOwnedFiles(): Promise<FileAsset[]> {
    const [useCases, partnerList, localFiles] = await Promise.all([
      this.useCases.getUseCases(),
      this.partners.getPartners(),
      this.fileSharing.listFiles(),
    ]);

    const partnerNamesById = new Map(
      partnerList.filter(item => !!item.identifier).map(item => [item.identifier, item.nickname ?? '']),
    );

    const files = localFiles
      .map(file => this.mapFileSharingResource(file, useCases, partnerNamesById))
      .sort((a, b) => a.name.localeCompare(b.name));

    await this.catalog.matchContractsToFiles(files);
    return files;
  }

  private mapFileSharingResource(
    file: FileSharingFileResource,
    useCases: Array<{ id: string; label: string }>,
    partnerNamesById: Map<string, string>,
  ): FileAsset {
    const metadata = file.metadata ?? {};
    const useCaseId = asString(metadata['useCase']) ?? '';
    const partnerIds = asStringArray(metadata['partnerIds']);
    const uploadedAt =
      typeof file.uploadTimestamp === 'number' && Number.isFinite(file.uploadTimestamp)
        ? new Date(file.uploadTimestamp).toISOString()
        : '';

    return {
      id: file.id ?? '',
      name:
        file.fileName ?? asString(metadata['fileName']) ?? asString(metadata['name']) ?? file.id ?? '',
      type: file.contentType,
      uploadedAt,
      useCase: useCaseId,
      useCaseLabel: useCases.find(uc => uc.id === useCaseId)?.label,
      size: asNumber(metadata['size']) ?? file.contentLength ?? 0,
      origin: (asString(metadata['origin']) as 'owned' | 'remote' | undefined) ?? 'owned',
      assetId: asString(metadata['assetId']),
      accessRestrictions: partnerIds.map(partnerId => ({
        partnerId,
        partnerName: partnerNamesById.get(partnerId) ?? '',
      })),
    };
  }
}
