import type { Indexer } from "algosdk";
import { encodeAddress } from "algosdk";
import { fromIntToBytes8Hex, getParsedValueFromState } from "../../utils";
import { calcConversionRate, calcLPPrice, minimum } from "./math";
import type { ConversionRate, LPToken, Oracle, OraclePrice, OraclePrices } from "./types";

function parseOracleValue(base64Value: string) {
  const value = Buffer.from(base64Value, "base64").toString("hex");
  // first 8 bytes are the price
  const price = BigInt("0x" + value.slice(0, 16));
  // next 8 bytes are the timestamp
  const timestamp = BigInt("0x" + value.slice(16, 32));
  return { price, timestamp };
}

function parseOracleAdapterValue(base64Value: string): LPToken {
  const value = Buffer.from(base64Value, "base64").toString("hex");
  // first 8 bytes are if Tinyman
  const isTinyman = Number(`0x${value.slice(0, 16)}`);
  // next 16 bytes are asset ids
  const asset0Id = Number(`0x${value.slice(16, 32)}`);
  const asset1Id = Number(`0x${value.slice(32, 48)}`);

  // check if LP token is Tinyman or Pact
  if (isTinyman) {
    // next 32 bytes are tinyman pool address
    const poolAddress = encodeAddress(Buffer.from(value.slice(48, 112), "hex"));
    return { provider: "Tinyman", asset0Id, asset1Id, poolAddress };
  } else {
    // next 8 bytes are pact pool app id
    const poolAppId = Number(`0x${value.slice(48, 64)}`);
    return { provider: "Pact", asset0Id, asset1Id, poolAppId };
  }
}

async function getTinymanLPPrice(
  indexerClient: Indexer,
  validatorAppId: number,
  poolAddress: string,
  p0: bigint,
  p1: bigint,
): Promise<bigint> {
  const res = await indexerClient.lookupAccountByID(poolAddress).do();
  const { account } = res;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = account["apps-local-state"]?.find((app: any) => app.id === validatorAppId)?.["key-value"];
  if (state === undefined)
    throw new Error(`Unable to find Tinyman Pool: ${poolAddress} for validator app ${validatorAppId}.`);
  const r0 = BigInt(getParsedValueFromState(state, "s1") || 0);
  const r1 = BigInt(getParsedValueFromState(state, "s2") || 0);
  const lts = BigInt(getParsedValueFromState(state, "ilt") || 0);

  return calcLPPrice(r0, r1, p0, p1, lts);
}

async function getPactLPPrice(indexerClient: Indexer, poolAppId: number, p0: bigint, p1: bigint): Promise<bigint> {
  const res = await indexerClient.lookupApplications(poolAppId).do();
  const state = res.application.params["global-state"];

  const r0 = BigInt(getParsedValueFromState(state, "A") || 0);
  const r1 = BigInt(getParsedValueFromState(state, "B") || 0);
  const lts = BigInt(getParsedValueFromState(state, "L") || 0);

  return calcLPPrice(r0, r1, p0, p1, lts);
}

/**
 *
 * Returns oracle prices for given oracle and provided assets.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param oracle - oracle to query
 * @param assets - assets to get prices for
 * @returns OraclePrices oracle prices
 */
async function getOraclePrices(indexerClient: Indexer, oracle: Oracle, assets: number[]): Promise<OraclePrices> {
  const { oracle1AppId, oracleAdapterAppId, tinymanValidatorAppId } = oracle;
  const [oracleRes, oracleAdapterRes] = await Promise.all([
    indexerClient.lookupApplications(oracle1AppId).do(),
    indexerClient.lookupApplications(oracleAdapterAppId).do(),
  ]);
  const oracleState = oracleRes.application.params["global-state"];
  const oracleAdapterState = oracleAdapterRes.application.params["global-state"];

  const prices: Record<number, OraclePrice> = {};
  let price: OraclePrice;

  const promises = assets.map(async (assetId) => {
    const base64Value = getParsedValueFromState(oracleAdapterState, fromIntToBytes8Hex(assetId), "hex");

    // check if liquidity token
    if (base64Value !== undefined) {
      const oracleAdapterValue = parseOracleAdapterValue(base64Value as string);

      const { price: p0, timestamp: t0 } = parseOracleValue(
        String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(oracleAdapterValue.asset0Id), "hex")),
      );
      const { price: p1, timestamp: t1 } = parseOracleValue(
        String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(oracleAdapterValue.asset1Id), "hex")),
      );

      price = {
        price:
          oracleAdapterValue.provider === "Tinyman"
            ? await getTinymanLPPrice(indexerClient, tinymanValidatorAppId, oracleAdapterValue.poolAddress, p0, p1)
            : await getPactLPPrice(indexerClient, oracleAdapterValue.poolAppId, p0, p1),
        timestamp: minimum(t0, t1),
      };
    } else {
      price = parseOracleValue(String(getParsedValueFromState(oracleState, fromIntToBytes8Hex(assetId), "hex")));
    }

    prices[assetId] = price;
  });

  await Promise.all(promises);

  return { currentRound: oracleRes["current-round"], prices };
}

/**
 *
 * Returns conversion rate between two prices.
 *
 * @param collateralPrice - collateral asset price
 * @param borrowPrice - borrow asset price
 * @returns ConversionRate conversion rate
 */
function getConversionRate(collateralPrice: bigint, borrowPrice: bigint): ConversionRate {
  return calcConversionRate(collateralPrice, borrowPrice);
}

export { getOraclePrices, getConversionRate };
