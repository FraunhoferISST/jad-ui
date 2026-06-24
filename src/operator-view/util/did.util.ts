/**
 * Helpers for deriving a participant DID from a tenant name.
 *
 * The DID is used as the participant `identifier` when deploying a participant
 * (see the Redline `.../participants/{id}/deployments` request body).
 */

/** Slugifies a tenant name into a DID-safe identifier segment. */
export function slugifyTenantName(name: string): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a valid `did:web` DID for a participant from a tenant name.
 *
 * @param tenantName - The human-readable tenant name.
 * @param didPrefix - The configured DID prefix the slug is appended to
 *   (e.g. `did:web:identityhub%3A7083:`).
 * @returns The generated DID, or an empty string when the name is blank.
 */
export function generateParticipantDid(tenantName: string, didPrefix: string): string {
  const slug = slugifyTenantName(tenantName);
  return slug ? `${didPrefix}${slug}` : '';
}
