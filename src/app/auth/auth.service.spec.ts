import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import {
  AUTH_PROVIDER,
  AuthProvider,
  AuthSession,
  LoginCredentials,
} from './auth.types';

const STORAGE_KEY = 'edc-dashboard.auth.session';

function operatorSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: { username: 'operator', role: 'operator', displayName: 'Operator' },
    token: 'stub-token',
    ...overrides,
  };
}

class FakeAuthProvider implements AuthProvider {
  loginResult: AuthSession = operatorSession();
  loginError: Error | null = null;
  logoutError: Error | null = null;
  loginCalls: LoginCredentials[] = [];
  logoutCalls = 0;

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    this.loginCalls.push(credentials);
    if (this.loginError) {
      throw this.loginError;
    }
    return this.loginResult;
  }

  async logout(): Promise<void> {
    this.logoutCalls++;
    if (this.logoutError) {
      throw this.logoutError;
    }
  }
}

describe('AuthService', () => {
  let provider: FakeAuthProvider;

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_PROVIDER, useValue: provider },
      ],
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

  describe('login', () => {
    it('delegates to the provider, sets signals and persists the session', async () => {
      const service = createService();

      const session = await service.login({ username: 'operator', password: 'operator' });

      expect(provider.loginCalls).toEqual([{ username: 'operator', password: 'operator' }]);
      expect(session).toBe(provider.loginResult);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()?.username).toBe('operator');
      expect(service.role()).toBe('operator');
      expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(provider.loginResult));
    });

    it('propagates provider errors and leaves the session unauthenticated', async () => {
      provider.loginError = new Error('Invalid username or password.');
      const service = createService();

      await expectAsync(
        service.login({ username: 'bad', password: 'bad' }),
      ).toBeRejectedWithError('Invalid username or password.');

      expect(service.isAuthenticated()).toBe(false);
      expect(service.role()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the session and storage', async () => {
      const service = createService();
      await service.login({ username: 'operator', password: 'operator' });

      await service.logout();

      expect(provider.logoutCalls).toBe(1);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.role()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('still clears the local session when the provider logout rejects', async () => {
      provider.logoutError = new Error('network down');
      const service = createService();
      await service.login({ username: 'operator', password: 'operator' });

      await expectAsync(service.logout()).toBeRejectedWithError('network down');

      // The `finally` block must clear local state regardless of provider failure.
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('session restore from storage', () => {
    it('restores a valid stored session on construction', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(operatorSession()));

      const service = createService();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.role()).toBe('operator');
    });

    it('does not restore when there is no stored session', () => {
      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.role()).toBeNull();
    });

    it('ignores a session with an invalid (unknown) role', () => {
      const tampered = {
        user: { username: 'x', role: 'admin', displayName: 'X' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tampered));

      const service = createService();

      // Restoring this would otherwise cause an infinite redirect loop in the
      // role guard, since the role is in no route allow-list.
      expect(service.isAuthenticated()).toBe(false);
      expect(service.role()).toBeNull();
    });

    it('ignores an expired session', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(operatorSession({ expiresAt: Date.now() - 1000 })),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('restores a session whose expiry is in the future', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(operatorSession({ expiresAt: Date.now() + 60_000 })),
      );

      const service = createService();

      expect(service.isAuthenticated()).toBe(true);
    });

    it('ignores malformed JSON in storage', () => {
      localStorage.setItem(STORAGE_KEY, '{ not valid json');

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });
  });
});
