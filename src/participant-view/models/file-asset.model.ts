import { Constraint, Dataset } from './redline-data.model';

export interface FileAsset {
  id: string;
  name: string;
  description?: string;
  useCase?: string;
  useCaseLabel?: string;
  origin: 'owned' | 'remote';
  dataspace?: string;
  uploadedAt: string;
  updatedAt?: string;
  size?: number;
  type?: string;
  accessRestrictions?: AccessRestriction[];
  agreements?: Agreement[];
  transactionHistory?: Transaction[];
  partnerName?: string;
  catalogDataset?: Dataset;
  partnerDid?: string;
  assetId?: string;
}

export interface AccessRestriction {
  partnerId?: string;
  partnerName?: string;
  policy?: string;
  contractId?: string;
}

export interface Agreement {
  id: string;
  partnerId: string;
  partnerName: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  permissions?: Constraint[];
}

export interface Transaction {
  id: string;
  type: 'upload' | 'download' | 'share' | 'access';
  partnerId?: string;
  partnerName?: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
}
