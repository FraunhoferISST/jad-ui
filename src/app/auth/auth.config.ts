import { Provider } from '@angular/core';
import { AUTH_PROVIDER } from './auth.types';
import { CredentialsAuthProvider } from './providers/credentials-auth.provider';

/**
 * Wires up the authentication providers for the application.
 *
 * To switch from the iteration-1 username/password flow to OAuth/OIDC, change
 * the single `useClass` binding below to your `OAuthAuthProvider` (which must
 * implement {@link AuthProvider}). No other application code needs to change.
 */
export function provideAuth(): Provider[] {
  return [
    CredentialsAuthProvider,
    { provide: AUTH_PROVIDER, useExisting: CredentialsAuthProvider },
  ];
}
