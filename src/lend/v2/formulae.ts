import {
  divScale,
  divScaleRoundUp,
  expBySquaring,
  mulScale,
  mulScaleRoundUp,
  ONE_10_DP,
  ONE_14_DP,
  ONE_16_DP,
  ONE_4_DP,
  SECONDS_IN_YEAR,
  sqrt,
} from "../../math-lib";
import { unixTime } from "../../utils";

/**
 * Calculates the dollar value of a given asset amount
 * @param amount (0dp)
 * @param price (14dp)
 * @return value (0dp)
 */
function calcAssetDollarValue(amount: bigint, price: bigint): bigint {
  return mulScaleRoundUp(amount, price, ONE_14_DP);
}

/**
 * Calculates the total debt of a pool
 * @param totalVarDebt (0dp)
 * @param totalStblDebt (0dp)
 * @return totalDebt (0dp)
 */
function calcTotalDebt(totalVarDebt: bigint, totalStblDebt: bigint): bigint {
  return totalVarDebt + totalStblDebt;
}

/**
 * Calculates the total debt of a pool
 * @param totalDebt (0dp)
 * @param totalDeposits (0dp)
 * @return availableLiquidity (0dp)
 */
function calcAvailableLiquidity(totalDebt: bigint, totalDeposits: bigint): bigint {
  return totalDeposits - totalDebt;
}

/**
 * Calculates the ratio of the available liquidity that is being stable borrowed
 * @param stblBorAmount (0dp)
 * @param availableLiquidity (0dp)
 * @return stableBorrowRatio (16dp)
 */
function calcStableBorrowRatio(stblBorAmount: bigint, availableLiquidity: bigint): bigint {
  return divScale(stblBorAmount, availableLiquidity, ONE_16_DP);
}

/**
 * Calculates the maximum stable borrow amount a user can make in one go
 * @param availableLiquidity (0dp)
 * @param sbpc (0dp)
 * @return stableBorrowRatio (16dp)
 */
function calcMaxSingleStableBorrow(availableLiquidity: bigint, sbpc: bigint): bigint {
  return mulScale(availableLiquidity, sbpc, ONE_16_DP);
}

/**
 * Calculates the utilisation ratio of a pool
 * @param totalDebt (0dp)
 * @param totalDeposits (0dp)
 * @return utilisationRatio (16dp)
 */
function calcUtilisationRatio(totalDebt: bigint, totalDeposits: bigint): bigint {
  if (totalDeposits === BigInt(0)) return BigInt(0);
  return divScale(totalDebt, totalDeposits, ONE_16_DP);
}

/**
 * Calculates the stable debt to total debt ratio of a pool
 * @param totalStblDebt (0dp)
 * @param totalDebt (0dp)
 * @return stableDebtToTotalDebtRatio (16dp)
 */
function calcStableDebtToTotalDebtRatio(totalStblDebt: bigint, totalDebt: bigint): bigint {
  if (totalDebt === BigInt(0)) return BigInt(0);
  return divScale(totalStblDebt, totalDebt, ONE_16_DP);
}

/**
 * Calculate the variable borrow interest rate of a pool
 * @param vr0 (16dp)
 * @param vr1 (16dp)
 * @param vr2 (16dp)
 * @param ut (16dp)
 * @param uopt (16dp)
 * @return variableBorrowInterestRate (16dp)
 */
function calcVariableBorrowInterestRate(vr0: bigint, vr1: bigint, vr2: bigint, ut: bigint, uopt: bigint): bigint {
  return ut < uopt
    ? vr0 + divScale(mulScale(ut, vr1, ONE_16_DP), uopt, ONE_16_DP)
    : vr0 + vr1 + divScale(mulScale(ut - uopt, vr2, ONE_16_DP), ONE_16_DP - uopt, ONE_16_DP);
}

/**
 * Calculate the stable borrow interest rate of a pool
 * @param vr1 (16dp)
 * @param sr0 (16dp)
 * @param sr1 (16dp)
 * @param sr2 (16dp)
 * @param sr3 (16dp)
 * @param ut (16dp)
 * @param uopt (16dp)
 * @param ratiot (16dp)
 * @param ratioopt (16dp)
 * @return stableBorrowInterestRate (16dp)
 */
function calcStableBorrowInterestRate(
  vr1: bigint,
  sr0: bigint,
  sr1: bigint,
  sr2: bigint,
  sr3: bigint,
  ut: bigint,
  uopt: bigint,
  ratiot: bigint,
  ratioopt: bigint,
): bigint {
  const base =
    ut <= uopt
      ? vr1 + sr0 + divScale(mulScale(ut, sr1, ONE_16_DP), uopt, ONE_16_DP)
      : vr1 + sr0 + sr1 + divScale(mulScale(ut - uopt, sr2, ONE_16_DP), ONE_16_DP - uopt, ONE_16_DP);
  const extra =
    ratiot <= ratioopt
      ? BigInt(0)
      : divScale(mulScale(sr3, ratiot - ratioopt, ONE_16_DP), ONE_16_DP - ratioopt, ONE_16_DP);
  return base + extra;
}

