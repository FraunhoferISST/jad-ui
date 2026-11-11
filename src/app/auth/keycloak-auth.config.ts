import { EnvironmentProviders, InjectionToken } from '@angular/core';
import { isConfigObject, provideRuntimeConfig } from '../runtime-config';

export interface KeycloakAuthRuntimeConfig {
  issuer: string;
  clientId: string;
  scope: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  strictDiscoveryDocumentValidation: boolean;
  requireHttps: boolean | 'remoteOnly';
}

const DEFAULT_AUTH_CONFIG: KeycloakAuthRuntimeConfig = {
  issuer: 'http://keycloak.jad.localhost/realms/jad-dev',
  clientId: 'jad-ui',
  scope: 'openid profile email roles',
  redirectUri: 'http://localhost:4200/login',
  postLogoutRedirectUri: 'http://localhost:4200/login',
  strictDiscoveryDocumentValidation: false,
  requireHttps: false,
};

export const KEYCLOAK_AUTH_CONFIG = new InjectionToken<KeycloakAuthRuntimeConfig>(
  'KEYCLOAK_AUTH_CONFIG',
  { factory: () => ({ ...DEFAULT_AUTH_CONFIG }) },
);

export function provideKeycloakAuthConfig(
  configUrl = 'config/auth-config.json',
  afterLoad?: () => () => Promise<void>,
): EnvironmentProviders {
  return provideRuntimeConfig(
    KEYCLOAK_AUTH_CONFIG,
    configUrl,
    (config, loaded) => {
      if (!isConfigObject(loaded)) return;
      for (const key of [
        'issuer',
        'clientId',
        'scope',
        'redirectUri',
        'postLogoutRedirectUri',
      ] as const) {
        const value = loaded[key];
        if (typeof value === 'string' && value) config[key] = value;
      }
      if (typeof loaded['strictDiscoveryDocumentValidation'] === 'boolean') {
        config.strictDiscoveryDocumentValidation = loaded['strictDiscoveryDocumentValidation'];
      }
      const requireHttps = loaded['requireHttps'];
      if (typeof requireHttps === 'boolean' || requireHttps === 'remoteOnly') {
        config.requireHttps = requireHttps;
      }
    },
    afterLoad,
  );
}
