import {
  AtomicTransactionComposer,
  encodeAddress,
  generateAccount,
  getApplicationAddress,
  getMethodByName,
  makeApplicationCloseOutTxnFromObject,
  OnApplicationComplete,
} from "algosdk";

import { divScale, minimum, mulScale, ONE_10_DP, ONE_4_DP } from "../math-lib";
import {
  addEscrowNoteTransaction,
  fromIntToByteHex,
  getAccountApplicationLocalState,
  getApplicationGlobalState,
  getParsedValueFromState,
  removeEscrowNoteTransaction,
  signer,
  transferAlgoOrAsset,
} from "../utils";

import { loanABIContract, poolABIContract } from "./abi-contracts";
import { retrievePoolManagerInfo } from "./deposit";
import { calcBorrowUtilisationRatio, calcDepositReturn, calcFlashLoanRepayment } from "./formulae";
import { getOraclePrices, prepareRefreshPricesInOracleAdapter } from "./oracle";
import { getEscrows, loanLocalState, userLoanInfo } from "./utils";

import type {
  AssetsAdditionalInterest,
  LoanInfo,
  LoanLocalState,
  LPToken,
  Oracle,
  OraclePrices,
  Pool,
  PoolLoanInfo,
  PoolManagerInfo,
  ReserveAddress,
  UserLoanInfo,
} from "./types";
import type { Account, Algodv2, Indexer, SuggestedParams, Transaction } from "algosdk";

/**
 *
 * Returns information regarding the given pool.
 *
 * @param client - Algorand client to query
 * @param loanAppId - loan application to query about
 * @returns Promise<LoanInfo[]> loan info
 */
async function retrieveLoanInfo(client: Algodv2 | Indexer, loanAppId: number): Promise<LoanInfo> {
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, loanAppId);
  if (state === undefined) throw Error("Could not find Loan");

  const paramsBase64Value = String(getParsedValueFromState(state, "pa"));
  const paramsValue = Buffer.from(paramsBase64Value, "base64").toString("hex");
  const adminAddress = encodeAddress(Buffer.from(paramsBase64Value, "base64").subarray(0, 32));
  const poolManagerAppId = Number("0x" + paramsValue.slice(64, 80));
  const oracleAdapterAppId = Number("0x" + paramsValue.slice(80, 96));
  const canSwapCollateral = Boolean(BigInt("0x" + paramsValue.slice(96, 98)));

  const pools: Record<number, PoolLoanInfo> = {};
  for (let i = 0; i < 63; i++) {
    const poolBase64Value = String(getParsedValueFromState(state, fromIntToByteHex(i), "hex"));
    const poolValue = Buffer.from(poolBase64Value, "base64").toString("hex");

    for (let j = 0; j < 3; j++) {
      const basePos = j * 84;
      const poolAppId = Number("0x" + poolValue.slice(basePos, basePos + 16));
      // add pool
      if (poolAppId > 0) {
        pools[poolAppId] = {
          poolAppId,
          assetId: Number("0x" + poolValue.slice(basePos + 16, basePos + 32)),
          collateralCap: BigInt("0x" + poolValue.slice(basePos + 32, basePos + 48)),
          collateralUsed: BigInt("0x" + poolValue.slice(basePos + 48, basePos + 64)),
          collateralFactor: BigInt("0x" + poolValue.slice(basePos + 64, basePos + 68)),
          borrowFactor: BigInt("0x" + poolValue.slice(basePos + 68, basePos + 72)),
          liquidationMax: BigInt("0x" + poolValue.slice(basePos + 72, basePos + 76)),
          liquidationBonus: BigInt("0x" + poolValue.slice(basePos + 76, basePos + 80)),
          liquidationFee: BigInt("0x" + poolValue.slice(basePos + 80, basePos + 84)),
        };
      }
    }
  }

  // combine
  return { currentRound, adminAddress, poolManagerAppId, oracleAdapterAppId, canSwapCollateral, pools };
}

/**
 *
 * Returns local state regarding the loan escrows of a given user.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param loanAppId - loan application to query about
 * @param userAddr - account address for the user
 * @returns Promise<LoanLocalState[]> loan escrows' local state
 */
