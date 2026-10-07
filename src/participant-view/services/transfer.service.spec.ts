import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { EdcClientService } from '@eclipse-edc/dashboard-core';

import { AuthService } from '../../app/auth/auth.service';
import { FileAsset } from '../models/file-asset.model';
import { ParticipantConfigService } from './participant-config.service';
import { PartnerService } from './partner.service';
import { TransferService } from './transfer.service';

// Initiation is stubbed here; the real DID resolution/transfer is covered by the browser test.
describe('TransferService download', () => {
  let service: TransferService;
  let http: HttpTestingController;
  let getTransfer: jasmine.Spy;
  let click: jasmine.Spy;
  const file: FileAsset = {
    id: 'file',
    name: 'report.txt',
    origin: 'remote',
    uploadedAt: 0,
  };
  const tokenUrl = 'http://proxy.test/siglet/tokens/consumer-context/transfer-id';
  const endpoint = 'http://provider.test/api/dataplane/files';

  beforeEach(() => {
    getTransfer = jasmine.createSpy('getTransfer').and.resolveTo({ state: 'STARTED' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: EdcClientService,
          useValue: {
            getClient: async () => ({ management: { transferProcesses: { get: getTransfer } } }),
          },
        },
        { provide: PartnerService, useValue: {} },
        {
          provide: ParticipantConfigService,
          useValue: {
            getSigletConfig: async () => ({ baseUrl: 'http://proxy.test/siglet/' }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ participantContextId: 'consumer-context' }),
            session: () => ({ token: 'browser-token' }),
          },
        },
      ],
    });
    service = TestBed.inject(TransferService);
    http = TestBed.inject(HttpTestingController);
    spyOn(service, 'requestTransfer').and.resolveTo('transfer-id');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-download');
    spyOn(URL, 'revokeObjectURL');
    click = spyOn(HTMLAnchorElement.prototype, 'click');
  });

  afterEach(() => http.verify());

  function reachStarted(): void {
    flushMicrotasks();
    http.expectNone(tokenUrl);
    tick(1000);
  }

  it('waits for STARTED, retrieves the EDR, and downloads the blob with its token', fakeAsync(() => {
    let completed = false;
    getTransfer.and.returnValues(
      Promise.resolve({ state: 'REQUESTED' }),
      Promise.resolve({ state: 'STARTED' }),
    );
    service.requestTransferAndDownload(file).then(() => {
      completed = true;
    });
    reachStarted();
    http.expectNone(tokenUrl);
    tick(1000);

    const tokenRequest = http.expectOne(tokenUrl);
    expect(tokenRequest.request.method).toBe('GET');
    expect(tokenRequest.request.headers.get('Authorization')).toBe('Bearer browser-token');
    tokenRequest.flush({ token: 'transfer-token', endpoint });
    flushMicrotasks();

    const downloadRequest = http.expectOne(endpoint);
    expect(downloadRequest.request.responseType).toBe('blob');
    expect(downloadRequest.request.headers.get('Authorization')).toBe('Bearer transfer-token');
    expect(click).not.toHaveBeenCalled();
    const blob = new Blob(['hello'], { type: 'text/plain' });
    downloadRequest.flush(blob);
    flushMicrotasks();

    expect(URL.createObjectURL).toHaveBeenCalledOnceWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.calls.mostRecent().object as HTMLAnchorElement;
    expect(anchor.download).toBe('report.txt');
    expect(anchor.href).toBe('blob:test-download');
    expect(anchor.isConnected).toBeFalse();
    expect(completed).toBeTrue();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    tick(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnceWith('blob:test-download');
  }));

  for (const edr of [
    { endpoint },
    { token: ' ', endpoint },
    { token: 'transfer-token' },
    { token: 'transfer-token', endpoint: 'javascript:alert(1)' },
    { token: 'transfer-token', endpoint: '/relative/files' },
  ]) {
    it(`rejects an unusable EDR ${JSON.stringify(edr)}`, fakeAsync(() => {
      let error: Error | undefined;
      service.requestTransferAndDownload(file).catch((value) => {
        error = value;
      });
      reachStarted();
      http.expectOne(tokenUrl).flush(edr);
      flushMicrotasks();
      expect(error?.message).toMatch(/did not issue an access token|invalid download endpoint/);
      http.expectNone(endpoint);
      expect(click).not.toHaveBeenCalled();
    }));
  }

  it('propagates token API failures without attempting a download', fakeAsync(() => {
    let error: { status: number } | undefined;
    service.requestTransferAndDownload(file).catch((value) => {
      error = value;
    });
    reachStarted();
    http.expectOne(tokenUrl).flush('forbidden', { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();
    expect(error?.status).toBe(403);
    http.expectNone(endpoint);
    expect(click).not.toHaveBeenCalled();
  }));

  it('does not signal a browser download when the file request fails', fakeAsync(() => {
    let error: { status: number } | undefined;
    service.requestTransferAndDownload(file).catch((value) => {
      error = value;
    });
    reachStarted();
    http.expectOne(tokenUrl).flush({ token: 'transfer-token', endpoint });
    flushMicrotasks();
    http.expectOne(endpoint).flush(new Blob(), { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks();
    expect(error?.status).toBe(401);
    expect(click).not.toHaveBeenCalled();
  }));

  it('reports a terminated transfer immediately with the backend reason', fakeAsync(() => {
    getTransfer.and.resolveTo({ state: 'TERMINATED', errorDetail: 'No dataplane found' });
    let error: Error | undefined;
    service.requestTransferAndDownload(file).catch((value) => {
      error = value;
    });
    reachStarted();
    expect(error?.message).toBe('Transfer process terminated: No dataplane found');
    http.expectNone(tokenUrl);
    expect(click).not.toHaveBeenCalled();
  }));

  it('times out without requesting an EDR when STARTED is never reached', fakeAsync(() => {
    getTransfer.and.resolveTo({ state: 'REQUESTED' });
    let error: Error | undefined;
    service.requestTransferAndDownload(file).catch((value) => {
      error = value;
    });
    flushMicrotasks();
    tick(30_000);
    expect(error?.message).toBe('Transfer process timed out before reaching STARTED.');
    http.expectNone(tokenUrl);
    expect(click).not.toHaveBeenCalled();
  }));
});
