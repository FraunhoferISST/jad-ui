import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SKIP_BEARER_AUTH } from '../../app/auth/interceptors/auth-bearer.interceptor';
import { ParticipantConfigService } from './participant-config.service';

@Injectable({ providedIn: 'root' })
export class DidResolverService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ParticipantConfigService);
  private readonly cache = new Map<string, Promise<string | undefined>>();

  /** Resolve public did:web documents without sending the application bearer token. */
  async resolveProtocolEndpoint(did: string): Promise<string | undefined> {
    const { scheme } = await this.config.getDidConfig();
    const url = didDocumentUrl(did, scheme);
    if (!url) return undefined;

    let pending = this.cache.get(url);
    if (!pending) {
      pending = firstValueFrom(
        this.http.get<unknown>(url, {
          context: new HttpContext().set(SKIP_BEARER_AUTH, true),
        }),
      )
        .then(protocolEndpointFrom)
        .catch(() => undefined);
      this.cache.set(url, pending);
      const request = pending;
      void request.then((endpoint) => {
        // Retry transient failures and incomplete documents on the next lookup.
        if (!endpoint && this.cache.get(url) === request) this.cache.delete(url);
      });
    }
    return pending;
  }
}

/** did:web host-only documents use /.well-known; path DIDs use /path/did.json. */
function didDocumentUrl(did: string, scheme: 'http' | 'https'): string | undefined {
  if (!did.startsWith('did:web:')) return undefined;
  try {
    const parts = did.slice('did:web:'.length).split(':').map(decodeURIComponent);
    if (parts.some((part) => !part)) return undefined;
    const host = parts[0];
    // Host cannot contain user-info, a path, query or fragment.
    if (/[\s/@?#]/.test(host)) return undefined;
    const url = new URL(`${scheme}://${host}`);
    if (!url.hostname || url.username || url.password) return undefined;
    url.pathname =
      parts.length === 1 ? '/.well-known/did.json' : `/${parts.slice(1).join('/')}/did.json`;
    return url.href;
  } catch {
    return undefined;
  }
}

function protocolEndpointFrom(document: unknown): string | undefined {
  if (!document || typeof document !== 'object' || !('service' in document)) return undefined;
  const services = document.service;
  if (!Array.isArray(services)) return undefined;
  for (const service of services) {
    if (
      service &&
      typeof service === 'object' &&
      service.type === 'ProtocolEndpoint' &&
      typeof service.serviceEndpoint === 'string' &&
      service.serviceEndpoint.trim()
    ) {
      return service.serviceEndpoint;
    }
  }
  return undefined;
}
