import type { Indexer } from "algosdk";
import { encodeAddress, getApplicationAddress } from "algosdk";
import type { TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";
import { compoundEverySecond, maximum, mulScale, ONE_10_DP, ONE_16_DP, ONE_4_DP, SECONDS_IN_YEAR } from "../math-lib";
import { enc, fromIntToByteHex, getParsedValueFromState, parseUint64s, unixTime } from "../utils";
import {
  calcBorrowAssetLoanValue,
  calcBorrowBalance,
  calcBorrowInterestIndex,
  calcBorrowUtilisationRatio,
  calcCollateralAssetLoanValue,
  calcLiquidationMargin,
  calcLTVRatio,
  calcWithdrawReturn,
} from "./formulae";
import type {
  DepositStakingInfo,
  DepositStakingProgramInfo,
  LoanInfo,
  LoanLocalState,
  OraclePrices,
  Pool,
  PoolManagerInfo,
  UserDepositStakingInfo,
  UserDepositStakingLocalState,
  UserDepositStakingProgramInfo,
  UserLoanInfo,
  UserLoanInfoBorrow,
  UserLoanInfoCollateral,
} from "./types";

export async function getEscrows(
  indexerClient: Indexer,
  userAddr: string,
  appId: number,
  addNotePrefix: string,
  removeNotePrefix: string,
): Promise<Set<string>> {
  const escrows: Set<string> = new Set();
  const appAddress = getApplicationAddress(appId);

  const addedReq = indexerClient
    .searchForTransactions()
    .address(userAddr)
    .addressRole("sender")
    .txType("pay")
    .notePrefix(enc.encode(addNotePrefix))
    .do();
  const removedReq = indexerClient
    .searchForTransactions()
    .address(userAddr)
    .addressRole("receiver")
    .txType("pay")
    .notePrefix(enc.encode(removeNotePrefix))
    .do();

  const [added, removed] = await Promise.all([addedReq, removedReq]);

  for (const txn of added["transactions"]) {
    const receiver: string = txn["payment-transaction"]["receiver"];
    if (receiver === appAddress) {
      const note: Uint8Array = Buffer.from(txn["note"], "base64");
      const address = encodeAddress(note.slice(addNotePrefix.length));
      escrows.add(address);
    }
  }
  for (const txn of removed["transactions"]) {
    const sender: string = txn["sender"];
    escrows.delete(sender);
  }

  return escrows;
}

/**
 *
 * Derives deposit staking local state from escrow account.
 *
 * @param state - escrow account local state
 * @param depositStakingAppId - deposit staking application to query about
 * @param escrowAddr - escrow address
 * @returns UserDepositStakingLocalState user deposit staking local state
 */
export function depositStakingLocalState(
  state: TealKeyValue[],
  depositStakingAppId: number,
  escrowAddr: string,
): UserDepositStakingLocalState {
  // standard
  const userAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "ua")), "base64"));

  const stakedAmounts: bigint[] = [];
  for (let i = 0; i < 2; i++) {
    const prefix = "S".charCodeAt(0).toString(16);
    const stakeBase64Value = String(getParsedValueFromState(state, prefix + fromIntToByteHex(i), "hex"));
    const stakeValue = parseUint64s(stakeBase64Value);
    stakedAmounts.push(...stakeValue);
  }

  const rewardPerTokens: bigint[] = [];
  for (let i = 0; i < 6; i++) {
    const prefix = "R".charCodeAt(0).toString(16);
    const rewardBase64Value = String(getParsedValueFromState(state, prefix + fromIntToByteHex(i), "hex"));
    const rewardValue = parseUint64s(rewardBase64Value);
    rewardPerTokens.push(...rewardValue);
  }

  const unclaimedRewards: bigint[] = [];
  for (let i = 0; i < 6; i++) {
    const prefix = "U".charCodeAt(0).toString(16);
    const unclaimedBase64Value = String(getParsedValueFromState(state, prefix + fromIntToByteHex(i), "hex"));
    const unclaimedValue = parseUint64s(unclaimedBase64Value);
    unclaimedRewards.push(...unclaimedValue);
  }

  return {
    userAddress,
    escrowAddress: escrowAddr,
    optedIntoAssets: new Set(),
    stakedAmounts,
    rewardPerTokens,
    unclaimedRewards,
  };
}

/**
 *
 * Derives deposit staking programs info from deposit staking info.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param depositStakingInfo - deposit staking info which is returned by retrieveDepositStakingInfo function
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param pools - pools in pool manager (either MainnetPools or TestnetPools)
 * @param oraclePrices - oracle prices which is returned by getOraclePrices function
 * @returns Promise<DepositStakingProgramInfo[]> deposit staking programs info
 */
