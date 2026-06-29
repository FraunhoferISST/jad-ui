/**
 * Helpers for reasoning about participant/tenant deployment state from their
 * virtual participant agents.
 *
 * A participant is considered "active" once it has agents and every one of them
 * has reached the `ACTIVE` state. A tenant is considered "deployed" once it has
 * at least one active participant and none that are only partially deployed.
 */

import { Participant, Tenant } from '../models/redline.models';

/** Whether a participant has agents and every one of them is `ACTIVE`. */
export function isParticipantActive(participant: Participant): boolean {
  const agents = participant.agents ?? [];
  return (
    agents.length > 0 &&
    agents.every(agent => (agent.state ?? '').toUpperCase() === 'ACTIVE')
  );
}

/**
 * Whether a tenant is fully deployed: it has at least one participant with
 * agents, and every such participant is {@link isParticipantActive}.
 */
export function isTenantDeployed(tenant: Tenant): boolean {
  const participantsWithAgents =
    tenant.participants?.filter(p => (p.agents?.length ?? 0) > 0) ?? [];
  return (
    participantsWithAgents.length > 0 &&
    participantsWithAgents.every(isParticipantActive)
  );
}
