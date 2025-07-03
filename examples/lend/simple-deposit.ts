import { assignGroupID } from "algosdk";

import {
  prepareDepositIntoPool,
  TestnetPoolManagerAppId,
  TestnetPools,
} from "../../src";
import { algodClient, sender } from "../config";

async function main() {
  const poolManager = TestnetPoolManagerAppId;
  const pools = TestnetPools;

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // deposit 1 ALGO
  const algoDepositAmount = 1e6;
  const depositTxns = prepareDepositIntoPool(
    pools.ALGO,
    poolManager,
    sender.addr,
    sender.addr, // specify here deposit escrow if you'd prefer to receive fALGO there
    algoDepositAmount,
    params,
  );

  // group, sign and submit
  assignGroupID(depositTxns);
  const signedTxns = depositTxns.map((txn) => txn.signTxn(sender.sk));
  await algodClient.sendRawTransaction(signedTxns).do();
}

main().catch(console.error);
