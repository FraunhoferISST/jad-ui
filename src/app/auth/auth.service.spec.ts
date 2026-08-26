import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AUTH_PROVIDER, AuthProvider, AuthSession } from './auth.types';

const STORAGE_KEY = 'edc-dashboard.auth.session';

function participantSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      username: 'participant',
      role: 'participant',
      displayName: 'Participant',
      participantContextId: 'pcx-123',
    },
    token: 'stub-token',
    ...overrides,
  };
}

function operatorSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      username: 'operator',
      role: 'operator',
      displayName: 'Operator',
      operatorId: 'opr-001',
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
}

describe('AuthService', () => {
  let provider: FakeAuthProvider;

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [AuthService, { provide: AUTH_PROVIDER, useValue: provider }],
    });
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    localStorage.clear();
    provider = new FakeAuthProvider();
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
      expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(provider.callbackResult));
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

  describe('session restore from storage', () => {
    it('restores a valid stored session on construction', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(participantSession()));

      const service = createService();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.role()).toBe('participant');
    });

    it('ignores a session with an invalid role', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: { username: 'x', role: 'admin', displayName: 'X' } }),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.role()).toBeNull();
    });

    it('ignores participant session without participantContextId', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: { username: 'participant', role: 'participant' }, token: 'x' }),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('ignores operator session without operatorId', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: { username: 'operator', role: 'operator' }, token: 'x' }),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('ignores an expired session', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(participantSession({ expiresAt: Date.now() - 1000 })),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('ignores malformed JSON in storage', () => {
      localStorage.setItem(STORAGE_KEY, '{ not valid json');

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('restores a valid operator session on construction', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(operatorSession()));

      const service = createService();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.role()).toBe('operator');
      expect(service.user()?.operatorId).toBe('opr-001');
    });
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
