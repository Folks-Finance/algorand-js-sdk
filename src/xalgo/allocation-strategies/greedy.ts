import { maximum, minimum } from "../../math-lib.js";
import { convertAlgoToXAlgoWhenDelay } from "../formulae.js";

import { FIXED_CAPACITY_BUFFER, MAX_APPL_CALLS } from "./constants.js";

import type { ProposerAllocations, ConsensusState } from "../types.js";

const greedyStakeAllocationStrategy = (
  consensusState: ConsensusState,
  amount: number | bigint,
): ProposerAllocations => {
  const { proposersBalances, maxProposerBalance } = consensusState;
  const allocation = new Array<bigint>(proposersBalances.length);

  // sort in ascending order
  const indexed = proposersBalances.map((proposer, index) => ({ ...proposer, index }));
  indexed.sort((p0, p1) => Number(p0.algoBalance - p1.algoBalance));

  // allocate to proposers in greedy approach
  let remaining = BigInt(amount);
  for (let i = 0; i < allocation.length && i < MAX_APPL_CALLS; i++) {
    const { algoBalance: proposerAlgoBalance, index: proposerIndex } = indexed[i];

    // under-approximate capacity to leave wiggle room
    const algoCapacity = maximum(maxProposerBalance - proposerAlgoBalance - FIXED_CAPACITY_BUFFER, BigInt(0));
    const allocate = minimum(remaining, algoCapacity);
    allocation[proposerIndex] = allocate;

    // exit if fully allocated
    remaining -= allocate;
    if (remaining <= 0) break;
  }

  // handle case where still remaining
  if (remaining > 0) throw Error("Insufficient capacity to stake");

  return allocation;
};

const greedyUnstakeAllocationStrategy = (
  consensusState: ConsensusState,
  amount: number | bigint,
): ProposerAllocations => {
  const { proposersBalances, minProposerBalance } = consensusState;
  const allocation = new Array<bigint>(proposersBalances.length);

  // sort in descending order
  const indexed = proposersBalances.map((proposer, index) => ({ ...proposer, index }));
  indexed.sort((p0, p1) => Number(p1.algoBalance - p0.algoBalance));

  // allocate to proposers in greedy approach
  let remaining = BigInt(amount);
  for (let i = 0; i < allocation.length && i < MAX_APPL_CALLS; i++) {
    const { algoBalance: proposerAlgoBalance, index: proposerIndex } = indexed[i];

    // under-approximate capacity to leave wiggle room
    const algoCapacity = maximum(proposerAlgoBalance - minProposerBalance - FIXED_CAPACITY_BUFFER, BigInt(0));
    const xAlgoCapacity = convertAlgoToXAlgoWhenDelay(algoCapacity, consensusState);
    const allocate = minimum(remaining, xAlgoCapacity);
    allocation[proposerIndex] = allocate;

    // exit if fully allocated
    remaining -= allocate;
    if (remaining <= 0) break;
  }

  // handle case where still remaining
  if (remaining > 0) throw Error("Insufficient capacity to unstake - override with your own allocation");

  return allocation;
};

export { greedyStakeAllocationStrategy, greedyUnstakeAllocationStrategy };
