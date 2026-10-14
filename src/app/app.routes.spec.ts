import config from '../../public/config/app-config.json';
import { routes } from './app.routes';
import { canAccess } from './auth/access-rules';

describe('Tenant dataspace navigation', () => {
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
