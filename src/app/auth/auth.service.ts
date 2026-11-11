import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OAuthEvent, OAuthInfoEvent, OAuthService } from 'angular-oauth2-oidc';
import { filter } from 'rxjs';
import { AUTH_PROVIDER, AuthSession, Role } from './auth.types';

/** Holds the authenticated session in memory and delegates OIDC operations to Keycloak. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly provider = inject(AUTH_PROVIDER);
  private readonly oauth = inject(OAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _session = signal<AuthSession | null>(null);
  private readonly _initializationError = signal<string | null>(null);
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;
  private providerReady = false;

  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly user = computed(() => this._session()?.user ?? null);
  readonly role = computed<Role | null>(() => this._session()?.user.role ?? null);

  /** Initialize once, after the runtime auth configuration has loaded. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.initializeInternal()
      .catch((error: unknown) => {
        this._initializationError.set(
          error instanceof Error ? error.message : 'Authentication failed.',
        );
      })
      .finally(() => {
        this.initialized = true;
        this.initializationPromise = null;
      });
    return this.initializationPromise;
  }

  async login(returnUrl?: string): Promise<void> {
    if (!this.providerReady) {
      throw new Error('Authentication has not been configured.');
    }
    this._initializationError.set(null);
    await this.provider.login(returnUrl);
  }

  async logout(): Promise<void> {
    try {
      await this.provider.logout();
    } finally {
      this._session.set(null);
    }
  }

  consumePostLoginRedirectUrl(): string | null {
    return this.provider.consumePostLoginRedirectUrl();
  }

  consumeInitializationError(): string | null {
    const message = this._initializationError();
    this._initializationError.set(null);
    return message;
  }

  private async initializeInternal(): Promise<void> {
    // Remove the token-bearing copy written by older versions; never read it.
    try {
      localStorage.removeItem('edc-dashboard.auth.session');
    } catch {
      // Storage may be disabled; authentication itself does not rely on it.
    }

    await this.provider.initialize();
    this.providerReady = true;
    const callbackSession = await this.provider.handleRedirectCallback();
    this._session.set(callbackSession ?? (await this.provider.restoreSession()));

    this.oauth.events
      .pipe(
        filter(
          (event: OAuthEvent) =>
            event.type === 'token_received' ||
            event.type === 'token_refreshed' ||
            (event instanceof OAuthInfoEvent &&
              event.type === 'token_expires' &&
              event.info === 'access_token'),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refreshSession());
  }

  private async refreshSession(): Promise<void> {
    if (!this.isAuthenticated()) return;
    try {
      const refreshed = await this.provider.refreshSession();
      // A late refresh must not restore a session after logout.
      if (refreshed && this.isAuthenticated()) this._session.set(refreshed);
    } catch {
      // Keep the last known session if a refresh re-read fails.
    }
  }
}
