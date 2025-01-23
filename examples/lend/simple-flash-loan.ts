import { assignGroupID } from "algosdk";

import { TestnetPools, TestnetReserveAddress, wrapWithFlashLoan } from "../../src";
import { algodClient, sender } from "../config";

import type { Transaction } from "algosdk";

async function main() {
  const reserveAddress = TestnetReserveAddress;
  const pools = TestnetPools;

  // can put arbitrary txns inside flash loan
  const insideTxns: Transaction[] = [];

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // there are two ways you can use flash loans
  // will show here the simple version where just wrapping inside txns with flash loan

  // final result will be:
  //  - flash loan borrow of 1 ALGO
  //  - <ARBITRARY_TXNS>
  //  - flash loan repay of 1.001001 ALGO (0.1% fee + 0.000001)

  // flash loan of 1 ALGO, repayment will be 1.001001 ALGO (0.1% + 0.000001)
  const algoBorrowAmount = 1e6;
  const flashLoanTxns = wrapWithFlashLoan(
    insideTxns,
    pools.ALGO,
    sender.addr,
    sender.addr,
    reserveAddress,
    algoBorrowAmount,
    params,
  );

  // group, sign and submit
  assignGroupID(flashLoanTxns);
  const signedTxns = flashLoanTxns.map((txn) => txn.signTxn(sender.sk));
  await algodClient.sendRawTransaction(signedTxns).do();
}

main().catch(console.error);
