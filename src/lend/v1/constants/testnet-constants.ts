import type { Oracle, Pool, ReserveAddress, TokenPair } from "../types";

type TestnetPoolKey = "ALGO" | "USDC" | "USDt" | "goBTC" | "goETH" | "xUSD";
const TestnetPools: Record<TestnetPoolKey, Pool> = {
  ALGO: {
    appId: 79413571,
    assetId: 0,
    fAssetId: 79413584,
    frAssetId: 79413585,
    assetDecimals: 6,
  },
  USDC: {
    appId: 79414655,
    assetId: 67395862,
    fAssetId: 79414673,
    frAssetId: 79414674,
    assetDecimals: 6,
  },
  USDt: {
    appId: 79414803,
    assetId: 67396430,
    fAssetId: 79414816,
    frAssetId: 79414817,
    assetDecimals: 6,
  },
  goBTC: {
    appId: 79414213,
    assetId: 67396528,
    fAssetId: 79414227,
    frAssetId: 79414228,
    assetDecimals: 8,
  },
  goETH: {
    appId: 79414429,
    assetId: 76598897,
    fAssetId: 79414445,
    frAssetId: 79414446,
    assetDecimals: 8,
  },
  xUSD: {
    appId: 79414940,
    assetId: 62281549,
    fAssetId: 79414986,
    frAssetId: 79414987,
    assetDecimals: 6,
  },
};

// CollateralPool-BorrowPool
type TestnetTokenPairKey =
  | "ALGO-USDC"
  | "ALGO-USDt"
  | "ALGO-goBTC"
  | "ALGO-goETH"
  | "ALGO-xUSD"
  | "USDC-ALGO"
  | "USDC-USDt"
  | "USDC-goBTC"
  | "USDC-goETH"
  | "USDC-xUSD"
  | "USDt-ALGO"
  | "USDt-USDC"
  | "USDt-goBTC"
  | "USDt-goETH"
  | "USDt-xUSD"
  | "goBTC-ALGO"
  | "goBTC-USDC"
  | "goBTC-USDt"
  | "goBTC-goETH"
  | "goBTC-xUSD"
  | "goETH-ALGO"
  | "goETH-USDC"
  | "goETH-USDt"
  | "goETH-goBTC"
  | "goETH-xUSD"
  | "xUSD-ALGO"
  | "xUSD-USDC"
  | "xUSD-USDt"
  | "xUSD-goBTC"
  | "xUSD-goETH";
