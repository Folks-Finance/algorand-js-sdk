import { ONE_4_DP } from "../../math-lib";
import { LoanType, LPTokenProvider } from "../types";

import type { LendingPool, OpUp, Oracle, Pool, ReserveAddress } from "../types";

const MainnetPoolManagerAppId = 971350278;

const MainnetDepositsAppId = 971353536;

const MainnetDepositStakingAppId = 1093729103;

type MainnetPoolKey =
  | "ALGO"
  | "gALGO"
  | "xALGO"
  | "tALGO"
  | "USDC"
  | "USDt"
  | "GARD"
  | "EURS"
  | "goBTC"
  | "goETH"
  | "WBTC"
  | "WETH"
  | "WAVAX"
  | "WSOL"
  | "WLINK"
  | "GOLD"
  | "SILVER"
  | "OPUL"
  | "WMPL"
  | "ISOLATED_ALGO"
  | "ISOLATED_USDC"
  | "ISOLATED_TINY"
  | "ISOLATED_FOLKS"
  | "WBTC_NTT"
  | "WETH_NTT";
const MainnetPools: Record<MainnetPoolKey, Pool> = {
  ALGO: {
    appId: 971368268,
    assetId: 0,
    fAssetId: 971381860,
    frAssetId: 971381861,
    assetDecimals: 6,
    poolManagerIndex: 0,
    loans: {
      971388781: BigInt(0),
      971389489: BigInt(0),
      1202382736: BigInt(1),
      1202382829: BigInt(1),
    },
  },
  gALGO: {
    appId: 971370097,
    assetId: 793124631,
    fAssetId: 971383839,
    frAssetId: 971383840,
    assetDecimals: 6,
    poolManagerIndex: 1,
    loans: {
      971388781: BigInt(1),
      971389489: BigInt(1),
    },
  },
  xALGO: {
    appId: 2611131944,
    assetId: 1134696561,
    fAssetId: 2611138444,
    frAssetId: 2611138445,
    assetDecimals: 6,
    poolManagerIndex: 17,
    loans: {
      971388781: BigInt(17),
      971389489: BigInt(2),
    },
  },
  tALGO: {
    appId: 3073474613,
    assetId: 2537013734,
    fAssetId: 3073480070,
    frAssetId: 3073480071,
    assetDecimals: 6,
    poolManagerIndex: 18,
    loans: {
      971388781: BigInt(18),
      971389489: BigInt(3),
    },
  },
  USDC: {
    appId: 971372237,
    assetId: 31566704,
    fAssetId: 971384592,
    frAssetId: 971384593,
    assetDecimals: 6,
    poolManagerIndex: 2,
    loans: {
      971388781: BigInt(2),
      971388977: BigInt(0),
      1202382736: BigInt(0),
      1202382829: BigInt(0),
    },
  },
  USDt: {
    appId: 971372700,
    assetId: 312769,
    fAssetId: 971385312,
    frAssetId: 971385313,
    assetDecimals: 6,
    poolManagerIndex: 3,
    loans: {
      971388781: BigInt(3),
      971388977: BigInt(1),
    },
  },
  GARD: {
    appId: 1060585819,
    assetId: 684649988,
    fAssetId: 1060587336,
    frAssetId: 1060587337,
    assetDecimals: 6,
    poolManagerIndex: 7,
    loans: {
      971388781: BigInt(7),
      971388977: BigInt(2),
    },
  },
  EURS: {
    appId: 1247053569,
    assetId: 227855942,
    fAssetId: 1247054501,
    frAssetId: 1247054502,
    assetDecimals: 6,
    poolManagerIndex: 14,
    loans: {
      971388781: BigInt(14),
      971388977: BigInt(3),
    },
  },
  WBTC_NTT: {
    appId: 3514794123,
    assetId: 3495558025,
    fAssetId: 3514808410,
    frAssetId: 3514808411,
    assetDecimals: 8,
    poolManagerIndex: 23,
    loans: {
      971388781: BigInt(19),
    },
  },
  WETH_NTT: {
    appId: 3514795114,
    assetId: 3495722210,
    fAssetId: 3514808788,
    frAssetId: 3514808789,
    assetDecimals: 8,
    poolManagerIndex: 24,
    loans: {
      971388781: BigInt(20),
    },
  },
  goBTC: {
    appId: 971373361,
    assetId: 386192725,
    fAssetId: 971386173,
    frAssetId: 971386174,
    assetDecimals: 8,
    poolManagerIndex: 4,
    loans: {
      971388781: BigInt(4),
      1202382736: BigInt(2),
      1202382829: BigInt(2),
    },
  },
  goETH: {
    appId: 971373611,
    assetId: 386195940,
    fAssetId: 971387073,
    frAssetId: 971387074,
    assetDecimals: 8,
    poolManagerIndex: 5,
    loans: {
      971388781: BigInt(5),
      1202382736: BigInt(3),
      1202382829: BigInt(3),
    },
  },
  WBTC: {
    appId: 1067289273,
    assetId: 1058926737,
    fAssetId: 1067295154,
    frAssetId: 1067295155,
    assetDecimals: 8,
    poolManagerIndex: 8,
    loans: {
      971388781: BigInt(8),
      1202382736: BigInt(4),
      1202382829: BigInt(4),
    },
  },
  WETH: {
    appId: 1067289481,
    assetId: 887406851,
    fAssetId: 1067295558,
    frAssetId: 1067295559,
    assetDecimals: 8,
    poolManagerIndex: 9,
    loans: {
      971388781: BigInt(9),
      1202382736: BigInt(5),
      1202382829: BigInt(5),
    },
  },
  WAVAX: {
    appId: 1166977433,
    assetId: 893309613,
    fAssetId: 1166979636,
    frAssetId: 1166979637,
    assetDecimals: 8,
    poolManagerIndex: 10,
    loans: {
      971388781: BigInt(10),
    },
  },
  WSOL: {
    appId: 1166980669,
    assetId: 887648583,
    fAssetId: 1166980820,
    frAssetId: 1166980821,
    assetDecimals: 8,
    poolManagerIndex: 11,
    loans: {
      971388781: BigInt(11),
    },
  },
  WLINK: {
    appId: 1216434571,
    assetId: 1200094857,
    fAssetId: 1216437148,
    frAssetId: 1216437149,
    assetDecimals: 8,
    poolManagerIndex: 13,
    loans: {
      971388781: BigInt(13),
    },
  },
  GOLD: {
    appId: 1258515734,
    assetId: 246516580,
    fAssetId: 1258524377,
    frAssetId: 1258524378,
    assetDecimals: 6,
    poolManagerIndex: 15,
    loans: {
      971388781: BigInt(15),
    },
  },
  SILVER: {
    appId: 1258524099,
    assetId: 246519683,
    fAssetId: 1258524381,
    frAssetId: 1258524382,
    assetDecimals: 6,
    poolManagerIndex: 16,
    loans: {
      971388781: BigInt(16),
    },
  },
  OPUL: {
    appId: 1044267181,
    assetId: 287867876,
    fAssetId: 1044269355,
    frAssetId: 1044269356,
    assetDecimals: 10,
    poolManagerIndex: 6,
    loans: {
      971388781: BigInt(6),
    },
  },
  WMPL: {
    appId: 1166982094,
    assetId: 1163259470,
    fAssetId: 1166982296,
    frAssetId: 1166982297,
    assetDecimals: 8,
    poolManagerIndex: 12,
    loans: {
      971388781: BigInt(12),
    },
  },
  ISOLATED_ALGO: {
    appId: 3184317016,
    assetId: 0,
    fAssetId: 3184331013,
    frAssetId: 3184331014,
    assetDecimals: 6,
    poolManagerIndex: 19,
    loans: {
      3184333108: BigInt(0),
    },
  },
  ISOLATED_USDC: {
    appId: 3184324594,
    assetId: 31566704,
    fAssetId: 3184331239,
    frAssetId: 3184331240,
    assetDecimals: 6,
    poolManagerIndex: 20,
    loans: {
      3184333108: BigInt(1),
    },
  },
  ISOLATED_TINY: {
    appId: 3184325123,
    assetId: 2200000000,
    fAssetId: 3184331789,
    frAssetId: 3184331790,
    assetDecimals: 6,
    poolManagerIndex: 21,
    loans: {
      3184333108: BigInt(2),
    },
  },
  ISOLATED_FOLKS: {
    appId: 3343137163,
    assetId: 3203964481,
    fAssetId: 3343139268,
    frAssetId: 3343139269,
    assetDecimals: 6,
    poolManagerIndex: 22,
    loans: {
      3184333108: BigInt(3),
    },
  },
};

