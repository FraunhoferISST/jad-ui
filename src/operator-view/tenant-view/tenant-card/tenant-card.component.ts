import { Component, EventEmitter, Input, Output } from '@angular/core';

import {
  DataspaceResponse,
  Participant,
  Tenant,
  VirtualParticipantAgent,
} from '../../models/redline.models';

/**
 * Card combining a tenant with its participant(s). Shows the tenant header
 * together with each participant's agents and dataspace memberships, and emits
 * events to deploy a participant or register a data plane for it.
 */
@Component({
  selector: 'tenant-card',
  standalone: true,
  templateUrl: './tenant-card.component.html',
})
export class TenantCardComponent {
  @Input({ required: true }) tenant!: Tenant;

  /** Dataspaces available, used to resolve dataspace names from their IDs. */
  @Input() dataspaces: DataspaceResponse[] = [];

  /** IDs of participants currently being polled for deployment status. */
  @Input() pollingParticipantIds: ReadonlySet<number> = new Set<number>();

  /** Emitted when the user requests to deploy a participant. */
  @Output() deploy = new EventEmitter<Participant>();

  /** Emitted when the user requests to register a data plane for a participant. */
  @Output() registerDataPlane = new EventEmitter<Participant>();

  /** Resolves a dataspace's display name from its ID, if known. */
  dataspaceName(dataspaceId: number): string | undefined {
    return this.dataspaces.find(dataspace => dataspace.id === dataspaceId)?.name;
  }

  /** Returns a participant's agents sorted alphabetically by type. */
  sortedAgents(participant: Participant): VirtualParticipantAgent[] {
    return [...(participant.agents ?? [])].sort((a, b) =>
      (a.type ?? '').localeCompare(b.type ?? ''),
    );
  }

  /** Whether the given participant is currently being polled. */
  isPolling(participant: Participant): boolean {
    return this.pollingParticipantIds.has(participant.id);
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
