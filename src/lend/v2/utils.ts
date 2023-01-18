import {
  decodeAddress,
  encodeAddress,
  getApplicationAddress,
  Indexer,
  makePaymentTxnWithSuggestedParams,
  SuggestedParams,
  Transaction,
} from "algosdk";
import { TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";
import { enc, fromIntToByteHex, getParsedValueFromState, parseUint64s, unixTime } from "../../utils";
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
import { expBySquaring, mulScale, ONE_10_DP, ONE_16_DP, ONE_4_DP, SECONDS_IN_YEAR } from "./mathLib";
import {
  DepositStakingInfo,
  LoanInfo,
  LoanLocalState,
  OraclePrices,
  Pool,
  PoolManagerInfo,
  UserDepositStakingInfo,
  UserDepositStakingInfoStakingProgram,
  UserDepositStakingLocalState,
  UserLoanInfo,
  UserLoanInfoBorrow,
  UserLoanInfoCollateral
} from "./types";

export function addEscrowNoteTransaction(
  userAddr: string,
  escrowAddr: string,
  appId: number,
  notePrefix: string,
  params: SuggestedParams,
): Transaction {
  const note = Uint8Array.from([...enc.encode(notePrefix), ...decodeAddress(escrowAddr).publicKey]);
  return makePaymentTxnWithSuggestedParams(userAddr, getApplicationAddress(appId), 0, undefined, note, params);
}

export function removeEscrowNoteTransaction(
  escrowAddr: string,
  userAddr: string,
  notePrefix: string,
  params: SuggestedParams,
): Transaction {
  const note = Uint8Array.from([...enc.encode(notePrefix), ...decodeAddress(escrowAddr).publicKey]);
  return makePaymentTxnWithSuggestedParams(escrowAddr, userAddr, 0, userAddr, note, params);
}

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
 * @returns LoanLocalState loan local state
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
    stakedAmounts,
    rewardPerTokens,
    unclaimedRewards,
  };
}

/**
 *
 * Derives user loan info from escrow account.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param localState - local state of escrow account
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param depositStakingInfo - deposit staking info which is returned by retrieveDepositStakingInfo function
 * @param pools - pools in pool manager (either MainnetPools or TestnetPools)
 * @param oraclePrices - oracle prices which is returned by getOraclePrices function
 * @returns Promise<UserDepositStakingInfo> user loans info
 */
export function userDepositStakingInfo(
  localState: UserDepositStakingLocalState,
  poolManagerInfo: PoolManagerInfo,
  depositStakingInfo: DepositStakingInfo,
  pools: Record<string, Pool>,
  oraclePrices: OraclePrices,
): UserDepositStakingInfo {
  const stakingPrograms: UserDepositStakingInfoStakingProgram[] = [];

  const { pools: poolManagerPools } = poolManagerInfo;
  const { prices } = oraclePrices;

  depositStakingInfo.stakingPrograms.forEach(({ poolAppId, rewards }, stakeIndex) => {
    const pool = Object.entries(pools).map(([, pool]) => pool).find(pool => pool.appId === poolAppId);
    const poolInfo = poolManagerPools[poolAppId];
    if (pool === undefined || poolInfo === undefined) throw Error("Could not find pool " + poolAppId);
    const { assetId, fAssetId } = pool;
    const { depositInterestIndex, depositInterestRate, depositInterestYield } = poolInfo;

    const oraclePrice = prices[assetId];
    if (oraclePrice === undefined) throw Error("Could not find asset price " + assetId);
    const { price: assetPrice } = oraclePrice;

    const fAssetStakedAmount = localState.stakedAmounts[stakeIndex];
    const assetStakedAmount = calcWithdrawReturn(fAssetStakedAmount, depositInterestIndex);
    const stakedAmountValue = mulScale(assetStakedAmount, assetPrice, ONE_10_DP); // 4 d.p.

    const userRewards: {
      rewardAssetId: number;
      assetPrice: bigint;
      unclaimedReward: bigint;
      unclaimedRewardValue: bigint;
      interestRate: bigint;
    }[] = [];
    rewards.forEach(({ rewardAssetId, endTimestamp, rewardRate, rewardPerToken }, localRewardIndex) => {
      const rewardIndex = stakeIndex * 3 + localRewardIndex;
      const oldRewardPerToken = localState.rewardPerTokens[rewardIndex];
      const oldUnclaimedReward = localState.unclaimedRewards[rewardIndex];

      const oraclePrice = prices[rewardAssetId];
      if (oraclePrice === undefined) throw Error("Could not find asset price " + rewardAssetId);
      const { price: rewardAssetPrice } = oraclePrice;

      const unclaimedReward = oldUnclaimedReward + mulScale(fAssetStakedAmount, rewardPerToken - oldRewardPerToken, ONE_10_DP);
      const unclaimedRewardValue = mulScale(unclaimedReward, rewardAssetPrice, ONE_10_DP); // 4 d.p.
      const interestRate = unixTime() > endTimestamp ? BigInt(0) : ((fAssetStakedAmount * rewardRate * rewardAssetPrice * SECONDS_IN_YEAR) / (assetStakedAmount * assetPrice));

      userRewards.push({
        rewardAssetId,
        assetPrice: rewardAssetPrice,
        unclaimedReward,
        unclaimedRewardValue,
        interestRate,
      })
    });

    stakingPrograms.push({
      poolAppId,
      fAssetId,
      fAssetStakedAmount,
      assetId,
      assetPrice,
      assetStakedAmount,
      stakedAmountValue,
      interestRate: depositInterestRate,
      interestYield: depositInterestYield,
      rewards: userRewards,
    });
  });

  return {
    currentRound: localState.currentRound,
    userAddress: localState.userAddress,
    escrowAddress: localState.escrowAddress,
    stakingPrograms,
  }
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

  localState.collaterals.forEach(({ poolAppId, fAssetBalance }) => {
    const isColPresent = poolAppId > 0;
    if (!isColPresent) return;

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
  });

  // borrows
  const borrows: UserLoanInfoBorrow[] = [];
  let totalBorrowedAmountValue = BigInt(0);
  let totalBorrowBalanceValue = BigInt(0);
  let totalEffectiveBorrowBalanceValue = BigInt(0);

  localState.borrows.forEach(
    ({
      poolAppId,
      borrowedAmount,
      borrowBalance: oldBorrowBalance,
      latestBorrowInterestIndex,
      stableBorrowInterestRate,
      latestStableChange,
    }) => {
      const isBorPresent = oldBorrowBalance > BigInt(0);
      if (!isBorPresent) return;

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
        ? expBySquaring(ONE_16_DP + stableBorrowInterestRate / SECONDS_IN_YEAR, SECONDS_IN_YEAR, ONE_16_DP) - ONE_16_DP
        : poolInfo.variableBorrowInterestYield;

      totalBorrowedAmountValue += borrowedAmount;
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
    },
  );

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
