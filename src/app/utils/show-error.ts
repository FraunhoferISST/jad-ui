import { HttpErrorResponse } from '@angular/common/http';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

/**
 * Extracts the most specific message from a failed request.
 *
 * Redline (and other Spring backends) answer errors with a
 * `{ code, message }` body, which is far more useful than the generic
 * `HttpErrorResponse.message` ("Http failure response for …: 404 Not Found").
 */
export function errorMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string' &&
      body.message.trim()
    ) {
      return body.message;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function showError(alerts: ModalAndAlertService, error: unknown, title: string): void {
  alerts.showAlert(errorMessage(error), title, 'error', 8);
}