/**
 * Calculate the overall borrow interest rate of a pool
 * @param totalVarDebt (0dp)
 * @param totalDebt (0dp)
 * @param vbirt (16dp)
 * @param osbiat (16dp)
 * @return overallBorrowInterestRate (16dp)
 */
function calcOverallBorrowInterestRate(totalVarDebt: bigint, totalDebt: bigint, vbirt: bigint, osbiat: bigint): bigint {
  if (totalDebt === BigInt(0)) return BigInt(0);
  return (totalVarDebt * vbirt + osbiat) / totalDebt;
}

/**
 * Calculate the deposit interest rate of a pool
 * @param obirt (16dp)
 * @param ut (16dp)
 * @param rr (16dp)
 * @return overallBorrowInterestRate (16dp)
 */
function calcDepositInterestRate(obirt: bigint, rr: bigint, ut: bigint): bigint {
  return mulScale(mulScale(ut, obirt, ONE_16_DP), ONE_16_DP - rr, ONE_16_DP);
}

/**
 * Calculate the borrow interest index of pool
 * @param birt1 (16dp)
 * @param biit1 (16dp)
 * @param latestUpdate (0dp)
 * @return borrowInterestIndex (14dp)
 */
function calcBorrowInterestIndex(birt1: bigint, biit1: bigint, latestUpdate: bigint): bigint {
  const dt = BigInt(unixTime()) - latestUpdate;
  return mulScale(biit1, expBySquaring(ONE_16_DP + birt1 / SECONDS_IN_YEAR, dt, ONE_16_DP), ONE_16_DP);
}

/**
 * Calculate the deposit interest index of pool
 * @param dirt1 (16dp)
 * @param diit1 (16dp)
 * @param latestUpdate (0dp)
 * @return depositInterestIndex (14dp)
 */
function calcDepositInterestIndex(dirt1: bigint, diit1: bigint, latestUpdate: bigint): bigint {
  const dt = BigInt(unixTime()) - latestUpdate;
  return mulScale(diit1, ONE_16_DP + (dirt1 * dt) / SECONDS_IN_YEAR, ONE_16_DP);
}

/**
 * Calculates the fAsset received from a deposit
 * @param depositAmount (0dp)
 * @param diit (14dp)
 * @return depositReturn (0dp)
 */
function calcDepositReturn(depositAmount: bigint, diit: bigint): bigint {
  return divScale(depositAmount, diit, ONE_14_DP);
}

/**
 * Calculates the asset received from a withdraw
 * @param withdrawAmount (0dp)
 * @param diit (14dp)
 * @return withdrawReturn (0dp)
 */
function calcWithdrawReturn(withdrawAmount: bigint, diit: bigint): bigint {
  return mulScale(withdrawAmount, diit, ONE_14_DP);
}

/**
 * Calculates the collateral asset loan value
 * @param amount (0dp)
 * @param price (14dp)
 * @param factor (4dp)
 * @return loanValue (4dp)
 */
function calcCollateralAssetLoanValue(amount: bigint, price: bigint, factor: bigint): bigint {
  return mulScale(mulScale(amount, price, ONE_10_DP), factor, ONE_4_DP);
}

/**
 * Calculates the borrow asset loan value
 * @param amount (0dp)
 * @param price (14dp)
 * @param factor (4dp)
 * @return loanValue (4dp)
 */
function calcBorrowAssetLoanValue(amount: bigint, price: bigint, factor: bigint): bigint {
  return mulScaleRoundUp(mulScaleRoundUp(amount, price, ONE_10_DP), factor, ONE_4_DP);
}

/**
 * Calculates the loan's LTV ratio
 * @param totalBorrowBalanceValue (4dp)
 * @param totalCollateralBalanceValue (4dp)
 * @return LTVRatio (4dp)
 */
function calcLTVRatio(totalBorrowBalanceValue: bigint, totalCollateralBalanceValue: bigint): bigint {
  if (totalCollateralBalanceValue === BigInt(0)) return BigInt(0);
  return divScale(totalBorrowBalanceValue, totalCollateralBalanceValue, ONE_4_DP);
}

/**
 * Calculates the loan's borrow utilisation ratio
 * @param totalEffectiveBorrowBalanceValue (4dp)
 * @param totalEffectiveCollateralBalanceValue (4dp)
 * @return borrowUtilisationRatio (4dp)
 */
