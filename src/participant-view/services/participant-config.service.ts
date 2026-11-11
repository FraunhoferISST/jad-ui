import { EnvironmentProviders, inject, Injectable, InjectionToken } from '@angular/core';
import { isConfigObject, provideRuntimeConfig } from '../../app/runtime-config';

interface ParticipantUploadConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
}
interface ParticipantFileSharingConfig {
  baseUrl: string;
}
interface ParticipantSigletConfig {
  baseUrl: string;
}
interface ParticipantDidConfig {
  scheme: 'http' | 'https';
}
interface ParticipantFeatureConfig {
  did: ParticipantDidConfig;
  upload: ParticipantUploadConfig;
  fileSharing: ParticipantFileSharingConfig;
  siglet: ParticipantSigletConfig;
}

export const PARTICIPANT_CONFIG = new InjectionToken<ParticipantFeatureConfig>(
  'PARTICIPANT_CONFIG',
  {
    factory: () => ({
      did: { scheme: 'http' },
      upload: { maxFileSize: 10 * 1024 * 1024, allowedFileTypes: [] },
      fileSharing: { baseUrl: 'http://file-sharing-app.localhost' },
      siglet: { baseUrl: 'http://edc-proxy.localhost/proxy/siglet' },
    }),
  },
);

export function provideParticipantConfig(
  url = 'config/participant-config.json',
): EnvironmentProviders {
  return provideRuntimeConfig(PARTICIPANT_CONFIG, url, (config, loaded) => {
    if (!isConfigObject(loaded)) return;
    const did = loaded['did'];
    if (isConfigObject(did) && (did['scheme'] === 'http' || did['scheme'] === 'https')) {
      config.did.scheme = did['scheme'];
    }
    const upload = loaded['upload'];
    if (isConfigObject(upload)) {
      if (typeof upload['maxFileSize'] === 'number')
        config.upload.maxFileSize = upload['maxFileSize'];
      if (Array.isArray(upload['allowedFileTypes'])) {
        config.upload.allowedFileTypes = upload['allowedFileTypes'].filter(
          (type: unknown): type is string => typeof type === 'string',
        );
      }
    }
    const fileSharing = loaded['fileSharing'];
    if (
      isConfigObject(fileSharing) &&
      typeof fileSharing['baseUrl'] === 'string' &&
      fileSharing['baseUrl'].trim()
    ) {
      config.fileSharing.baseUrl = fileSharing['baseUrl'];
    }
    const siglet = loaded['siglet'];
    if (
      isConfigObject(siglet) &&
      typeof siglet['baseUrl'] === 'string' &&
      siglet['baseUrl'].trim()
    ) {
      config.siglet.baseUrl = siglet['baseUrl'];
    }
  });
}

@Injectable({ providedIn: 'root' })
export class ParticipantConfigService {
  private readonly config = inject(PARTICIPANT_CONFIG);

  async getDidConfig(): Promise<ParticipantDidConfig> {
    return this.config.did;
  }
  async getUploadConfig(): Promise<ParticipantUploadConfig> {
    return this.config.upload;
  }
  async getFileSharingConfig(): Promise<ParticipantFileSharingConfig> {
    return this.config.fileSharing;
  }
  async getSigletConfig(): Promise<ParticipantSigletConfig> {
    return this.config.siglet;
  }
}
