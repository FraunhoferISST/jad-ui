import { fakeAsync, tick } from '@angular/core/testing';
import { triggerBrowserDownload } from './browser-download';

describe('triggerBrowserDownload', () => {
  it('clicks an anchor and revokes its object URL after the browser can consume it', fakeAsync(() => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:download');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const blob = new Blob(['content']);
    triggerBrowserDownload(blob, 'report.txt');
    expect(URL.createObjectURL).toHaveBeenCalledOnceWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.calls.mostRecent().object as HTMLAnchorElement;
    expect(anchor.download).toBe('report.txt');
    expect(anchor.isConnected).toBeFalse();
    expect(revoke).not.toHaveBeenCalled();
    tick(60_000);
    expect(revoke).toHaveBeenCalledOnceWith('blob:download');
  }));

  it('still removes the anchor and schedules revocation if click fails', fakeAsync(() => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:download');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.throwError('click failed');
    expect(() => triggerBrowserDownload(new Blob(), '')).toThrowError('click failed');
    expect((click.calls.mostRecent().object as HTMLAnchorElement).isConnected).toBeFalse();
    tick(60_000);
    expect(revoke).toHaveBeenCalledOnceWith('blob:download');
  }));
});
