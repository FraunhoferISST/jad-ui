import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../app/auth/auth.service';
import { FileSharingFileResource } from '../models/file-sharing-data.model';
import { ParticipantConfigService } from './participant-config.service';

@Injectable({ providedIn: 'root' })
export class FileSharingApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly participantConfig = inject(ParticipantConfigService);

  async listFiles(): Promise<FileSharingFileResource[]> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    const response = await firstValueFrom(
      this.http.get<FileSharingFileResource[] | FileSharingFileResource>(
        `${baseUrl}/api/files/${encodeURIComponent(participantContextId)}`,
        { headers },
      ),
    );

    return Array.isArray(response) ? response : response ? [response] : [];
  }

  async uploadFile(formData: FormData): Promise<void> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    await firstValueFrom(
      this.http.post<void>(`${baseUrl}/api/files/${encodeURIComponent(participantContextId)}`, formData, {
        headers,
      }),
    );
  }

  async deleteFile(fileId: string): Promise<void> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    await firstValueFrom(
      this.http.delete<void>(
        `${baseUrl}/api/files/${encodeURIComponent(participantContextId)}/${encodeURIComponent(fileId)}`,
        { headers },
      ),
    );
  }

  private async resolveRequestContext(): Promise<{
    baseUrl: string;
    participantContextId: string;
    headers: HttpHeaders;
  }> {
    const participantContextId = this.auth.user()?.participantContextId;
    if (!participantContextId) {
      throw new Error('Participant context id is unavailable for file operations.');
    }

    const token = this.auth.session()?.token;
    if (!token) {
      throw new Error('Authentication token is unavailable for file operations.');
    }

    const config = await this.participantConfig.getFileSharingConfig();
    const baseUrl = config.baseUrl.replace(/\/$/, '');

    return {
      baseUrl,
      participantContextId,
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
    };
  }
}
