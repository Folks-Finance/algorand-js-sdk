import { assignGroupID } from "algosdk";

import {
  calcFlashLoanRepayment,
  prepareFlashLoanBegin,
  prepareFlashLoanEnd,
  TestnetPools,
  TestnetReserveAddress,
} from "../../src";
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
  // will show here the complex version where have complete flexibility and
  // can do multiple flash loans in single group transaction

  // final result will be:
  //  - flash loan borrow of 2 ALGO
  //  - flash loan borrow of 1 USDC
  //  - <ARBITRARY_TXNS>
  //  - flash loan repay of 2.002001 ALGO (0.1% fee + 0.000001)
  //  - flash loan repay of 1.002001 USDC (0.1% fee + 0.000001)

  // flash loan of 2 ALGO, repayment will be 2.002 ALGO (0.1% + 1)
  const algoBorrowAmount = 2e6;
  const algoRepaymentAmount = calcFlashLoanRepayment(BigInt(algoBorrowAmount), BigInt(0.001e16));
  const algoTxnIndexForFlashLoanEnd = insideTxns.length + 3;
  const algoFlashLoanBegin = prepareFlashLoanBegin(
    pools.ALGO,
    sender.addr,
    sender.addr,
    algoBorrowAmount,
    algoTxnIndexForFlashLoanEnd,
    params,
  );
  const algoFlashLoanEnd = prepareFlashLoanEnd(pools.ALGO, sender.addr, reserveAddress, algoRepaymentAmount, params);

  // flash loan of 1 USDC, repayment will be 1.001 USDC (0.1% + 1)
  const usdcBorrowAmount = 1e6;
  const usdcRepaymentAmount = calcFlashLoanRepayment(BigInt(usdcBorrowAmount), BigInt(0.001e16));
  const usdcTxnIndexForFlashLoanEnd = insideTxns.length + 5;
  const usdcFlashLoanBegin = prepareFlashLoanBegin(
    pools.USDC,
    sender.addr,
    sender.addr,
    usdcBorrowAmount,
    usdcTxnIndexForFlashLoanEnd,
    params,
  );
  const usdcFlashLoanEnd = prepareFlashLoanEnd(pools.USDC, sender.addr, reserveAddress, usdcRepaymentAmount, params);

  // build
  const flashLoanTxns: Transaction[] = [
    algoFlashLoanBegin,
    usdcFlashLoanBegin,
    ...insideTxns,
    ...algoFlashLoanEnd,
    ...usdcFlashLoanEnd,
  ];

  // group, sign and submit
  assignGroupID(flashLoanTxns);
  const signedTxns = flashLoanTxns.map((txn) => txn.signTxn(sender.sk));
  await algodClient.sendRawTransaction(signedTxns).do();
}

main().catch(console.error);
