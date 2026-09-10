import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { UseCase } from '../models/redline-data.model';

export interface ParticipantUploadConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
}

export interface ParticipantFileSharingConfig {
  baseUrl: string;
}

interface ParticipantFeatureConfig {
  useCases: UseCase[];
  upload: ParticipantUploadConfig;
  fileSharing: ParticipantFileSharingConfig;
  defaultServiceProviderId?: number;
}

const DEFAULT_CONFIG: ParticipantFeatureConfig = {
  useCases: [
    {
      id: 'uc-certificate-management',
      name: 'certificate-management',
      label: 'Certificate Management',
      description: 'Manage your certificate sharing with partners',
    },
  ],
  upload: {
    maxFileSize: 10 * 1024 * 1024,
    allowedFileTypes: [],
  },
  fileSharing: {
    baseUrl: 'http://file-sharing-app.localhost',
  },
  defaultServiceProviderId: 1,
};

@Injectable({ providedIn: 'root' })
export class ParticipantConfigService {
  private readonly http = inject(HttpClient);

  private configPromise: Promise<ParticipantFeatureConfig> | null = null;

  async getConfig(): Promise<ParticipantFeatureConfig> {
    if (!this.configPromise) {
      this.configPromise = this.loadConfig();
    }
    return this.configPromise;
  }

  async getUseCases(): Promise<UseCase[]> {
    return (await this.getConfig()).useCases;
  }

  async getUploadConfig(): Promise<ParticipantUploadConfig> {
    return (await this.getConfig()).upload;
  }

  async getFileSharingConfig(): Promise<ParticipantFileSharingConfig> {
    return (await this.getConfig()).fileSharing;
  }

  async getDefaultServiceProviderId(): Promise<number | null> {
    const value = (await this.getConfig()).defaultServiceProviderId;
    return typeof value === 'number' ? value : null;
  }

  private async loadConfig(): Promise<ParticipantFeatureConfig> {
    try {
      const loaded = await firstValueFrom(
        this.http.get<Partial<ParticipantFeatureConfig>>('config/participant-config.json'),
      );

      const useCases = Array.isArray(loaded.useCases) ? loaded.useCases : DEFAULT_CONFIG.useCases;

      const upload: ParticipantUploadConfig = {
        maxFileSize:
          typeof loaded.upload?.maxFileSize === 'number'
            ? loaded.upload.maxFileSize
            : DEFAULT_CONFIG.upload.maxFileSize,
        allowedFileTypes: Array.isArray(loaded.upload?.allowedFileTypes)
          ? loaded.upload.allowedFileTypes.filter(type => typeof type === 'string')
          : DEFAULT_CONFIG.upload.allowedFileTypes,
      };

      const fileSharing: ParticipantFileSharingConfig = {
        baseUrl:
          typeof loaded.fileSharing?.baseUrl === 'string' && loaded.fileSharing.baseUrl.trim().length > 0
            ? loaded.fileSharing.baseUrl
            : DEFAULT_CONFIG.fileSharing.baseUrl,
      };

      const defaultServiceProviderId =
        typeof loaded.defaultServiceProviderId === 'number'
          ? loaded.defaultServiceProviderId
          : DEFAULT_CONFIG.defaultServiceProviderId;

      return { useCases, upload, fileSharing, defaultServiceProviderId };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
}
