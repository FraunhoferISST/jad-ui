import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { firstValueFrom } from 'rxjs';
import { ExtendedEdcClient } from '../models/edc.model';
import { PolicyCreateRequest, PolicySchema, SchemaNode } from './policy-schema';

export const POLICY_SCHEMA_URL = 'config/jad-profile.json';
// export const POLICY_SCHEMA_URL = 'config/cx-profile.json';

@Injectable({ providedIn: 'root' })
export class PolicyBuilderService {
  private readonly http = inject(HttpClient);
  private readonly edc = inject(EdcClientService);

  async loadSchema(): Promise<PolicySchema> {
    return new PolicySchema(await firstValueFrom(this.http.get<SchemaNode>(POLICY_SCHEMA_URL)));
  }

  async createPolicy(request: PolicyCreateRequest): Promise<void> {
    const client = (await this.edc.getClient()) as ExtendedEdcClient;
    await client.policyCreation.create(request);
  }
}
