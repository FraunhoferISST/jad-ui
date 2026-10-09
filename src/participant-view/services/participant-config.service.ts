import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ParticipantUploadConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
}

export interface ParticipantFileSharingConfig {
  baseUrl: string;
}

export interface ParticipantSigletConfig {
  baseUrl: string;
}

interface ParticipantFeatureConfig {
  upload: ParticipantUploadConfig;
  fileSharing: ParticipantFileSharingConfig;
  siglet: ParticipantSigletConfig;
}

const DEFAULT_CONFIG: ParticipantFeatureConfig = {
  upload: {
    maxFileSize: 10 * 1024 * 1024,
    allowedFileTypes: [],
  },
  fileSharing: {
    baseUrl: 'http://file-sharing-app.localhost',
  },
  siglet: {
    baseUrl: 'http://edc-proxy.localhost/proxy/issuerservice',
  },
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

  async getUploadConfig(): Promise<ParticipantUploadConfig> {
    return (await this.getConfig()).upload;
  }

  async getFileSharingConfig(): Promise<ParticipantFileSharingConfig> {
    return (await this.getConfig()).fileSharing;
  }

  async getSigletConfig(): Promise<ParticipantSigletConfig> {
    return (await this.getConfig()).siglet;
  }

  private async loadConfig(): Promise<ParticipantFeatureConfig> {
    try {
      const loaded = await firstValueFrom(
        this.http.get<Partial<ParticipantFeatureConfig>>('config/participant-config.json'),
      );

      const upload: ParticipantUploadConfig = {
        maxFileSize:
          typeof loaded.upload?.maxFileSize === 'number'
            ? loaded.upload.maxFileSize
            : DEFAULT_CONFIG.upload.maxFileSize,
        allowedFileTypes: Array.isArray(loaded.upload?.allowedFileTypes)
          ? loaded.upload.allowedFileTypes.filter((type) => typeof type === 'string')
          : DEFAULT_CONFIG.upload.allowedFileTypes,
      };

      const fileSharing: ParticipantFileSharingConfig = {
        baseUrl:
          typeof loaded.fileSharing?.baseUrl === 'string' &&
          loaded.fileSharing.baseUrl.trim().length > 0
            ? loaded.fileSharing.baseUrl
            : DEFAULT_CONFIG.fileSharing.baseUrl,
      };

      const siglet: ParticipantSigletConfig = {
        baseUrl:
          typeof loaded.siglet?.baseUrl === 'string' && loaded.siglet.baseUrl.trim().length > 0
            ? loaded.siglet.baseUrl
            : DEFAULT_CONFIG.siglet.baseUrl,
      };

      return { upload, fileSharing, siglet };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
}