function calcBorrowUtilisationRatio(
  totalEffectiveBorrowBalanceValue: bigint,
  totalEffectiveCollateralBalanceValue: bigint,
): bigint {
  if (totalEffectiveCollateralBalanceValue === BigInt(0)) return BigInt(0);
  return divScale(totalEffectiveBorrowBalanceValue, totalEffectiveCollateralBalanceValue, ONE_4_DP);
}

/**
 * Calculates the loan's liquidation margin
 * @param totalEffectiveBorrowBalanceValue (4dp)
 * @param totalEffectiveCollateralBalanceValue (4dp)
 * @return liquidationMargin (4dp)
 */
function calcLiquidationMargin(
  totalEffectiveBorrowBalanceValue: bigint,
  totalEffectiveCollateralBalanceValue: bigint,
): bigint {
  if (totalEffectiveCollateralBalanceValue === BigInt(0)) return BigInt(0);
  return divScale(
    totalEffectiveCollateralBalanceValue - totalEffectiveBorrowBalanceValue,
    totalEffectiveCollateralBalanceValue,
    ONE_4_DP,
  );
}

/**
 * Calculates the borrow balance of the loan at time t
 * @param bbtn1 (0dp)
 * @param biit (14dp)
 * @param biitn1 (14dp)
 * @return borrowBalance (0dp)
 */
function calcBorrowBalance(bbtn1: bigint, biit: bigint, biitn1: bigint): bigint {
  return mulScaleRoundUp(bbtn1, divScaleRoundUp(biit, biitn1, ONE_14_DP), ONE_14_DP);
}

/**
 * Calculates the stable borrow interest rate of the loan after a borrow increase
 * @param bbt (0dp)
 * @param amount (0dp)
 * @param sbirtn1 (16dp)
 * @param sbirt1 (16dp)
 * @return stableInterestRate (16dp)
 */
function calcLoanStableInterestRate(bbt: bigint, amount: bigint, sbirtn1: bigint, sbirt1: bigint): bigint {
  return (bbt * sbirtn1 + amount * sbirt1) / (bbt + amount);
}

/**
 * Calculates the deposit interest rate condition required to rebalance up stable borrow.
 * Note that there is also a second condition on the pool utilisation ratio.
 * @param rudir (16dp)
 * @param vr0 (16dp)
 * @param vr1 (16dp)
 * @param vr2 (16dp)
 * @return rebalanceUpThreshold (16dp)
 */
function calcRebalanceUpThreshold(rudir: bigint, vr0: bigint, vr1: bigint, vr2: bigint): bigint {
  return mulScale(rudir, vr0 + vr1 + vr2, ONE_16_DP);
}

/**
 * Calculates the stable interest rate condition required to rebalance down stable borrow
 * @param rdd (16dp)
 * @param sbirt1 (16dp)
 * @return rebalanceDownThreshold (16dp)
 */
function calcRebalanceDownThreshold(rdd: bigint, sbirt1: bigint): bigint {
  return mulScale(ONE_16_DP + rdd, sbirt1, ONE_16_DP);
}

/**
 * Calculates the flash loan repayment amount for a given borrow amount and fee
 * @param borrowAmount (0dp)
 * @param fee (16dp)
 * @return repaymentAmount (0dp)
 */
function calcFlashLoanRepayment(borrowAmount: bigint, fee: bigint): bigint {
  return borrowAmount + mulScaleRoundUp(borrowAmount, fee, ONE_16_DP);
}

/**
 * Calculates the LP price
 * @param r0 pool supply of asset 0
 * @param r1 pool supply of asset 1
 * @param p0 price of asset 0
 * @param p1 price of asset 1
 * @param lts circulating supply of liquidity token
 * @return bigint LP price
 */
function calcLPPrice(r0: bigint, r1: bigint, p0: bigint, p1: bigint, lts: bigint): bigint {
  return BigInt(2) * (sqrt(r0 * p0 * r1 * p1) / lts);
}

export {
  calcAssetDollarValue,
  calcTotalDebt,
  calcAvailableLiquidity,
  calcStableBorrowRatio,
  calcMaxSingleStableBorrow,
  calcUtilisationRatio,
  calcStableDebtToTotalDebtRatio,
  calcVariableBorrowInterestRate,
  calcStableBorrowInterestRate,
  calcOverallBorrowInterestRate,
  calcDepositInterestRate,
  calcBorrowInterestIndex,
  calcDepositInterestIndex,
  calcDepositReturn,
  calcWithdrawReturn,
  calcCollateralAssetLoanValue,
  calcBorrowAssetLoanValue,
  calcLTVRatio,
  calcBorrowUtilisationRatio,
  calcLiquidationMargin,
  calcBorrowBalance,
  calcLoanStableInterestRate,
  calcRebalanceUpThreshold,
  calcRebalanceDownThreshold,
  calcFlashLoanRepayment,
  calcLPPrice,
};
