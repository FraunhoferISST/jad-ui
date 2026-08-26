import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideOAuthClient } from 'angular-oauth2-oidc';
import { AUTH_PROVIDER } from './auth.types';
import { AuthService } from './auth.service';
import { provideKeycloakAuthConfig } from './keycloak-auth.config';
import { KeycloakAuthProvider } from './providers/keycloak-auth.provider';

/**
 * Wires up Keycloak OAuth/OIDC authentication for the application.
 */
export function provideAuth(): (Provider | EnvironmentProviders)[] {
  return [
    provideOAuthClient(),
    ...provideKeycloakAuthConfig(),
    KeycloakAuthProvider,
    { provide: AUTH_PROVIDER, useExisting: KeycloakAuthProvider },
    provideAppInitializer(() => inject(AuthService).initialize()),
  ];
}
