import { DIDDocument, DIDResolutionResult, DIDResolver, ParsedDID, Resolver } from 'did-resolver'
import { getResolver } from 'web-did-resolver'

export async function resolveWebDid(did: string, https: boolean = true): Promise<DIDResolutionResult> {
  const webResolver = https ? getResolver() : getHttpResolver();
  const didResolver = new Resolver({ ...webResolver });
  return await didResolver.resolve(did);
}

export async function resolveDidProtocolEndpoint(did: string, https: boolean = true): Promise<string | undefined> {
  const doc = await resolveWebDid(did, https);
  const service = doc.didDocument?.service?.find(svc => svc.type == 'ProtocolEndpoint');
  if (service) {
    return service.serviceEndpoint.toString();
  } else {
    console.error(`No ProtocolEndpoint service found for DID: ${did}`);
    return undefined;
  }
}

/**
 * Builds a custom did:web resolver that fetches DID documents over plain HTTP
 * instead of HTTPS.
 *
 * NOTE: Only use this for local development / trusted internal networks.
 * Resolving did:web over HTTP means the document can't be authenticated via TLS.
 */
function getHttpResolver(): Record<string, DIDResolver> {
  const resolve: DIDResolver = async (
    did: string,
    parsed: ParsedDID
  ): Promise<DIDResolutionResult> => {
    const DOC_PATH = '/.well-known/did.json'
    let path = decodeURIComponent(parsed.id) + DOC_PATH
    const id = parsed.id.split(':')
    if (id.length > 1) {
      path = id.map(decodeURIComponent).join('/') + '/did.json'
    }

    const url = `http://${path}` // <-- force http

    const didDocumentMetadata = {}
    let didDocument: DIDDocument | null = null
    let err: string | null = null

    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) {
        throw new Error(`Bad response ${res.statusText}`)
      }
      didDocument = await res.json()
    } catch (error) {
      err = `resolver_error: DID must resolve to a valid http URL containing a JSON document: ${error}`
    }

    const contentType =
      typeof didDocument?.['@context'] !== 'undefined'
        ? 'application/did+ld+json'
        : 'application/did+json'

    if (err) {
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: 'notFound',
          message: err,
        },
      }
    }

    return {
      didDocument,
      didDocumentMetadata,
      didResolutionMetadata: { contentType },
    }
  }

  return { web: resolve }
}