export function depositStakingProgramsInfo(
  depositStakingInfo: DepositStakingInfo,
  poolManagerInfo: PoolManagerInfo,
  pools: Record<string, Pool>,
  oraclePrices: OraclePrices,
): DepositStakingProgramInfo[] {
  const stakingPrograms: DepositStakingProgramInfo[] = [];
  const { pools: poolManagerPools } = poolManagerInfo;
  const { prices } = oraclePrices;

  for (const {
    poolAppId,
    totalStaked,
    minTotalStaked,
    rewards,
    stakeIndex,
  } of depositStakingInfo.stakingPrograms.filter(({ poolAppId }) => poolAppId !== 0)) {
    const pool = Object.entries(pools)
      .map(([, pool]) => pool)
      .find((pool) => pool.appId === poolAppId);
    const poolInfo = poolManagerPools[poolAppId];
    if (pool === undefined || poolInfo === undefined) throw Error("Could not find pool " + poolAppId);
    const { assetId, fAssetId } = pool;
    const { depositInterestIndex, depositInterestRate, depositInterestYield } = poolInfo;

    const oraclePrice = prices[assetId];
    if (oraclePrice === undefined) throw Error("Could not find asset price " + assetId);
    const { price: assetPrice } = oraclePrice;

    const fAssetTotalStakedAmount = maximum(totalStaked, minTotalStaked);
    const assetTotalStakedAmount = calcWithdrawReturn(fAssetTotalStakedAmount, depositInterestIndex);
    const totalStakedAmountValue = mulScale(assetTotalStakedAmount, assetPrice, ONE_10_DP); // 4 d.p.

    const userRewards: {
      rewardAssetId: number;
      endTimestamp: bigint;
      rewardRate: bigint;
      rewardPerToken: bigint;
      rewardAssetPrice: bigint;
      rewardInterestRate: bigint;
    }[] = [];
    for (const { rewardAssetId, endTimestamp, rewardRate, rewardPerToken } of rewards) {
      const oraclePrice = prices[rewardAssetId];
      if (oraclePrice === undefined) throw Error("Could not find asset price " + rewardAssetId);
      const { price: rewardAssetPrice } = oraclePrice;

      const stakedAmountValue = assetTotalStakedAmount * assetPrice;
      const rewardInterestRate =
        unixTime() < endTimestamp && stakedAmountValue !== BigInt(0)
          ? (rewardRate * BigInt(1e6) * rewardAssetPrice * SECONDS_IN_YEAR) / stakedAmountValue
          : BigInt(0);

      userRewards.push({
        rewardAssetId,
        endTimestamp,
        rewardAssetPrice,
        rewardInterestRate,
        rewardRate,
        rewardPerToken,
      });
    }

    stakingPrograms.push({
      poolAppId,
      stakeIndex,
      fAssetId,
      fAssetTotalStakedAmount,
      assetId,
      assetPrice,
      assetTotalStakedAmount,
      totalStakedAmountValue,
      depositInterestRate,
      depositInterestYield,
      rewards: userRewards,
    });
  }

  return stakingPrograms;
}

/**
 *
 * Derives user loan info from escrow account.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param localState - local state of escrow account
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function*
 * @param depositStakingProgramsInfo - deposit staking programs info which is returned by depositStakingProgramsInfo function
 * @returns Promise<UserDepositStakingInfo> user loans info
 */
export function userDepositStakingInfo(
  localState: UserDepositStakingLocalState,
  poolManagerInfo: PoolManagerInfo,
  depositStakingProgramsInfo: DepositStakingProgramInfo[],
): UserDepositStakingInfo {
  const stakingPrograms: UserDepositStakingProgramInfo[] = [];
  const { pools: poolManagerPools } = poolManagerInfo;

  for (const [stakeIndex, stakingProgram] of depositStakingProgramsInfo.entries()) {
    const { poolAppId, fAssetId, assetId, assetPrice, depositInterestRate, depositInterestYield, rewards } =
      stakingProgram;

    const poolInfo = poolManagerPools[poolAppId];
    if (poolInfo === undefined) throw Error("Could not find pool " + poolAppId);
    const { depositInterestIndex } = poolInfo;

    const fAssetStakedAmount = localState.stakedAmounts[stakeIndex];
    const assetStakedAmount = calcWithdrawReturn(fAssetStakedAmount, depositInterestIndex);
    const stakedAmountValue = mulScale(assetStakedAmount, assetPrice, ONE_10_DP); // 4 d.p.

    const userRewards: {
      rewardAssetId: number;
      endTimestamp: bigint;
      rewardAssetPrice: bigint;
      rewardInterestRate: bigint;
      unclaimedReward: bigint;
      unclaimedRewardValue: bigint;
    }[] = [];
    for (const [
      localRewardIndex,
      { rewardAssetId, endTimestamp, rewardAssetPrice, rewardInterestRate, rewardPerToken },
    ] of rewards.entries()) {
      const rewardIndex = stakeIndex * 3 + localRewardIndex;
      const oldRewardPerToken = localState.rewardPerTokens[rewardIndex];
      const oldUnclaimedReward = localState.unclaimedRewards[rewardIndex];

      const unclaimedReward =
        oldUnclaimedReward + mulScale(fAssetStakedAmount, rewardPerToken - oldRewardPerToken, ONE_10_DP);
      const unclaimedRewardValue = mulScale(unclaimedReward, rewardAssetPrice, ONE_10_DP); // 4 d.p.

      userRewards.push({
        rewardAssetId,
        endTimestamp,
        rewardAssetPrice,
        rewardInterestRate,
        unclaimedReward,
        unclaimedRewardValue,
      });
    }

    stakingPrograms.push({
      poolAppId,
      fAssetId,
      fAssetStakedAmount,
      assetId,
      assetPrice,
      assetStakedAmount,
      stakedAmountValue,
      depositInterestRate,
      depositInterestYield,
      rewards: userRewards,
    });
  }

  return {
    currentRound: localState.currentRound,
    userAddress: localState.userAddress,
    escrowAddress: localState.escrowAddress,
    optedIntoAssets: localState.optedIntoAssets,
    stakingPrograms,
  };
}

