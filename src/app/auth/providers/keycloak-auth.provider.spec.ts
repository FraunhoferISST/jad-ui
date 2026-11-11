import { TestBed } from '@angular/core/testing';
import { OAuthService, OAuthSuccessEvent } from 'angular-oauth2-oidc';
import { KEYCLOAK_AUTH_CONFIG } from '../keycloak-auth.config';
import { KeycloakAuthProvider } from './keycloak-auth.provider';

describe('KeycloakAuthProvider', () => {
  let provider: KeycloakAuthProvider;
  let oauth: jasmine.SpyObj<OAuthService>;

  beforeEach(() => {
    oauth = jasmine.createSpyObj('OAuthService', [
      'configure',
      'loadDiscoveryDocument',
      'setupAutomaticSilentRefresh',
      'hasValidAccessToken',
      'getAccessToken',
      'getIdentityClaims',
      'getAccessTokenExpiration',
      'initCodeFlow',
      'logOut',
    ]);
    oauth.loadDiscoveryDocument.and.resolveTo(new OAuthSuccessEvent('discovery_document_loaded'));
    oauth.hasValidAccessToken.and.returnValue(true);
    oauth.getAccessToken.and.returnValue('access-token');
    oauth.getAccessTokenExpiration.and.returnValue(12345);
    TestBed.configureTestingModule({
      providers: [
        KeycloakAuthProvider,
        { provide: OAuthService, useValue: oauth },
        {
          provide: KEYCLOAK_AUTH_CONFIG,
          useValue: {
            issuer: 'https://identity.test',
            clientId: 'client',
            scope: 'openid',
            redirectUri: 'https://ui.test/login',
            postLogoutRedirectUri: 'https://ui.test/login',
            requireHttps: true,
            strictDiscoveryDocumentValidation: true,
          },
        },
      ],
    });
    provider = TestBed.inject(KeycloakAuthProvider);
  });

  it('configures discovery once on initialization, not on login or restore', async () => {
    oauth.getIdentityClaims.and.returnValue({
      realm_access: { roles: ['operator'] },
      operator_id: 'operator-1',
    });
    await provider.initialize();
    await provider.restoreSession();
    await provider.login('/home');
    expect(oauth.configure).toHaveBeenCalledTimes(1);
    expect(oauth.loadDiscoveryDocument).toHaveBeenCalledTimes(1);
    expect(oauth.setupAutomaticSilentRefresh).toHaveBeenCalledTimes(1);
    expect(oauth.configure.calls.mostRecent().args[0].issuer).toBe('https://identity.test');
  });

  it('requires exactly one application role and the appropriate identity claims', async () => {
    oauth.getIdentityClaims.and.returnValue({
      realm_access: { roles: ['operator', 'tenant-user'] },
    });
    await expectAsync(provider.restoreSession()).toBeRejectedWithError(
      /exactly one application role/,
    );
    oauth.getIdentityClaims.and.returnValue({ realm_access: { roles: ['operator'] } });
    await expectAsync(provider.restoreSession()).toBeRejectedWithError(/operator_id/);
    oauth.getIdentityClaims.and.returnValue({ realm_access: { roles: ['tenant-user'] } });
    await expectAsync(provider.restoreSession()).toBeRejectedWithError(/participant_context_id/);
    oauth.getIdentityClaims.and.returnValue({
      realm_access: { roles: ['tenant-admin'] },
      participant_context_id: 'ctx',
    });
    await expectAsync(provider.restoreSession()).toBeRejectedWithError(/edc_connector_config/);
  });
});
