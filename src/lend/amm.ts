import { compoundEveryHour, ONE_12_DP, ONE_16_DP } from "../math-lib";
import {
  getAccountApplicationLocalState,
  getApplicationGlobalState,
  getParsedValueFromState,
  parseUint64s,
} from "../utils";

import type {
  AssetsAdditionalInterest,
  LendingPool,
  PactLendingPool,
  PactLendingPoolInfo,
  PoolManagerInfo,
  TinymanLendingPool,
  TinymanLendingPoolInfo,
} from "./types";
import type { Algodv2, Indexer } from "algosdk";

/**
 *
 * Returns information regarding the given Pact lending pool.
 *
 * @param client - Algorand client to query
 * @param lendingPool - Pact lending pool to query about
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param additionalInterests - optional additional interest to consider
 * @returns Promise<LendingPoolInfo> lending pool info
 */
async function retrievePactLendingPoolInfo(
  client: Algodv2 | Indexer,
  lendingPool: PactLendingPool,
  poolManagerInfo: PoolManagerInfo,
  additionalInterests?: AssetsAdditionalInterest,
): Promise<PactLendingPoolInfo> {
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, lendingPool.lpPoolAppId);
  if (state === undefined) throw Error("Could not find lending pool");
  const config = parseUint64s(String(getParsedValueFromState(state, "CONFIG")));
  const fa0s = BigInt(getParsedValueFromState(state, "A") || 0);
  const fa1s = BigInt(getParsedValueFromState(state, "B") || 0);
  const ltcs = BigInt(getParsedValueFromState(state, "L") || 0);

  // pact pool swap fee interest
  const lpInfoRes = await fetch(`https://api.pact.fi/api/pools/${lendingPool.lpPoolAppId}`);
  if (!lpInfoRes.ok || lpInfoRes.status !== 200) throw Error("Failed to fetch pact swap fee from api");
  const pactPoolData = await lpInfoRes.json();
  const swapFeeInterestRate = BigInt(Math.round(Number(pactPoolData?.["apr_7d"] || 0) * 1e16));
  const tvlUsd = Number(pactPoolData?.["tvl_usd"] || 0);

  // lending pool deposit interest and additional interest
  const commonLendingPoolInterest = getCommonLendingPoolInterest(lendingPool, poolManagerInfo, additionalInterests);

  return {
    ...commonLendingPoolInterest,
    currentRound,
    fAsset0Supply: fa0s,
    fAsset1Supply: fa1s,
    liquidityTokenCirculatingSupply: ltcs,
    fee: config[2],
    swapFeeInterestRate,
    swapFeeInterestYield: compoundEveryHour(swapFeeInterestRate, ONE_16_DP),
    tvlUsd,
  };
}

/**
 *
 * Returns information regarding the given Tinyman lending pool.
 *
 * @param client - Algorand client to query
 * @param tinymanAppId - Tinyman application id where lending pool belongs to
 * @param lendingPool - Pact lending pool to query about
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param additionalInterests - optional additional interest to consider
 * @returns Promise<LendingPoolInfo> lending pool info
 */
async function retrieveTinymanLendingPoolInfo(
  client: Algodv2 | Indexer,
  tinymanAppId: number,
  lendingPool: TinymanLendingPool,
  poolManagerInfo: PoolManagerInfo,
  additionalInterests?: AssetsAdditionalInterest,
): Promise<TinymanLendingPoolInfo> {
  const { currentRound, localState: state } = await getAccountApplicationLocalState(
    client,
    tinymanAppId,
    lendingPool.lpPoolAppAddress,
  );
  if (state === undefined) throw Error("Could not find lending pool");
  const fee = BigInt(getParsedValueFromState(state, "total_fee_share") || 0);
  const fa0s = BigInt(getParsedValueFromState(state, "asset_2_reserves") || 0);
  const fa1s = BigInt(getParsedValueFromState(state, "asset_1_reserves") || 0);
  const ltcs = BigInt(getParsedValueFromState(state, "issued_pool_tokens") || 0);

  // pact pool swap fee interest
  const res = await fetch(`https://mainnet.analytics.tinyman.org/api/v1/pools/${lendingPool.lpPoolAppAddress}`);
  if (!res.ok || res.status !== 200) throw Error("Failed to fetch tinyman swap fee from api");
  const tmPoolData = await res.json();

  const swapFeeInterestRate = BigInt(Math.round(Number(tmPoolData?.["annual_percentage_rate"] || 0) * 1e16));
  const swapFeeInterestYield = BigInt(Math.round(Number(tmPoolData?.["annual_percentage_yield"] || 0) * 1e16));
  const farmInterestYield = BigInt(
    Math.round(Number(tmPoolData?.["staking_total_annual_percentage_yield"] || 0) * 1e16),
  );
  const tvlUsd = Number(tmPoolData?.["liquidity_in_usd"] || 0);

  // lending pool deposit interest and additional interest
  const commonLendingPoolInterest = getCommonLendingPoolInterest(lendingPool, poolManagerInfo, additionalInterests);

  return {
    ...commonLendingPoolInterest,
    currentRound,
    fAsset0Supply: fa0s,
    fAsset1Supply: fa1s,
    liquidityTokenCirculatingSupply: ltcs,
    fee,
    swapFeeInterestRate,
    swapFeeInterestYield,
    farmInterestYield,
    tvlUsd,
  };
}

function getCommonLendingPoolInterest(
  lendingPool: LendingPool,
  poolManagerInfo: PoolManagerInfo,
  additionalInterests?: AssetsAdditionalInterest,
) {
  const { asset0Id, asset1Id, pool0AppId, pool1AppId } = lendingPool;

  // lending pool deposit interest
  const pool0 = poolManagerInfo.pools[pool0AppId];
  const pool1 = poolManagerInfo.pools[pool1AppId];
  if (pool0 === undefined || pool1 === undefined) throw Error("Could not find deposit pool");
  const asset0DepositInterestRate = pool0.depositInterestRate / BigInt(2);
  const asset0DepositInterestYield = pool0.depositInterestYield / BigInt(2);
  const asset1DepositInterestRate = pool1.depositInterestRate / BigInt(2);
  const asset1DepositInterestYield = pool1.depositInterestYield / BigInt(2);

  // add additional interests if specified
  let additionalInterestRate;
  let additionalInterestYield;
  if (additionalInterests) {
    for (const assetId of [asset0Id, asset1Id]) {
      if (additionalInterests[assetId]) {
        const { rateBps, yieldBps } = additionalInterests[assetId];
        // multiply by 1e12 to standardise at 16 d.p.
        additionalInterestRate = (additionalInterestRate || BigInt(0)) + (rateBps * ONE_12_DP) / BigInt(2);
        additionalInterestYield = (additionalInterestYield || BigInt(0)) + (yieldBps * ONE_12_DP) / BigInt(2);
      }
    }
  }

  return {
    asset0DepositInterestRate,
    asset0DepositInterestYield,
    asset1DepositInterestRate,
    asset1DepositInterestYield,
    additionalInterestRate,
    additionalInterestYield,
  };
}

export { retrievePactLendingPoolInfo, retrieveTinymanLendingPoolInfo };
