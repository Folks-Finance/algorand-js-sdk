import { AtomicTransactionComposer, decodeUint64, encodeAddress, getMethodByName } from "algosdk";

import { minimum } from "../math-lib";
import {
  fromIntToBytes8Hex,
  getAccountApplicationLocalState,
  getApplicationGlobalState,
  getParsedValueFromState,
  signer,
} from "../utils";

import { oracleAdapterABIContract } from "./abi-contracts";
import { calcLPPrice } from "./formulae";
import { LPTokenProvider } from "./types";

import type { LPToken, Oracle, OraclePrice, OraclePrices } from "./types";
import type { Algodv2, Indexer, SuggestedParams, Transaction } from "algosdk";
import type { TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";

function parseOracleValue(base64Value: string) {
  const value = Buffer.from(base64Value, "base64").toString("hex");

  // [price (uint64), latest_update (uint64), ...]
  const price = BigInt("0x" + value.slice(0, 16));
  const timestamp = BigInt("0x" + value.slice(16, 32));
  return { price, timestamp };
}

function parseLPTokenOracleValue(lpAssetId: number, base64Value: string): LPToken {
  const value = Buffer.from(base64Value, "base64").toString("hex");

  // [type (uint8), a0_id (uint64), a1_id, (uint64), _ (uint64), _ (uint64), _ (uint64), pool (address/uint64)]
  const provider = Number("0x" + value.slice(0, 2));
  const asset0Id = Number(`0x${value.slice(2, 34)}`);
  const asset1Id = Number(`0x${value.slice(34, 50)}`);

  // check if LP token is Tinyman or Pact
  if (provider == LPTokenProvider.TINYMAN) {
    const poolAddress = encodeAddress(Buffer.from(value.slice(82, 146), "hex"));
    return { provider, lpAssetId, asset0Id, asset1Id, lpPoolAddress: poolAddress };
  } else if (provider == LPTokenProvider.PACT) {
    const poolAppId = Number("0x" + value.slice(82, 98));
    return { provider, lpAssetId, asset0Id, asset1Id, lpPoolAppId: poolAppId };
  } else {
    throw Error("Unknown LP Token type");
  }
}

async function getTinymanLPPrice(
  client: Algodv2 | Indexer,
  validatorAppId: number,
  poolAddress: string,
  p0: bigint,
  p1: bigint,
): Promise<bigint> {
  const { localState: state } = await getAccountApplicationLocalState(client, validatorAppId, poolAddress);
  if (state === undefined)
    throw new Error(`Unable to find Tinyman Pool: ${poolAddress} for validator app ${validatorAppId}.`);

  const r0 = BigInt(getParsedValueFromState(state, "s1") || 0);
  const r1 = BigInt(getParsedValueFromState(state, "s2") || 0);
  const lts = BigInt(getParsedValueFromState(state, "ilt") || 0);

  return calcLPPrice(r0, r1, p0, p1, lts);
}

async function getPactLPPrice(client: Algodv2 | Indexer, poolAppId: number, p0: bigint, p1: bigint): Promise<bigint> {
  const { globalState: state } = await getApplicationGlobalState(client, poolAppId);
  if (state === undefined) throw new Error(`Unable to find Pact Pool: ${poolAppId}.`);

  const r0 = BigInt(getParsedValueFromState(state, "A") || 0);
  const r1 = BigInt(getParsedValueFromState(state, "B") || 0);
  const lts = BigInt(getParsedValueFromState(state, "L") || 0);

  return calcLPPrice(r0, r1, p0, p1, lts);
}

/**
 *
 * Returns oracle prices for given oracle and provided assets.
 *
 * @param client - Algorand client to query
 * @param oracle - oracle to query
 * @param assetIds - assets ids to get prices for, if undefined then returns all prices
 * @returns OraclePrices oracle prices
 */
async function getOraclePrices(client: Algodv2 | Indexer, oracle: Oracle, assetIds?: number[]): Promise<OraclePrices> {
  const { oracle0AppId, lpTokenOracle } = oracle;

  const lookupApps = [getApplicationGlobalState(client, oracle0AppId)];
  if (lpTokenOracle) lookupApps.push(getApplicationGlobalState(client, lpTokenOracle.appId));
  const [oracleRes, lpTokenOracleRes] = await Promise.all(lookupApps);

  const { currentRound, globalState: oracleState } = oracleRes;
  const lpTokenOracleState = lpTokenOracleRes?.globalState;

  if (oracleState === undefined) throw Error("Could not find Oracle");
  if (lpTokenOracle && lpTokenOracleState === undefined) throw Error("Could not find LP Token Oracle");

  const prices: Record<number, OraclePrice> = {};

  // get the assets for which we need to retrieve their prices
  const allAssetIds: number[] = oracleState
    .concat(lpTokenOracleState || [])
    // remove non asset ids global state
    .filter(({ key }: TealKeyValue) => {
      const keyParsed = Buffer.from(key).toString("utf8");
      return (
        keyParsed !== "updater_addr" &&
        keyParsed !== "admin" &&
        keyParsed !== "tinyman_validator_app_id" &&
        keyParsed !== "td"
      );
    })
    // convert key to asset id
    .map(({ key }: TealKeyValue) => decodeUint64(key, "safe"));
  const assets = assetIds ? assetIds : allAssetIds;

  // retrieve asset prices
  const retrievePrices = assets.map(async (assetId) => {
    let assetPrice: OraclePrice;
    const lpTokenBase64Value = lpTokenOracle
      ? getParsedValueFromState(lpTokenOracleState!, fromIntToBytes8Hex(assetId), "hex")
      : undefined;

    // lpTokenBase64Value defined iff asset is lp token in given lpTokenOracle
    if (lpTokenBase64Value !== undefined) {
      const lpTokenOracleValue = parseLPTokenOracleValue(assetId, lpTokenBase64Value as string);
      const { price: p0, timestamp: t0 } = parseOracleValue(
        String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(lpTokenOracleValue.asset0Id), "hex")),
      );
      const { price: p1, timestamp: t1 } = parseOracleValue(
        String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(lpTokenOracleValue.asset1Id), "hex")),
      );

      let price: bigint;
      switch (lpTokenOracleValue.provider) {
        case LPTokenProvider.TINYMAN:
          price = await getTinymanLPPrice(
            client,
            lpTokenOracle!.tinymanValidatorAppId,
            lpTokenOracleValue.lpPoolAddress,
            p0,
            p1,
          );
          break;
        case LPTokenProvider.PACT:
          price = await getPactLPPrice(client, lpTokenOracleValue.lpPoolAppId, p0, p1);
          break;
        default:
          throw Error("Unknown LP Token provider");
      }
      assetPrice = { price, timestamp: minimum(t0, t1) };
    } else {
      assetPrice = parseOracleValue(String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(assetId), "hex")));
    }

    prices[assetId] = assetPrice;
  });

  await Promise.all(retrievePrices);
  return { currentRound, prices };
}

