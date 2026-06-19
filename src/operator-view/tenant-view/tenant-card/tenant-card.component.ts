import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Participant, Tenant, VirtualParticipantAgent } from '../../models/redline.models';

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

  /** Emitted when the user requests to deploy a participant. */
  @Output() deploy = new EventEmitter<Participant>();

  /** Emitted when the user requests to register a data plane for a participant. */
  @Output() registerDataPlane = new EventEmitter<Participant>();

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