async function retrieveLoansLocalState(
  indexerClient: Indexer,
  loanAppId: number,
  userAddr: string,
): Promise<LoanLocalState[]> {
  const loansLocalState: LoanLocalState[] = [];

  const escrows = await getEscrows(indexerClient, userAddr, loanAppId, "la ", "lr ");

  // get all remaining loans' local state
  for (const escrowAddr of escrows) {
    const { currentRound, localState: state } = await getAccountApplicationLocalState(
      indexerClient,
      loanAppId,
      escrowAddr,
    );
    if (state === undefined) throw Error(`Could not find loan ${loanAppId} in escrow ${escrowAddr}`);
    loansLocalState.push({ currentRound, ...loanLocalState(state, loanAppId, escrowAddr) });
  }

  return loansLocalState;
}

/**
 *
 * Returns local state of given escrow.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param client - Algorand indexer client to query
 * @param loanAppId - loan application to query about
 * @param escrowAddr - account address for the loan escrow
 * @returns Promise<LoanLocalState> loan escrow local state
 */
async function retrieveLoanLocalState(
  client: Algodv2 | Indexer,
  loanAppId: number,
  escrowAddr: string,
): Promise<LoanLocalState> {
  const { currentRound, localState: state } = await getAccountApplicationLocalState(client, loanAppId, escrowAddr);
  if (state === undefined) throw Error(`Could not find loan ${loanAppId} in escrow ${escrowAddr}`);
  return { currentRound, ...loanLocalState(state, loanAppId, escrowAddr) };
}

/**
 *
 * Returns information regarding the loan escrows of a given user.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param loanAppId - loan application to query about
 * @param poolManagerAppId - pool manager application to query about
 * @param oracle - oracle to query
 * @param userAddr - account address for the user
 * @param additionalInterests - optional additional interest to consider in loan net rate/yield
 * @returns Promise<UserLoanInfo[]> user loans infos
 */
async function retrieveUserLoansInfo(
  indexerClient: Indexer,
  loanAppId: number,
  poolManagerAppId: number,
  oracle: Oracle,
  userAddr: string,
  additionalInterests?: AssetsAdditionalInterest,
): Promise<UserLoanInfo[]> {
  const userLoanInfos: UserLoanInfo[] = [];

  // get all prerequisites
  const escrowsReq = getEscrows(indexerClient, userAddr, loanAppId, "la ", "lr ");
  const loanInfoReq = retrieveLoanInfo(indexerClient, loanAppId);
  const poolManagerInfoReq = retrievePoolManagerInfo(indexerClient, poolManagerAppId);
  const oraclePricesReq = getOraclePrices(indexerClient, oracle);
  const [escrows, poolManagerInfo, loanInfo, oraclePrices] = await Promise.all([
    escrowsReq,
    poolManagerInfoReq,
    loanInfoReq,
    oraclePricesReq,
  ]);

  // get all remaining loans' info
  for (const escrowAddr of escrows) {
    const { currentRound, localState: state } = await getAccountApplicationLocalState(
      indexerClient,
      loanAppId,
      escrowAddr,
    );
    if (state === undefined) throw Error(`Could not find loan ${loanAppId} in escrow ${escrowAddr}`);
    const localState = loanLocalState(state, loanAppId, escrowAddr);
    userLoanInfos.push({
      ...userLoanInfo(localState, poolManagerInfo, loanInfo, oraclePrices, additionalInterests),
      currentRound,
    });
  }

  return userLoanInfos;
}

/**
 *
 * Returns information regarding the given user loan escrow.
 *
 * @param client - Algorand client to query
 * @param loanAppId - loan application to query about
 * @param poolManagerAppId - pool manager application to query about
 * @param oracle - oracle to query
 * @param escrowAddr - account address for the loan escrow
 * @param additionalInterests - optional additional interest to consider in loan net rate/yield
 * @returns Promise<UserLoanInfo> user loan info
 */
async function retrieveUserLoanInfo(
  client: Algodv2 | Indexer,
  loanAppId: number,
  poolManagerAppId: number,
  oracle: Oracle,
  escrowAddr: string,
  additionalInterests?: AssetsAdditionalInterest,
): Promise<UserLoanInfo> {
  // get all prerequisites
  const loanInfoReq = retrieveLoanInfo(client, loanAppId);
  const poolManagerInfoReq = retrievePoolManagerInfo(client, poolManagerAppId);
  const oraclePricesReq = getOraclePrices(client, oracle);
  const [poolInfo, loanInfo, oraclePrices] = await Promise.all([poolManagerInfoReq, loanInfoReq, oraclePricesReq]);

  // get loan info
  const { currentRound, localState: state } = await getAccountApplicationLocalState(client, loanAppId, escrowAddr);
  if (state === undefined) throw Error(`Could not find loan ${loanAppId} in escrow ${escrowAddr}`);
  const localState = loanLocalState(state, loanAppId, escrowAddr);
  return { ...userLoanInfo(localState, poolInfo, loanInfo, oraclePrices, additionalInterests), currentRound };
}

