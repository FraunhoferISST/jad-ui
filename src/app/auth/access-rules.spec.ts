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
    expect(canAccess('logout', 'participant')).toBe(true);
  });

  it('allows unknown paths for any authenticated role (fail-open by design)', () => {
    expect(canAccess('newly-added-route', 'operator')).toBe(true);
    expect(canAccess('newly-added-route', 'participant')).toBe(true);
  });

  it('restricts operator-only routes to the operator role', () => {
    expect(canAccess('tenants', 'operator')).toBe(true);
    expect(canAccess('tenants', 'participant')).toBe(false);
  });

  it('restricts participant-only routes to the participant role', () => {
    expect(canAccess('catalog', 'participant')).toBe(true);
    expect(canAccess('catalog', 'operator')).toBe(false);
  });

  it('allows the home route for both roles', () => {
    expect(canAccess('home', 'operator')).toBe(true);
    expect(canAccess('home', 'participant')).toBe(true);
  });

  it('denies a role that is not in a route allow-list', () => {
    // An unrecognized role value (e.g. from a stale/tampered session) must not
    // be granted access to a restricted route.
    const unknownRole = 'admin' as unknown as Role;
    expect(canAccess('home', unknownRole)).toBe(false);
    expect(canAccess('tenants', unknownRole)).toBe(false);
  });
});
