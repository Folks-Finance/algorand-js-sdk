import type {
  Account,
  Indexer,
  SuggestedParams,
  Transaction} from "algosdk";
import {
  assignGroupID,
  encodeAddress,
  encodeUint64,
  generateAccount,
  getApplicationAddress,
  makeApplicationNoOpTxn,
  makeApplicationOptInTxn
} from "algosdk";
import { enc, fromIntToBytes8Hex, getParsedValueFromState, parseUint64s, transferAlgoOrAsset } from "../../utils";
import type { AssetRewardsInfo, RewardsAggregator, RewardsAggregatorInfo, StakedRewardsInfo } from "./types";

/**
 *
 * Returns information regarding the given rewards aggregator application.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param appId - rewards aggregator app id
 * @returns RewardsAggregatorInfo rewards aggregator info
 */
async function getRewardsAggregatorInfo(indexerClient: Indexer, appId: number): Promise<RewardsAggregatorInfo> {
  const res = await indexerClient.lookupApplications(appId).do();
  const state = res["application"]["params"]["global-state"];

  const vestingPeriodLengths = parseUint64s(String(getParsedValueFromState(state, "periods")));
  const assetIds = parseUint64s(String(getParsedValueFromState(state, "assets")));

  const assetsRewards: AssetRewardsInfo[] = assetIds.map((assetId) => {
    const asset = parseUint64s(String(getParsedValueFromState(state, fromIntToBytes8Hex(assetId), "hex")));
    const periodRewards = [];
    for (let i = 0; i < asset.length; i += 3) {
      periodRewards.push({
        limit: asset[i],
        claimed: asset[i + 1],
        conversionRate: asset[i + 2],
      });
    }
    return { assetId: Number(assetId), periodRewards };
  });

  return {
    currentRound: res["current-round"],
    vestingPeriodLengths,
    assetsRewards,
  };
}

/**
 *
 * Returns a group transaction to immediately exchange frAsset for rewards.
 *
 * @param rewardsAggregator - rewards aggregator to exchange rewards using
 * @param senderAddr - account address for the sender
 * @param rewardAssetIds - asset ids for the rewards given to the user
 * @param frAssetAmount - amount of frAsset to send
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] exchange group transaction
 */
function prepareRewardImmediateExchangeTransactions(
  rewardsAggregator: RewardsAggregator,
  senderAddr: string,
  rewardAssetIds: number[],
  frAssetAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, pool } = rewardsAggregator;

  const fee = 2000 + rewardAssetIds.length * 1000;

  const appCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee, flatFee: true },
    appId,
    [enc.encode("ie"), encodeUint64(0)],
    undefined,
    undefined,
    rewardAssetIds,
  );
  const assetTransfer = transferAlgoOrAsset(
    pool.frAssetId,
    senderAddr,
    getApplicationAddress(pool.appId),
    frAssetAmount,
    { ...params, fee: 0, flatFee: true },
  );
  return assignGroupID([appCall, assetTransfer]);
}

/**
 *
 * Returns a group transaction to exchange frAsset for rewards staked.
 *
 * @param rewardsAggregator - rewards aggregator to exchange rewards using
 * @param senderAddr - account address for the sender
 * @param period - number from 1-4 indicate staking period
 * @param frAssetAmount - amount of frAsset to send
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and escrow account
 */
function prepareRewardStakedExchangeTransactions(
  rewardsAggregator: RewardsAggregator,
  senderAddr: string,
  period: number,
  frAssetAmount: number | bigint,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const { appId, pool } = rewardsAggregator;

  if (period < 1 || 4 < period) throw new Error("Invalid period specified.");

  const escrow = generateAccount();

  const algoTransfer = transferAlgoOrAsset(0, senderAddr, escrow.addr, 0.5e6, { ...params, fee: 0, flatFee: true });
  const optInCall = makeApplicationOptInTxn(
    escrow.addr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("e"), encodeUint64(period)],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    getApplicationAddress(appId),
  );
  const appCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("e")],
    [escrow.addr],
  );
  const assetTransfer = transferAlgoOrAsset(
    pool.frAssetId,
    senderAddr,
    getApplicationAddress(pool.appId),
    frAssetAmount,
    { ...params, fee: 4000, flatFee: true },
  );
  return {
    txns: assignGroupID([algoTransfer, optInCall, appCall, assetTransfer]),
    escrow,
  };
}

/**
 *
 * Returns information regarding the staked rewards.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param rewardsAggregator - rewards aggregator
 * @param escrowAddr - escrow address to query about
 * @param round - results for specified round
 * @returns Promise<StakedRewardsInfo> staked rewards info
 */
async function getStakedRewardsInfo(
  indexerClient: Indexer,
  rewardsAggregator: RewardsAggregator,
  escrowAddr: string,
  round?: number,
): Promise<StakedRewardsInfo> {
  const { appId } = rewardsAggregator;

  // get escrow account
  const req = indexerClient.lookupAccountByID(escrowAddr);
  if (round) req.round(round);
  const res = await req.do();

  // escrow local state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = res["account"]["apps-local-state"]?.find((app: any) => app.id === appId)?.["key-value"];
  if (state === undefined)
    throw new Error("Unable to find escrow: " + escrowAddr + " for rewards aggregator " + appId + ".");
  const ua = String(getParsedValueFromState(state, "user_address"));

  const times = parseUint64s(String(getParsedValueFromState(state, "time")));

  const assetIds = parseUint64s(String(getParsedValueFromState(state, "reward_assets")));
  const rewards = assetIds.map((assetId) => {
    const asset = parseUint64s(String(getParsedValueFromState(state, fromIntToBytes8Hex(assetId), "hex")));
    return {
      assetId: Number(assetId),
      claimed: asset[0],
      total: asset[1],
    };
  });

  return {
    currentRound: res["current-round"],
    escrowAddress: escrowAddr,
    userAddress: encodeAddress(Buffer.from(ua, "base64")),
    start: times[0],
    latest: times[1],
    end: times[2],
    rewards,
  };
}

/**
 *
 * Returns a transaction to claim staked rewards.
 *
 * @param rewardsAggregator - rewards aggregator to exchange rewards using
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that holds the staked rewards parameters
 * @param rewardAssetIds - asset ids for the rewards given to the user
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction claim stake rewards transaction
 */
function prepareClaimRewardsTransaction(
  rewardsAggregator: RewardsAggregator,
  senderAddr: string,
  escrowAddr: string,
  rewardAssetIds: number[],
  params: SuggestedParams,
): Transaction {
  const { appId } = rewardsAggregator;

  const fee = 1000 + rewardAssetIds.length * 1000;

  return makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee, flatFee: true },
    appId,
    [enc.encode("c")],
    [escrowAddr],
    undefined,
    rewardAssetIds,
  );
}

export {
  getRewardsAggregatorInfo,
  prepareRewardImmediateExchangeTransactions,
  prepareRewardStakedExchangeTransactions,
  getStakedRewardsInfo,
  prepareClaimRewardsTransaction,
};