/**
 *
 * Returns all loans that are liquidatable.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param loanAppId - loan application to query about
 * @param poolManagerInfo - pool manager info which is returned by retrievePoolManagerInfo function
 * @param loanInfo - loan info which is returned by retrieveLoanInfo function
 * @param oraclePrices - oracle prices which is returned by getOraclePrices function
 * @param nextToken - token for retrieving next escrows
 * @returns Promise<{ loans: UserLoanInfo[], nextToken?: string}> object containing liquidatable loans and next token
 */
async function retrieveLiquidatableLoans(
  indexerClient: Indexer,
  loanAppId: number,
  poolManagerInfo: PoolManagerInfo,
  loanInfo: LoanInfo,
  oraclePrices: OraclePrices,
  nextToken?: string,
): Promise<{ loans: UserLoanInfo[]; nextToken?: string }> {
  const loans: UserLoanInfo[] = [];

  const req = await indexerClient
    .searchAccounts()
    .applicationID(loanAppId)
    .exclude("assets,created-assets,created-apps");
  if (nextToken !== undefined) req.nextToken(nextToken);
  const res = await req.do();

  // metadata
  const currentRound = res.currentRound;
  nextToken = res.nextToken;

  // convert to user loan info and add if liquidatable
  for (const acc of res["accounts"]) {
    const escrowAddr = acc["address"];
    const state = acc.appsLocalState?.find(({ id }) => id === BigInt(loanAppId))?.keyValue;
    if (!state) throw new Error(`Cannot find local state for app id ${loanAppId} address ${escrowAddr}`);
    const localState = loanLocalState(state, loanAppId, escrowAddr);
    const loan = userLoanInfo(localState, poolManagerInfo, loanInfo, oraclePrices);
    if (loan.totalEffectiveCollateralBalanceValue < loan.totalEffectiveBorrowBalanceValue)
      loans.push({
        ...loan,
        currentRound,
      });
  }

  return { loans, nextToken };
}

/**
 *
 * Returns the maximum reduce collateral of a given f asset considering a target borrow utilisation ratio.
 * Returns 0 if no collateral in loan.
 * Returns at most the collateral balance.
 *
 * @param loan - user loan
 * @param colPoolAppId - price of asset borrowing 14 d.p.
 * @param targetBorrowUtilisationRatio - the utilisation ratio that you are targeting 4 d.p.
 * @returns bigint max f asset amount
 */
function getMaxReduceCollateralForBorrowUtilisationRatio(
  loan: UserLoanInfo,
  colPoolAppId: number,
  targetBorrowUtilisationRatio: bigint,
): bigint {
  const collateral = loan.collaterals.find(({ poolAppId }) => poolAppId === colPoolAppId);

  // if could not find collateral or target is below actual, return 0
  if (!collateral || targetBorrowUtilisationRatio <= loan.borrowUtilisationRatio) return BigInt(0);

  // check if can reduce all collateral (special case as lack required precision otherwise)
  const newEffectiveBalanceValue = loan.totalEffectiveCollateralBalanceValue - collateral.effectiveBalanceValue;
  const newBorrowUtilisationRatio = calcBorrowUtilisationRatio(
    loan.totalEffectiveBorrowBalanceValue,
    newEffectiveBalanceValue,
  );
  if (
    !(newEffectiveBalanceValue === BigInt(0) && loan.totalEffectiveBorrowBalanceValue > BigInt(0)) &&
    newBorrowUtilisationRatio <= targetBorrowUtilisationRatio
  )
    return collateral.fAssetBalance;

  // calculate max
  const targetEffectiveCollateralBalanceValue = divScale(
    loan.totalEffectiveBorrowBalanceValue,
    targetBorrowUtilisationRatio,
    ONE_4_DP,
  ); // 4 d.p.
  const deltaEffectiveBalanceValue = loan.totalEffectiveCollateralBalanceValue - targetEffectiveCollateralBalanceValue; // 4 d.p.
  const deltaBalanceValue = divScale(deltaEffectiveBalanceValue, collateral.collateralFactor, ONE_4_DP); // 4 d.p.
  const deltaAssetBalance = divScale(deltaBalanceValue, collateral.assetPrice, ONE_10_DP); // 0 d.p.
  const deltafAssetBalance = calcDepositReturn(deltaAssetBalance, collateral.depositInterestIndex);
  return minimum(deltafAssetBalance, collateral.fAssetBalance);
}

