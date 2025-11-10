import { assignGroupID } from "algosdk";

import {
  prefixWithOpUp,
  prepareDepositIntoPool,
  TestnetOpUp,
  TestnetPoolManagerAppId,
  TestnetPools,
} from "../../src";
import { algodClient, sender } from "../config";

async function main() {
  const poolManager = TestnetPoolManagerAppId;
  const pools = TestnetPools;
  const opup = TestnetOpUp;

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // deposit 1 ALGO
  const algoDepositAmount = 1e6;
  let depositTxns = prepareDepositIntoPool(
    pools.ALGO,
    poolManager,
    sender.addr.toString(),
    sender.addr.toString(), // specify here deposit escrow if you'd prefer to receive fALGO there
    algoDepositAmount,
    params,
  );

  // add additional opcode budget (if needed)
  depositTxns = prefixWithOpUp(opup, sender.addr.toString(), depositTxns, 0, params);

  // group, sign and submit
  assignGroupID(depositTxns);
  const signedTxns = depositTxns.map((txn) => txn.signTxn(sender.sk));
  await algodClient.sendRawTransaction(signedTxns).do();
}

main().catch(console.error);
