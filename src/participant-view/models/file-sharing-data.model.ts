export interface FileSharingFileResource {
  id?: string;
  participantContextId?: string;
  uploadTimestamp?: number;
  contentType?: string;
  contentLength?: number;
  fileName?: string;
  metadata?: Record<string, unknown>;
}
