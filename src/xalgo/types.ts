interface ConsensusConfig {
  appId: number;
  xAlgoId: number;
}

interface ConsensusState {
  currentRound: number; // round the data was read at
  algoBalance: bigint;
  xAlgoCirculatingSupply: bigint;
  proposersBalances: {
    address: string;
    algoBalance: bigint;
  }[];
  timeDelay: bigint;
  numProposers: bigint;
  minProposerBalance: bigint;
  maxProposerBalance: bigint;
  fee: bigint; // 4 d.p.
  premium: bigint; // 16 d.p.
  totalPendingStake: bigint;
  totalActiveStake: bigint;
  totalRewards: bigint;
  totalUnclaimedFees: bigint;
  canImmediateStake: boolean;
  canDelayStake: boolean;
}

type ProposerAllocations = bigint[];

export type { ConsensusConfig, ConsensusState, ProposerAllocations };
