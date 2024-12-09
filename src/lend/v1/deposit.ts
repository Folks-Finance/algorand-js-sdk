import type {
  Indexer,
  SuggestedParams,
  Transaction} from "algosdk";
import {
  assignGroupID,
  getApplicationAddress,
  makeApplicationNoOpTxn
} from "algosdk";
import { enc, getParsedValueFromState, transferAlgoOrAsset } from "../../utils";
import { calcInterestIndex, calcUtilizationRatio } from "./math";
import type { Pool, PoolInfo } from "./types";

/**
 *
 * Returns information regarding the given pool.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param pool - pool to query about
 * @returns PoolInfo[] pool info
 */
async function getPoolInfo(indexerClient: Indexer, pool: Pool): Promise<PoolInfo> {
  const { appId } = pool;
  const res = await indexerClient.lookupApplications(appId).do();
  const state = res["application"]["params"]["global-state"];

  const dir = BigInt(getParsedValueFromState(state, "deposit_interest_rate") || 0);
  const dii = BigInt(getParsedValueFromState(state, "deposit_interest_index") || 0);
  const bir = BigInt(getParsedValueFromState(state, "borrow_interest_rate") || 0);
  const bii = BigInt(getParsedValueFromState(state, "borrow_interest_index") || 0);
  const lu = BigInt(getParsedValueFromState(state, "latest_update") || 0);
  const r0 = BigInt(getParsedValueFromState(state, "R0") || 0);
  const r1 = BigInt(getParsedValueFromState(state, "R1") || 0);
  const r2 = BigInt(getParsedValueFromState(state, "R2") || 0);
  const eps = BigInt(getParsedValueFromState(state, "EPS") || 0);
  const rf = BigInt(getParsedValueFromState(state, "RF") || 0);
  const srr = BigInt(getParsedValueFromState(state, "SRR") || 0);
  const td = BigInt(getParsedValueFromState(state, "total_deposits") || 0);
  const tb = BigInt(getParsedValueFromState(state, "total_borrows") || 0);
  const uopt = BigInt(getParsedValueFromState(state, "U_OPT") || 0);
  const isPaused = Boolean(getParsedValueFromState(state, "is_paused") || 0);
  const isRewardsPaused = Boolean(getParsedValueFromState(state, "is_rewards_paused") || 0);

  return {
    currentRound: res["current-round"],
    depositInterestRate: dir,
    depositInterestIndex: calcInterestIndex(dii, dir, lu),
    borrowInterestRate: bir,
    borrowInterestIndex: calcInterestIndex(bii, bir, lu, eps),
    baseRate: r0,
    slope1Rate: r1,
    slope2Rate: r2,
    retentionRate: rf + srr,
    totalDeposits: td,
    totalBorrows: tb,
    utilizationRatio: calcUtilizationRatio(tb, td),
    optimalUtilizationRatio: uopt,
    epsilon: eps,
    latestUpdate: lu,
    isPaused,
    isRewardsPaused,
  };
}

/**
 *
 * Returns a group transaction to deposit into the specified pool.
 *
 * @param pool - pool to deposit into
 * @param senderAddr - account address for the sender
 * @param depositAmount - integer amount of algo / asset to deposit
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] deposit group transaction
 */
function prepareDepositTransactions(
  pool: Pool,
  senderAddr: string,
  depositAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, assetId, fAssetId } = pool;
  const appCallTx = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 3000, flatFee: true },
    appId,
    [enc.encode("d")],
    undefined,
    undefined,
    [fAssetId],
  );
  const depositTx = transferAlgoOrAsset(assetId, senderAddr, getApplicationAddress(appId), depositAmount, {
    ...params,
    fee: 0,
    flatFee: true,
  });
  return assignGroupID([appCallTx, depositTx]);
}

/**
 *
 * Returns a group transaction to withdraw from the specified pool.
 *
 * @param pool - pool to deposit into
 * @param senderAddr - account address for the sender
 * @param withdrawAmount - integer amount of the fAsset to withdraw
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] deposit group transaction
 */
function prepareWithdrawTransactions(
  pool: Pool,
  senderAddr: string,
  withdrawAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, assetId, fAssetId } = pool;
  const appCallTx = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 3000, flatFee: true },
    appId,
    [enc.encode("r")],
    undefined,
    undefined,
    assetId ? [assetId] : undefined,
  );
  const redeemTx = transferAlgoOrAsset(fAssetId, senderAddr, getApplicationAddress(appId), withdrawAmount, {
    ...params,
    fee: 0,
    flatFee: true,
  });
  return assignGroupID([appCallTx, redeemTx]);
}

export { getPoolInfo, prepareDepositTransactions, prepareWithdrawTransactions };
