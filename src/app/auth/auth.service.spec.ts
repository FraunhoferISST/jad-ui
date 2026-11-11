import { TestBed } from '@angular/core/testing';
import { OAuthEvent, OAuthService, OAuthSuccessEvent } from 'angular-oauth2-oidc';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { AUTH_PROVIDER, AuthProvider, AuthSession } from './auth.types';

const STORAGE_KEY = 'edc-dashboard.auth.session';

function participantSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      username: 'participant',
      role: 'tenant-user',
      displayName: 'Participant',
      participantContextId: 'pcx-123',
      participantEdcConfig: {
        connectorName: 'demo-provider',
        managementUrl: 'http://jad.localhost/api/management',
        managementApiVersion: 'v5beta/participants/pcx-123',
        defaultUrl: 'http://jad.localhost/api/management/health',
        protocolUrl: 'http://jad.localhost/api/dsp/pcx-123/http-dsp-profile-2025-1',
        protocolVersion: 'dataspace-protocol-http:2025-1',
        did: 'did:web:identity.jad.localhost:demo-provider',
        authorization: {
          key: 'Authorization',
          value: 'Bearer token',
        },
      },
    },
    token: 'stub-token',
    ...overrides,
  };
}

class FakeAuthProvider implements AuthProvider {
  restoreResult: AuthSession | null = null;
  callbackResult: AuthSession | null = null;
  restoreError: Error | null = null;
  callbackError: Error | null = null;
  loginError: Error | null = null;
  logoutError: Error | null = null;
  loginCalls: Array<string | undefined> = [];
  logoutCalls = 0;
  restoreCalls = 0;
  callbackCalls = 0;
  postLoginReturnUrl: string | null = null;
  refreshResult: AuthSession | null = null;
  refreshCalls = 0;
  initializeCalls = 0;
  initializeError: Error | null = null;

  async initialize(): Promise<void> {
    this.initializeCalls++;
    if (this.initializeError) throw this.initializeError;
  }

  async login(returnUrl?: string): Promise<void> {
    this.loginCalls.push(returnUrl);
    if (this.loginError) {
      throw this.loginError;
    }
  }

  async logout(): Promise<void> {
    this.logoutCalls++;
    if (this.logoutError) {
      throw this.logoutError;
    }
  }

  async restoreSession(): Promise<AuthSession | null> {
    this.restoreCalls++;
    if (this.restoreError) {
      throw this.restoreError;
    }
    return this.restoreResult;
  }

  async handleRedirectCallback(): Promise<AuthSession | null> {
    this.callbackCalls++;
    if (this.callbackError) {
      throw this.callbackError;
    }
    return this.callbackResult;
  }

  consumePostLoginRedirectUrl(): string | null {
    const url = this.postLoginReturnUrl;
    this.postLoginReturnUrl = null;
    return url;
  }

  async refreshSession(): Promise<AuthSession | null> {
    this.refreshCalls++;
    return this.refreshResult;
  }
}

