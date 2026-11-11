import { HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../app/auth/auth.service';

/** Resolve the participant and bearer credential without sending it to a new origin. */
export function participantAuthorization(
  auth: AuthService,
  operation: string,
): { participantContextId: string; headers: HttpHeaders } {
  const participantContextId = auth.user()?.participantContextId;
  if (!participantContextId) {
    throw new Error(`Participant context id is unavailable for ${operation}.`);
  }
  const token = auth.session()?.token;
  if (!token) {
    throw new Error(`Authentication token is unavailable for ${operation}.`);
  }
  return { participantContextId, headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
}
