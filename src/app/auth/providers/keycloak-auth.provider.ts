import { inject, Injectable } from '@angular/core';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { AuthProvider, AuthSession, AuthUser, isRole, Role } from '../auth.types';
import { KEYCLOAK_AUTH_CONFIG } from '../keycloak-auth.config';

interface TokenClaims {
  preferred_username?: string;
  name?: string;
  realm_access?: {
    roles?: unknown;
  };
  participant_context_id?: string;
  operator_id?: string;
}

@Injectable()
export class KeycloakAuthProvider implements AuthProvider {
  private readonly oauth = inject(OAuthService);
  private readonly config = inject(KEYCLOAK_AUTH_CONFIG);

  private configured = false;
  private postLoginRedirectUrl: string | null = null;

  async login(returnUrl = '/home'): Promise<void> {
    await this.ensureConfigured();
    this.oauth.initCodeFlow(this.normalizeReturnUrl(returnUrl) ?? '/home');
  }

  async logout(): Promise<void> {
    await this.ensureConfigured();
    this.oauth.logOut();
  }

  async restoreSession(): Promise<AuthSession | null> {
    await this.ensureConfigured();

    if (!this.oauth.hasValidAccessToken()) {
      return null;
    }

    return this.createSessionFromTokens();
  }

  async handleRedirectCallback(): Promise<AuthSession | null> {
    await this.ensureConfigured();

    const params = new URLSearchParams(window.location.search);
    const isCallback = params.has('code') || params.has('state') || params.has('error');
    if (!isCallback) {
      return null;
    }

    await this.oauth.tryLoginCodeFlow();

    const callbackError = params.get('error');
    if (callbackError) {
      const callbackErrorDescription = params.get('error_description');
      throw new Error(
        callbackErrorDescription
          ? `Authentication with Keycloak failed: ${callbackErrorDescription}`
          : `Authentication with Keycloak failed: ${callbackError}`,
      );
    }

    if (!this.oauth.hasValidAccessToken()) {
      throw new Error('Authentication with Keycloak failed.');
    }

    this.postLoginRedirectUrl = this.normalizeReturnUrl(this.oauth.state);
    return this.createSessionFromTokens();
  }

  consumePostLoginRedirectUrl(): string | null {
    const redirectUrl = this.postLoginRedirectUrl;
    this.postLoginRedirectUrl = null;
    return redirectUrl;
  }

  private async ensureConfigured(): Promise<void> {
    if (this.configured) {
      return;
    }

    const authConfig: AuthConfig = {
      issuer: this.config.issuer,
      clientId: this.config.clientId,
      responseType: 'code',
      scope: this.config.scope,
      redirectUri: this.config.redirectUri,
      postLogoutRedirectUri: this.config.postLogoutRedirectUri,
      oidc: true,
      requestAccessToken: true,
      strictDiscoveryDocumentValidation: this.config.strictDiscoveryDocumentValidation,
      requireHttps: this.config.requireHttps,
      showDebugInformation: false,
      timeoutFactor: 0.75,
    };

    this.oauth.configure(authConfig);
    await this.oauth.loadDiscoveryDocument();
    this.oauth.setupAutomaticSilentRefresh();
    this.configured = true;
  }

  private createSessionFromTokens(): AuthSession {
    const claims = this.readClaims();
    const role = this.readRole(claims);

    const user: AuthUser = {
      username: claims.preferred_username ?? 'unknown',
      role,
      displayName: claims.name,
    };

    if (role === 'participant') {
      const participantContextId = claims.participant_context_id?.trim();
      if (!participantContextId) {
        throw new Error('Missing required token claim: participant_context_id');
      }
      user.participantContextId = participantContextId;
    }

    if (role === 'operator') {
      const operatorId = claims.operator_id?.trim();
      if (!operatorId) {
        throw new Error('Missing required token claim: operator_id');
      }
      user.operatorId = operatorId;
    }

    return {
      user,
      token: this.oauth.getAccessToken(),
      expiresAt: this.oauth.getAccessTokenExpiration(),
    };
  }

  private readClaims(): TokenClaims {
    const accessClaims = this.parseTokenClaims(this.oauth.getAccessToken());
    const identityClaims = this.oauth.getIdentityClaims() as TokenClaims | null;
    return {
      ...(accessClaims ?? {}),
      ...(identityClaims ?? {}),
    };
  }

  private readRole(claims: TokenClaims): Role {
    const roles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access?.roles : [];
    const applicationRoles = roles.filter(isRole);

    if (applicationRoles.length !== 1) {
      throw new Error('Token must contain exactly one application role (operator or participant).');
    }

    return applicationRoles[0];
  }

  private parseTokenClaims(token: string): TokenClaims | null {
    if (!token) {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = this.base64UrlDecode(parts[1]);
      return JSON.parse(payload) as TokenClaims;
    } catch {
      return null;
    }
  }

  private base64UrlDecode(value: string): string {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  private normalizeReturnUrl(returnUrl?: string): string | null {
    if (!returnUrl) {
      return null;
    }
    if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return null;
    }
    return returnUrl;
  }
}
