import { waitForConfirmation } from "algosdk";
import {
  prepareAddEscrowTransactions,
  prepareBorrowTransactions,
  prepareRepayTransactions,
  TestnetOracle,
  TestnetReserveAddress,
  TestnetTokenPairs,
} from "../../src/lend/v1";
import { algodClient, sender } from "../config";

async function main() {
  let txns, signedTxns, txId;

  const oracle = TestnetOracle;
  const tokenPair = TestnetTokenPairs["USDC-USDt"];
  const reserveAddress = TestnetReserveAddress;

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // add escrow
  const addEscrowTxns = prepareAddEscrowTransactions(tokenPair, sender.addr, params);
  const escrow = addEscrowTxns.escrow;
  txns = addEscrowTxns.txns;
  signedTxns = [txns[0].signTxn(sender.sk), txns[1].signTxn(escrow.sk), txns[2].signTxn(sender.sk)];
  txId = (await algodClient.sendRawTransaction(signedTxns).do()).txId;
  await waitForConfirmation(algodClient, txId, 1000);

  // borrow
  const collateralAmount = 2e6;
  const borrowAmount = 1e6;
  txns = prepareBorrowTransactions(tokenPair, oracle, sender.addr, escrow.addr, collateralAmount, borrowAmount, params);
  signedTxns = txns.map((txn) => txn.signTxn(sender.sk));
  txId = (await algodClient.sendRawTransaction(signedTxns).do()).txId;
  await waitForConfirmation(algodClient, txId, 1000);

  // repay
  const repayAmount = 1.1e6;
  txns = prepareRepayTransactions(tokenPair, sender.addr, escrow.addr, reserveAddress, repayAmount, params);
  signedTxns = txns.map((txn) => txn.signTxn(sender.sk));
  txId = (await algodClient.sendRawTransaction(signedTxns).do()).txId;
  await waitForConfirmation(algodClient, txId, 1000);
}

main().catch(console.error);
