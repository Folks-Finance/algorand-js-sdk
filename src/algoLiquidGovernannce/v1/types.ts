interface Dispenser {
  appId: number;
  gAlgoId: number;
}

interface DispenserInfo {
  currentRound: number; // round the data was read at
  distributorAppIds: number[]; // list of valid distributor app ids
  isMintingPaused: boolean; // flag indicating if users can mint gALGO
}

interface Distributor {
  appId: number;
}

interface DistributorInfo {
  currentRound: number; // round the data was read at
  dispenserAppId: number; // id of dispenser app which mints gALGO
  commitEnd: bigint; // unix timestamp for end of the commitment period
  periodEnd: bigint; // unix timestamp for end of the governance period
  totalCommitment: bigint; // total amount of ALGOs committed
  totalCommitmentClaimed: bigint; // total amount of ALGOs committed whose rewards have already been claimed
  canClaimAlgoRewards: boolean; // flag to indicate if users can claim ALGO rewards (excl early claims)
  rewardsPerAlgo: bigint; // reward amount per ALGO committed (16 d.p.)
  totalRewardsClaimed: bigint; // total amount of rewards claimed
  isBurningPaused: boolean; // flag to indicate if users can burn their ALGO for gALGO
  premintEnd?: bigint; // unix timestamp for the end of the pre-mint period (if present)
}

interface UserCommitmentInfo {
  currentRound: number;
  commitment: bigint; // amount of ALGOs the user has committed
  commitmentClaimed: bigint; // amount of ALGOs the user has committed whose rewards have already been claimed
  premint?: bigint; // amount of ALGOs the user has pre-minted and not yet claimed
}

export {
  Dispenser,
  DispenserInfo,
  Distributor,
  DistributorInfo,
  UserCommitmentInfo,
};
