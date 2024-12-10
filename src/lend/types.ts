enum LPTokenProvider {
  TINYMAN = 0,
  PACT = 1,
}

interface BaseLPToken {
  provider: LPTokenProvider;
  lpAssetId: number;
  asset0Id: number;
  asset1Id: number;
}

interface TinymanLPToken extends BaseLPToken {
  provider: LPTokenProvider.TINYMAN;
  lpPoolAddress: string;
}

interface PactLPToken extends BaseLPToken {
  provider: LPTokenProvider.PACT;
  lpPoolAppId: number;
}

type LPToken = TinymanLPToken | PactLPToken;

interface BaseLendingPool extends BaseLPToken {
  pool0AppId: number;
  pool1AppId: number;
  feeScale: bigint;
}

interface PactLendingPool extends BaseLendingPool {
  provider: LPTokenProvider.PACT;
  lpPoolAppId: number;
}

interface TinymanLendingPool extends BaseLendingPool {
  provider: LPTokenProvider.TINYMAN;
  lpPoolAppAddress: string;
}

type LendingPool = PactLendingPool | TinymanLendingPool;

interface BaseLendingPoolInfo {
  currentRound?: number;
  fAsset0Supply: bigint;
  fAsset1Supply: bigint;
  liquidityTokenCirculatingSupply: bigint;
  fee: bigint;
  swapFeeInterestRate: bigint; // 16 d.p.
  swapFeeInterestYield: bigint; // 16 d.p.
  asset0DepositInterestRate: bigint; // 16 d.p.
  asset0DepositInterestYield: bigint; // approximation 16 d.p.
  asset1DepositInterestRate: bigint; // 16 d.p.
  asset1DepositInterestYield: bigint; // approximation 16 d.p.
  tvlUsd: number;
}

type PactLendingPoolInfo = BaseLendingPoolInfo;
interface TinymanLendingPoolInfo extends BaseLendingPoolInfo {
  farmInterestYield: bigint; // 16 d.p.
}

interface PoolManagerInfo {
  currentRound?: number;
  pools: Partial<
    Record<
      number,
      {
        // poolAppId -> ...
        variableBorrowInterestRate: bigint; // 16 d.p.
        variableBorrowInterestYield: bigint; // approximation 16 d.p.
        variableBorrowInterestIndex: bigint; // 14 d.p.
        depositInterestRate: bigint; // 16 d.p.
        depositInterestYield: bigint; // approximation 16 d.p.
        depositInterestIndex: bigint; // 14 d.p.
        metadata: {
          oldVariableBorrowInterestIndex: bigint; // 14 d.p.
          oldDepositInterestIndex: bigint; // 14 d.p.
          oldTimestamp: bigint;
        };
      }
    >
  >;
}

interface BasePool {
  appId: number;
  assetId: number;
  fAssetId: number;
  frAssetId: number;
  assetDecimals: number;
  poolManagerIndex: number;
  loans: Partial<Record<number, bigint>>; // loanAppId -> loanIndex
}

interface LPTokenPool extends BasePool {
  lpToken: LPToken;
}

type Pool = BasePool | LPTokenPool;

interface PoolInfo {
  currentRound?: number;
  variableBorrow: {
    vr0: bigint; // 16 d.p.
    vr1: bigint; // 16 d.p.
    vr2: bigint; // 16 d.p.
    totalVariableBorrowAmount: bigint;
    variableBorrowInterestRate: bigint; // 16 d.p.
    variableBorrowInterestYield: bigint; // approximation 16 d.p.
    variableBorrowInterestIndex: bigint; // 14 d.p.
  };
  stableBorrow: {
    sr0: bigint; // 16 d.p.
    sr1: bigint; // 16 d.p.
    sr2: bigint; // 16 d.p.
    sr3: bigint; // 16 d.p.
    optimalStableToTotalDebtRatio: bigint; // 16 d.p.
    rebalanceUpUtilisationRatio: bigint; // 16 d.p.
    rebalanceUpDepositInterestRate: bigint; // 16 d.p.
    rebalanceDownDelta: bigint; // 16 d.p.
    totalStableBorrowAmount: bigint;
    stableBorrowInterestRate: bigint; // 16 d.p.
    stableBorrowInterestYield: bigint; // approximation 16 d.p.
    overallStableBorrowInterestAmount: bigint; // 16 d.p.
  };
  interest: {
    retentionRate: bigint; // 16 d.p.
    flashLoanFee: bigint; // 16 d.p.
    optimalUtilisationRatio: bigint; // 16 d.p.
    totalDeposits: bigint;
    depositInterestRate: bigint; // 16 d.p.
    depositInterestYield: bigint; // approximation 16 d.p.
    depositInterestIndex: bigint; // 14 d.p.
    latestUpdate: bigint;
  };
  caps: {
    borrowCap: bigint; // $ value
    stableBorrowPercentageCap: bigint; // 16 d.p.
  };
  config: {
    depreciated: boolean;
    rewardsPaused: boolean;
    stableBorrowSupported: boolean;
    flashLoanSupported: boolean;
  };
}