/**
 *
 * Returns the maximum borrow of a given asset considering a target borrow utilisation ratio.
 * Returns 0 if cannot borrow anything more.
 *
 * @param loan - user loan
 * @param assetPrice - price of asset borrowing 14 d.p.
 * @param borrowFactor - borrow factor of asset borrowing 4 d.p.
 * @param targetBorrowUtilisationRatio - the utilisation ratio that you are targeting 4 d.p.
 * @returns bigint max asset amount
 */
function getMaxBorrowForBorrowUtilisationRatio(
  loan: UserLoanInfo,
  assetPrice: bigint,
  borrowFactor: bigint,
  targetBorrowUtilisationRatio: bigint,
): bigint {
  // if target is below actual, return 0
  if (targetBorrowUtilisationRatio <= loan.borrowUtilisationRatio) return BigInt(0);

  // calculate max
  const targetEffectiveBorrowBalanceValue = mulScale(
    loan.totalEffectiveCollateralBalanceValue,
    targetBorrowUtilisationRatio,
    ONE_4_DP,
  ); // 4 d.p.
  const deltaEffectiveBalanceValue = targetEffectiveBorrowBalanceValue - loan.totalEffectiveBorrowBalanceValue; // 4 d.p.
  const deltaBalanceValue = divScale(deltaEffectiveBalanceValue, borrowFactor, ONE_4_DP); // 4 d.p.
  const deltaAssetBalance = divScale(deltaBalanceValue, assetPrice, ONE_10_DP); // 0 d.p.
  return deltaAssetBalance;
}

/**
 *
 * Returns a group transaction to create loan escrow.
 *
 * @param loanAppId - loan application to add escrow for
 * @param userAddr - account address for the user
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and generated escrow account
 */
