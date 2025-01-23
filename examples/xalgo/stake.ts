import { assignGroupID } from "algosdk";

import {
  getConsensusState,
  prefixWithOpUp,
  prepareImmediateStakeTransactions,
  TestnetConsensusConfig,
  TestnetOpUp,
} from "../../src";
import { algodClient, sender } from "../config";

async function main() {
  const opup = TestnetOpUp;
  const consensusConfig = TestnetConsensusConfig;

  // retrieve params and consensus state
  const params = await algodClient.getTransactionParams().do();
  const consensusState = await getConsensusState(algodClient, consensusConfig);

  // stake 1 ALGO
  const stakeAmount = 1e6;
  const minReceivedAmount = 0;
  let stakeTransactions = prepareImmediateStakeTransactions(
    consensusConfig,
    consensusState,
    sender.addr,
    sender.addr,
    stakeAmount,
    minReceivedAmount,
    params,
  );

  // add additional opcode budget (if needed)
  stakeTransactions = prefixWithOpUp(opup, sender.addr, stakeTransactions, 0, params);

  // group, sign and submit
  assignGroupID(stakeTransactions);
  const signedTxns = stakeTransactions.map((txn) => txn.signTxn(sender.sk));
  await algodClient.sendRawTransaction(signedTxns).do();
}

main().catch(console.error);
