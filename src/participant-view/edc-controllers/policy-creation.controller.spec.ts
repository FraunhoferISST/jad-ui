import { EdcConnectorClient } from '@think-it-labs/edc-connector-client';
import { PolicyCreationController } from './policy-creation.controller';
import { PolicyCreateRequest } from '../policy-builder/policy-schema';

describe('PolicyCreationController', () => {
  const body: PolicyCreateRequest = {
    '@context': ['https://w3id.org/edc/connector/management/v2'],
    '@type': 'PolicyDefinition',
    '@id': 'Named policy',
    policy: { '@type': 'Set' },
  };

  it('preserves participant routing, authorization and the exact schema-valid envelope', async () => {
    const request = jasmine.createSpy('request').and.resolveTo({ '@id': 'Named policy' });
    const inner = { request } as unknown as ConstructorParameters<
      typeof PolicyCreationController
    >[0];
    const context = EdcConnectorClient.createContext({
      addresses: { management: 'https://edc.example/api/mgmt' },
      managementApiVersion: 'v5/participants/pcx-test',
      authorization: { Authorization: 'Bearer test-token' },
    });
    await new PolicyCreationController(inner, context).create(body);
    expect(request).toHaveBeenCalledOnceWith('https://edc.example/api/mgmt', {
      path: '/v5/participants/pcx-test/policydefinitions',
      method: 'POST',
      authorization: context.authorization,
      body,
    });
  });

  it('fails without an authenticated connector context', async () => {
    const request = jasmine.createSpy('request');
    const inner = { request } as unknown as ConstructorParameters<
      typeof PolicyCreationController
    >[0];
    await expectAsync(new PolicyCreationController(inner).create(body)).toBeRejectedWithError(
      /No EDC context/,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
