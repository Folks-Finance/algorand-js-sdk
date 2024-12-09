import { SuggestedParams, waitForConfirmation } from "algosdk";
import {
  getConversionRate,
  getLoansInfo,
  getOraclePrices,
  getPoolInfo,
  getTokenPairInfo,
  LoanInfo,
  Oracle,
  prepareLiquidateTransactions,
  ReserveAddress,
  TestnetOracle,
  TestnetReserveAddress,
  TestnetTokenPairs,
  TokenPair,
} from "../../src/lend/v1";
import { algodClient, indexerClient, sender } from "../config";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function liquidateLoans(
  loans: LoanInfo[],
  tokenPair: TokenPair,
  oracle: Oracle,
  reserveAddress: ReserveAddress,
  params: SuggestedParams,
) {
  for (const loan of loans) {
    const { escrowAddress, healthFactor, borrowBalance } = loan;

    // check health factor is below 1
    if (healthFactor < 1e14) {
      // prepare liquidation transactions
      const txns = prepareLiquidateTransactions(
        tokenPair,
        oracle,
        sender.addr,
        loan.escrowAddress,
        reserveAddress,
        (borrowBalance * BigInt(110)) / BigInt(100), // over approx (will be repaid anything extra)
        params,
      );

      // sign transactions
      const signedTxns = txns.map((txn) => txn.signTxn(sender.sk));

      // submit transactions
      try {
        const { txId } = await algodClient.sendRawTransaction(signedTxns).do();
        await waitForConfirmation(algodClient, txId, 1000);
        console.log("Successfully liquidated: " + escrowAddress);
      } catch (e) {
        console.error(e);
        console.log("Failed to liquidate: " + escrowAddress);
      }
    }
  }
}

async function main() {
  const oracle = TestnetOracle;
  const tokenPair = TestnetTokenPairs["ALGO-USDC"];
  const reserveAddress = TestnetReserveAddress;
  const { collateralPool, borrowPool } = tokenPair;

  // get conversion rate
  const { prices } = await getOraclePrices(indexerClient, oracle, [collateralPool.assetId, borrowPool.assetId]);
  const conversionRate = getConversionRate(prices[collateralPool.assetId].price, prices[borrowPool.assetId].price);

  // get collateral pool and token pair info
  const collateralPoolInfo = await getPoolInfo(indexerClient, collateralPool);
  const borrowPoolInfo = await getPoolInfo(indexerClient, borrowPool);
  const tokenPairInfo = await getTokenPairInfo(indexerClient, tokenPair);

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // loop through escrows
  let loansInfo = await getLoansInfo(
    indexerClient,
    tokenPair,
    tokenPairInfo,
    collateralPoolInfo,
    borrowPoolInfo,
    conversionRate,
  );
  let loans = loansInfo.loans;
  let nextToken = loansInfo.nextToken;

  // liquidate if possible
  await liquidateLoans(loans, tokenPair, oracle, reserveAddress, params);

  while (nextToken !== undefined) {
    // sleep for 0.1 seconds to prevent hitting request limit
    await sleep(100);

    // next loop of escrows
    loansInfo = await getLoansInfo(
      indexerClient,
      tokenPair,
      tokenPairInfo,
      collateralPoolInfo,
      borrowPoolInfo,
      conversionRate,
      nextToken,
    );
    loans = loansInfo.loans;
    nextToken = loansInfo.nextToken;

    // liquidate if possible
    await liquidateLoans(loans, tokenPair, oracle, reserveAddress, params);
  }
}

main().catch(console.error);
