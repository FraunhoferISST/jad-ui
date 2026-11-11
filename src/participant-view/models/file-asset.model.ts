import { Dataset, ContractAgreement } from '@think-it-labs/edc-connector-client';

export interface FileAsset {
  id: string;
  name: string;
  origin: 'owned' | 'remote';
  uploadedAt: string | number;
  size?: number;
  type?: string;
  agreements?: ContractAgreement[];
  transactionHistory?: Transaction[];
  partnerName?: string;
  catalogDataset?: Dataset;
  partnerDid?: string;
  assetId?: string;
  contractDefinitionId?: string;
}

export interface Transaction {
  id: string;
  type: 'share' | 'access';
  partnerId?: string;
  partnerName?: string;
  timestamp: string | null;
  status: 'success' | 'failed';
}
