import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KEYCLOAK_AUTH_CONFIG, provideKeycloakAuthConfig } from './auth/keycloak-auth.config';
import { REDLINE_CONFIG, provideRedline } from './redline/redline.config';
import {
  PARTICIPANT_CONFIG,
  provideParticipantConfig,
} from '../participant-view/services/participant-config.service';

describe('runtime configuration initializers', () => {
  it('updates injected references in place before starting authentication', async () => {
    let configuredIssuer: string | undefined;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideKeycloakAuthConfig(undefined, () => {
          const config = inject(KEYCLOAK_AUTH_CONFIG);
          return async () => {
            configuredIssuer = config.issuer;
          };
        }),
        ...provideRedline(),
        provideParticipantConfig(),
      ],
    });
    const auth = TestBed.inject(KEYCLOAK_AUTH_CONFIG);
    const redline = TestBed.inject(REDLINE_CONFIG);
    const participant = TestBed.inject(PARTICIPANT_CONFIG);
    const upload = participant.upload;
    const http = TestBed.inject(HttpTestingController);
    expect(configuredIssuer).toBeUndefined();
    http
      .expectOne('config/auth-config.json')
      .flush({ issuer: 'https://identity.test', requireHttps: true });
    http.expectOne('config/redline-config.json').flush({ baseUrl: 'https://redline.test' });
    http.expectOne('config/participant-config.json').flush({
      did: { scheme: 'https' },
      upload: { maxFileSize: 1024, allowedFileTypes: ['text/plain', 42] },
      siglet: { baseUrl: 'https://proxy.test/siglet' },
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(configuredIssuer).toBe('https://identity.test');
    expect(auth.issuer).toBe('https://identity.test');
    expect(auth.requireHttps).toBeTrue();
    expect(redline.baseUrl).toBe('https://redline.test');
    expect(upload).toBe(participant.upload);
    expect(upload.maxFileSize).toBe(1024);
    expect(upload.allowedFileTypes).toEqual(['text/plain']);
    expect(participant.siglet.baseUrl).toBe('https://proxy.test/siglet');
    expect(participant.did.scheme).toBe('https');
    http.verify();
  });

  it('keeps defaults when files fail or contain invalid fields', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideKeycloakAuthConfig(),
        ...provideRedline(),
        provideParticipantConfig(),
      ],
    });
    const auth = TestBed.inject(KEYCLOAK_AUTH_CONFIG);
    const redline = TestBed.inject(REDLINE_CONFIG);
    const participant = TestBed.inject(PARTICIPANT_CONFIG);
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('config/auth-config.json')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    http.expectOne('config/redline-config.json').flush({ baseUrl: 3, didPrefix: null });
    http
      .expectOne('config/participant-config.json')
      .flush({ did: { scheme: 'ftp' }, upload: null, siglet: { baseUrl: '' } });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(auth.clientId).toBe('jad-ui');
    expect(redline.baseUrl).toBe('http://localhost:8081');
    expect(participant.upload.maxFileSize).toBe(10 * 1024 * 1024);
    expect(participant.did.scheme).toBe('http');
    expect(participant.siglet.baseUrl).toBe('http://edc-proxy.localhost/proxy/siglet');
    http.verify();
  });
});