const MainnetLoans: Partial<Record<LoanType, number>> = {
  [LoanType.GENERAL]: 971388781,
  [LoanType.STABLECOIN_EFFICIENCY]: 971388977,
  [LoanType.ALGO_EFFICIENCY]: 971389489,
  [LoanType.ULTRASWAP_UP]: 1202382736,
  [LoanType.ULTRASWAP_DOWN]: 1202382829,
  [LoanType.ALGORAND_ECOSYSTEM]: 3184333108,
};

const MainnetTinymanAppId = 1002541853;

type MainnetLendingPoolKey =
  | "ALGOUSDCPLP"
  | "ALGOUSDCTM"
  | "ALGOgoBTCPLP"
  | "ALGOgoBTCTM"
  | "ALGOgoETHPLP"
  | "ALGOgoETHTM"
  | "ALGOGOLDPLP"
  | "ALGOGOLDTM"
  | "ALGOSILVERPLP"
  | "ALGOSILVERTM"
  | "xALGOtALGOTM"
  | "xALGOUSDCPLP"
  | "xALGOUSDCTM"
  | "tALGOUSDCTM"
  | "USDCwBTCNTTTM"
  | "USDCwETHNTTTM"
  | "USDCGOLDPLP"
  | "USDCSILVERPLP";
