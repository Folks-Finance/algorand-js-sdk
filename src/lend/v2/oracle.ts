import {
  Algodv2,
  AtomicTransactionComposer,
  decodeAddress,
  decodeUint64,
  encodeAddress,
  getMethodByName,
  Indexer,
  SuggestedParams,
  Transaction,
} from "algosdk";
import {
  fromIntToBytes8Hex,
  getAccountApplicationLocalState,
  getApplicationGlobalState,
  getParsedValueFromState,
  signer,
} from "../../utils";
import { lpTokenOracleABIContract, oracleAdapterABIContract } from "./abiContracts";
import { calcLPPrice } from "./formulae";
import { minimum } from "./mathLib";
import { LPToken, LPTokenProvider, Oracle, OraclePrice, OraclePrices, PactLPToken, TinymanLPToken } from "./types";
import { TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";

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
    .filter(({ key }: TealKeyValue) => {
      // remove non asset ids global state
      key = Buffer.from(key, "base64").toString("utf8");
      return key !== "updater_addr" && key !== "admin" && key !== "tinyman_validator_app_id" && key !== "td";
    })
    .map(({ key }: TealKeyValue) => {
      // convert key to asset id
      return decodeUint64(Buffer.from(key, "base64"), "safe");
    });
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

  if (lpTokenOracle === undefined && lpAssets.length > 0)
    throw Error("Cannot refresh LP assets without LP Token Oracle");

  const atc = new AtomicTransactionComposer();

  // divide lp tokens into Tinyman and Pact
  const tinymanLPAssets: TinymanLPToken[] = lpAssets.filter(
    ({ provider }) => provider === LPTokenProvider.TINYMAN,
  ) as TinymanLPToken[];
  const pactLPAssets: PactLPToken[] = lpAssets.filter(
    ({ provider }) => provider === LPTokenProvider.PACT,
  ) as PactLPToken[];

  // update lp tokens
  const foreignAccounts: string[][] = [];
  const foreignApps: number[][] = [];

  const MAX_TINYMAN_UPDATE = 4;
  const MAX_PACT_UPDATE = 8;
  const MAX_COMBINATION_UPDATE = 7;
  let tinymanIndex = 0;
  let pactIndex = 0;

  while (tinymanIndex < tinymanLPAssets.length && pactIndex < pactLPAssets.length) {
    // retrieve which lp assets to update
    const tinymanLPUpdates = tinymanLPAssets.slice(tinymanIndex, tinymanIndex + MAX_TINYMAN_UPDATE);
    const maxPactUpdates =
      tinymanLPUpdates.length === 0 ? MAX_PACT_UPDATE : MAX_COMBINATION_UPDATE - tinymanLPUpdates.length;
    const pactLPUpdates = pactLPAssets.slice(pactIndex, pactIndex + maxPactUpdates);

    // prepare update lp tokens arguments
    const lpAssetIds = [
      ...tinymanLPUpdates.map(({ lpAssetId }) => lpAssetId),
      ...pactLPUpdates.map(({ lpAssetId }) => lpAssetId),
    ];

    // foreign arrays
    foreignAccounts.push(tinymanLPUpdates.map(({ lpPoolAddress }) => lpPoolAddress));
    const apps: number[] = [];
    if (tinymanLPUpdates.length > 0) apps.push(lpTokenOracle!.tinymanValidatorAppId);
    pactLPUpdates.forEach(({ lpPoolAppId }) => apps.push(lpPoolAppId));
    foreignApps.push(apps);

    // update lp
    atc.addMethodCall({
      sender: userAddr,
      signer,
      appID: lpTokenOracle!.appId,
      method: getMethodByName(lpTokenOracleABIContract.methods, "update_lp_tokens"),
      methodArgs: [lpAssetIds],
      suggestedParams: { ...params, flatFee: true, fee: 1000 },
    });

    // increase indexes
    tinymanIndex += tinymanLPUpdates.length;
    pactIndex += pactLPUpdates.length;
  }

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
  return atc.buildGroup().map(({ txn }, index) => {
    if (index < foreignAccounts.length && index < foreignApps.length) {
      txn.appAccounts = foreignAccounts[index].map((address) => decodeAddress(address));
      txn.appForeignApps = foreignApps[index];
    }
    txn.group = undefined;
    return txn;
  });
}

export { getOraclePrices, prepareRefreshPricesInOracleAdapter };