/**
 *
 * Derives loan local state from escrow account.
 *
 * @param state - escrow account local state
 * @param loanAppId - loan application to query about
 * @param escrowAddr - escrow address
 * @returns LoanLocalState loan local state
 */
export function loanLocalState(state: TealKeyValue[], loanAppId: number, escrowAddr: string): LoanLocalState {
  // standard
  const userAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "u")), "base64"));
  const colPls = parseUint64s(String(getParsedValueFromState(state, "c")));
  const borPls = parseUint64s(String(getParsedValueFromState(state, "b")));
  const colBals = parseUint64s(String(getParsedValueFromState(state, "cb")));
  const borAms = parseUint64s(String(getParsedValueFromState(state, "ba")));
  const borBals = parseUint64s(String(getParsedValueFromState(state, "bb")));
  const lbii = parseUint64s(String(getParsedValueFromState(state, "l")));
  const sbir = parseUint64s(String(getParsedValueFromState(state, "r")));
  const lsc = parseUint64s(String(getParsedValueFromState(state, "t")));

  // custom
  const collaterals = [];
  const borrows = [];
  for (let i = 0; i < 15; i++) {
    // add collateral
    collaterals.push({
      poolAppId: Number(colPls[i]),
      fAssetBalance: colBals[i],
    });

    // add borrow
    borrows.push({
      poolAppId: Number(borPls[i]),
      borrowedAmount: borAms[i],
      borrowBalance: borBals[i],
      latestBorrowInterestIndex: lbii[i],
      stableBorrowInterestRate: sbir[i],
      latestStableChange: lsc[i],
    });
  }

  return {
    userAddress,
    escrowAddress: escrowAddr,
    collaterals,
    borrows,
  };
}

/**
 *
 * Derives user loan info from escrow account.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param localState - local state of escrow account
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param loanInfo - loan info which is returned by retrieveLoanInfo function
 * @param oraclePrices - oracle prices which is returned by getOraclePrices function
 * @returns Promise<UserLoansInfo> user loans info
 */
