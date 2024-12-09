import type { Oracle, Pool, ReserveAddress, TokenPair } from "../types";

type MainnetPoolKey =
  | "ALGO"
  | "gALGO"
  | "USDC"
  | "USDt"
  | "goBTC"
  | "goETH"
  | "gALGO3"
  | "Planet"
  | "ALGOgALGOPLP"
  | "ALGOUSDCTMP"
  | "ALGOUSDCPLP"
  | "ALGOgALGO3TMP"
  | "ALGOgALGO3PLP"
  | "USDCgALGOTMP"
  | "USDCUSDtTMP"
  | "USDCUSDtPLP"
  | "goBTCgALGOPLP"
  | "goETHgALGOPLP";
const MainnetPools: Record<MainnetPoolKey, Pool> = {
  ALGO: {
    appId: 686498781,
    assetId: 0,
    fAssetId: 686505742,
    frAssetId: 686505743,
    assetDecimals: 6,
  },
  gALGO: {
    appId: 794055220,
    assetId: 793124631,
    fAssetId: 794060802,
    frAssetId: 794060803,
    assetDecimals: 6,
  },
  USDC: {
    appId: 686500029,
    assetId: 31566704,
    fAssetId: 686508050,
    frAssetId: 686508051,
    assetDecimals: 6,
  },
  USDt: {
    appId: 686500844,
    assetId: 312769,
    fAssetId: 686509463,
    frAssetId: 686509464,
    assetDecimals: 6,
  },
  goBTC: {
    appId: 686501760,
    assetId: 386192725,
    fAssetId: 686510134,
    frAssetId: 686510135,
    assetDecimals: 8,
  },
  goETH: {
    appId: 694405065,
    assetId: 386195940,
    fAssetId: 694408528,
    frAssetId: 694408529,
    assetDecimals: 8,
  },
  gALGO3: {
    appId: 694464549,
    assetId: 694432641,
    fAssetId: 694474015,
    frAssetId: 694474016,
    assetDecimals: 6,
  },
  Planet: {
    appId: 751285119,
    assetId: 27165954,
    fAssetId: 751289888,
    frAssetId: 751289889,
    assetDecimals: 6,
  },
  ALGOgALGOPLP: {
    appId: 805846536,
    assetId: 794882756,
    fAssetId: 805848550,
    frAssetId: 805848551,
    assetDecimals: 6,
    poolAppId: 794882684,
  },
  ALGOUSDCTMP: {
    appId: 747237154,
    assetId: 552647097,
    fAssetId: 747244426,
    frAssetId: 747244427,
    assetDecimals: 6,
    poolAppAddress: "FPOU46NBKTWUZCNMNQNXRWNW3SMPOOK4ZJIN5WSILCWP662ANJLTXVRUKA",
  },
  ALGOUSDCPLP: {
    appId: 747239433,
    assetId: 620996279,
    fAssetId: 747244580,
    frAssetId: 747244581,
    assetDecimals: 6,
    poolAppId: 620995314,
  },
  ALGOgALGO3TMP: {
    appId: 743679535,
    assetId: 694683000,
    fAssetId: 743689704,
    frAssetId: 743689705,
    assetDecimals: 6,
    poolAppAddress: "WNA4H7Y3UGEVNEVVFU2TUDLMOMLWSV72UF6SYYRBOQ7IGDW4ZIOKYWNIWU",
  },
  ALGOgALGO3PLP: {
    appId: 743685742,
    assetId: 701364134,
    fAssetId: 743689819,
    frAssetId: 743689820,
    assetDecimals: 6,
    poolAppId: 701363946,
  },
  USDCgALGOTMP: {
    appId: 805843312,
    assetId: 794948880,
    fAssetId: 805848419,
    frAssetId: 805848420,
    assetDecimals: 6,
    poolAppAddress: "3WT6YVLQY2WSQ6VLX73MJB7BI3CGBDTB2KKAAFZ2CZQJUFUCIOMUN2K24U",
  },
  USDCUSDtTMP: {
    appId: 776179559,
    assetId: 552888874,
    fAssetId: 776184808,
    frAssetId: 776184809,
    assetDecimals: 6,
    poolAppAddress: "I37JDCOJCK2JSPRMV5HHFHQ54YU6J6VWCBCDNULIT5ZJWO357R2DJLGIBM",
  },
  USDCUSDtPLP: {
    appId: 776176449,
    assetId: 701273234,
    fAssetId: 776185076,
    frAssetId: 776185077,
    assetDecimals: 6,
    poolAppId: 701273050,
  },
  goBTCgALGOPLP: {
    appId: 818026112,
    assetId: 807805560,
    fAssetId: 818036525,
    frAssetId: 818036526,
    assetDecimals: 6,
    poolAppId: 807805342,
  },
  goETHgALGOPLP: {
    appId: 818028354,
    assetId: 807804381,
    fAssetId: 818036407,
    frAssetId: 818036408,
    assetDecimals: 6,
    poolAppId: 807804196,
  },
};