type UserDepositInfo = {
  currentRound?: number;
  escrowAddress: string;
  holdings: {
    fAssetId: number;
    fAssetBalance: bigint;
  }[];
};

type UserDepositFullInfo = {
  currentRound?: number;
  escrowAddress: string;
  holdings: {
    fAssetId: number;
    fAssetBalance: bigint;
    poolAppId: number;
    assetId: number;
    assetPrice: bigint; // 14 d.p.
    assetBalance: bigint;
    balanceValue: bigint; // in $, 4 d.p.
    interestRate: bigint; // 16 d.p.
    interestYield: bigint; // approximation 16 d.p.
  }[];
};

interface DepositStakingInfo {
  currentRound?: number;
  stakingPrograms: {
    poolAppId: number;
    totalStaked: bigint;
    minTotalStaked: bigint;
    stakeIndex: number;
    rewards: {
      rewardAssetId: number;
      endTimestamp: bigint;
      rewardRate: bigint; // 10 d.p.
      rewardPerToken: bigint; // 10 d.p.
    }[];
  }[];
}

interface DepositStakingProgramInfo {
  poolAppId: number;
  stakeIndex: number;
  fAssetId: number;
  fAssetTotalStakedAmount: bigint;
  assetId: number;
  assetPrice: bigint; // 14 d.p.
  assetTotalStakedAmount: bigint;
  totalStakedAmountValue: bigint; // in $, 4 d.p.
  depositInterestRate: bigint; // 16 d.p.
  depositInterestYield: bigint; // approximation 16 d.p.
  rewards: {
    rewardAssetId: number;
    endTimestamp: bigint;
    rewardRate: bigint; // 10 d.p.
    rewardPerToken: bigint; // 10 d.p.
    rewardAssetPrice: bigint; // 14 d.p.
    rewardInterestRate: bigint; // 0 if past reward end timestamp, 16 d.p.
  }[];
}

interface UserDepositStakingLocalState {
  currentRound?: number;
  userAddress: string;
  escrowAddress: string;
  optedIntoAssets: Set<number>;
  stakedAmounts: bigint[];
  rewardPerTokens: bigint[]; // 10 d.p.
  unclaimedRewards: bigint[];
}

interface UserDepositStakingProgramInfo {
  poolAppId: number;
  fAssetId: number;
  fAssetStakedAmount: bigint;
  assetId: number;
  assetPrice: bigint; // 14 d.p.
  assetStakedAmount: bigint;
  stakedAmountValue: bigint; // in $, 4 d.p.
  depositInterestRate: bigint; // 16 d.p.
  depositInterestYield: bigint; // approximation 16 d.p.
  rewards: {
    rewardAssetId: number;
    endTimestamp: bigint;
    rewardAssetPrice: bigint; // 14 d.p.
    rewardInterestRate: bigint; // 0 if past reward end timestamp, 16 d.p.
    unclaimedReward: bigint;
    unclaimedRewardValue: bigint; // in $, 4 d.p.
  }[];
}

interface UserDepositStakingInfo {
  currentRound?: number;
  userAddress: string;
  escrowAddress: string;
  optedIntoAssets: Set<number>;
  stakingPrograms: UserDepositStakingProgramInfo[];
}

interface PoolLoanInfo {
  poolAppId: number;
  assetId: number;
  collateralCap: bigint; // $ value
  collateralUsed: bigint;
  collateralFactor: bigint; // 4 d.p.
  borrowFactor: bigint; // 4 d.p.
  liquidationMax: bigint; // 4 d.p.
  liquidationBonus: bigint; // 4 d.p.
  liquidationFee: bigint; // 4 d.p.
}

enum LoanType {
  "GENERAL" = "GENERAL",
  "STABLECOIN_EFFICIENCY" = "STABLECOIN_EFFICIENCY",
  "ALGO_EFFICIENCY" = "ALGO_EFFICIENCY",
  "ULTRASWAP_UP" = "ULTRASWAP_UP",
  "ULTRASWAP_DOWN" = "ULTRASWAP_DOWN",
}

