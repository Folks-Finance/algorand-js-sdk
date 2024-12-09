import type {
  Account,
  Indexer,
  SuggestedParams,
  Transaction} from "algosdk";
import {
  assignGroupID,
  encodeUint64,
  generateAccount,
  getApplicationAddress,
  makeApplicationNoOpTxn,
  makeApplicationOptInTxn
} from "algosdk";
import { enc, getParsedValueFromState, transferAlgoOrAsset } from "../../utils";
import type { Oracle, ReserveAddress, TokenPair, TokenPairInfo } from "./types";
import { getOracleAdapterForeignAccounts, getOracleAdapterForeignApps } from "./utils";

/**
 *
 * Returns information regarding the given token pair.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param tokenPair - token pair to query about
 * @returns Promise<TokenPairInfo[]> token pair info
 */
async function getTokenPairInfo(indexerClient: Indexer, tokenPair: TokenPair): Promise<TokenPairInfo> {
  const { appId } = tokenPair;
  const res = await indexerClient.lookupApplications(appId).do();
  const state = res["application"]["params"]["global-state"];

  const s1 = BigInt(getParsedValueFromState(state, "S1") || 0);
  const s2 = BigInt(getParsedValueFromState(state, "S2") || 0);
  const s3 = BigInt(getParsedValueFromState(state, "S3") || 0);

  const tb = getParsedValueFromState(state, "total_borrowed");
  const totalBorrowed = tb !== undefined ? BigInt(tb) : undefined;
  const tbl = getParsedValueFromState(state, "total_borrowed_limit");
  const totalBorrowedLimit = tbl !== undefined ? BigInt(tbl) : undefined;

  return {
    currentRound: res["current-round"],
    loanToValueRatio: s1,
    liquidationThreshold: s2,
    safetyThreshold: s3,
    totalBorrowed,
    totalBorrowedLimit,
  };
}

/**
 *
 * Returns a group transaction to add escrow before borrowing.
 *
 * @param tokenPair - token pair to add escrow for
 * @param senderAddr - account address for the sender
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and escrow account
 */
function prepareAddEscrowTransactions(
  tokenPair: TokenPair,
  senderAddr: string,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const { appId, collateralPool } = tokenPair;

  const escrow = generateAccount();

  const paymentTx = transferAlgoOrAsset(0, senderAddr, escrow.addr, 0.4355e6, { ...params, fee: 0, flatFee: true });
  const optInAppCallTx = makeApplicationOptInTxn(
    escrow.addr,
    { ...params, fee: 0, flatFee: true },
    appId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    getApplicationAddress(appId),
  );
  const appCallTx = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 4000, flatFee: true },
    appId,
    [enc.encode("ae")],
    [escrow.addr],
    undefined,
    [collateralPool.fAssetId],
  );

  return {
    txns: assignGroupID([paymentTx, optInAppCallTx, appCallTx]),
    escrow,
  };
}

/**
 *
 * Returns a group transaction to borrow.
 *
 * @param tokenPair - token pair to use for borrow
 * @param oracle - oracle price source
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that will hold the collateral
 * @param collateralAmount - collateral amount to send
 * @param borrowAmount - borrow amount to receive (max amount if undefined)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] borrow group transaction
 */
function prepareBorrowTransactions(
  tokenPair: TokenPair,
  oracle: Oracle,
  senderAddr: string,
  escrowAddr: string,
  collateralAmount: number | bigint,
  borrowAmount: number | bigint | undefined,
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
    { ...params, fee: 6000, flatFee: true },
    collateralPool.appId,
    [enc.encode("b")],
    [linkAddr],
    [appId],
  );
  const borrowDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    borrowPool.appId,
    borrowAmount ? [enc.encode("b"), encodeUint64(borrowAmount)] : [enc.encode("b")],
    [linkAddr],
    undefined,
    borrowPool.assetId ? [borrowPool.assetId] : undefined,
  );
  const tokenPairAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("b")],
    [escrowAddr],
    [borrowPool.appId],
  );
  const collateralTx = transferAlgoOrAsset(collateralPool.fAssetId, senderAddr, escrowAddr, collateralAmount, {
    ...params,
    fee: 0,
    flatFee: true,
  });
  return assignGroupID([
    oracleAdapterAppCall,
    collateralDispenserAppCall,
    borrowDispenserAppCall,
    tokenPairAppCall,
    collateralTx,
  ]);
}

/**
 *
 * Returns a transaction to increase collateral.
 *
 * @param tokenPair - token pair to use for borrow
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that will hold the collateral
 * @param collateralAmount - collateral amount to send
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction increase collateral transaction
 */
function prepareIncreaseCollateralTransaction(
  tokenPair: TokenPair,
  senderAddr: string,
  escrowAddr: string,
  collateralAmount: number | bigint,
  params: SuggestedParams,
): Transaction {
  const { fAssetId } = tokenPair.collateralPool;
  return transferAlgoOrAsset(fAssetId, senderAddr, escrowAddr, collateralAmount, {
    ...params,
    fee: 1000,
    flatFee: true,
  });
}

/**
 *
 * Returns a group transaction to reduce collateral.
 *
 * @param tokenPair - token pair to use for borrow
 * @param oracle - oracle price source
 * @param sender - account address for the sender
 * @param escrow - escrow address that will hold the collateral
 * @param reduceAmount - collateral amount to reduce by (max amount if undefined)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] reduce collateral group transaction
 */