export function userLoanInfo(
  localState: LoanLocalState,
  poolManagerInfo: PoolManagerInfo,
  loanInfo: LoanInfo,
  oraclePrices: OraclePrices,
): UserLoanInfo {
  const { pools: poolManagerPools } = poolManagerInfo;
  const { pools: loanPools } = loanInfo;
  const { prices } = oraclePrices;

  let netRate = BigInt(0);
  let netYield = BigInt(0);

  // collaterals
  const collaterals: UserLoanInfoCollateral[] = [];
  let totalCollateralBalanceValue = BigInt(0);
  let totalEffectiveCollateralBalanceValue = BigInt(0);

  for (const { poolAppId, fAssetBalance } of localState.collaterals) {
    const isColPresent = poolAppId > 0;
    if (!isColPresent) continue;

    const poolInfo = poolManagerPools[poolAppId];
    const poolLoanInfo = loanPools[poolAppId];
    if (poolInfo === undefined || poolLoanInfo === undefined)
      throw Error("Could not find collateral pool " + poolAppId);

    const { depositInterestIndex, depositInterestRate, depositInterestYield } = poolInfo;
    const { assetId, collateralFactor } = poolLoanInfo;
    const oraclePrice = prices[assetId];
    if (oraclePrice === undefined) throw Error("Could not find asset price " + assetId);

    const { price: assetPrice } = oraclePrice;
    const assetBalance = calcWithdrawReturn(fAssetBalance, depositInterestIndex);
    const balanceValue = calcCollateralAssetLoanValue(assetBalance, assetPrice, ONE_4_DP);
    const effectiveBalanceValue = calcCollateralAssetLoanValue(assetBalance, assetPrice, collateralFactor);

    totalCollateralBalanceValue += balanceValue;
    totalEffectiveCollateralBalanceValue += effectiveBalanceValue;
    netRate += balanceValue * depositInterestRate;
    netYield += balanceValue * depositInterestYield;

    collaterals.push({
      poolAppId,
      assetId,
      assetPrice,
      depositInterestIndex,
      collateralFactor,
      fAssetBalance,
      assetBalance,
      balanceValue,
      effectiveBalanceValue,
      interestRate: depositInterestRate,
      interestYield: depositInterestYield,
    });
  }

  // borrows
  const borrows: UserLoanInfoBorrow[] = [];
  let totalBorrowedAmountValue = BigInt(0);
  let totalBorrowBalanceValue = BigInt(0);
  let totalEffectiveBorrowBalanceValue = BigInt(0);

  for (const {
    poolAppId,
    borrowedAmount,
    borrowBalance: oldBorrowBalance,
    latestBorrowInterestIndex,
    stableBorrowInterestRate,
    latestStableChange,
  } of localState.borrows) {
    const isBorPresent = oldBorrowBalance > BigInt(0);
    if (!isBorPresent) continue;

    const poolInfo = poolManagerPools[poolAppId];
    const poolLoanInfo = loanPools[poolAppId];
    if (poolInfo === undefined || poolLoanInfo === undefined) throw Error("Could not find borrow pool " + poolAppId);

    const { assetId, borrowFactor } = poolLoanInfo;
    const oraclePrice = prices[assetId];
    if (oraclePrice === undefined) throw Error("Could not find asset price " + assetId);

    const { price: assetPrice } = oraclePrice;
    const isStable = latestStableChange > BigInt(0);
    const bii = isStable
      ? calcBorrowInterestIndex(stableBorrowInterestRate, latestBorrowInterestIndex, latestStableChange)
      : poolInfo.variableBorrowInterestIndex;
    const borrowedAmountValue = calcCollateralAssetLoanValue(borrowedAmount, oraclePrice.price, ONE_4_DP); // no rounding
    const borrowBalance = calcBorrowBalance(oldBorrowBalance, bii, latestBorrowInterestIndex);
    const borrowBalanceValue = calcBorrowAssetLoanValue(borrowBalance, assetPrice, ONE_4_DP);
    const effectiveBorrowBalanceValue = calcBorrowAssetLoanValue(borrowBalance, assetPrice, borrowFactor);
    const interestRate = isStable ? stableBorrowInterestRate : poolInfo.variableBorrowInterestRate;
    const interestYield = isStable
      ? compoundEverySecond(stableBorrowInterestRate, ONE_16_DP)
      : poolInfo.variableBorrowInterestYield;

    totalBorrowedAmountValue += borrowedAmountValue;
    totalBorrowBalanceValue += borrowBalanceValue;
    totalEffectiveBorrowBalanceValue += effectiveBorrowBalanceValue;
    netRate -= borrowBalanceValue * interestRate;
    netYield -= borrowBalanceValue * interestYield;

    borrows.push({
      poolAppId,
      assetId,
      assetPrice,
      isStable,
      borrowFactor,
      borrowedAmount,
      borrowedAmountValue,
      borrowBalance,
      borrowBalanceValue,
      effectiveBorrowBalanceValue,
      accruedInterest: borrowBalance - borrowedAmount,
      accruedInterestValue: borrowBalanceValue - borrowedAmountValue,
      interestRate,
      interestYield,
    });
  }

  if (totalCollateralBalanceValue > BigInt(0)) {
    netRate /= totalCollateralBalanceValue;
    netYield /= totalCollateralBalanceValue;
  }

  // combine
  return {
    currentRound: localState.currentRound,
    userAddress: localState.userAddress,
    escrowAddress: localState.escrowAddress,
    collaterals,
    borrows,
    netRate,
    netYield,
    totalCollateralBalanceValue,
    totalBorrowedAmountValue,
    totalBorrowBalanceValue,
    totalEffectiveCollateralBalanceValue,
    totalEffectiveBorrowBalanceValue,
    loanToValueRatio: calcLTVRatio(totalBorrowBalanceValue, totalCollateralBalanceValue),
    borrowUtilisationRatio: calcBorrowUtilisationRatio(
      totalEffectiveBorrowBalanceValue,
      totalEffectiveCollateralBalanceValue,
    ),
    liquidationMargin: calcLiquidationMargin(totalEffectiveBorrowBalanceValue, totalEffectiveCollateralBalanceValue),
  };
}
