import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth.service';

const PUBLIC_PATHS = ['/config/', '/api/public/', '/realms/', '/protocol/openid-connect/'];

export const authBearerInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('Authorization') || isPublicRequest(req.url) || !isSameOriginRequest(req.url)) {
    return next(req);
  }

  const token = inject(AuthService).session()?.token;
  if (!token) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};

function isPublicRequest(url: string): boolean {
  const normalized = url.toLowerCase();
  return PUBLIC_PATHS.some(path => normalized.includes(path));
}

function isSameOriginRequest(url: string): boolean {
  if (url.startsWith('/')) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}
