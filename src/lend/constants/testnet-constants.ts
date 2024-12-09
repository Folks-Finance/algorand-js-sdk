import type { OpUp, Oracle, Pool, ReserveAddress } from "../types";
import { LoanType } from "../types";

const TestnetPoolManagerAppId = 147157634;

const TestnetDepositsAppId = 147157692;

type TestnetPoolKey = "ALGO" | "gALGO" | "USDC" | "USDt" | "goBTC" | "goETH";
const TestnetPools: Record<TestnetPoolKey, Pool> = {
  ALGO: {
    appId: 147169673,
    assetId: 0,
    fAssetId: 147171698,
    frAssetId: 147171699,
    assetDecimals: 6,
    poolManagerIndex: 0,
    loans: {
      147173131: BigInt(0),
      168153622: BigInt(0),
      397181473: BigInt(1),
      397181998: BigInt(1),
    },
  },
  gALGO: {
    appId: 168152517,
    assetId: 167184545,
    fAssetId: 168153084,
    frAssetId: 168153085,
    assetDecimals: 6,
    poolManagerIndex: 5,
    loans: {
      147173131: BigInt(5),
      168153622: BigInt(1),
    },
  },
  USDC: {
    appId: 147170678,
    assetId: 67395862,
    fAssetId: 147171826,
    frAssetId: 147171827,
    assetDecimals: 6,
    poolManagerIndex: 1,
    loans: {
      147173131: BigInt(1),
      147173190: BigInt(0),
      397181473: BigInt(0),
      397181998: BigInt(0),
    },
  },
  USDt: {
    appId: 147171033,
    assetId: 67396430,
    fAssetId: 147172417,
    frAssetId: 147172418,
    assetDecimals: 6,
    poolManagerIndex: 2,
    loans: {
      147173131: BigInt(2),
      147173190: BigInt(1),
    },
  },
  goBTC: {
    appId: 147171314,
    assetId: 67396528,
    fAssetId: 147172646,
    frAssetId: 147172647,
    assetDecimals: 8,
    poolManagerIndex: 3,
    loans: {
      147173131: BigInt(3),
      397181473: BigInt(2),
      397181998: BigInt(2),
    },
  },
  goETH: {
    appId: 147171345,
    assetId: 76598897,
    fAssetId: 147172881,
    frAssetId: 147172882,
    assetDecimals: 8,
    poolManagerIndex: 4,
    loans: {
      147173131: BigInt(4),
      397181473: BigInt(3),
      397181998: BigInt(3),
    },
  },
};

const TestnetLoans: Partial<Record<LoanType, number>> = {
  [LoanType.GENERAL]: 147173131,
  [LoanType.STABLECOIN_EFFICIENCY]: 147173190,
  [LoanType.ALGO_EFFICIENCY]: 168153622,
  [LoanType.ULTRASWAP_UP]: 397181473,
  [LoanType.ULTRASWAP_DOWN]: 397181998,
};

const TestnetReserveAddress: ReserveAddress = "KLF3MEIIHMTA7YHNPLBDVHLN2MVC27X5M7ULTDZLMEX5XO5XCUP7HGBHMQ";

const TestnetOracle: Oracle = {
  oracle0AppId: 124087437,
  oracleAdapterAppId: 147153711,
  decimals: 14,
};

const TestnetOpUp: OpUp = {
  callerAppId: 397104542,
  baseAppId: 118186203,
};

export {
  TestnetPoolManagerAppId,
  TestnetDepositsAppId,
  TestnetPoolKey,
  TestnetPools,
  TestnetLoans,
  TestnetReserveAddress,
  TestnetOracle,
  TestnetOpUp,
};