describe('AuthService', () => {
  let provider: FakeAuthProvider;
  let events: Subject<OAuthEvent>;

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_PROVIDER, useValue: provider },
        { provide: OAuthService, useValue: { events } },
      ],
    });
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    localStorage.clear();
    provider = new FakeAuthProvider();
    events = new Subject<OAuthEvent>();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('initialize', () => {
    it('restores session from redirect callback when present', async () => {
      provider.callbackResult = participantSession();
      const service = createService();

      await service.initialize();

      expect(provider.callbackCalls).toBe(1);
      expect(provider.restoreCalls).toBe(0);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()?.username).toBe('participant');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(provider.initializeCalls).toBe(1);
    });

    it('falls back to provider restore when callback has no session', async () => {
      provider.restoreResult = participantSession();
      const service = createService();

      await service.initialize();

      expect(provider.callbackCalls).toBe(1);
      expect(provider.restoreCalls).toBe(1);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('captures initialization errors and keeps user unauthenticated', async () => {
      provider.callbackError = new Error('oidc callback failed');
      const service = createService();

      await service.initialize();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.consumeInitializationError()).toBe('oidc callback failed');
      expect(service.consumeInitializationError()).toBeNull();
    });
  });

  it('does not start login when discovery failed', async () => {
    provider.initializeError = new Error('discovery failed');
    const service = createService();
    await service.initialize();
    expect(service.consumeInitializationError()).toBe('discovery failed');
    await expectAsync(service.login()).toBeRejectedWithError(
      'Authentication has not been configured.',
    );
    expect(provider.loginCalls).toEqual([]);
  });

  describe('token refresh propagation', () => {
    it('re-syncs the session token when the provider signals a token change', async () => {
      const refreshed = participantSession({
        token: 'fresh-token',
        expiresAt: Date.now() + 60_000,
      });
      provider.restoreResult = participantSession({ token: 'stale-token' });
      provider.refreshResult = refreshed;
      const service = createService();

      await service.initialize();
      expect(service.session()?.token).toBe('stale-token');

      events.next(new OAuthSuccessEvent('token_received'));
      await new Promise((resolve) => setTimeout(resolve));

      expect(provider.refreshCalls).toBe(1);
      expect(service.session()?.token).toBe('fresh-token');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('does not restore a session if refresh completes after logout', async () => {
      provider.restoreResult = participantSession();
      let finish!: (session: AuthSession | null) => void;
      spyOn(provider, 'refreshSession').and.returnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const service = createService();
      await service.initialize();
      events.next(new OAuthSuccessEvent('token_refreshed'));
      await service.logout();
      finish(participantSession({ token: 'late-token' }));
      await Promise.resolve();
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('keeps the current session when a refresh returns no session', async () => {
      provider.restoreResult = participantSession({ token: 'stale-token' });
      provider.refreshResult = null;
      const service = createService();

      await service.initialize();
      events.next(new OAuthSuccessEvent('token_refreshed'));
      await new Promise((resolve) => setTimeout(resolve));

      expect(service.session()?.token).toBe('stale-token');
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('login', () => {
    it('delegates to provider with returnUrl and clears stale init errors', async () => {
      provider.callbackError = new Error('stale error');
      const service = createService();
      await service.initialize();
      expect(service.consumeInitializationError()).toBe('stale error');

      await service.login('/catalog');

      expect(provider.loginCalls).toEqual(['/catalog']);
      expect(service.consumeInitializationError()).toBeNull();
    });

    it('propagates login errors', async () => {
      provider.loginError = new Error('redirect start failed');
      const service = createService();
      await service.initialize();

      await expectAsync(service.login('/home')).toBeRejectedWithError('redirect start failed');
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears session and storage', async () => {
      provider.restoreResult = participantSession();
      const service = createService();
      await service.initialize();

      await service.logout();

      expect(provider.logoutCalls).toBe(1);
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('still clears local session when provider logout rejects', async () => {
      provider.restoreResult = participantSession();
      provider.logoutError = new Error('network down');
      const service = createService();
      await service.initialize();

      await expectAsync(service.logout()).toBeRejectedWithError('network down');

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  it('ignores and removes legacy stored sessions without persisting the restored token', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(participantSession({ token: 'legacy-token' })),
    );
    provider.restoreResult = participantSession({ token: 'current-token' });
    const service = createService();
    expect(service.isAuthenticated()).toBeFalse();
    await service.initialize();
    expect(service.session()?.token).toBe('current-token');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('coalesces concurrent initializations and configures the provider once', async () => {
    const service = createService();
    await Promise.all([service.initialize(), service.initialize()]);
    await service.initialize();
    expect(provider.initializeCalls).toBe(1);
    expect(provider.callbackCalls).toBe(1);
  });

  describe('post-login redirect URL', () => {
    it('consumes the redirect URL exactly once', () => {
      provider.postLoginReturnUrl = '/transfer-history';
      const service = createService();

      expect(service.consumePostLoginRedirectUrl()).toBe('/transfer-history');
      expect(service.consumePostLoginRedirectUrl()).toBeNull();
    });
  });
});
