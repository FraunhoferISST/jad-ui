import { computed, inject, Injectable, signal } from '@angular/core';
import { AUTH_PROVIDER, AuthSession, isRole, Role } from './auth.types';

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
  private readonly _initializationError = signal<string | null>(null);
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

  /** The current session, or `null` when not authenticated. */
  readonly session = this._session.asReadonly();

  /** Error encountered while initializing callback/session state, if any. */
  readonly initializationError = this._initializationError.asReadonly();

  /** Whether a user is currently authenticated. */
  readonly isAuthenticated = computed(() => this._session() !== null);

  /** The current user, or `null` when not authenticated. */
  readonly user = computed(() => this._session()?.user ?? null);

  /** The current user's role, or `null` when not authenticated. */
  readonly role = computed<Role | null>(() => this._session()?.user.role ?? null);

  /**
   * Initialize authentication state from provider callback/session state.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeInternal()
      .then(() => {
        this.initialized = true;
      })
      .catch(err => {
        this._initializationError.set(err instanceof Error ? err.message : 'Authentication failed.');
        this.initialized = true;
      })
      .finally(() => {
        this.initializationPromise = null;
      });

    return this.initializationPromise;
  }

  /**
   * Start authentication (redirect-based for OIDC providers).
   * @throws Error propagated from the provider on failure.
   */
  async login(returnUrl?: string): Promise<void> {
    await this.initialize();
    this._initializationError.set(null);
    await this.provider.login(returnUrl);
  }

  /** Clear the session locally and on the provider side. */
  async logout(): Promise<void> {
    try {
      await this.initialize();
      await this.provider.logout();
    } finally {
      this.setSession(null);
    }
  }

  /**
   * Returns a provider-captured post-login return URL once and clears it.
   */
  consumePostLoginRedirectUrl(): string | null {
    return this.provider.consumePostLoginRedirectUrl?.() ?? null;
  }

  consumeInitializationError(): string | null {
    const message = this._initializationError();
    this._initializationError.set(null);
    return message;
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

      if (session.user.role === 'participant' && !session.user.participantContextId) {
        return null;
      }

      if (session.user.role === 'participant' && !session.user.participantEdcConfig) {
        return null;
      }

      if (session.user.role === 'operator' && !session.user.operatorId) {
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

  private async initializeInternal(): Promise<void> {
    const callbackSession =
      (await this.provider.handleRedirectCallback?.()) ?? null;

    if (callbackSession) {
      this.setSession(callbackSession);
      return;
    }

    if (this.provider.restoreSession) {
      const restored = await this.provider.restoreSession();
      this.setSession(restored);
    }
  }
}