// CollateralPool-BorrowPool
type MainnetTokenPairKey =
  | "ALGO-USDC"
  | "ALGO-USDt"
  | "ALGO-goBTC"
  | "ALGO-goETH"
  | "ALGO-Planet"
  | "gALGO-ALGO"
  | "gALGO-USDC"
  | "gALGO-USDt"
  | "gALGO-goBTC"
  | "gALGO-goETH"
  | "gALGO-Planet"
  | "USDC-ALGO"
  | "USDC-USDt"
  | "USDC-goBTC"
  | "USDC-goETH"
  | "USDC-Planet"
  | "USDt-ALGO"
  | "USDt-USDC"
  | "USDt-goBTC"
  | "USDt-goETH"
  | "USDt-Planet"
  | "goBTC-ALGO"
  | "goBTC-USDC"
  | "goBTC-USDt"
  | "goBTC-goETH"
  | "goETH-ALGO"
  | "goETH-USDC"
  | "goETH-USDt"
  | "goETH-goBTC"
  | "gALGO3-ALGO"
  | "gALGO3-USDC"
  | "gALGO3-USDt"
  | "gALGO3-goBTC"
  | "gALGO3-goETH"
  | "Planet-ALGO"
  | "Planet-USDC"
  | "Planet-USDt"
  | "ALGO/gALGOPLP-ALGO"
  | "ALGO/gALGOPLP-USDC"
  | "ALGO/gALGOPLP-USDt"
  | "ALGO/USDCTMP1.1-ALGO"
  | "ALGO/USDCTMP1.1-USDC"
  | "ALGO/USDCTMP1.1-USDt"
  | "ALGO/USDCPLP-ALGO"
  | "ALGO/USDCPLP-USDC"
  | "ALGO/USDCPLP-USDt"
  | "USDC/USDtTMP1.1-ALGO"
  | "USDC/USDtTMP1.1-USDC"
  | "USDC/USDtTMP1.1-USDt"
  | "ALGO/gALGO3PLP-ALGO"
  | "ALGO/gALGO3PLP-USDC"
  | "ALGO/gALGO3PLP-USDt"
  | "ALGO/gALGO3TMP1.1-ALGO"
  | "ALGO/gALGO3TMP1.1-USDC"
  | "ALGO/gALGO3TMP1.1-USDt"
  | "USDC/gALGOTMP1.1-ALGO"
  | "USDC/gALGOTMP1.1-USDC"
  | "USDC/gALGOTMP1.1-USDt"
  | "USDC/USDtPLP-ALGO"
  | "USDC/USDtPLP-USDC"
  | "USDC/USDtPLP-USDt"
  | "goBTC/gALGOPLP-ALGO"
  | "goBTC/gALGOPLP-USDC"
  | "goBTC/gALGOPLP-USDt"
  | "goBTC/gALGOPLP-goBTC"
  | "goBTC/gALGOPLP-goETH"
  | "goETH/gALGOPLP-ALGO"
  | "goETH/gALGOPLP-USDC"
  | "goETH/gALGOPLP-USDt"
  | "goETH/gALGOPLP-goBTC"
  | "goETH/gALGOPLP-goETH";
