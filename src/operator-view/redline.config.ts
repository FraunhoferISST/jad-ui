import { inject, InjectionToken, provideAppInitializer, EnvironmentProviders, Provider } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { RedlineConfig } from './models/redline.models';

/**
 * Default Redline configuration, used as a fallback when the config file
 * (`config/redline-config.json`) cannot be loaded.
 */
const DEFAULT_REDLINE_CONFIG: RedlineConfig = {
  baseUrl: 'http://localhost:8081',
  didPrefix: 'did:web:identityhub%3A7083:',
};

/**
 * Injection token exposing the resolved {@link RedlineConfig}.
 *
 * The token is initialised with a mutable object reference that is populated
 * during application startup by {@link provideRedline}. Consumers (e.g.
 * {@link RedlineService}) inject this token and read `baseUrl`.
 */
export const REDLINE_CONFIG = new InjectionToken<RedlineConfig>('REDLINE_CONFIG', {
  factory: () => ({ ...DEFAULT_REDLINE_CONFIG }),
});

/**
 * Provides the Redline configuration and loads it from
 * `config/redline-config.json` during application startup.
 *
 * Add the returned providers to the application's `providers` array
 * (see `app.config.ts`).
 */
export function provideRedline(configUrl = 'config/redline-config.json'): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: REDLINE_CONFIG,
      useFactory: () => ({ ...DEFAULT_REDLINE_CONFIG }),
    },
    provideAppInitializer(async () => {
      const http = inject(HttpClient);
      const config = inject(REDLINE_CONFIG);
      try {
        const loaded = await firstValueFrom(http.get<RedlineConfig>(configUrl));
        if (loaded?.baseUrl) {
          // Mutate in place so the already-injected reference stays valid.
          config.baseUrl = loaded.baseUrl;
        }
        if (loaded?.didPrefix) {
          config.didPrefix = loaded.didPrefix;
        }
      } catch {
        // Keep the default configuration when the file is missing/invalid.
      }
    }),
  ];
}