const MainnetLendingPools: Record<MainnetLendingPoolKey, LendingPool> = {
  ALGOUSDCPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 1116363704,
    lpAssetId: 1116363710,
    pool0AppId: 971368268,
    pool1AppId: 971372237,
    asset0Id: 0,
    asset1Id: 31566704,
    feeScale: ONE_4_DP,
  },
  ALGOUSDCTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "ZA42RCTLUMWUUB6SXEUNTI72LVSGV3TJIUTCGLNQF3KNOXFBMEPXNST3MA",
    lpAssetId: 1256805381,
    pool0AppId: 971368268,
    pool1AppId: 971372237,
    asset0Id: 0,
    asset1Id: 31566704,
    feeScale: ONE_4_DP,
  },
  ALGOgoBTCPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 2161677283,
    lpAssetId: 2161677289,
    pool0AppId: 971368268,
    pool1AppId: 971373361,
    asset0Id: 0,
    asset1Id: 386192725,
    feeScale: ONE_4_DP,
  },
  ALGOgoETHPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 2161681928,
    lpAssetId: 2161681934,
    pool0AppId: 971368268,
    pool1AppId: 971373611,
    asset0Id: 0,
    asset1Id: 386195940,
    feeScale: ONE_4_DP,
  },
  ALGOgoBTCTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "RB6SQMZINE5SEEYH6PZNSOGEUTC6BSYTOJ2YGEAHSE6MOPCLEUTCA6MNLM",
    lpAssetId: 2169397535,
    pool0AppId: 971368268,
    pool1AppId: 971373361,
    asset0Id: 0,
    asset1Id: 386192725,
    feeScale: ONE_4_DP,
  },
  ALGOgoETHTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "DU4NAE2N6FQLTYFRURJVTOC7Y7GOTZO4C7BQHHVJ2B5NZU6EDZLK7G6HKU",
    lpAssetId: 2169399904,
    pool0AppId: 971368268,
    pool1AppId: 971373611,
    asset0Id: 0,
    asset1Id: 386195940,
    feeScale: ONE_4_DP,
  },
  ALGOGOLDPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 1258807438,
    lpAssetId: 1258807444,
    pool0AppId: 971368268,
    pool1AppId: 1258515734,
    asset0Id: 0,
    asset1Id: 246516580,
    feeScale: ONE_4_DP,
  },
  ALGOGOLDTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "N44TFF4OLWLUTJS3ZA67LODV2DQR3ZBTEXKGAQ6ZIWXBDLN7J4KBLIXNIQ",
    lpAssetId: 2169404223,
    pool0AppId: 971368268,
    pool1AppId: 1258515734,
    asset0Id: 0,
    asset1Id: 246516580,
    feeScale: ONE_4_DP,
  },
  ALGOSILVERPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 1258808812,
    lpAssetId: 1258808818,
    pool0AppId: 971368268,
    pool1AppId: 1258524099,
    asset0Id: 0,
    asset1Id: 246519683,
    feeScale: ONE_4_DP,
  },
  ALGOSILVERTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "4LJMARM7FXLYLOUERA74QHUA4SIX2YMCTHGXBW7A75BOVGV6RXJYZTQSH4",
    lpAssetId: 2169402187,
    pool0AppId: 971368268,
    pool1AppId: 1258524099,
    asset0Id: 0,
    asset1Id: 246519683,
    feeScale: ONE_4_DP,
  },
  xALGOtALGOTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "7OKJA2HXKYKCQ4GVQOXCQEVITILDH4VRIHT6VW5YC5WC4KPUMV2R5KTZW4",
    lpAssetId: 3074122693,
    pool0AppId: 3073474613,
    pool1AppId: 2611131944,
    asset0Id: 2537013734,
    asset1Id: 1134696561,
    feeScale: ONE_4_DP,
  },
  xALGOUSDCPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 2649980181,
    lpAssetId: 2649980187,
    pool0AppId: 2611131944,
    pool1AppId: 971372237,
    asset0Id: 1134696561,
    asset1Id: 31566704,
    feeScale: ONE_4_DP,
  },
  xALGOUSDCTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "EHYUE2VAI22PB5DID4EHUD5YH7UIOE2NG5XPQZ7NZPIHFUQ334C7J5OSTY",
    lpAssetId: 2649938842,
    pool0AppId: 2611131944,
    pool1AppId: 971372237,
    asset0Id: 1134696561,
    asset1Id: 31566704,
    feeScale: ONE_4_DP,
  },
  tALGOUSDCTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "LWAAYBCUROTZ3RO4EBQ7TN7MJ3ZHGCY7MTK6QNLG2HYOS232JKEQ23NG6Y",
    lpAssetId: 3074051630,
    pool0AppId: 3073474613,
    pool1AppId: 971372237,
    asset0Id: 2537013734,
    asset1Id: 31566704,
    feeScale: ONE_4_DP,
  },
  USDCwBTCNTTTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "3PR5Z3IYPUM66FSLLJ44GZZZMN534O3JUDLOZYDQKIJRIYQZ3NJMG2HVQY",
    lpAssetId: 1394237139,
    pool0AppId: 971372237,
    pool1AppId: 3514794123,
    asset0Id: 31566704,
    asset1Id: 3495558025,
    feeScale: ONE_4_DP,
  },
  USDCwETHNTTTM: {
    provider: LPTokenProvider.TINYMAN,
    lpPoolAppAddress: "63EYPMHHLV43ZHRBWDAKHRHWFDB7II2LTVCFMPDF5BNGL4UK7ZVMKHUORM",
    lpAssetId: 1734424720,
    pool0AppId: 971372237,
    pool1AppId: 3514795114,
    asset0Id: 31566704,
    asset1Id: 3495722210,
    feeScale: ONE_4_DP,
  },
  USDCGOLDPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 1736289878,
    lpAssetId: 1736289884,
    pool0AppId: 971372237,
    pool1AppId: 1258515734,
    asset0Id: 31566704,
    asset1Id: 246516580,
    feeScale: ONE_4_DP,
  },
  USDCSILVERPLP: {
    provider: LPTokenProvider.PACT,
    lpPoolAppId: 1736326581,
    lpAssetId: 1736326587,
    pool0AppId: 971372237,
    pool1AppId: 1258524099,
    asset0Id: 31566704,
    asset1Id: 246519683,
    feeScale: ONE_4_DP,
  },
};

const MainnetReserveAddress: ReserveAddress = "Q5Q5FC5PTYQIUX5PGNTEW22UJHJHVVUEMMWV2LSG6MGT33YQ54ST7FEIGA";

const MainnetOracle: Oracle = {
  oracle0AppId: 1040271396,
  oracle1AppId: 971323141,
  oracleAdapterAppId: 971333964,
  decimals: 14,
};

const MainnetOpUp: OpUp = {
  callerAppId: 1167143153,
  baseAppId: 971335616,
};

export {
  MainnetPoolManagerAppId,
  MainnetDepositsAppId,
  MainnetDepositStakingAppId,
  MainnetPoolKey,
  MainnetPools,
  MainnetLoans,
  MainnetTinymanAppId,
  MainnetLendingPoolKey,
  MainnetLendingPools,
  MainnetReserveAddress,
  MainnetOracle,
  MainnetOpUp,
};
