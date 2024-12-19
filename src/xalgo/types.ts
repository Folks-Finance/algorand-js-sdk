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
  maxProposerBalance: bigint;
  fee: bigint; // 4 d.p.
  premium: bigint; // 16 d.p.
  lastProposersActiveBalance: bigint;
  totalPendingStake: bigint;
  totalUnclaimedFees: bigint;
  canImmediateStake: boolean;
  canDelayStake: boolean;
}

type ProposerAllocations = bigint[];

export { ConsensusConfig, ConsensusState, ProposerAllocations };