/**
 *
 * Returns a group transaction to refresh the given assets.
 *
 * @param oracle - oracle applications to use
 * @param userAddr - account address for the user
 * @param lpAssets - list of lp assets
 * @param baseAssetIds - list of base asset ids (non-lp assets)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] refresh prices group transaction
 */
function prepareRefreshPricesInOracleAdapter(
  oracle: Oracle,
  userAddr: string,
  lpAssets: LPToken[],
  baseAssetIds: number[],
  params: SuggestedParams,
): Transaction[] {
  const { oracleAdapterAppId, lpTokenOracle, oracle0AppId } = oracle;

  if (lpAssets.length > 0) throw Error("Refresh LP assets unsupported");

  const atc = new AtomicTransactionComposer();

  // prepare refresh prices arguments
  const oracle1AppId = oracle.oracle1AppId || 0;
  const lpTokenOracleAppId = lpTokenOracle?.appId || 0;
  const lpAssetIds = lpAssets.map(({ lpAssetId }) => lpAssetId);

  // refresh prices
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: oracleAdapterAppId,
    method: getMethodByName(oracleAdapterABIContract.methods, "refresh_prices"),
    methodArgs: [lpAssetIds, baseAssetIds, oracle0AppId, oracle1AppId, lpTokenOracleAppId],
    suggestedParams: { ...params, flatFee: true, fee: 1000 },
  });

  // build
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

export { getOraclePrices, prepareRefreshPricesInOracleAdapter };
