import { Injectable } from '@angular/core';
import { AuthProvider, AuthSession, LoginCredentials, Role } from '../auth.types';

/**
 * A demo user record for the in-memory credentials provider.
 */
interface DemoUser {
  username: string;
  password: string;
  role: Role;
  displayName: string;
}

/**
 * Iteration-1 authentication provider: validates credentials against a small
 * in-memory list of demo users. No backend is required.
 *
 * This class intentionally implements the same {@link AuthProvider} interface
 * that an OAuth/OIDC provider would, so replacing it is a one-line change in
 * `provideAuth()`.
 *
 * Demo credentials:
 *   - operator    / operator      -> role "operator"
 *   - participant / participant   -> role "participant"
 */
@Injectable()
export class CredentialsAuthProvider implements AuthProvider {
  private static readonly USERS: readonly DemoUser[] = [
    { username: 'operator', password: 'operator', role: 'operator', displayName: 'Operator' },
    {
      username: 'participant',
      password: 'participant',
      role: 'participant',
      displayName: 'Participant',
    },
  ];

  /** Simulated network latency so the UI loading state is exercised. */
  private static readonly FAKE_LATENCY_MS = 300;

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    await this.delay(CredentialsAuthProvider.FAKE_LATENCY_MS);

    const username = credentials.username?.trim() ?? '';
    const match = CredentialsAuthProvider.USERS.find(
      user => user.username === username && user.password === credentials.password,
    );

    if (!match) {
      throw new Error('Invalid username or password.');
    }

    return {
      user: {
        username: match.username,
        role: match.role,
        displayName: match.displayName,
      },
      // A real provider would return a signed access token here.
      token: this.createStubToken(match),
    };
  }

  async logout(): Promise<void> {
    // Nothing to tear down for the in-memory provider.
  }

  private createStubToken(user: DemoUser): string {
    // Not a real JWT — just an opaque, decodable marker for local development.
    const payload = JSON.stringify({ sub: user.username, role: user.role });
    return `local.${btoa(payload)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