const TestnetTokenPairs: Record<TestnetTokenPairKey, TokenPair> = {
  "ALGO-USDC": {
    appId: 79423184,
    collateralPool: TestnetPools.ALGO,
    borrowPool: TestnetPools.USDC,
    linkAddr: "M26JBDFAY54XYYQO6NZMRDKBDWR5JWJIU5MKETX5NHJ4NCFRG27NEW6KLA",
  },
  "ALGO-USDt": {
    appId: 79423331,
    collateralPool: TestnetPools.ALGO,
    borrowPool: TestnetPools.USDt,
    linkAddr: "GQD757UKRASKEBUJAUKEGDPSF7NQIIKK2IUV7BWF7J5NCANXNLRWXWIMTA",
  },
  "ALGO-goBTC": {
    appId: 79422813,
    collateralPool: TestnetPools.ALGO,
    borrowPool: TestnetPools.goBTC,
    linkAddr: "4ZYOED2WJDUNLRUW22UY6O3DUZLWP4ZFGT2TQJTLLDTLQUXFD6YLA3SUXA",
  },
  "ALGO-goETH": {
    appId: 79422954,
    collateralPool: TestnetPools.ALGO,
    borrowPool: TestnetPools.goETH,
    linkAddr: "MSRIVQXAHKNG4CWC6CF6PKU7GIQPNYUNV6BX3CVKUHHCVRCDQ57RWHUQZM",
  },
  "ALGO-xUSD": {
    appId: 79423508,
    collateralPool: TestnetPools.ALGO,
    borrowPool: TestnetPools.xUSD,
    linkAddr: "AGJU45VOV55F65KJQ7WP45VLNNTYPH5PTCZGEY2AW7YI2AZPEDWTM5YLUQ",
  },
  "USDC-ALGO": {
    appId: 79426010,
    collateralPool: TestnetPools.USDC,
    borrowPool: TestnetPools.ALGO,
    linkAddr: "VW4GYRHMN5WJ6KQ7E3OQVR5NJZIPWL7Y6VAMTJY3GLTATIH7SBKC3CXCJE",
  },
  "USDC-USDt": {
    appId: 79957120,
    collateralPool: TestnetPools.USDC,
    borrowPool: TestnetPools.USDt,
    linkAddr: "XBNNO4AK7NDS22KACW3CPOMSXVRLK2JPEV42TSMLKFNFX3IWD2J6N3FQPY",
  },
  "USDC-goBTC": {
    appId: 79426562,
    collateralPool: TestnetPools.USDC,
    borrowPool: TestnetPools.goBTC,
    linkAddr: "YHK46XJZEQ3QW57LK2WZRH2NZLBA6NLWKAR3CM3333CGWTD45KTEDGUD6Q",
  },
  "USDC-goETH": {
    appId: 79426875,
    collateralPool: TestnetPools.USDC,
    borrowPool: TestnetPools.goETH,
    linkAddr: "GMWY22NJS5EOR4EPVX5A2VP6FOKBJYHFTLGQEMYYBDMDPEWXCDYXGV5IVY",
  },
  "USDC-xUSD": {
    appId: 79427925,
    collateralPool: TestnetPools.USDC,
    borrowPool: TestnetPools.xUSD,
    linkAddr: "YLWW54VAYZ57MOIAOJHLHH727QESCRIR6BOJPD4QO4LMXPX7VIW5BINIHM",
  },
  "USDt-ALGO": {
    appId: 79428141,
    collateralPool: TestnetPools.USDt,
    borrowPool: TestnetPools.ALGO,
    linkAddr: "VD2N5IWER5E3P45BWLUZDBOHNMWSPVJF6H5YWONQWOSFJLA2KD5NFHMOUQ",
  },
  "USDt-USDC": {
    appId: 79428791,
    collateralPool: TestnetPools.USDt,
    borrowPool: TestnetPools.USDC,
    linkAddr: "BJJ6XQPUPLZCFQVMQG7GSZ44PPH7ROEWORFGNMT3WAUOL2VHSJTJDAVVDM",
  },
  "USDt-goBTC": {
    appId: 79428351,
    collateralPool: TestnetPools.USDt,
    borrowPool: TestnetPools.goBTC,
    linkAddr: "ZSVW77KE5ZC5PD7MX7VRKWPMNJWGCQYAXUKK6PVVE6JIM3AUXVQCHRCEOE",
  },
  "USDt-goETH": {
    appId: 79428525,
    collateralPool: TestnetPools.USDt,
    borrowPool: TestnetPools.goETH,
    linkAddr: "BZRW6QIPIVB4WFH5PDH2T3QIROM64KDMUPCW2MWWJ7DG434LFPTUUXH5SA",
  },
  "USDt-xUSD": {
    appId: 79441603,
    collateralPool: TestnetPools.USDt,
    borrowPool: TestnetPools.xUSD,
    linkAddr: "QAYROUFUXALKZTN6FIQPLO6EDJ7IRZQU6EIXJ4XT4D4TMS7CZO2DC2DDPQ",
  },
  "goBTC-ALGO": {
    appId: 79423759,
    collateralPool: TestnetPools.goBTC,
    borrowPool: TestnetPools.ALGO,
    linkAddr: "T2CFE5DJDQAUPAYGGVBE2SVA3W2VEOE7RDJ4DXBUY3FXJ4565E4S7VHOI4",
  },
  "goBTC-USDC": {
    appId: 79424196,
    collateralPool: TestnetPools.goBTC,
    borrowPool: TestnetPools.USDC,
    linkAddr: "XMFIFQXTW2UWWNOUNMMNESPZ5PWQP6NQPK67XURP7F23HJIYS6YTJ5QLCI",
  },
  "goBTC-USDt": {
    appId: 79424605,
    collateralPool: TestnetPools.goBTC,
    borrowPool: TestnetPools.USDt,
    linkAddr: "Z74NWKC5RT6CC5KMK23QWUXRV47FQ5RTKJTEGSTKQ6XFKPZIZPDCLOQ7CI",
  },
  "goBTC-goETH": {
    appId: 79424008,
    collateralPool: TestnetPools.goBTC,
    borrowPool: TestnetPools.goETH,
    linkAddr: "NPWUHKBRNQDIATMDWY6H6IGJNLSZ3A62AQNZHJYSTZWOXG7U2XVV5MW4H4",
  },
  "goBTC-xUSD": {
    appId: 79424344,
    collateralPool: TestnetPools.goBTC,
    borrowPool: TestnetPools.xUSD,
    linkAddr: "5BCJJIM4M2ZJCI6SEW6F4CUISUUZC7OHD2PLC5I77RUAGEDCGLHZPF57BA",
  },
  "goETH-ALGO": {
    appId: 79424838,
    collateralPool: TestnetPools.goETH,
    borrowPool: TestnetPools.ALGO,
    linkAddr: "7RCFQXNNS5F7ORN7U23R2BTIKSAFJIUPLQGJYK4TA4FMHWZCQPHQHXWPCU",
  },
  "goETH-USDC": {
    appId: 79425463,
    collateralPool: TestnetPools.goETH,
    borrowPool: TestnetPools.USDC,
    linkAddr: "XRNCWYPP7YI3M3GWOJKAQAXRRFL4HODWLPW36RALOSHWJGPSQ3GFH7REHE",
  },
  "goETH-USDt": {
    appId: 79425675,
    collateralPool: TestnetPools.goETH,
    borrowPool: TestnetPools.USDt,
    linkAddr: "JBW3VMOZLO7SS3HUBHGHKBHKEGHZZM7RXMZPLMHXIWF4DYPEPCEM4LFOEI",
  },
  "goETH-goBTC": {
    appId: 79425279,
    collateralPool: TestnetPools.goETH,
    borrowPool: TestnetPools.goBTC,
    linkAddr: "CFXETLXMNK7S2HLUHOJZLBZAF7QVVVNDSKLAVDCJVMI7A5YFWUZS26PKKE",
  },
  "goETH-xUSD": {
    appId: 79425555,
    collateralPool: TestnetPools.goETH,
    borrowPool: TestnetPools.xUSD,
    linkAddr: "YIFHV3AF5KE5IAI5AKU7JDSG4QY4LW5GMSZ5IVPD4OKWXT5QN4PMM5MBGU",
  },
  "xUSD-ALGO": {
    appId: 79441866,
    collateralPool: TestnetPools.xUSD,
    borrowPool: TestnetPools.ALGO,
    linkAddr: "EGXTA3I5WJVPPQS5KJ63WKRZREPZRBVG7PCDNKV6C3RD6C7UZWQMRJDF5M",
  },
  "xUSD-USDC": {
    appId: 79442346,
    collateralPool: TestnetPools.xUSD,
    borrowPool: TestnetPools.USDC,
    linkAddr: "TUFHG3BJ3MEBQMMEGW72Z37P2VKS6MNPFDSERAFG3E7KTEVOXGXBQTOOSM",
  },
  "xUSD-USDt": {
    appId: 79442464,
    collateralPool: TestnetPools.xUSD,
    borrowPool: TestnetPools.USDt,
    linkAddr: "VNUFIDQRMZFIWMAJOJJEJLG7DHAW36J5CMQBTK763BYQJLVGO2QIKHT7RI",
  },
  "xUSD-goBTC": {
    appId: 79442005,
    collateralPool: TestnetPools.xUSD,
    borrowPool: TestnetPools.goBTC,
    linkAddr: "Z2ISA647MUTAUYRPXLZ6TJ7ABE2R7M5J4K3ONANWDEDFZXPUFL45OCLT5E",
  },
  "xUSD-goETH": {
    appId: 79442146,
    collateralPool: TestnetPools.xUSD,
    borrowPool: TestnetPools.goETH,
    linkAddr: "MNMJ6Y3BNUGUEUZWF4DPTOOTHLY2MDQRIDAHDKBGPZSAKLC4WJJSN4CXXY",
  },
};

const TestnetOracle: Oracle = {
  oracle1AppId: 124087437,
  oracle2AppId: 67734391,
  oracleAdapterAppId: 138252228,
  tinymanValidatorAppId: 62368684,
  decimals: 14,
};

const TestnetReserveAddress: ReserveAddress = "5ISPVI3JMQ4MP5XWWK4ILLKJAYU34U4TGZGXNC5BKR5AK3JBVAMJYBRYEI";

export { TestnetPoolKey, TestnetPools, TestnetTokenPairKey, TestnetTokenPairs, TestnetOracle, TestnetReserveAddress };
