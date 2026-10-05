import { EdcController } from '@think-it-labs/edc-connector-client';
import { PolicyCreateRequest } from '../policy-builder/policy-schema';

/** Sends the compact request unchanged: no model-generated `id` or nested context. */
export class PolicyCreationController extends EdcController {
  async create(request: PolicyCreateRequest): Promise<void> {
    if (!this.context) throw new Error('No EDC context available while creating a policy.');
    await this.inner.request(this.context.management, {
      path: `/${this.context.managementApiVersion}/policydefinitions`,
      method: 'POST',
      authorization: this.context.authorization,
      body: request,
    });
  }
}