const MainnetTokenPairs: Record<MainnetTokenPairKey, TokenPair> = {
  "ALGO-USDC": {
    appId: 686541542,
    collateralPool: MainnetPools.ALGO,
    borrowPool: MainnetPools.USDC,
    linkAddr: "XMW3WFSMMHV54FAP5ROYPB6LUDBUAKSQBZVI2PIX6OR3NWQWBXKUW7KBGY",
  },
  "ALGO-USDt": {
    appId: 686556017,
    collateralPool: MainnetPools.ALGO,
    borrowPool: MainnetPools.USDt,
    linkAddr: "F273Q7I2CY76UH6A5PKFSCDM7DMYPY3SZ3DMAWVGOWAQKZQZOZFCSNVUU4",
  },
  "ALGO-goBTC": {
    appId: 686565241,
    collateralPool: MainnetPools.ALGO,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "JFITNNIUGBIIXHDDHV63CRNA5XGJICY6ILKL3RUYIBSLBTCY6B3MNC3ASE",
  },
  "ALGO-goETH": {
    appId: 695914630,
    collateralPool: MainnetPools.ALGO,
    borrowPool: MainnetPools.goETH,
    linkAddr: "QMY5HJGXE6SGBHBNTPCPMZORI2VBPA43GYEIQARH52X4QJYWUWE4GTTFKQ",
  },
  "ALGO-Planet": {
    appId: 751337142,
    collateralPool: MainnetPools.ALGO,
    borrowPool: MainnetPools.Planet,
    linkAddr: "ZVLQM6UCBPA22HAQ4K3P5CSM5WHU6ADRERXEQBCPQF2VLSDB7O7PIDD6SM",
  },
  "gALGO-ALGO": {
    appId: 794069724,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "QBYE6JFDZHZFNMC2PEPBVSW36XASEBNVSNVZ65YFPFFHIKJFUFSGBQ5BM4",
  },
  "gALGO-USDC": {
    appId: 794073216,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.USDC,
    linkAddr: "OVQYFHG7P5ZCVO5E65VJWIZ3CAPXP2C6JEMN4YBQVJV2W2BSKIOAXJPI64",
  },
  "gALGO-USDt": {
    appId: 794075692,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.USDt,
    linkAddr: "OQJ7WB5DKEB75PSSCWTHKG5PWWA34FXKHB2JSS6QMORJ5MDUGBZOBAMXJ4",
  },
  "gALGO-goBTC": {
    appId: 794078346,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "KZGZPQPC5IMJLW2SEZFQNV6XD3KYVTDBA7JBU3H5OZZ7SYLDDJLZCPJKWU",
  },
  "gALGO-goETH": {
    appId: 794079547,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.goETH,
    linkAddr: "F247PBG5FMJKU4SVX5YRDK7L42C3TP27XD5YMQ5OIAJCUFAWUR2LERROY4",
  },
  "gALGO-Planet": {
    appId: 794083828,
    collateralPool: MainnetPools.gALGO,
    borrowPool: MainnetPools.Planet,
    linkAddr: "LJBD5SXBTVPR2CJ57QADDCTQOPENUSYYTMTFSNBIQETNEHX4H654AONDVA",
  },
  "USDC-ALGO": {
    appId: 686544126,
    collateralPool: MainnetPools.USDC,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "XJWPG5IIJB6ZFYUJHHJO2C4RGJNWVK6N2MND5A2R7HBMK2BMOAVMT5FM74",
  },
  "USDC-USDt": {
    appId: 686571823,
    collateralPool: MainnetPools.USDC,
    borrowPool: MainnetPools.USDt,
    linkAddr: "6TFJXHX6YZ3WI2ODB7GB6W6763VBZW65EQ6XAC7DMFUFIBKBXYNXHSJUTA",
  },
  "USDC-goBTC": {
    appId: 686577278,
    collateralPool: MainnetPools.USDC,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "XR3Z56543O2XQE7FLFKTOJ52XNFXBSUPQZ6TFCZGNWIWCB54VKLKDATUTI",
  },
  "USDC-goETH": {
    appId: 695921655,
    collateralPool: MainnetPools.USDC,
    borrowPool: MainnetPools.goETH,
    linkAddr: "FDVL4R3MFMX27UPPJYATPZVJUGSI6BXAIXWMWQPNYDMUJSZTLJB4EG73ZY",
  },
  "USDC-Planet": {
    appId: 751338512,
    collateralPool: MainnetPools.USDC,
    borrowPool: MainnetPools.Planet,
    linkAddr: "KJMZPDLXASMP4QUM765K2QEJXCVKQNUSJSJE73JTCVB3TH5CK6NQJRBNFU",
  },
  "USDt-ALGO": {
    appId: 686556570,
    collateralPool: MainnetPools.USDt,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "JOAQ6M3COSVOYXGQ7YDTIRNI6YIOLIXOC72XCWA7MISVAYH4KRCCEGWT2E",
  },
  "USDt-USDC": {
    appId: 686572578,
    collateralPool: MainnetPools.USDt,
    borrowPool: MainnetPools.USDC,
    linkAddr: "RFMBPBC4PUVYK26QWWYKS6DPQQLFVAKBZZYU6QYJXBRQS2PT2LFZSP36RU",
  },
  "USDt-goBTC": {
    appId: 686616139,
    collateralPool: MainnetPools.USDt,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "KFYW365ROG2MWWH3OHKCNOTAEXND4P5DXBIMTDQUUG5IHRVXB3AB6SEOWY",
  },
  "USDt-goETH": {
    appId: 695926008,
    collateralPool: MainnetPools.USDt,
    borrowPool: MainnetPools.goETH,
    linkAddr: "ZUWFYK4OT2NRJC4KRPXPY65XIK2KUE4F5WYL3FORXOE3YTJKN6IV6VW5CM",
  },
  "USDt-Planet": {
    appId: 751339316,
    collateralPool: MainnetPools.USDt,
    borrowPool: MainnetPools.Planet,
    linkAddr: "RM6T7DXISKWITNCRF42PV57L4MSQQELT5YU4ELQW5XAGNNG6NKZ3UY6E2A",
  },
  "goBTC-ALGO": {
    appId: 686565943,
    collateralPool: MainnetPools.goBTC,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "HSLL3IO44B276TZQGVA6ZGTWT7YSADN7IZF5VYRN6KNJSU6CLU67BRJIXY",
  },
  "goBTC-USDC": {
    appId: 686578002,
    collateralPool: MainnetPools.goBTC,
    borrowPool: MainnetPools.USDC,
    linkAddr: "6JE72NWDM3IZGDLJOBSMAHY6EGYAQR2SWRRYORGUQQGSX4SOOLB37QX634",
  },
  "goBTC-USDt": {
    appId: 686616739,
    collateralPool: MainnetPools.goBTC,
    borrowPool: MainnetPools.USDt,
    linkAddr: "EFD5ENIIDLOMXKG4HMNPMODORVZ625NCO5U6B66LHH26FI3HSNCWZ6NFYA",
  },
  "goBTC-goETH": {
    appId: 695954993,
    collateralPool: MainnetPools.goBTC,
    borrowPool: MainnetPools.goETH,
    linkAddr: "SI4H6QZ66XGVHYNDWTES264N4ABCKPEPVFPMQ4OSIBQ33QDIXI5ZNWZIKQ",
  },
  "goETH-ALGO": {
    appId: 695912626,
    collateralPool: MainnetPools.goETH,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "GTZOCCCQ2QLR72GNLDJ2EPVI54QGOQ2LIQFYQ7THMJT7BL3NOXX5QNZ364",
  },
  "goETH-USDC": {
    appId: 695919152,
    collateralPool: MainnetPools.goETH,
    borrowPool: MainnetPools.USDC,
    linkAddr: "E3AO4MSTLD47USAMF7Z22ZHCL33HDNJ7URBYQEAPYJSLKOE2EYS6ZEA7UI",
  },
  "goETH-USDt": {
    appId: 695924150,
    collateralPool: MainnetPools.goETH,
    borrowPool: MainnetPools.USDt,
    linkAddr: "OBXUXUQOA46SDGHYRYOREPRYMGZ4FLHBWHUMRKU5MY7LJ4VUS6X4TLO6PI",
  },
  "goETH-goBTC": {
    appId: 695953758,
    collateralPool: MainnetPools.goETH,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "7MON4QTA2MZZFTRNE2CSNZAPF4NEGACR73T3DNAYW42OQIKNZSOUZL4WFI",
  },
  "gALGO3-ALGO": {
    appId: 694502241,
    collateralPool: MainnetPools.gALGO3,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "DXQV2ITJ72XJBQYDWW7BE7P32TDDT4I4SVMPO5VKCPPBIB55AG5LF2WZRA",
  },
  "gALGO3-USDC": {
    appId: 694505855,
    collateralPool: MainnetPools.gALGO3,
    borrowPool: MainnetPools.USDC,
    linkAddr: "CX6DDNB3KP2QN5SCJRAMRMTSIEIFLYSZ3AP4DQCQDODHKVECE6JXRGKXPY",
  },
  "gALGO3-USDt": {
    appId: 694509879,
    collateralPool: MainnetPools.gALGO3,
    borrowPool: MainnetPools.USDt,
    linkAddr: "HLNGVZRKGWQOAWVUZESZQ7ELRMDHDY4IAP76KSLBNWVMPZXFVCLBMISMW4",
  },
  "gALGO3-goBTC": {
    appId: 694511513,
    collateralPool: MainnetPools.gALGO3,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "5A7S6HPCSRQXFFV4QXP2MX4E4FMLWU2SAQ6BFS4SCAASZEO24J7HIH4VJI",
  },
  "gALGO3-goETH": {
    appId: 695956892,
    collateralPool: MainnetPools.gALGO3,
    borrowPool: MainnetPools.goETH,
    linkAddr: "2BHUQR72HSDUSUHHNZ4HSW52XG6TFI6GTOOMLCJIYRWG4DCD45OMMDK454",
  },
  "Planet-ALGO": {
    appId: 751335351,
    collateralPool: MainnetPools.Planet,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "SXIJ5JVLGDO2IVT4EXRASANAA3NJIES4ZCFB2ZCOIXS6KDWMZ7CNOFUEJQ",
  },
  "Planet-USDC": {
    appId: 751340276,
    collateralPool: MainnetPools.Planet,
    borrowPool: MainnetPools.USDC,
    linkAddr: "V3F5GITUEDNKRHLSCMJCABHJAZUZ5TAKT4R6YMWSH54O3MRRXAK3O73Y3U",
  },
  "Planet-USDt": {
    appId: 751341083,
    collateralPool: MainnetPools.Planet,
    borrowPool: MainnetPools.USDt,
    linkAddr: "23RALSVIDE7L2FI5HFMN7PHHUQM45H3SJ5V3BMFTBH2UKRAGBWBTLBVAJM",
  },
  "ALGO/gALGOPLP-ALGO": {
    appId: 805859260,
    collateralPool: MainnetPools.ALGOgALGOPLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "GD24GO3I32SL3MO32TBSRDVCNRAM5U2SH2YXOSU35X2BTHGQU6D4TOJO7A",
  },
  "ALGO/gALGOPLP-USDC": {
    appId: 805860282,
    collateralPool: MainnetPools.ALGOgALGOPLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "O6W6BSEXSKBFS2PMYKVWVNFEDQVGQG63TJTL6IA3XQ6GLFQWBCFV4USFZY",
  },
  "ALGO/gALGOPLP-USDt": {
    appId: 805861171,
    collateralPool: MainnetPools.ALGOgALGOPLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "ETILDYA4TQHY5IMRLXKJILKKWQEUUEIYYBYWV5OJ6NJ6BSYHYJ4R7F6PWE",
  },
  "ALGO/USDCTMP1.1-ALGO": {
    appId: 747248418,
    collateralPool: MainnetPools.ALGOUSDCTMP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "VPIW3MS55ATYSH4FYBKJ7WFG7DJWBF3M4PG4ENWJMUSUCX4VGV7LKTEGRQ",
  },
  "ALGO/USDCTMP1.1-USDC": {
    appId: 747252072,
    collateralPool: MainnetPools.ALGOUSDCTMP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "DU2NAZ5AYER7RMM6ZDVT2Y7ZCUKRXGI75TFFYAGLQSLOZCTNRABGEMJ6OE",
  },
  "ALGO/USDCTMP1.1-USDt": {
    appId: 747255122,
    collateralPool: MainnetPools.ALGOUSDCTMP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "OBGEJVMCGPD3XT2D2GCMWF3PDOKJI5JC3V5DZMM52A6EGATIR7T32WVT2M",
  },
  "ALGO/USDCPLP-ALGO": {
    appId: 747250540,
    collateralPool: MainnetPools.ALGOUSDCPLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "23TZOQTXXH6LNO6A4MLCPAYSGXWX4HTXYXMFKQLAFES65SKDV7GH4XD6BI",
  },
  "ALGO/USDCPLP-USDC": {
    appId: 747253010,
    collateralPool: MainnetPools.ALGOUSDCPLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "5HSMXYNU7HGLFYI3UEQ37K6U3WGNGFB6S26VRVSM4UB6HH2GGBJ4FHTCUM",
  },
  "ALGO/USDCPLP-USDt": {
    appId: 747254560,
    collateralPool: MainnetPools.ALGOUSDCPLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "QEICZ76HF7MRJ37N52YPWSYAIGYFRL3VNEHKEQB7L4OXDH6EB7BZZQDRGM",
  },
  "ALGO/gALGO3TMP1.1-ALGO": {
    appId: 743705087,
    collateralPool: MainnetPools.ALGOgALGO3TMP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "TBXOH44M3PQ32Y7OXR26LJVNAMGDGKH5HKYIWLL3GGXE2POIRAY7PYMIT4",
  },
  "ALGO/gALGO3TMP1.1-USDC": {
    appId: 743710958,
    collateralPool: MainnetPools.ALGOgALGO3TMP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "FPUTNTOOJQY4V4XDEPYQEMMDKFW3RNLYELVJQIGDUQQXJXEBPB6CXKMMCY",
  },
  "ALGO/gALGO3TMP1.1-USDt": {
    appId: 743712504,
    collateralPool: MainnetPools.ALGOgALGO3TMP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "NPPUWS7IBRKY46HKN6VVISBQKDTUO5UUOIAU7LBYQTWW3SUXXVCPTQVR6I",
  },
  "ALGO/gALGO3PLP-ALGO": {
    appId: 743708357,
    collateralPool: MainnetPools.ALGOgALGO3PLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "P3VIDBKNCOQPZBRD4LJ4MTOUXVDDVXAUPECEYZX4M6Q6A3AK6WW7R4NYH4",
  },
  "ALGO/gALGO3PLP-USDC": {
    appId: 743709872,
    collateralPool: MainnetPools.ALGOgALGO3PLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "SKGZLWCBIGN2LA7JDSATTARDXIDTDYUAXJBLCP3JXUDJVNP4UZXX4OSPC4",
  },
  "ALGO/gALGO3PLP-USDt": {
    appId: 743713705,
    collateralPool: MainnetPools.ALGOgALGO3PLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "OUEZFEA2JOMAH4KGO35W7HOW4IWNSVBEUCYVDJZPNIWRTJQ3VFEXZR24YI",
  },
  "USDC/gALGOTMP1.1-ALGO": {
    appId: 805854329,
    collateralPool: MainnetPools.USDCgALGOTMP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "GMU7AZCGANBMC7ZCRVJ4XHQ4B5RUNVGQJGR7LCRWMA7JMLDDKNBLCCJQUQ",
  },
  "USDC/gALGOTMP1.1-USDC": {
    appId: 805856415,
    collateralPool: MainnetPools.USDCgALGOTMP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "PKCXEKV6BZKIUSEGWT32OOKLFS2VVCNSQA3HRMA4USAD2JBEZRGKKOVEOY",
  },
  "USDC/gALGOTMP1.1-USDt": {
    appId: 805857470,
    collateralPool: MainnetPools.USDCgALGOTMP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "H4OZABT6K34G7USHAMZ362YOHU7NA4QEPC3ZS6IM57RF4RH6NLICWSDVNY",
  },
  "USDC/USDtTMP1.1-ALGO": {
    appId: 776214410,
    collateralPool: MainnetPools.USDCUSDtTMP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "XVC7TV7Z3DDTV23RXSJ6VQQDTG7UICCFNLKLHRQPIES77P6A4R5363QOHE",
  },
  "USDC/USDtTMP1.1-USDC": {
    appId: 776217914,
    collateralPool: MainnetPools.USDCUSDtTMP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "VNHEKJ7DZHQTIO5IH3RQSJHIPFXK6GILW3JAAMZJKPSR2YUWVJUZ7R4JKM",
  },
  "USDC/USDtTMP1.1-USDt": {
    appId: 776223117,
    collateralPool: MainnetPools.USDCUSDtTMP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "7HGL4E6M7SJAKYJA2ADQ3FEY3ZQRULMSDDCWMY4P2OYREOF3H2VUIMLYHI",
  },
  "USDC/USDtPLP-ALGO": {
    appId: 776215541,
    collateralPool: MainnetPools.USDCUSDtPLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "TGTSN7VPEK426RUM2GWTDSJGQUGLITIF5PDUZQQ4BO2N7LQKZFPGDGTKDY",
  },
  "USDC/USDtPLP-USDC": {
    appId: 776219872,
    collateralPool: MainnetPools.USDCUSDtPLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "WKPHMSBT4NO6TAHCXYTBF54WEMMJUTR3VAN7ZX27Y6B6FUIFQDO4J2NXT4",
  },
  "USDC/USDtPLP-USDt": {
    appId: 776224055,
    collateralPool: MainnetPools.USDCUSDtPLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "D7DSTJGLQXBHRSS5W5XT353ALXUO6LHFNGXQXX3L7OXK6A3HL7JZSPATMQ",
  },
  "goBTC/gALGOPLP-ALGO": {
    appId: 818040031,
    collateralPool: MainnetPools.goBTCgALGOPLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "ERQN7QAXSBLHHPBE7DE3KTFZSQRKLTRCCV4BIXLRS3YJ5A77TPGNLTCUWI",
  },
  "goBTC/gALGOPLP-USDC": {
    appId: 818042616,
    collateralPool: MainnetPools.goBTCgALGOPLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "A7E237D3MEFMSCTUH7GDYJRLX2RR3K7UFMPVETSVTEYSC2EVULJPYYARNA",
  },
  "goBTC/gALGOPLP-USDt": {
    appId: 818043183,
    collateralPool: MainnetPools.goBTCgALGOPLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "IGH63FNVPPZPLXGJSL4A4ZQBIYCHM3V2CAOWPO7524XCAEIJDKS5EAE3OM",
  },
  "goBTC/gALGOPLP-goBTC": {
    appId: 818056982,
    collateralPool: MainnetPools.goBTCgALGOPLP,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "RLLNTANPDWBYJPM7VF7XXCY2FXDNTMKJSTZIPQLRDNWCQAAEGISMIYJM5M",
  },
  "goBTC/gALGOPLP-goETH": {
    appId: 818060413,
    collateralPool: MainnetPools.goBTCgALGOPLP,
    borrowPool: MainnetPools.goETH,
    linkAddr: "FVVLBGGK7PTDXGZZZCM2DEBQ575QUWKHNZWIJBSYJFF76BKWBDMODIHCYU",
  },
  "goETH/gALGOPLP-ALGO": {
    appId: 818041145,
    collateralPool: MainnetPools.goETHgALGOPLP,
    borrowPool: MainnetPools.ALGO,
    linkAddr: "HCRY6IF2LLH7CYZDDD3PVUHTSXJDSOYIETSK3EROKHAZDH4QHAON3N45VQ",
  },
  "goETH/gALGOPLP-USDC": {
    appId: 818045535,
    collateralPool: MainnetPools.goETHgALGOPLP,
    borrowPool: MainnetPools.USDC,
    linkAddr: "DKUYMUWGF54SL74B2XYDIIEANNNNBVBNAAZEG7PVRNYBNO22U352N6ZCKY",
  },
  "goETH/gALGOPLP-USDt": {
    appId: 818044129,
    collateralPool: MainnetPools.goETHgALGOPLP,
    borrowPool: MainnetPools.USDt,
    linkAddr: "YCAJAFX53IA7JEUYYCU2ZLSJQO65WOTR5DY7ZYQ4VNCOKHXXPTWXHADENE",
  },
  "goETH/gALGOPLP-goBTC": {
    appId: 818059371,
    collateralPool: MainnetPools.goETHgALGOPLP,
    borrowPool: MainnetPools.goBTC,
    linkAddr: "FFMRRH6BGSSQS55DH6RU6HN4YHUH4NGJGVCM2CEU6IVAPYS4PXXZZRZMWU",
  },
  "goETH/gALGOPLP-goETH": {
    appId: 818061261,
    collateralPool: MainnetPools.goETHgALGOPLP,
    borrowPool: MainnetPools.goETH,
    linkAddr: "BHBPNPF2PKUFGC7I5PZE57IAUC4XRZVFI4WINJ46UR6XC2ORTMC3NVU7KU",
  },
};

const MainnetOracle: Oracle = {
  oracle1AppId: 1040271396,
  oracle2AppId: 971323141,
  oracleAdapterAppId: 751277258,
  tinymanValidatorAppId: 552635992,
  decimals: 14,
};

const MainnetReserveAddress: ReserveAddress = "XQEOICBG6FMMBBWTBOWCMVJX5IQEDUSBF6L4MTSIALWRWODSOV2THX6GTU";

export { MainnetPoolKey, MainnetPools, MainnetTokenPairKey, MainnetTokenPairs, MainnetOracle, MainnetReserveAddress };
