import {
  EnvironmentProviders,
  inject,
  InjectionToken,
  provideAppInitializer,
  Provider,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
  {
    factory: () => ({ ...DEFAULT_AUTH_CONFIG }),
  },
);

export function provideKeycloakAuthConfig(
  configUrl = 'config/auth-config.json',
): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: KEYCLOAK_AUTH_CONFIG,
      useFactory: () => ({ ...DEFAULT_AUTH_CONFIG }),
    },
    provideAppInitializer(async () => {
      const http = inject(HttpClient);
      const config = inject(KEYCLOAK_AUTH_CONFIG);

      try {
        const loaded = await firstValueFrom(http.get<Partial<KeycloakAuthRuntimeConfig>>(configUrl));
        if (!loaded) {
          return;
        }

        if (loaded.issuer) {
          config.issuer = loaded.issuer;
        }
        if (loaded.clientId) {
          config.clientId = loaded.clientId;
        }
        if (loaded.scope) {
          config.scope = loaded.scope;
        }
        if (loaded.redirectUri) {
          config.redirectUri = loaded.redirectUri;
        }
        if (loaded.postLogoutRedirectUri) {
          config.postLogoutRedirectUri = loaded.postLogoutRedirectUri;
        }
        if (typeof loaded.strictDiscoveryDocumentValidation === 'boolean') {
          config.strictDiscoveryDocumentValidation = loaded.strictDiscoveryDocumentValidation;
        }
        if (loaded.requireHttps === true || loaded.requireHttps === false || loaded.requireHttps === 'remoteOnly') {
          config.requireHttps = loaded.requireHttps;
        }
      } catch {
        // Keep defaults when the config file is missing or invalid.
      }
    }),
  ];
}
