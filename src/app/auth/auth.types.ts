import { InjectionToken } from '@angular/core';

/**
 * The roles supported by the application.
 *
 * - `operator`: may access the home view and the operator-only views (tenants).
 * - `participant`: may access the home view and all other views except the
 *   operator views.
 */
export type Role = 'operator' | 'participant';

/**
 * Runtime list of the valid {@link Role} values.
 *
 * Kept next to the `Role` type so the runtime set and the compile-time union
 * stay in sync. The `satisfies` clause makes the compiler flag this list if a
 * member is ever added to or removed from the `Role` union.
 */
export const ROLES = ['operator', 'participant'] as const satisfies readonly Role[];

/**
 * Runtime type guard for {@link Role}. Used when validating untrusted input
 * (e.g. a session restored from `localStorage`).
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Credentials passed to an {@link AuthProvider} when logging in with the
 * username/password flow. OAuth-based providers may ignore these (they perform
 * a redirect/popup flow instead).
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * The authenticated user as exposed to the rest of the application.
 */
export interface AuthUser {
  username: string;
  role: Role;
  displayName?: string;
}

/**
 * A persisted authentication session. The optional {@link AuthSession.token}
 * is where an access/bearer token would live once a real backend or OAuth
 * provider is wired up.
 */
export interface AuthSession {
  user: AuthUser;
  token?: string;
  /** Epoch millis when the token expires, if known. */
  expiresAt?: number;
}

/**
 * Strategy abstraction for authentication.
 *
 * This is the single seam that makes the auth system swappable. The current
 * iteration ships a {@link CredentialsAuthProvider} (in-memory username /
 * password). To move to OAuth later, implement this interface with an
 * OAuth/OIDC client and swap the binding in `provideAuth()` — nothing else in
 * the app needs to change.
 *
 * Redirect-based flows (OAuth authorization code) can use the optional
 * {@link AuthProvider.handleRedirectCallback} hook, which the app can call on
 * bootstrap to complete the login after the identity provider redirects back.
 */
export interface AuthProvider {
  /**
   * Authenticate a user and resolve to a session. Implementations must reject
   * (throw) with a meaningful error message on failure.
   */
  login(credentials: LoginCredentials): Promise<AuthSession>;

  /** Tear down any provider-side session state. */
  logout(): Promise<void>;

  /**
   * Optional: restore a session on startup (e.g. silent token refresh, or
   * reading an existing IdP session). Returns `null` when there is no session.
   */
  restoreSession?(): Promise<AuthSession | null>;

  /**
   * Optional: complete a redirect-based login flow (OAuth authorization code).
   * Returns the resulting session, or `null` if the current URL is not a
   * redirect callback.
   */
  handleRedirectCallback?(): Promise<AuthSession | null>;
}

/**
 * DI token used to inject the active {@link AuthProvider}. Bind it in
 * `provideAuth()`.
 */
export const AUTH_PROVIDER = new InjectionToken<AuthProvider>('AUTH_PROVIDER');
