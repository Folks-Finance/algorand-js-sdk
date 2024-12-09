import {
  assignGroupID,
  encodeUint64,
  getApplicationAddress,
  Indexer,
  makeApplicationNoOpTxn,
  SuggestedParams,
  Transaction,
} from "algosdk";
import { enc, transferAlgoOrAsset } from "../../utils";
import { getTokenPairInfo } from "./borrow";
import { getPoolInfo } from "./deposit";
import { getConversionRate, getOraclePrices } from "./oracle";
import { ConversionRate, LoanInfo, Oracle, PoolInfo, ReserveAddress, TokenPair, TokenPairInfo } from "./types";
import { getEscrows, getOracleAdapterForeignAccounts, getOracleAdapterForeignApps, loanInfo } from "./utils";

/**
 *
 * Returns information regarding the given loan.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param tokenPair - token pair of the loan
 * @param oracle - oracle to query for prices
 * @param escrowAddr - escrow address to query about
 * @param round - results for specified round
 * @returns Promise<LoanInfo> loan info
 */
async function getLoanInfo(
  indexerClient: Indexer,
  tokenPair: TokenPair,
  oracle: Oracle,
  escrowAddr: string,
  round?: number,
): Promise<LoanInfo> {
  const { collateralPool, borrowPool } = tokenPair;

  // get escrow account
  const req = indexerClient.lookupAccountByID(escrowAddr);
  if (round) req.round(round);
  const res = await req.do();

  // get conversion rate
  const { prices } = await getOraclePrices(indexerClient, oracle, [collateralPool.assetId, borrowPool.assetId]);
  const conversionRate = getConversionRate(prices[collateralPool.assetId].price, prices[borrowPool.assetId].price);

  // get collateral pool and token pair info
  const collateralPoolInfo = await getPoolInfo(indexerClient, collateralPool);
  const borrowPoolInfo = await getPoolInfo(indexerClient, borrowPool);
  const tokenPairInfo = await getTokenPairInfo(indexerClient, tokenPair);

  // derive loan info
  return loanInfo(
    res["account"],
    tokenPair,
    tokenPairInfo,
    collateralPoolInfo,
    borrowPoolInfo,
    conversionRate,
    res["current-round"],
  );
}

/**
 *
 * Returns information regarding the given loans.
 * Must pass the token pair info, collateral pool info and conversion that you are using.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param tokenPair - token pair of the loan
 * @param tokenPairInfo - token pair info
 * @param collateralPoolInfo - collateral pool info
 * @param borrowPoolInfo - borrow pool info
 * @param conversionRate - conversion rate from collateral to borrow asset
 * @param nextToken - token for retrieving next escrows
 * @param round - results for specified round
 * @returns Promise<{ loans: LoanInfo[], nextToken?: string}> object containing loan infos and next token
 */
async function getLoansInfo(
  indexerClient: Indexer,
  tokenPair: TokenPair,
  tokenPairInfo: TokenPairInfo,
  collateralPoolInfo: PoolInfo,
  borrowPoolInfo: PoolInfo,
  conversionRate: ConversionRate,
  nextToken?: string,
  round?: number,
): Promise<{ loans: LoanInfo[]; nextToken?: string }> {
  // retrieve loans
  const res = await getEscrows(indexerClient, tokenPair, nextToken, round);

  // derive loans info
  const loans: LoanInfo[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res["accounts"].forEach((account: any) => {
    try {
      const loan = loanInfo(
        account,
        tokenPair,
        tokenPairInfo,
        collateralPoolInfo,
        borrowPoolInfo,
        conversionRate,
        res["current-round"],
      );
      loans.push(loan);
    } catch (e) {
      console.error(e);
    }
  });

  return {
    loans,
    nextToken: res["next-token"],
  };
}

/**
 *
 * Returns a group transaction to liquidate an under-collateralized loan.
 *
 * @param tokenPair - token pair to use for borrow
 * @param oracle - oracle price source
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that will hold the collateral
 * @param reserveAddr - reserve address that will earn percentage of interest paid
 * @param liquidationAmount - amount to liquidate (will send back any over-payment if any)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] liquidate group transaction
 */
function prepareLiquidateTransactions(
  tokenPair: TokenPair,
  oracle: Oracle,
  senderAddr: string,
  escrowAddr: string,
  reserveAddr: ReserveAddress,
  liquidationAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, collateralPool, borrowPool, linkAddr } = tokenPair;
  const { oracleAdapterAppId } = oracle;

  const oracleAdapterAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    oracleAdapterAppId,
    [encodeUint64(collateralPool.assetId), encodeUint64(borrowPool.assetId)],
    getOracleAdapterForeignAccounts(oracle, tokenPair),
    getOracleAdapterForeignApps(oracle, tokenPair),
  );
  const collateralDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 8000, flatFee: true },
    collateralPool.appId,
    [enc.encode("l")],
    [linkAddr, escrowAddr],
    [appId],
    [collateralPool.fAssetId],
  );
  const borrowDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    borrowPool.appId,
    [enc.encode("l")],
    [linkAddr, escrowAddr, reserveAddr],
    [appId],
    borrowPool.assetId ? [borrowPool.assetId] : undefined,
  );
  const tokenPairAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("l")],
    [escrowAddr],
    [borrowPool.appId],
    [collateralPool.fAssetId],
  );
  const repayTx = transferAlgoOrAsset(
    borrowPool.assetId,
    senderAddr,
    getApplicationAddress(borrowPool.appId),
    liquidationAmount,
    { ...params, fee: 0, flatFee: true },
  );
  return assignGroupID([
    oracleAdapterAppCall,
    collateralDispenserAppCall,
    borrowDispenserAppCall,
    tokenPairAppCall,
    repayTx,
  ]);
}

export { getLoanInfo, getLoansInfo, prepareLiquidateTransactions };
