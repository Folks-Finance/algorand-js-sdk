import { waitForConfirmation } from "algosdk";
import { prepareDepositTransactions, prepareWithdrawTransactions, TestnetPools } from "../../src/lend/v1";
import { algodClient, sender } from "../config";

async function main() {
  let txns, signedTxns, txId;

  const pool = TestnetPools["USDC"];

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // deposit
  const depositAmount = 1e6;
  txns = prepareDepositTransactions(pool, sender.addr, depositAmount, params);
  signedTxns = txns.map((txn) => txn.signTxn(sender.sk));
  txId = (await algodClient.sendRawTransaction(signedTxns).do()).txId;
  await waitForConfirmation(algodClient, txId, 1000);

  // withdraw
  const withdrawAmount = 1e6;
  txns = prepareWithdrawTransactions(pool, sender.addr, withdrawAmount, params);
  signedTxns = txns.map((txn) => txn.signTxn(sender.sk));
  txId = (await algodClient.sendRawTransaction(signedTxns).do()).txId;
  await waitForConfirmation(algodClient, txId, 1000);
}

main().catch(console.error);
