import config from '../../public/config/app-config.json';
import { routes } from './app.routes';
import { canAccess } from './auth/access-rules';

describe('Tenant dataspace navigation', () => {
  it('loads participant views directly while preserving route paths and access rules', () => {
    const shell = routes.find((route) => route.canActivateChild);
    for (const [path, allowedRole] of [
      ['files', 'tenant-user'],
      ['explore', 'tenant-user'],
      ['partners', 'tenant-admin'],
    ] as const) {
      const route = shell?.children?.find((child) => child.path === path);
      expect(route?.loadComponent).toBeDefined();
      expect(route?.loadChildren).toBeUndefined();
      expect(canAccess(path, allowedRole)).toBeTrue();
    }
  });

  it('provides a lazy-loaded shell route and a menu item restricted to tenant admins', () => {
    const shell = routes.find((route) => route.canActivateChild);
    const route = shell?.children?.find((child) => child.path === 'dataspaces');
    expect(route?.loadComponent).toBeDefined();
    expect(shell?.canActivateChild?.length).toBe(2);
    const menu = config.menuItems.find((item) => item.routerPath === 'dataspaces');
    expect(menu?.text).toBe('Dataspaces');
    expect(canAccess(menu!.routerPath, 'tenant-admin')).toBeTrue();
    expect(canAccess(menu!.routerPath, 'tenant-user')).toBeFalse();
    expect(canAccess(menu!.routerPath, 'operator')).toBeFalse();
    expect(canAccess(menu!.routerPath, null)).toBeFalse();
  });
});
