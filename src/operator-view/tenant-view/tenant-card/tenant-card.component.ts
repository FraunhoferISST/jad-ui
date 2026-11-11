import { Component, input, output } from '@angular/core';

import {
  DataspaceResponse,
  Participant,
  Tenant,
  VirtualParticipantAgent,
} from '../../../app/redline/redline.models';
import { isParticipantActive } from '../../util/deployment.util';

/**
 * Card combining a tenant with its participant(s). Shows the tenant header
 * together with each participant's agents and dataspace memberships, and emits
 * an event to deploy a participant.
 */
@Component({
  selector: 'app-tenant-card',
  templateUrl: './tenant-card.component.html',
})
export class TenantCardComponent {
  readonly tenant = input.required<Tenant>();

  /** Dataspaces available, used to resolve dataspace names from their IDs. */
  readonly dataspaces = input<DataspaceResponse[]>([]);

  /** IDs of participants currently being polled for deployment status. */
  readonly pollingParticipantIds = input<ReadonlySet<number>>(new Set<number>());

  /** Whether the deploy action is offered for this card's participants. */
  readonly canDeploy = input(true);

  /** Emitted when the user requests to deploy a participant. */
  readonly deploy = output<Participant>();

  /** Resolves a dataspace's display name from its ID, if known. */
  dataspaceName(dataspaceId: number): string | undefined {
    return this.dataspaces().find((dataspace) => dataspace.id === dataspaceId)?.name;
  }

  /** Returns a participant's agents sorted alphabetically by type. */
  sortedAgents(participant: Participant): VirtualParticipantAgent[] {
    return [...(participant.agents ?? [])].sort((a, b) =>
      (a.type ?? '').localeCompare(b.type ?? ''),
    );
  }

  /** Whether the given participant is currently being polled. */
  isPolling(participant: Participant): boolean {
    return this.pollingParticipantIds().has(participant.id);
  }

  /** Whether the participant has agents and every one of them is ACTIVE. */
  allAgentsActive(participant: Participant): boolean {
    return isParticipantActive(participant);
  }

  /** Maps an agent state to a daisyUI badge color class. */
  agentBadgeColor(agent: VirtualParticipantAgent): string {
    switch ((agent.state ?? '').toUpperCase()) {
      case 'RUNNING':
      case 'DEPLOYED':
      case 'ACTIVE':
        return 'badge-success';
      case 'ERROR':
      case 'FAILED':
        return 'badge-error';
      case 'PENDING':
      case 'DEPLOYING':
        return 'badge-warning';
      default:
        return 'badge-ghost';
    }
  }
}
