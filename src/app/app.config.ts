import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideRedline } from './redline/redline.config';
import { provideAuth } from './auth/auth.config';
import { authBearerInterceptor } from './auth/interceptors/auth-bearer.interceptor';
import { provideParticipantConfig } from '../participant-view/services/participant-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authBearerInterceptor])),
    ...provideAuth(),
    ...provideRedline(),
    provideParticipantConfig(),
  ],
};
