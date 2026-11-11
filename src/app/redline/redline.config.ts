import { EnvironmentProviders, InjectionToken } from '@angular/core';
import { isConfigObject, provideRuntimeConfig } from '../runtime-config';
import { RedlineConfig } from './redline.models';

const DEFAULT_REDLINE_CONFIG: RedlineConfig = {
  baseUrl: 'http://localhost:8081',
  didPrefix: 'did:web:identity.jad.localhost:',
};

export const REDLINE_CONFIG = new InjectionToken<RedlineConfig>('REDLINE_CONFIG', {
  factory: () => ({ ...DEFAULT_REDLINE_CONFIG }),
});

export function provideRedline(configUrl = 'config/redline-config.json'): EnvironmentProviders[] {
  return [
    provideRuntimeConfig(REDLINE_CONFIG, configUrl, (config, loaded) => {
      if (!isConfigObject(loaded)) return;
      if (typeof loaded['baseUrl'] === 'string' && loaded['baseUrl'])
        config.baseUrl = loaded['baseUrl'];
      if (typeof loaded['didPrefix'] === 'string' && loaded['didPrefix'])
        config.didPrefix = loaded['didPrefix'];
    }),
  ];
}
