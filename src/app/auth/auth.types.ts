import { InjectionToken } from '@angular/core';
import { EdcConfig } from '@eclipse-edc/dashboard-core';

/**
 * The roles supported by the application.
 *
 * - `operator`: may access the home view and the operator-only views (tenants).
 * - `tenant-admin`: may manage partners and EDC dashboard resources.
 * - `tenant-user`: may upload files and explore shared files.
 */
export type Role = 'operator' | 'tenant-admin' | 'tenant-user';

/**
 * Runtime list of the valid {@link Role} values.
 *
 * Kept next to the `Role` type so the runtime set and the compile-time union
 * stay in sync. The `satisfies` clause makes the compiler flag this list if a
 * member is ever added to or removed from the `Role` union.
 */
const ROLES = ['operator', 'tenant-admin', 'tenant-user'] as const satisfies readonly Role[];

export function isTenantRole(role: Role | null): role is 'tenant-admin' | 'tenant-user' {
  return role === 'tenant-admin' || role === 'tenant-user';
}

/**
 * Runtime type guard for {@link Role}. Used when validating untrusted input
 * (e.g. role claims read from an identity token).
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isEdcConnectorConfig(value: unknown): value is EdcConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const config = value as Record<string, unknown>;
  const hasCoreFields =
    typeof config['connectorName'] === 'string' &&
    typeof config['managementUrl'] === 'string' &&
    typeof config['managementApiVersion'] === 'string' &&
    typeof config['defaultUrl'] === 'string' &&
    typeof config['protocolUrl'] === 'string';

  if (!hasCoreFields) {
    return false;
  }

  if (config['authorization'] == null) {
    return true;
  }

  if (typeof config['authorization'] !== 'object') {
    return false;
  }

  const authorization = config['authorization'] as Record<string, unknown>;
  return typeof authorization['key'] === 'string' && typeof authorization['value'] === 'string';
}

/**
 * The authenticated user as exposed to the rest of the application.
 */
export interface AuthUser {
  username: string;
  role: Role;
  displayName?: string;
  participantContextId?: string;
  participantEdcConfig?: EdcConfig;
  operatorId?: string;
}

/** Authenticated session held in memory. */
export interface AuthSession {
  user: AuthUser;
  token?: string;
  /** Epoch millis when the token expires, if known. */
  expiresAt?: number;
}

/** Required operations of the Keycloak authentication provider. */
export interface AuthProvider {
  /** Configure OAuth and load discovery metadata during application startup. */
  initialize(): Promise<void>;
  /**
   * Start authentication.
   *
   * Redirect-based providers begin the OAuth/OIDC flow and do not resolve with
   * a session directly; the resulting session is completed via
   * {@link AuthProvider.handleRedirectCallback}.
   */
  login(returnUrl?: string): Promise<void>;

  /** Tear down any provider-side session state. */
  logout(): Promise<void>;

  /**
   * Restore a session on startup (e.g. silent token refresh, or
   * reading an existing IdP session). Returns `null` when there is no session.
   */
  restoreSession(): Promise<AuthSession | null>;

  /**
   * Complete a redirect-based login flow (OAuth authorization code).
   * Returns the resulting session, or `null` if the current URL is not a
   * redirect callback.
   */
  handleRedirectCallback(): Promise<AuthSession | null>;

  /**
   * Return and clear the post-login redirect URL captured from the
   * provider's login state.
   */
  consumePostLoginRedirectUrl(): string | null;

  /**
   * Rebuild the current session from the provider's *current* tokens
   * (e.g. after a background token refresh). Returns `null` when there is no
   * valid session/token right now.
   */
  refreshSession(): Promise<AuthSession | null>;
}

/**
 * DI token used to inject the active {@link AuthProvider}. Bind it in
 * `provideAuth()`.
 */
export const AUTH_PROVIDER = new InjectionToken<AuthProvider>('AUTH_PROVIDER');