function prepareCreateUserLoan(
  loanAppId: number,
  userAddr: string,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const escrow = generateAccount();

  const userCall = addEscrowNoteTransaction(userAddr, escrow.addr.toString(), loanAppId, "la ", {
    ...params,
    flatFee: true,
    fee: 2000,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: escrow.addr,
    signer,
    appID: loanAppId,
    onComplete: OnApplicationComplete.OptInOC,
    method: getMethodByName(loanABIContract.methods, "create_loan"),
    methodArgs: [{ txn: userCall, signer }],
    rekeyTo: getApplicationAddress(loanAppId),
    suggestedParams: { ...params, flatFee: true, fee: 0 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return { txns, escrow };
}

/**
 *
 * Returns a transaction to add a collateral to a loan escrow.
 *
 * @param loanAppId - loan application to add collateral in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to add f asset of
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction add collateral to loan escrow transaction
 */
function prepareAddCollateralToLoan(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, fAssetId, poolManagerIndex, loans: poolLoans } = pool;

  const poolLoanIndex = poolLoans[loanAppId];
  if (poolLoanIndex === undefined) throw Error("Pool is not in loan");

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "add_collateral"),
    methodArgs: [escrowAddr, fAssetId, poolAppId, poolManagerIndex, poolLoanIndex, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a transaction to sync collateral of a loan escrow.
 *
 * @param loanAppId - loan application to sync collateral in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to sync collateral of
 * @param oracle - oracle application to retrieve asset price from
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] sync collateral group transaction
 */
function prepareSyncCollateralInLoan(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  oracle: Oracle,
  params: SuggestedParams,
): Transaction[] {
  const { appId: poolAppId, fAssetId } = pool;
  const { oracleAdapterAppId } = oracle;

  // refresh prices
  const lpAssets = "lpToken" in pool ? [pool.lpToken] : [];
  const baseAssetIds = "lpToken" in pool ? [] : [pool.assetId];
  const refreshPrices = prepareRefreshPricesInOracleAdapter(oracle, userAddr, lpAssets, baseAssetIds, params);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "sync_collateral"),
    methodArgs: [
      { txn: refreshPrices[refreshPrices.length - 1], signer },
      escrowAddr,
      fAssetId,
      poolAppId,
      poolManagerAppId,
      oracleAdapterAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 1000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return [...refreshPrices.slice(0, -1), ...txns];
}

/**
 *
 * Returns a transaction to sync collateral of a loan escrow.
 *
 * @param loanAppId - loan application to reduce collateral in
 * @param poolManagerAppId - pool manager application*
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param receiverAddr - account address to receive the collateral (typically the user's deposit escrow)
 * @param pool - pool to reduce collateral of
 * @param oracle - oracle application to retrieve asset prices from
 * @param lpAssets - list of lp assets in loan
 * @param baseAssetIds - list of base asset ids in loan (non-lp assets)
 * @param amount - the amount of asset / f asset to reduce the collateral by
 * @param isfAssetAmount - whether the amount of collateral to reduce by is expressed in terms of f asset or asset
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] reduce collateral group transaction
 */
function prepareReduceCollateralFromLoan(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  pool: Pool,
  oracle: Oracle,
  lpAssets: LPToken[],
  baseAssetIds: number[],
  amount: number | bigint,
  isfAssetAmount: boolean,
  params: SuggestedParams,
): Transaction[] {
  const { appId: poolAppId, assetId, fAssetId } = pool;
  const { oracleAdapterAppId } = oracle;

  const refreshPrices = prepareRefreshPricesInOracleAdapter(oracle, userAddr, lpAssets, baseAssetIds, params);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "reduce_collateral"),
    methodArgs: [
      { txn: refreshPrices[refreshPrices.length - 1], signer },
      escrowAddr,
      receiverAddr,
      assetId,
      fAssetId,
      amount,
      isfAssetAmount,
      poolAppId,
      poolManagerAppId,
      oracleAdapterAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 6000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return [...refreshPrices.slice(0, -1), ...txns];
}

/**
 *
 * Returns a transaction to begin swap collateral in a loan escrow.
 * Must be groped together with swap_collateral_end call.
 *
 * @param loanAppId - loan application to swap collateral in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param receiverAddr - account address to receive the collateral (typically the user's deposit escrow)
 * @param pool - pool to swap collateral of
 * @param amount - the amount of asset / f asset to reduce the collateral by
 * @param isfAssetAmount - whether the amount of collateral to reduce by is expressed in terms of f asset or asset
 * @param txnIndexForSwapCollateralEnd - transaction index in the group transaction for the swap_collateral_end call.
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction swap collateral begin transaction
 */
function prepareSwapCollateralInLoanBegin(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  pool: Pool,
  amount: number | bigint,
  isfAssetAmount: boolean,
  txnIndexForSwapCollateralEnd: number,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId, fAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "swap_collateral_begin"),
    methodArgs: [
      escrowAddr,
      receiverAddr,
      assetId,
      fAssetId,
      amount,
      isfAssetAmount,
      txnIndexForSwapCollateralEnd,
      poolAppId,
      poolManagerAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 6000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to end swap collateral in a loan escrow.
 * Must be groped together with swap_collateral_begin call.
 *
 * @param loanAppId - loan application to swap collateral in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param oracle - oracle application to retrieve asset prices from
 * @param lpAssets - list of lp assets in loan
 * @param baseAssetIds - list of base asset ids in loan (non-lp assets)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] swap collateral end group transaction
 */
function prepareSwapCollateralInLoanEnd(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  oracle: Oracle,
  lpAssets: LPToken[],
  baseAssetIds: number[],
  params: SuggestedParams,
): Transaction[] {
  const { oracleAdapterAppId } = oracle;

  const refreshPrices = prepareRefreshPricesInOracleAdapter(oracle, userAddr, lpAssets, baseAssetIds, params);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "swap_collateral_end"),
    methodArgs: [
      { txn: refreshPrices[refreshPrices.length - 1], signer },
      escrowAddr,
      poolManagerAppId,
      oracleAdapterAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 1000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return [...refreshPrices.slice(0, -1), ...txns];
}

/**
 *
 * Returns a transaction to remove collateral from loan escrow.
 *
 * @param loanAppId - loan application to remove collateral in
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to remove collateral of
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction remove collateral transaction
 */
function prepareRemoveCollateralFromLoan(
  loanAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, fAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "remove_collateral"),
    methodArgs: [escrowAddr, fAssetId, poolAppId],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to borrow using loan escrow.
 *
 * @param loanAppId - loan application to borrow in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param receiverAddr - account address to receive the borrow (typically the user)
 * @param pool - pool to borrow from
 * @param oracle - oracle application to retrieve asset prices from
 * @param lpAssets - list of lp assets in loan
 * @param baseAssetIds - list of base asset ids in loan (non-lp assets)
 * @param borrowAmount - amount to borrow of asset
 * @param maxStableRate - maximum stable rate of the borrow, if zero then borrow is interpreted as a variable rate borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] borrow group transaction
 */
function prepareBorrowFromLoan(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  pool: Pool,
  oracle: Oracle,
  lpAssets: LPToken[],
  baseAssetIds: number[],
  borrowAmount: number | bigint,
  maxStableRate: number | bigint, // if zero then variable borrow
  params: SuggestedParams,
): Transaction[] {
  const { appId: poolAppId, assetId, poolManagerIndex, loans: poolLoans } = pool;
  const { oracleAdapterAppId } = oracle;

  const poolLoanIndex = poolLoans[loanAppId];
  if (poolLoanIndex === undefined) throw Error("Pool is not in loan");

  const refreshPrices = prepareRefreshPricesInOracleAdapter(oracle, userAddr, lpAssets, baseAssetIds, params);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "borrow"),
    methodArgs: [
      { txn: refreshPrices[refreshPrices.length - 1], signer },
      escrowAddr,
      receiverAddr,
      assetId,
      borrowAmount,
      maxStableRate,
      poolManagerIndex,
      poolLoanIndex,
      poolAppId,
      poolManagerAppId,
      oracleAdapterAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 8000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return [...refreshPrices.slice(0, -1), ...txns];
}

/**
 *
 * Returns a transaction to switch borrow type of a loan borrow.
 *
 * @param loanAppId - loan application to switch borrow type in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to switch borrow type of
 * @param maxStableRate - maximum stable rate of the borrow, if zero then interpreted as switching a stable rate borrow to a variable rate borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] switch borrow type transaction
 */
function prepareSwitchBorrowTypeInLoan(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  maxStableRate: number | bigint, // ignored if not switching to stable borrow
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "switch_borrow_type"),
    methodArgs: [escrowAddr, assetId, maxStableRate, poolAppId, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 6000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to repay borrow in a loan escrow using assets sent from user.
 *
 * @param loanAppId - loan application to repay borrow in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param receiverAddr - account address to receive the rewards if any (typically the user's deposit escrow)
 * @param reserveAddr - account address to receive the protocol revenue from the percentage of the accrued interest
 * @param pool - pool to repay borrow of
 * @param repayAmount - amount of borrow to repay
 * @param isStable - whether the borrow that is being repaid is a stable or variable rate borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] reduce borrow with transaction group transaction
 */
function prepareRepayLoanWithTxn(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  reserveAddr: ReserveAddress,
  pool: Pool,
  repayAmount: number | bigint,
  isStable: boolean,
  params: SuggestedParams,
): Transaction[] {
  const { appId: poolAppId, assetId, frAssetId } = pool;

  const sendAsset = transferAlgoOrAsset(assetId, userAddr, getApplicationAddress(poolAppId).toString(), repayAmount, {
    ...params,
    flatFee: true,
    fee: 0,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "repay_with_txn"),
    methodArgs: [
      { txn: sendAsset, signer },
      escrowAddr,
      receiverAddr,
      reserveAddr,
      assetId,
      frAssetId,
      isStable,
      poolAppId,
      poolManagerAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 10000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a group transaction to repay borrow in a loan escrow using collateral.
 *
 * @param loanAppId - loan application to repay borrow in
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param receiverAddr - account address to receive the rewards if any (typically the user's deposit escrow)
 * @param reserveAddr - account address to receive the protocol revenue from the percentage of the accrued interest
 * @param pool - pool to repay borrow and use collateral of
 * @param repayAmount - amount of borrow to repay expressed in terms of the asset
 * @param isStable - whether the borrow that is being repaid is a stable or variable rate borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] repay borrow with collateral group transaction
 */
function prepareRepayLoanWithCollateral(
  loanAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  reserveAddr: ReserveAddress,
  pool: Pool,
  repayAmount: number | bigint,
  isStable: boolean,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId, fAssetId, frAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "repay_with_collateral"),
    methodArgs: [
      escrowAddr,
      receiverAddr,
      reserveAddr,
      assetId,
      fAssetId,
      frAssetId,
      repayAmount,
      isStable,
      poolAppId,
      poolManagerAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 14000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to repay borrow in a loan escrow using assets sent from user.
 *
 * @param loanAppId - loan application to repay borrow in
 * @param poolManagerAppId - pool manager application
 * @param liquidatorAddr - account address for the liquidator
 * @param escrowAddr - account address for the loan escrow
 * @param reserveAddr - account address to receive the protocol revenue from the percentage of the accrued interest
 * @param collateralPool - pool to seize collateral of
 * @param borrowPool - pool to repay borrow of
 * @param oracle - oracle application to retrieve asset prices from
 * @param lpAssets - list of lp assets in loan
 * @param baseAssetIds - list of base asset ids in loan (non-lp assets)
 * @param repayAmount - amount of borrow to repay expressed in terms of borrow pool asset
 * @param minCollateralAmount - minimum collateral amount for the liquidator to receive expressed in terms of collateral pool f asset
 * @param isStable - whether the borrow that is being repaid is a stable or variable rate borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] liquidate group transaction
 */
function prepareLiquidateLoan(
  loanAppId: number,
  poolManagerAppId: number,
  liquidatorAddr: string,
  escrowAddr: string,
  reserveAddr: ReserveAddress,
  collateralPool: Pool,
  borrowPool: Pool,
  oracle: Oracle,
  lpAssets: LPToken[],
  baseAssetIds: number[],
  repayAmount: number | bigint,
  minCollateralAmount: number | bigint,
  isStable: boolean,
  params: SuggestedParams,
): Transaction[] {
  const { appId: colPoolAppId, fAssetId } = collateralPool;
  const { appId: borPoolAppId, assetId } = borrowPool;
  const { oracleAdapterAppId } = oracle;

  const refreshPrices = prepareRefreshPricesInOracleAdapter(oracle, liquidatorAddr, lpAssets, baseAssetIds, params);

  const sendAsset = transferAlgoOrAsset(
    assetId,
    liquidatorAddr,
    getApplicationAddress(borPoolAppId).toString(),
    repayAmount,
    {
      ...params,
      flatFee: true,
      fee: 0,
    },
  );

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: liquidatorAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "liquidate"),
    methodArgs: [
      { txn: refreshPrices[refreshPrices.length - 1], signer },
      { txn: sendAsset, signer },
      escrowAddr,
      reserveAddr,
      assetId,
      fAssetId,
      minCollateralAmount,
      isStable,
      colPoolAppId,
      borPoolAppId,
      poolManagerAppId,
      oracleAdapterAppId,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 10000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a transaction to rebalance up borrow in a loan escrow.
 *
 * @param loanAppId - loan application to rebalance up borrow in
 * @param poolManagerAppId - pool manager application*
 * @param rebalancerAddr - account address for the rebalancer
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to rebalance
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction rebalance up transaction
 */
function prepareRebalanceUpLoan(
  loanAppId: number,
  poolManagerAppId: number,
  rebalancerAddr: string,
  escrowAddr: string,
  pool: Pool,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: rebalancerAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "rebalance_up"),
    methodArgs: [escrowAddr, assetId, poolAppId, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 5000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a transaction to rebalance up borrow in a loan escrow.
 *
 * @param loanAppId - loan application to rebalance down borrow in
 * @param poolManagerAppId - pool manager application
 * @param rebalancerAddr - account address for the rebalancer
 * @param escrowAddr - account address for the loan escrow
 * @param pool - pool to rebalance
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction rebalance down transaction
 */
function prepareRebalanceDownLoan(
  loanAppId: number,
  poolManagerAppId: number,
  rebalancerAddr: string,
  escrowAddr: string,
  pool: Pool,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: rebalancerAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "rebalance_down"),
    methodArgs: [escrowAddr, assetId, poolAppId, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 5000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to remove a user's loan escrow and return its minimum balance to the user.
 *
 * @param loanAppId - loan application to remove loan in
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the loan escrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] remove and close out loan escrow group transaction
 */
function prepareRemoveUserLoan(
  loanAppId: number,
  userAddr: string,
  escrowAddr: string,
  params: SuggestedParams,
): Transaction[] {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: loanAppId,
    method: getMethodByName(loanABIContract.methods, "remove_loan"),
    methodArgs: [escrowAddr],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  const optOutTx = makeApplicationCloseOutTxnFromObject({
    sender: escrowAddr,
    appIndex: loanAppId,
    suggestedParams: { ...params, flatFee: true, fee: 0 },
  });
  const closeToTx = removeEscrowNoteTransaction(escrowAddr, userAddr, "lr ", { ...params, flatFee: true, fee: 0 });
  return [txns[0], optOutTx, closeToTx];
}

/**
 *
 * Returns a transaction to begin flash loan
 * Must be groped together with flash_loan_end call.
 *
 * @param pool - pool to borrow from
 * @param userAddr - account address for the user
 * @param receiverAddr - account address to receive the loan
 * @param borrowAmount - the amount of the asset to borrow
 * @param txnIndexForFlashLoanEnd - transaction index in the group transaction for the flash_loan_end call.
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction flash loan begin transaction
 */
function prepareFlashLoanBegin(
  pool: Pool,
  userAddr: string,
  receiverAddr: string,
  borrowAmount: number | bigint,
  txnIndexForFlashLoanEnd: number,
  params: SuggestedParams,
): Transaction {
  const { appId, assetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: appId,
    method: getMethodByName(poolABIContract.methods, "flash_loan_begin"),
    methodArgs: [borrowAmount, txnIndexForFlashLoanEnd, receiverAddr, assetId],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to end flash loan.
 * Must be groped together with flash_loan_begin call.
 *
 * @param pool - pool borrowed from
 * @param userAddr - account address for the user
 * @param reserveAddr - account address to receive the protocol revenue from the flash loan fee
 * @param repaymentAmount - the amount of the asset to repay (borrow amount plus flash loan fee)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] flash loan end group transaction
 */
function prepareFlashLoanEnd(
  pool: Pool,
  userAddr: string,
  reserveAddr: ReserveAddress,
  repaymentAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId, assetId } = pool;

  const sendAsset = transferAlgoOrAsset(assetId, userAddr, getApplicationAddress(appId).toString(), repaymentAmount, {
    ...params,
    flatFee: true,
    fee: 0,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: appId,
    method: getMethodByName(poolABIContract.methods, "flash_loan_end"),
    methodArgs: [{ txn: sendAsset, signer }, reserveAddr, assetId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Wraps given transactions with flash loan.
 *
 * @param txns - txns to wrap flash loan around
 * @param pool - pool to borrow from
 * @param userAddr - account address for the user
 * @param receiverAddr - account address to receive the loan
 * @param reserveAddr - account address to receive the protocol revenue from the flash loan fee
 * @param borrowAmount - the amount of the asset to borrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @param flashLoanFee - fee for flash loan as 16 d.p integer (default 0.1%)
 * @returns Transaction[] group transaction wrapped with flash loan
 */
function wrapWithFlashLoan(
  txns: Transaction[],
  pool: Pool,
  userAddr: string,
  receiverAddr: string,
  reserveAddr: ReserveAddress,
  borrowAmount: number | bigint,
  params: SuggestedParams,
  flashLoanFee: bigint = BigInt(0.001e16),
): Transaction[] {
  // clear group id in passed txns
  const wrappedTxns = txns.map((txn) => {
    txn.group = undefined;
    return txn;
  });

  // add flash loan begin
  const txnIndexForFlashLoanEnd = txns.length + 2;
  const flashLoanBegin = prepareFlashLoanBegin(
    pool,
    userAddr,
    receiverAddr,
    borrowAmount,
    txnIndexForFlashLoanEnd,
    params,
  );
  wrappedTxns.unshift(flashLoanBegin);

  // add flash loan end
  const repaymentAmount = calcFlashLoanRepayment(BigInt(borrowAmount), flashLoanFee);
  const flashLoanEnd = prepareFlashLoanEnd(pool, userAddr, reserveAddr, repaymentAmount, params);
  wrappedTxns.push(...flashLoanEnd);

  // return txns wrapped with flash loan
  return wrappedTxns;
}

export {
  retrieveLoanInfo,
  retrieveLoansLocalState,
  retrieveLoanLocalState,
  userLoanInfo,
  retrieveUserLoansInfo,
  retrieveUserLoanInfo,
  retrieveLiquidatableLoans,
  getMaxReduceCollateralForBorrowUtilisationRatio,
  getMaxBorrowForBorrowUtilisationRatio,
  prepareCreateUserLoan,
  prepareAddCollateralToLoan,
  prepareSyncCollateralInLoan,
  prepareReduceCollateralFromLoan,
  prepareSwapCollateralInLoanBegin,
  prepareSwapCollateralInLoanEnd,
  prepareRemoveCollateralFromLoan,
  prepareBorrowFromLoan,
  prepareSwitchBorrowTypeInLoan,
  prepareRepayLoanWithTxn,
  prepareRepayLoanWithCollateral,
  prepareLiquidateLoan,
  prepareRebalanceUpLoan,
  prepareRebalanceDownLoan,
  prepareRemoveUserLoan,
  prepareFlashLoanBegin,
  prepareFlashLoanEnd,
  wrapWithFlashLoan,
};
