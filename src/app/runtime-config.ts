import { HttpClient } from '@angular/common/http';
import { EnvironmentProviders, inject, InjectionToken, provideAppInitializer } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Load one runtime config and mutate its injected defaults in place. */
export function provideRuntimeConfig<T extends object>(
  token: InjectionToken<T>,
  url: string,
  merge: (config: T, loaded: unknown) => void,
  afterLoad?: () => () => Promise<void>,
): EnvironmentProviders {
  return provideAppInitializer(() => {
    const http = inject(HttpClient);
    const config = inject(token);
    // Capture dependencies synchronously, before leaving Angular's injection context.
    const next = afterLoad?.();
    return (async () => {
      try {
        const loaded = await firstValueFrom(http.get<unknown>(url));
        merge(config, loaded);
      } catch {
        // Missing or malformed configuration leaves defaults in place.
      }
      await next?.();
    })();
  });
}

export function isConfigObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
