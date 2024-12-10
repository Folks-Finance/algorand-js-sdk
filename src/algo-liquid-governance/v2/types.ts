interface DistributorInfo {
  currentRound?: number; // round the data was read at
  dispenserAppId: number; // id of dispenser app which mints gALGO
  premintEnd: bigint; // unix timestamp for the end of the pre-mint period
  commitEnd: bigint; // unix timestamp for end of the commitment period
  periodEnd: bigint; // unix timestamp for end of the governance period
  fee: bigint; // minting fee 4 d.p.
  totalCommitment: bigint; // total amount of ALGOs committed
  isBurningPaused: boolean; // flag to indicate if users can burn their ALGO for gALGO
}

interface UserCommitmentInfo {
  currentRound?: number;
  userAddress: string;
  canDelegate: boolean; // whether voting can be delegated to admin
  premint: bigint; // amount of ALGOs the user has pre-minted and not yet claimed
  commitment: bigint; // amount of ALGOs the user has committed
  nonCommitment: bigint; // amount of ALGOs the user has added after the commitment period
}

interface EscrowGovernanceStatus {
  currentRound?: number;
  balance: bigint;
  isOnline: boolean;
  status?: {
    version: number;
    commitment: bigint;
    beneficiaryAddress?: string;
    xGovControlAddress?: string;
  };
}

export type { DistributorInfo, UserCommitmentInfo, EscrowGovernanceStatus };
