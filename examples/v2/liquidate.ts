import { assignGroupID, waitForConfirmation } from "algosdk";
import {
  getOraclePrices,
  LPToken,
  LPTokenPool,
  Pool,
  prefixWithOpUp,
  prepareLiquidateLoan,
  retrieveLiquidatableLoans,
  retrieveLoanInfo,
  retrievePoolManagerInfo,
  TestnetLoans,
  TestnetOpUp,
  TestnetOracle,
  TestnetPoolManagerAppId,
  TestnetPools,
  TestnetReserveAddress,
  UserLoanInfo,
} from "../../src";
import { algodClient, indexerClient, sender } from "../config";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const isLPTokenPool = (pool: Pool): pool is LPTokenPool => {
  return "lpToken" in pool;
};

const getAssetFromAppId = (pools: Record<string, Pool>, appId: number): LPToken | number => {
  const [, pool] = Object.entries(pools).find(([_, pool]) => pool.appId === appId)!;
  return isLPTokenPool(pool) ? (pool as LPTokenPool).lpToken : pool.assetId;
};

export const getUserLoanAssets = (pools: Record<string, Pool>, userLoan: UserLoanInfo) => {
  const lpAssets: LPToken[] = [];
  const baseAssetIds: number[] = [];
  const loanPoolAppIds = new Set<number>(); // use set to remove duplicates (assets which are both collateral and borrow)

  userLoan.collaterals.forEach(({ poolAppId }) => loanPoolAppIds.add(poolAppId));
  userLoan.borrows.forEach(({ poolAppId }) => loanPoolAppIds.add(poolAppId));

  // add to lp assets and base assets
  loanPoolAppIds.forEach((poolAppId) => {
    const asset = getAssetFromAppId(pools, poolAppId);
    if (Number.isNaN(asset)) {
      lpAssets.push(asset as LPToken);
    } else {
      baseAssetIds.push(asset as number);
    }
  });

  return { lpAssets, baseAssetIds };
};

async function main() {
  const poolManagerAppId = TestnetPoolManagerAppId;
  const loanAppId = TestnetLoans.GENERAL!;
  const oracle = TestnetOracle;
  const pools = TestnetPools;
  const reserveAddress = TestnetReserveAddress;
  const opup = TestnetOpUp;

  // get pool manager info, loan info and oracle prices
  const poolManagerInfo = await retrievePoolManagerInfo(indexerClient, poolManagerAppId);
  const loanInfo = await retrieveLoanInfo(indexerClient, loanAppId);
  const oraclePrices = await getOraclePrices(indexerClient, oracle);

  // retrieve params
  const params = await algodClient.getTransactionParams().do();

  // loop through loans and liquidate them if possible
  let nextToken = undefined;
  do {
    // sleep for 0.1 seconds to prevent hitting request limit
    await sleep(100);

    // find liquidatable loans
    const liquidatableLoans: { loans: UserLoanInfo[], nextToken?: string } = await retrieveLiquidatableLoans(
      indexerClient,
      loanAppId,
      poolManagerInfo,
      loanInfo,
      oraclePrices,
      nextToken,
    );
    nextToken = liquidatableLoans.nextToken;

    // liquidate
    for (const loan of liquidatableLoans.loans) {
      // decide on which collateral to seize
      const [, collateralPool] = Object.entries(pools).find(([_, pool]) => pool.appId === loan.collaterals[0].poolAppId)!;

      // decide on which borrow to repay
      const [, borrowPool] = Object.entries(pools).find(([_, pool]) => pool.appId === loan.borrows[0].poolAppId)!;

      // decide on how much to repay
      const repayAmount = loan.borrows[0].borrowBalance / BigInt(2);

      // decide on minimum collateral willing to accept
      // TODO: MUST SET IF RUNNING ACTUAL LIQUIDATOR
      const minCollateral = 0;

      // get assets in user loan
      const { lpAssets, baseAssetIds } = getUserLoanAssets(pools, loan);

      // transaction
      let liquidateTxns = prepareLiquidateLoan(
        loanAppId,
        poolManagerAppId,
        sender.addr,
        loan.escrowAddress,
        reserveAddress,
        collateralPool,
        borrowPool,
        oracle,
        lpAssets,
        baseAssetIds,
        repayAmount,
        minCollateral,
        loan.borrows[0].isStable,
        params,
      );

      // add opup transactions to increase opcode budget TODO better estimate
      const budget = Math.ceil(10 + lpAssets.length + 0.5 * baseAssetIds.length);
      liquidateTxns = prefixWithOpUp(opup, sender.addr, liquidateTxns, budget, params);

      // group, sign and submit
      assignGroupID(liquidateTxns);
      const signedTxns = liquidateTxns.map(txn => txn.signTxn(sender.sk));
      try {
        const { txId } = await algodClient.sendRawTransaction(signedTxns).do();
        await waitForConfirmation(algodClient, txId, 1000);
        console.log("Successfully liquidated: " + loan.escrowAddress);
      } catch (e) {
        console.error(e);
        console.log("Failed to liquidate: " + loan.escrowAddress);
      }
    }
  } while (nextToken !== undefined);

}

main().catch(console.error);
