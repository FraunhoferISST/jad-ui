import {
  ContractAgreement,
  EdcConnectorClient,
  MANAGEMENT_V2_CONTEXT,
  QuerySpec,
} from '@think-it-labs/edc-connector-client';

import { V5ContractAgreementController } from './contract-agreements-v5.controller';

describe('V5ContractAgreementController', () => {
  const rawAgreement = {
    '@type': 'ContractAgreement',
    '@id': 'agreement-1',
    assetId: 'asset-1',
    providerId: 'did:web:provider',
    consumerId: 'did:web:consumer',
    contractSigningDate: 1791203310,
    '@context': [MANAGEMENT_V2_CONTEXT],
  };

  function innerWith(request: jasmine.Spy) {
    return { request } as unknown as ConstructorParameters<typeof V5ContractAgreementController>[0];
  }

  function context() {
    return EdcConnectorClient.createContext({
      addresses: { management: 'https://edc.example/api/mgmt' },
      managementApiVersion: 'v5/participants/pcx-test',
      authorization: { Authorization: 'Bearer test-token' },
    });
  }

  it('expands raw agreements into typed entities so `id` and accessors resolve', async () => {
    const request = jasmine.createSpy('request').and.resolveTo([rawAgreement]);
    const spec: QuerySpec = { '@type': 'QuerySpec' };

    const result = await new V5ContractAgreementController(innerWith(request), context()).queryAll(
      spec,
    );

    expect(result.length).toBe(1);
    expect(result[0] instanceof ContractAgreement).toBeTrue();
    // `id` comes from the JSON-LD `@id`; without expansion it was undefined, which
    // silently broke matching transfers to agreements in the file detail history.
    expect(result[0].id).toBe('agreement-1');
    expect(result[0].assetId).toBe('asset-1');
    expect(result[0].providerId).toBe('did:web:provider');
    expect(result[0].consumerId).toBe('did:web:consumer');
    expect(result[0].contractSigningDate).toBe(1791203310);
  });

  it('preserves participant routing, authorization and the query envelope', async () => {
    const request = jasmine.createSpy('request').and.resolveTo([]);
    const spec: QuerySpec = { '@type': 'QuerySpec' };

    await new V5ContractAgreementController(innerWith(request), context()).queryAll(spec);

    expect(request).toHaveBeenCalledOnceWith('https://edc.example/api/mgmt', {
      path: '/v5/participants/pcx-test/contractagreements/request',
      method: 'POST',
      authorization: { Authorization: 'Bearer test-token' },
      body: { '@context': [MANAGEMENT_V2_CONTEXT], '@type': 'QuerySpec' },
    });
  });

  it('fails without an authenticated connector context', async () => {
    const request = jasmine.createSpy('request');
    await expectAsync(
      new V5ContractAgreementController(innerWith(request)).queryAll({ '@type': 'QuerySpec' }),
    ).toBeRejectedWithError(/No EDC context/);
    expect(request).not.toHaveBeenCalled();
  });
});
