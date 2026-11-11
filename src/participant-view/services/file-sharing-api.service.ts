import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../app/auth/auth.service';
import { FileSharingFileResource } from '../models/file-sharing-data.model';
import { ParticipantConfigService } from './participant-config.service';
import { triggerBrowserDownload } from '../utils/browser-download';
import { participantAuthorization } from '../utils/participant-auth';

@Injectable({ providedIn: 'root' })
export class FileSharingApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly participantConfig = inject(ParticipantConfigService);

  async listFiles(): Promise<FileSharingFileResource[]> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    return firstValueFrom(
      this.http.get<FileSharingFileResource[]>(
        `${baseUrl}/api/files/${encodeURIComponent(participantContextId)}`,
        { headers },
      ),
    );
  }

  async uploadFile(formData: FormData): Promise<void> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    await firstValueFrom(
      this.http.post<void>(
        `${baseUrl}/api/files/${encodeURIComponent(participantContextId)}`,
        formData,
        {
          headers,
        },
      ),
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

  async downloadFile(file: { id: string; name?: string }): Promise<void> {
    const { baseUrl, participantContextId, headers } = await this.resolveRequestContext();
    const blob = await firstValueFrom(
      this.http.get(
        `${baseUrl}/api/files/${encodeURIComponent(participantContextId)}/${encodeURIComponent(file.id)}`,
        { headers, responseType: 'blob' as const },
      ),
    );

    triggerBrowserDownload(blob, file.name || file.id);
  }

  private async resolveRequestContext(): Promise<{
    baseUrl: string;
    participantContextId: string;
    headers: HttpHeaders;
  }> {
    const { participantContextId, headers } = participantAuthorization(
      this.auth,
      'file operations',
    );
    const config = await this.participantConfig.getFileSharingConfig();
    const baseUrl = config.baseUrl.replace(/\/$/, '');

    return {
      baseUrl,
      participantContextId,
      headers,
    };
  }
}
