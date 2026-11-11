import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../app/auth/auth.service';
import { authBearerInterceptor } from '../../app/auth/interceptors/auth-bearer.interceptor';
import { DidResolverService } from './did-resolver.service';
import { PARTICIPANT_CONFIG } from './participant-config.service';

describe('DidResolverService', () => {
  let resolver: DidResolverService;
  let http: HttpTestingController;
  const endpoint = 'http://connector.test/api/dsp/participant/';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authBearerInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { session: () => ({ token: 'browser-token' }) } },
      ],
    });
    resolver = TestBed.inject(DidResolverService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('resolves host-only documents without exposing bearer tokens, even on the same origin', async () => {
    const did = `did:web:${window.location.host.replace(/:/g, '%3A')}`;
    const result = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    const req = http.expectOne(`http://${window.location.host}/.well-known/did.json`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ service: [{ type: 'ProtocolEndpoint', serviceEndpoint: endpoint }] });
    expect(await result).toBe(endpoint);
  });

  it('resolves encoded ports and path segments and shares in-flight and successful lookups', async () => {
    const did = 'did:web:identity.test%3A8080:org:participant';
    const first = resolver.resolveProtocolEndpoint(did);
    const second = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    const req = http.expectOne('http://identity.test:8080/org/participant/did.json');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ service: [{ type: 'ProtocolEndpoint', serviceEndpoint: endpoint }] });
    expect(await first).toBe(endpoint);
    expect(await second).toBe(endpoint);
    expect(await resolver.resolveProtocolEndpoint(did)).toBe(endpoint);
    http.expectNone('http://identity.test:8080/org/participant/did.json');
  });

  it('uses the configured HTTPS scheme and keeps scheme-specific cache entries', async () => {
    const did = 'did:web:identity.test:participant';
    const first = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    http.expectOne('http://identity.test/participant/did.json').flush({
      service: [{ type: 'ProtocolEndpoint', serviceEndpoint: endpoint }],
    });
    await first;
    TestBed.inject(PARTICIPANT_CONFIG).did.scheme = 'https';
    const secure = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    http.expectOne('https://identity.test/participant/did.json').flush({
      service: [{ type: 'ProtocolEndpoint', serviceEndpoint: 'https://secure.test/dsp' }],
    });
    expect(await secure).toBe('https://secure.test/dsp');
  });

  it('does not request malformed or unsupported DIDs', async () => {
    for (const did of [
      'did:key:abc',
      'did:web:',
      'did:web:host:',
      'did:web:%zz',
      'did:web:user%40host',
    ]) {
      expect(await resolver.resolveProtocolEndpoint(did)).toBeUndefined();
    }
  });

  it('retries HTTP errors and documents with invalid or missing endpoints', async () => {
    const did = 'did:web:identity.test';
    const url = 'http://identity.test/.well-known/did.json';
    for (const payload of [
      null,
      { service: [] },
      { service: [{ type: 'ProtocolEndpoint', serviceEndpoint: { uri: endpoint } }] },
      { service: [{ type: 'ProtocolEndpoint', serviceEndpoint: '  ' }] },
    ]) {
      const attempt = resolver.resolveProtocolEndpoint(did);
      await Promise.resolve();
      http.expectOne(url).flush(payload);
      expect(await attempt).toBeUndefined();
    }
    const failed = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    http.expectOne(url).flush('unavailable', { status: 503, statusText: 'Unavailable' });
    expect(await failed).toBeUndefined();
    const retry = resolver.resolveProtocolEndpoint(did);
    await Promise.resolve();
    http
      .expectOne(url)
      .flush({ service: [{ type: 'ProtocolEndpoint', serviceEndpoint: endpoint }] });
    expect(await retry).toBe(endpoint);
  });
});
