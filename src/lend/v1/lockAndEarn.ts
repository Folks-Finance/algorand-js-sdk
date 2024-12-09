import { enc, getParsedValueFromState, transferAlgoOrAsset } from "../../utils";
import { LockAndEarn, LockAndEarnInfo, LockedDepositInfo, Pool } from "./types";
import {
  Account,
  assignGroupID,
  encodeAddress,
  generateAccount,
  getApplicationAddress,
  Indexer,
  makeApplicationNoOpTxn,
  makeApplicationOptInTxn,
  SuggestedParams,
  Transaction,
} from "algosdk";

/**
 *
 * Returns array of lock and earns.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param pool - pool to query about
 * @returns LockAndEarn[] lock and earns
 */
async function getLockAndEarns(indexerClient: Indexer, pool: Pool): Promise<LockAndEarn[]> {
  const { appId } = pool;
  const res = await indexerClient.searchAccounts().applicationID(pool.appId).do();

  // build array of lock and earns
  const lockAndEarns: LockAndEarn[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res["accounts"].forEach((account: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = account["apps-local-state"]?.find((app: any) => app.id === appId)?.["key-value"];
    const liquidityAppId = getParsedValueFromState(state, "liquidity_app_id");
    if (liquidityAppId !== undefined)
      lockAndEarns.push({
        appId: Number(liquidityAppId),
        pool,
        linkAddr: account["address"],
      });
  });
  return lockAndEarns;
}

/**
 *
 * Returns information regarding the given lock and earn application.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param appId - lock and earn app id
 * @returns LockAndEarnInfo[] lock and earn info
 */
async function getLockAndEarnInfo(indexerClient: Indexer, appId: number): Promise<LockAndEarnInfo> {
  const res = await indexerClient.lookupApplications(appId).do();
  const state = res["application"]["params"]["global-state"];

  const rewardsRatio = BigInt(getParsedValueFromState(state, "rewards_ratio") || 0);
  const timeLocked = BigInt(getParsedValueFromState(state, "time_locked") || 0);
  const deposits = BigInt(getParsedValueFromState(state, "deposits") || 0);
  const limit = BigInt(getParsedValueFromState(state, "limit") || 0);

  return {
    currentRound: res["current-round"],
    rewardsRatio,
    timeLocked,
    deposits,
    limit,
  };
}

/**
 *
 * Returns a group transaction to provide liquidity in lock and earn.
 *
 * @param lockAndEarn - lock and earn
 * @param senderAddr - account address for the sender
 * @param depositAmount - amount to deposit (will be locked)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and escrow account
 */
function prepareProvideLiquidityTransactions(
  lockAndEarn: LockAndEarn,
  senderAddr: string,
  depositAmount: number | bigint,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const { linkAddr, pool } = lockAndEarn;
  const { assetId, fAssetId, frAssetId } = pool;

  const escrow = generateAccount();

  const fundEscrow = transferAlgoOrAsset(0, senderAddr, escrow.addr, 0.407e6, { ...params, flatFee: true, fee: 8000 });
  const optInCall = makeApplicationOptInTxn(
    escrow.addr,
    { ...params, flatFee: true, fee: 0 },
    lockAndEarn.appId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    getApplicationAddress(lockAndEarn.appId),
  );
  const liquidityCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, flatFee: true, fee: 0 },
    lockAndEarn.appId,
    [enc.encode("pl")],
    [escrow.addr],
    undefined,
    [fAssetId],
  );
  const dispenserCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, flatFee: true, fee: 0 },
    pool.appId,
    [enc.encode("pl")],
    [linkAddr, escrow.addr],
    [lockAndEarn.appId],
    [fAssetId, frAssetId],
  );
  const depositTx = transferAlgoOrAsset(assetId, senderAddr, getApplicationAddress(pool.appId), depositAmount, {
    ...params,
    fee: 0,
    flatFee: true,
  });

  return {
    txns: assignGroupID([fundEscrow, optInCall, liquidityCall, dispenserCall, depositTx]),
    escrow,
  };
}

/**
 *
 * Returns information regarding the locked deposit.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param lockAndEarn - lock and earn of the deposit
 * @param escrowAddr - escrow address to query about
 * @param round - results for specified round
 * @returns Promise<LoanInfo> loan info
 */
async function getLockedDepositInfo(
  indexerClient: Indexer,
  lockAndEarn: LockAndEarn,
  escrowAddr: string,
  round?: number,
): Promise<LockedDepositInfo> {
  const { appId, pool } = lockAndEarn;

  // get escrow account
  const req = indexerClient.lookupAccountByID(escrowAddr);
  if (round) req.round(round);
  const res = await req.do();
  const account = res["account"];

  // escrow balance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockedBalance = account["assets"]?.find((asset: any) => asset["asset-id"] === pool.fAssetId)?.["amount"];
  if (lockedBalance === undefined) throw new Error("Unable to get escrow: " + escrowAddr + " locked balance.");

  // escrow local state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = account["apps-local-state"]?.find((app: any) => app.id === appId)?.["key-value"];
  if (state === undefined)
    throw new Error("Unable to find escrow: " + escrowAddr + " for lock and earn " + appId + ".");
  const ua = String(getParsedValueFromState(state, "user_address"));
  const release = BigInt(getParsedValueFromState(state, "release") || 0);

  return {
    currentRound: res["current-round"],
    escrowAddress: escrowAddr,
    userAddress: encodeAddress(Buffer.from(ua, "base64")),
    lockedBalance: BigInt(lockedBalance),
    release,
  };
}

/**
 *
 * Returns a transaction to claim locked deposit.
 *
 * @param lockAndEarn - lock and earn
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that will hold the collateral
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction claim locked deposit transaction
 */
function prepareClaimLockedDepositTransactions(
  lockAndEarn: LockAndEarn,
  senderAddr: string,
  escrowAddr: string,
  params: SuggestedParams,
) {
  const { appId, pool } = lockAndEarn;
  return makeApplicationNoOpTxn(
    senderAddr,
    { ...params, flatFee: true, fee: 2000 },
    appId,
    [enc.encode("c")],
    [escrowAddr],
    undefined,
    [pool.fAssetId],
  );
}

export {
  getLockAndEarns,
  getLockAndEarnInfo,
  prepareProvideLiquidityTransactions,
  getLockedDepositInfo,
  prepareClaimLockedDepositTransactions,
};
