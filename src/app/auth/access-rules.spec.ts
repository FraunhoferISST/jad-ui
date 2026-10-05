import { canAccess } from './access-rules';
import { Role } from './auth.types';

describe('canAccess', () => {
  it('denies a null (unauthenticated) role for every path', () => {
    expect(canAccess('home', null)).toBe(false);
    expect(canAccess('tenants', null)).toBe(false);
    expect(canAccess('logout', null)).toBe(false);
    expect(canAccess('some-unknown-path', null)).toBe(false);
  });

  it('allows role-agnostic paths (logout) for any authenticated role', () => {
    expect(canAccess('logout', 'operator')).toBe(true);
    expect(canAccess('logout', 'tenant-admin')).toBe(true);
    expect(canAccess('logout', 'tenant-user')).toBe(true);
  });

  it('allows unknown paths for any authenticated role (fail-open by design)', () => {
    expect(canAccess('newly-added-route', 'operator')).toBe(true);
    expect(canAccess('newly-added-route', 'tenant-admin')).toBe(true);
    expect(canAccess('newly-added-route', 'tenant-user')).toBe(true);
  });

  it('restricts operator-only routes to the operator role', () => {
    expect(canAccess('tenants', 'operator')).toBe(true);
    expect(canAccess('tenants', 'tenant-admin')).toBe(false);
    expect(canAccess('tenants', 'tenant-user')).toBe(false);
  });

  it('restricts dashboard and partner routes to tenant-admin', () => {
    for (const path of ['catalog', 'assets', 'policies', 'policy-builder', 'contract-definitions', 'contracts', 'transfer-history', 'partners']) {
      expect(canAccess(path, 'tenant-admin')).toBe(true);
      expect(canAccess(path, 'tenant-user')).toBe(false);
      expect(canAccess(path, 'operator')).toBe(false);
    }
  });

  it('restricts file and explore routes to tenant-user', () => {
    for (const path of ['files', 'explore']) {
      expect(canAccess(path, 'tenant-user')).toBe(true);
      expect(canAccess(path, 'tenant-admin')).toBe(false);
      expect(canAccess(path, 'operator')).toBe(false);
    }
  });

  it('allows the home route for all roles', () => {
    expect(canAccess('home', 'operator')).toBe(true);
    expect(canAccess('home', 'tenant-admin')).toBe(true);
    expect(canAccess('home', 'tenant-user')).toBe(true);
  });

  it('denies a role that is not in a route allow-list', () => {
    // An unrecognized role value (e.g. from a stale/tampered session) must not
    // be granted access to a restricted route.
    const unknownRole = 'admin' as unknown as Role;
    expect(canAccess('home', unknownRole)).toBe(false);
    expect(canAccess('tenants', unknownRole)).toBe(false);
  });
});
