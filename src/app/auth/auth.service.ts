import { computed, inject, Injectable, signal } from '@angular/core';
import { AUTH_PROVIDER, AuthSession, isRole, LoginCredentials, Role } from './auth.types';

/**
 * Consumer-facing facade for authentication.
 *
 * Guards, the login view, the shell and the logout flow all depend on this
 * service rather than on a concrete provider. It owns:
 *  - reactive session state (signals),
 *  - persistence of the session in `localStorage`,
 *  - delegation of the actual auth work to the injected {@link AuthProvider}.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly STORAGE_KEY = 'edc-dashboard.auth.session';

  private readonly provider = inject(AUTH_PROVIDER);

  private readonly _session = signal<AuthSession | null>(this.readStoredSession());

  /** The current session, or `null` when not authenticated. */
  readonly session = this._session.asReadonly();

  /** Whether a user is currently authenticated. */
  readonly isAuthenticated = computed(() => this._session() !== null);

  /** The current user, or `null` when not authenticated. */
  readonly user = computed(() => this._session()?.user ?? null);

  /** The current user's role, or `null` when not authenticated. */
  readonly role = computed<Role | null>(() => this._session()?.user.role ?? null);

  /**
   * Authenticate and persist the resulting session.
   * @throws Error propagated from the provider on failure.
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const session = await this.provider.login(credentials);
    this.setSession(session);
    return session;
  }

  /** Clear the session locally and on the provider side. */
  async logout(): Promise<void> {
    try {
      await this.provider.logout();
    } finally {
      this.setSession(null);
    }
  }

  private setSession(session: AuthSession | null): void {
    this._session.set(session);
    this.persist(session);
  }

  private persist(session: AuthSession | null): void {
    try {
      if (session) {
        localStorage.setItem(AuthService.STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(AuthService.STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures (e.g. private mode / disabled storage).
    }
  }

  private readStoredSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(AuthService.STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const session = JSON.parse(raw) as AuthSession;
      // Reject sessions whose role is not a currently-valid `Role` (e.g. a
      // tampered entry or one left over from a previous role schema). Restoring
      // such a session would make every route guard deny access, including the
      // `/home` fallback, producing an infinite redirect loop.
      if (!session?.user || !isRole(session.user.role)) {
        return null;
      }
      if (session.expiresAt && session.expiresAt <= Date.now()) {
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
}