function prepareReduceCollateralTransactions(
  tokenPair: TokenPair,
  oracle: Oracle,
  sender: string,
  escrow: string,
  reduceAmount: number | bigint | undefined,
  params: SuggestedParams,
): Transaction[] {
  const { appId, collateralPool, borrowPool, linkAddr } = tokenPair;
  const { oracleAdapterAppId } = oracle;

  const oracleAdapterAppCall = makeApplicationNoOpTxn(
    sender,
    { ...params, fee: 0, flatFee: true },
    oracleAdapterAppId,
    [encodeUint64(collateralPool.assetId), encodeUint64(borrowPool.assetId)],
    getOracleAdapterForeignAccounts(oracle, tokenPair),
    getOracleAdapterForeignApps(oracle, tokenPair),
  );
  const collateralDispenserAppCall = makeApplicationNoOpTxn(
    sender,
    { ...params, fee: 5000, flatFee: true },
    collateralPool.appId,
    [enc.encode("rc")],
    [linkAddr, escrow],
    [appId],
    [collateralPool.fAssetId],
  );
  const borrowDispenserAppCall = makeApplicationNoOpTxn(
    sender,
    { ...params, fee: 0, flatFee: true },
    borrowPool.appId,
    reduceAmount ? [enc.encode("rc"), encodeUint64(reduceAmount)] : [enc.encode("rc")],
    [linkAddr, escrow],
    [appId],
    borrowPool.assetId ? [borrowPool.assetId] : undefined,
  );
  const tokenPairAppCall = makeApplicationNoOpTxn(
    sender,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("rc")],
    [escrow],
    [borrowPool.appId],
    [collateralPool.fAssetId],
  );
  return assignGroupID([oracleAdapterAppCall, collateralDispenserAppCall, borrowDispenserAppCall, tokenPairAppCall]);
}

/**
 *
 * Returns a group transaction to increase borrow.
 *
 * @param tokenPair - token pair to use for borrow
 * @param oracle - oracle price source
 * @param senderAddr - account address for the sender
 * @param escrow - escrow address that will hold the collateral
 * @param increaseAmount - borrow amount to increase by (max amount if undefined)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] increase borrow group transaction
 */
function prepareIncreaseBorrowTransactions(
  tokenPair: TokenPair,
  oracle: Oracle,
  senderAddr: string,
  escrow: string,
  increaseAmount: number | bigint,
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
    { ...params, fee: 5000, flatFee: true },
    collateralPool.appId,
    [enc.encode("ib")],
    [linkAddr, escrow],
    [appId],
    [collateralPool.fAssetId],
  );
  const borrowDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    borrowPool.appId,
    increaseAmount ? [enc.encode("ib"), encodeUint64(increaseAmount)] : [enc.encode("ib")],
    [linkAddr, escrow],
    [appId],
    borrowPool.assetId ? [borrowPool.assetId] : undefined,
  );
  const tokenPairAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("ib")],
    [escrow],
    [borrowPool.appId],
  );
  return assignGroupID([oracleAdapterAppCall, collateralDispenserAppCall, borrowDispenserAppCall, tokenPairAppCall]);
}

/**
 *
 * Returns a group transaction to increase borrow.
 *
 * @param tokenPair - token pair to use for borrow
 * @param senderAddr - account address for the sender
 * @param escrowAddr - escrow address that will hold the collateral
 * @param reserveAddr - reserve address that will earn percentage of interest paid
 * @param repayAmount - amount to repay (will send back any over-payment if any)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] increase borrow group transaction
 */
function prepareRepayTransactions(
  tokenPair: TokenPair,
  senderAddr: string,
  escrowAddr: string,
  reserveAddr: ReserveAddress,
  repayAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, collateralPool, borrowPool, linkAddr } = tokenPair;

  const collateralDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 8000, flatFee: true },
    collateralPool.appId,
    [enc.encode("rb")],
    [linkAddr],
  );
  const borrowDispenserAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    borrowPool.appId,
    [enc.encode("rb")],
    [linkAddr, escrowAddr, reserveAddr],
    [appId],
    borrowPool.assetId ? [borrowPool.assetId, borrowPool.frAssetId] : [borrowPool.frAssetId],
  );
  const tokenPairAppCall = makeApplicationNoOpTxn(
    senderAddr,
    { ...params, fee: 0, flatFee: true },
    appId,
    [enc.encode("rb")],
    [escrowAddr],
    [borrowPool.appId],
    [collateralPool.fAssetId],
  );
  const repayTx = transferAlgoOrAsset(
    borrowPool.assetId,
    senderAddr,
    getApplicationAddress(borrowPool.appId),
    repayAmount,
    { ...params, fee: 0, flatFee: true },
  );
  return assignGroupID([collateralDispenserAppCall, borrowDispenserAppCall, tokenPairAppCall, repayTx]);
}

export {
  getTokenPairInfo,
  prepareAddEscrowTransactions,
  prepareBorrowTransactions,
  prepareIncreaseCollateralTransaction,
  prepareReduceCollateralTransactions,
  prepareIncreaseBorrowTransactions,
  prepareRepayTransactions,
};
