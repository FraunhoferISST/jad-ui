import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { pollUntil } from './poll-until';

describe('pollUntil', () => {
  it('waits before the first attempt and returns the first defined result', fakeAsync(() => {
    const check = jasmine
      .createSpy('check')
      .and.returnValues(Promise.resolve(undefined), Promise.resolve('ready'));
    let result: string | undefined;
    pollUntil<string>(check, { intervalMs: 100, timeoutMs: 500, initialDelay: true }).then(
      (value) => {
        result = value;
      },
    );
    expect(check).not.toHaveBeenCalled();
    tick(100);
    expect(check).toHaveBeenCalledOnceWith(1);
    tick(100);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result).toBe('ready');
  }));

  it('stops at the timeout after the final scheduled check', fakeAsync(() => {
    const check = jasmine.createSpy('check').and.resolveTo(undefined);
    let done = false;
    pollUntil(check, { intervalMs: 100, timeoutMs: 300, initialDelay: true }).then(() => {
      done = true;
    });
    tick(300);
    expect(check).toHaveBeenCalledTimes(3);
    expect(done).toBeTrue();
  }));

  it('supports bounded backoff and an optional final wait', fakeAsync(() => {
    const check = jasmine.createSpy('check').and.resolveTo(undefined);
    let done = false;
    pollUntil(check, {
      intervalMs: (attempt) => attempt * 100,
      maxAttempts: 3,
      waitAfterLastAttempt: true,
    }).then(() => {
      done = true;
    });
    flushMicrotasks();
    expect(check).toHaveBeenCalledTimes(1);
    tick(100);
    expect(check).toHaveBeenCalledTimes(2);
    tick(200);
    expect(check).toHaveBeenCalledTimes(3);
    expect(done).toBeFalse();
    tick(300);
    expect(done).toBeTrue();
  }));

  it('cancels a pending delay and ignores results that arrive after abort', fakeAsync(() => {
    const controller = new AbortController();
    const check = jasmine.createSpy('check').and.resolveTo('ready');
    let finished = false;
    pollUntil(check, { intervalMs: 100, initialDelay: true, signal: controller.signal }).then(
      (value) => {
        finished = value === undefined;
      },
    );
    controller.abort();
    flushMicrotasks();
    tick(100);
    expect(check).not.toHaveBeenCalled();
    expect(finished).toBeTrue();

    const other = new AbortController();
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    let result: string | undefined = 'unresolved';
    pollUntil(() => pending, { intervalMs: 100, signal: other.signal }).then((value) => {
      result = value;
    });
    other.abort();
    resolve('late');
    flushMicrotasks();
    expect(result).toBeUndefined();
  }));

  it('ignores a rejection from a check that finishes after cancellation', fakeAsync(() => {
    const controller = new AbortController();
    let reject!: (reason: Error) => void;
    const pending = new Promise<string>((_resolve, fail) => {
      reject = fail;
    });
    let result: string | undefined = 'unresolved';
    pollUntil(() => pending, { intervalMs: 100, signal: controller.signal }).then((value) => {
      result = value;
    });
    controller.abort();
    reject(new Error('late failure'));
    flushMicrotasks();
    expect(result).toBeUndefined();
  }));

  it('propagates errors from the check', fakeAsync(() => {
    let message = '';
    pollUntil(
      async () => {
        throw new Error('backend failure');
      },
      { intervalMs: 100 },
    ).catch((error: Error) => {
      message = error.message;
    });
    flushMicrotasks();
    expect(message).toBe('backend failure');
  }));
});