interface LoanInfo {
  currentRound?: number;
  canSwapCollateral: boolean;
  pools: Partial<Record<number, PoolLoanInfo>>; // poolAppId -> PoolLoanInfo
}

interface LoanLocalState {
  currentRound?: number;
  userAddress: string;
  escrowAddress: string;
  collaterals: {
    poolAppId: number;
    fAssetBalance: bigint;
  }[];
  borrows: {
    poolAppId: number;
    borrowedAmount: bigint;
    borrowBalance: bigint;
    latestBorrowInterestIndex: bigint; // 14 d.p.
    stableBorrowInterestRate: bigint; // 16 d.p.
    latestStableChange: bigint;
  }[];
}

interface UserLoanInfoCollateral {
  poolAppId: number;
  assetId: number;
  assetPrice: bigint; // 14 d.p.
  collateralFactor: bigint; // 4 d.p.
  depositInterestIndex: bigint; // 14 d.p.
  fAssetBalance: bigint;
  assetBalance: bigint;
  balanceValue: bigint; // in $, 4 d.p.
  effectiveBalanceValue: bigint; // in $, 4 d.p.
  interestRate: bigint; // 16 d.p.
  interestYield: bigint; // approximation 16 d.p.
}

interface UserLoanInfoBorrow {
  poolAppId: number;
  assetId: number;
  assetPrice: bigint; // 14 d.p.
  isStable: boolean;
  borrowFactor: bigint; // 4 d.p.
  borrowedAmount: bigint;
  borrowedAmountValue: bigint; // in $, 4 d.p.
  borrowBalance: bigint;
  borrowBalanceValue: bigint; // in $, 4 d.p.
  effectiveBorrowBalanceValue: bigint; // in $, 4 d.p.
  accruedInterest: bigint;
  accruedInterestValue: bigint; // in $, 4 d.p.
  interestRate: bigint; // 16 d.p.
  interestYield: bigint; // approximation 16 d.p.
}

interface UserLoanInfo {
  currentRound?: number;
  userAddress: string;
  escrowAddress: string;
  collaterals: UserLoanInfoCollateral[];
  borrows: UserLoanInfoBorrow[];
  netRate: bigint; // 16 d.p. - negative indicates losing more on borrows than gaining on collaterals
  netYield: bigint; // 16 d.p. - negative indicates losing more on borrows than gaining on collaterals
  totalCollateralBalanceValue: bigint; // in $, 4 d.p.
  totalBorrowedAmountValue: bigint; // in $, 4 d.p.
  totalBorrowBalanceValue: bigint; // in $, 4 d.p.
  totalEffectiveCollateralBalanceValue: bigint; // in $, 4 d.p. - used to determine if liquidatable
  totalEffectiveBorrowBalanceValue: bigint; // in $, 4 d.p. - used to determine if liquidatable
  loanToValueRatio: bigint; // 4 d.p.
  borrowUtilisationRatio: bigint; // 4 d.p.
  liquidationMargin: bigint; // 4 d.p.
}

interface Oracle {
  oracle0AppId: number;
  oracle1AppId?: number;
  lpTokenOracle?: {
    appId: number;
    tinymanValidatorAppId: number;
  };
  oracleAdapterAppId: number;
  decimals: number;
}

interface OraclePrice {
  price: bigint; // price in USD for amount 1 of asset in lowest denomination
  timestamp: bigint;
}

interface OraclePrices {
  currentRound?: number;
  prices: Partial<Record<number, OraclePrice>>; // assetId -> OraclePrice
}

interface OpUp {
  callerAppId: number;
  baseAppId: number;
}

type ReserveAddress = string;

export { LPTokenProvider, LoanType };
export type {
  TinymanLPToken,
  PactLPToken,
  LPToken,
  PactLendingPool,
  TinymanLendingPool,
  LendingPool,
  BaseLendingPoolInfo,
  PactLendingPoolInfo,
  TinymanLendingPoolInfo,
  PoolManagerInfo,
  BasePool,
  LPTokenPool,
  Pool,
  PoolInfo,
  UserDepositInfo,
  UserDepositFullInfo,
  DepositStakingInfo,
  DepositStakingProgramInfo,
  UserDepositStakingLocalState,
  UserDepositStakingProgramInfo,
  UserDepositStakingInfo,
  PoolLoanInfo,
  LoanLocalState,
  LoanInfo,
  UserLoanInfoCollateral,
  UserLoanInfoBorrow,
  UserLoanInfo,
  Oracle,
  OraclePrice,
  OraclePrices,
  OpUp,
  ReserveAddress,
};
