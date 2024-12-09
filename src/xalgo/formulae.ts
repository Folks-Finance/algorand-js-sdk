import { mulScale, ONE_16_DP } from "../math-lib";
import type { ConsensusState } from "./types";

function convertAlgoToXAlgoWhenImmediate(algoAmount: bigint, consensusState: ConsensusState): bigint {
  const { algoBalance, xAlgoCirculatingSupply, premium } = consensusState;
  return mulScale(mulScale(algoAmount, xAlgoCirculatingSupply, algoBalance), ONE_16_DP - premium, ONE_16_DP);
}

function convertAlgoToXAlgoWhenDelay(algoAmount: bigint, consensusState: ConsensusState): bigint {
  const { algoBalance, xAlgoCirculatingSupply } = consensusState;
  return mulScale(algoAmount, xAlgoCirculatingSupply, algoBalance);
}

function convertXAlgoToAlgo(xAlgoAmount: bigint, consensusState: ConsensusState): bigint {
  const { algoBalance, xAlgoCirculatingSupply } = consensusState;
  return mulScale(xAlgoAmount, algoBalance, xAlgoCirculatingSupply);
}

export { convertAlgoToXAlgoWhenImmediate, convertAlgoToXAlgoWhenDelay, convertXAlgoToAlgo };
