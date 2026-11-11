import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth.service';

/** Explicitly opt public requests out of application bearer authentication. */
export const SKIP_BEARER_AUTH = new HttpContextToken(() => false);

const PUBLIC_PATHS = ['/config/', '/api/public/', '/realms/', '/protocol/openid-connect/'];

export const authBearerInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    req.context.get(SKIP_BEARER_AUTH) ||
    req.headers.has('Authorization') ||
    isPublicRequest(req.url) ||
    !isSameOriginRequest(req.url)
  ) {
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
  try {
    const normalized = url.toLowerCase();
    const path = new URL(url, window.location.origin).pathname.toLowerCase();
    // Keep the existing public-URL exclusions, including query strings, while
    // also recognizing relative paths such as `config/app-config.json`.
    return PUBLIC_PATHS.some(
      (publicPath) => normalized.includes(publicPath) || path.includes(publicPath),
    );
  } catch {
    return false;
  }
}

function isSameOriginRequest(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}
