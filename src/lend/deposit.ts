import {
  AtomicTransactionComposer,
  decodeUint64,
  encodeAddress,
  generateAccount,
  getApplicationAddress,
  getMethodByName,
  makeApplicationCloseOutTxn,
  OnApplicationComplete,
} from "algosdk";

import { compoundEveryHour, compoundEverySecond, mulScale, ONE_10_DP, ONE_16_DP, UINT64 } from "../math-lib";
import {
  addEscrowNoteTransaction,
  fromIntToByteHex,
  getAccountDetails,
  getApplicationGlobalState,
  getParsedValueFromState,
  parseBitsAsBooleans,
  parseUint64s,
  removeEscrowNoteTransaction,
  signer,
  transferAlgoOrAsset,
} from "../utils";

import { depositsABIContract, poolABIContract } from "./abi-contracts";
import { calcBorrowInterestIndex, calcDepositInterestIndex, calcWithdrawReturn } from "./formulae";
import { getOraclePrices } from "./oracle";
import { getEscrows } from "./utils";

import type { UserDepositFullInfo, Oracle, Pool, PoolInfo, PoolManagerInfo, UserDepositInfo } from "./types";
import type { Account, Algodv2, Indexer, SuggestedParams, Transaction } from "algosdk";

/**
 *
 * Returns information regarding the given pool manager.
 *
 * @param client - Algorand client to query
 * @param poolManagerAppId - pool manager application to query about
 * @returns Promise<PoolManagerInfo[]> pool manager info
 */
async function retrievePoolManagerInfo(client: Algodv2 | Indexer, poolManagerAppId: number): Promise<PoolManagerInfo> {
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, poolManagerAppId);
  if (state === undefined) throw Error("Could not find Pool Manager");

  const adminAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "admin")), "base64"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pools: Record<number, any> = {};
  for (let i = 0; i < 63; i++) {
    const poolBase64Value = String(getParsedValueFromState(state, fromIntToByteHex(i), "hex"));
    const poolValue = Buffer.from(poolBase64Value, "base64").toString("hex");
    for (let j = 0; j < 3; j++) {
      const basePos = j * 84;
      const poolAppId = Number("0x" + poolValue.slice(basePos, basePos + 12));

      // add pool
      if (poolAppId > 0) {
        const vbir = BigInt("0x" + poolValue.slice(basePos + 12, basePos + 28));
        const vbiit1 = BigInt("0x" + poolValue.slice(basePos + 28, basePos + 44));
        const dir = BigInt("0x" + poolValue.slice(basePos + 44, basePos + 60));
        const diit1 = BigInt("0x" + poolValue.slice(basePos + 60, basePos + 76));
        const lu = BigInt("0x" + poolValue.slice(basePos + 76, basePos + 84));

        const vbii = calcBorrowInterestIndex(vbir, vbiit1, lu);
        const dii = calcDepositInterestIndex(dir, diit1, lu);

        pools[poolAppId] = {
          variableBorrowInterestRate: vbir,
          variableBorrowInterestYield: compoundEverySecond(vbir, ONE_16_DP),
          variableBorrowInterestIndex: vbii,
          depositInterestRate: dir,
          depositInterestYield: compoundEveryHour(dir, ONE_16_DP),
          depositInterestIndex: dii,
          metadata: {
            oldVariableBorrowInterestIndex: vbiit1,
            oldDepositInterestIndex: diit1,
            oldTimestamp: lu,
          },
        };
      }
    }
  }

  return { currentRound, adminAddress, pools };
}

/**
 *
 * Returns information regarding the given pool.
 *
 * @param client - Algorand client to query
 * @param pool - pool application to query about
 * @returns Promise<PoolInfo> pool info
 */
async function retrievePoolInfo(client: Algodv2 | Indexer, pool: Pool): Promise<PoolInfo> {
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, pool.appId);
  if (state === undefined) throw Error("Could not find Pool");

  const poolManagerAppId = decodeUint64(Buffer.from(String(getParsedValueFromState(state, "pm")), "base64").subarray(0, 8), "safe");
  const poolAdminAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "ad")), "base64"));
  const paramsAdminAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "pad")), "base64"));
  const configAdminAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "cad")), "base64"));
  const loansAdminAddress = encodeAddress(Buffer.from(String(getParsedValueFromState(state, "lad")), "base64"));
  const varBor = parseUint64s(String(getParsedValueFromState(state, "v")));
  const stblBor = parseUint64s(String(getParsedValueFromState(state, "s")));
  const interest = parseUint64s(String(getParsedValueFromState(state, "i")));
  const caps = parseUint64s(String(getParsedValueFromState(state, "ca")));
  const config = parseBitsAsBooleans(String(getParsedValueFromState(state, "co")));

  // combine
  return {
    currentRound,
    poolManagerAppId,
    poolAdminAddress,
    paramsAdminAddress,
    configAdminAddress,
    loansAdminAddress,
    variableBorrow: {
      vr0: varBor[0],
      vr1: varBor[1],
      vr2: varBor[2],
      totalVariableBorrowAmount: varBor[3],
      variableBorrowInterestRate: varBor[4],
      variableBorrowInterestYield: compoundEverySecond(varBor[4], ONE_16_DP),
      variableBorrowInterestIndex: calcBorrowInterestIndex(varBor[4], varBor[5], interest[6]),
    },
    stableBorrow: {
      sr0: stblBor[0],
      sr1: stblBor[1],
      sr2: stblBor[2],
      sr3: stblBor[3],
      optimalStableToTotalDebtRatio: stblBor[4],
      rebalanceUpUtilisationRatio: stblBor[5],
      rebalanceUpDepositInterestRate: stblBor[6],
      rebalanceDownDelta: stblBor[7],
      totalStableBorrowAmount: stblBor[8],
      stableBorrowInterestRate: stblBor[9],
      stableBorrowInterestYield: compoundEverySecond(stblBor[9], ONE_16_DP),
      overallStableBorrowInterestAmount: stblBor[10] * UINT64 + stblBor[11],
    },
    interest: {
      retentionRate: interest[0],
      flashLoanFee: interest[1],
      optimalUtilisationRatio: interest[2],
      totalDeposits: interest[3],
      depositInterestRate: interest[4],
      depositInterestYield: compoundEveryHour(interest[4], ONE_16_DP),
      depositInterestIndex: calcDepositInterestIndex(interest[4], interest[5], interest[6]),
      latestUpdate: interest[6],
    },
    caps: {
      borrowCap: caps[0],
      stableBorrowPercentageCap: caps[1],
    },
    config: {
      depreciated: config[0],
      rewardsPaused: config[1],
      stableBorrowSupported: config[2],
      flashLoanSupported: config[3],
    },
  };
}

/**
 *
 * Returns basic information regarding the given user's deposit escrows.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param depositsAppId - deposits application to query about
 * @param userAddr - account address for the user
 * @returns Promise<UserDepositInfo[]> user deposits info
 */
async function retrieveUserDepositsInfo(
  indexerClient: Indexer,
  depositsAppId: number,
  userAddr: string,
): Promise<UserDepositInfo[]> {
  const userDepositsInfo: UserDepositInfo[] = [];

  // get users' escrows
  const escrows: Set<string> = await getEscrows(indexerClient, userAddr, depositsAppId, "da ", "dr ");

  // get all remaining escrows' holdings
  for (const escrowAddr of escrows) {
    const { currentRound, holdings: assetHoldings } = await getAccountDetails(indexerClient, escrowAddr);
    const holdings: { fAssetId: number; fAssetBalance: bigint }[] = [];
    for (const [assetId, balance] of assetHoldings.entries()) {
      if (assetId !== 0) holdings.push({ fAssetId: assetId, fAssetBalance: balance });
    }
    userDepositsInfo.push({ currentRound, escrowAddress: escrowAddr, holdings });
  }

  return userDepositsInfo;
}

/**
 *
 * Returns full information regarding the given user's deposit escrows.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param poolManagerAppId - pool manager application to query about
 * @param depositsAppId - deposits application to query about
 * @param pools - pools in pool manager (either MainnetPools or TestnetPools)
 * @param oracle - oracle to query
 * @param userAddr - account address for the user
 * @returns Promise<UserDepositFullInfo[]> user deposits full info
 */
async function retrieveUserDepositsFullInfo(
  indexerClient: Indexer,
  poolManagerAppId: number,
  depositsAppId: number,
  pools: Record<string, Pool>,
  oracle: Oracle,
  userAddr: string,
): Promise<UserDepositFullInfo[]> {
  // get all prerequisites
  const userDepositsInfoReq = retrieveUserDepositsInfo(indexerClient, depositsAppId, userAddr);
  const poolManagerInfoReq = retrievePoolManagerInfo(indexerClient, poolManagerAppId);
  const oraclePricesReq = getOraclePrices(indexerClient, oracle);
  const [userDepositsInfo, poolManagerInfo, { prices }] = await Promise.all([
    userDepositsInfoReq,
    poolManagerInfoReq,
    oraclePricesReq,
  ]);

  // map from UserDepositInfo to ExtendedUserDepositInfo
  return userDepositsInfo.map((deposit) => {
    const holdings = deposit.holdings.map(({ fAssetId, fAssetBalance }) => {
      const pool = Object.entries(pools)
        .map(([, pool]) => pool)
        .find((pool) => pool.fAssetId === fAssetId);
      if (pool === undefined) throw Error("Could not find pool with fAsset " + fAssetId);
      const poolAppId = pool.appId;
      const assetId = pool.assetId;

      const poolInfo = poolManagerInfo.pools[poolAppId];
      if (poolInfo === undefined) throw Error("Could not find pool " + poolAppId);
      const { depositInterestIndex, depositInterestRate, depositInterestYield } = poolInfo;

      const oraclePrice = prices[assetId];
      if (oraclePrice === undefined) throw Error("Could not find asset price " + assetId);
      const { price: assetPrice } = oraclePrice;

      const assetBalance = calcWithdrawReturn(fAssetBalance, depositInterestIndex);
      const balanceValue = mulScale(assetBalance, assetPrice, ONE_10_DP); // 4 d.p.

      return {
        fAssetId,
        fAssetBalance,
        poolAppId,
        assetId,
        assetPrice,
        assetBalance,
        balanceValue,
        interestRate: depositInterestRate,
        interestYield: depositInterestYield,
      };
    });
    return { ...deposit, holdings };
  });
}

/**
 *
 * Returns information regarding the given user's deposit escrows.
 *
 * @param client - Algorand client to query
 * @param depositsAppId - deposits application to query about
 * @param escrowAddr - account address for the deposit escrow
 * @returns Promise<UserDepositInfo> user deposit info
 */
async function retrieveUserDepositInfo(
  client: Algodv2 | Indexer,
  depositsAppId: number,
  escrowAddr: string,
): Promise<UserDepositInfo> {
  const { currentRound, holdings: assetHoldings } = await getAccountDetails(client, escrowAddr);
  const holdings: { fAssetId: number; fAssetBalance: bigint }[] = [];
  for (const [assetId, balance] of assetHoldings.entries()) {
    if (assetId !== 0) holdings.push({ fAssetId: assetId, fAssetBalance: balance });
  }
  return { currentRound, escrowAddress: escrowAddr, holdings };
}

/**
 *
 * Returns a group transaction to add escrow before depositing.
 *
 * @param depositsAppId - deposits application to add an escrow for
 * @param userAddr - account address for the user
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and generated escrow account
 */
function prepareAddDepositEscrowToDeposits(
  depositsAppId: number,
  userAddr: string,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const escrow = generateAccount();

  const userCall = addEscrowNoteTransaction(userAddr, escrow.addr, depositsAppId, "da ", {
    ...params,
    flatFee: true,
    fee: 2000,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: escrow.addr,
    signer,
    appID: depositsAppId,
    onComplete: OnApplicationComplete.OptInOC,
    method: getMethodByName(depositsABIContract.methods, "add_deposit_escrow"),
    methodArgs: [{ txn: userCall, signer }],
    rekeyTo: getApplicationAddress(depositsAppId),
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
 * Returns a transaction to opt deposits escrow into asset so that it can hold a given pool's f asset.
 *
 * @param depositsAppId - deposits application of escrow
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit escrow
 * @param pool - pool to add f asset of
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction opt deposit escrow into asset transaction
 */
function prepareOptDepositEscrowIntoAssetInDeposits(
  depositsAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, fAssetId, poolManagerIndex } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositsAppId,
    method: getMethodByName(depositsABIContract.methods, "opt_escrow_into_asset"),
    methodArgs: [escrowAddr, poolManagerAppId, poolAppId, fAssetId, poolManagerIndex],
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
 * Returns a transaction to deposit asset into given pool.
 *
 * @param pool - pool application to deposit into
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param receiverAddr - account address to receive the deposit (typically the user's deposit escrow or loan escrow)
 * @param assetAmount - the asset amount to deposit
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note field to add
 * @returns Transaction[] deposit asset group transaction
 */
function prepareDepositIntoPool(
  pool: Pool,
  poolManagerAppId: number,
  userAddr: string,
  receiverAddr: string,
  assetAmount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const { appId, assetId, fAssetId } = pool;

  const sendAsset = transferAlgoOrAsset(assetId, userAddr, getApplicationAddress(appId), assetAmount, {
    ...params,
    flatFee: true,
    fee: 0,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: appId,
    method: getMethodByName(poolABIContract.methods, "deposit"),
    methodArgs: [{ txn: sendAsset, signer }, receiverAddr, assetId, fAssetId, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
    note,
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a transaction to withdraw from a deposits escrow
 *
 * @param depositsAppId - deposits application of escrow
 * @param pool - pool to withdraw from
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit escrow
 * @param receiverAddr - account address to receive the withdrawal (typically the same as the user address)
 * @param amount - the amount of asset / f asset to send to withdraw from escrow.
 * @param isfAssetAmount - whether the amount to withdraw is expressed in terms of f asset or asset
 * @param remainDeposited - whether receiver should get f asset or asset (cannot remain deposited and use asset amount)
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction withdraw from deposit escrow transaction
 */
function prepareWithdrawFromDepositEscrowInDeposits(
  depositsAppId: number,
  pool: Pool,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  amount: number | bigint,
  isfAssetAmount: boolean,
  remainDeposited: boolean,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId, fAssetId, poolManagerIndex } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositsAppId,
    method: getMethodByName(depositsABIContract.methods, "withdraw"),
    methodArgs: [
      escrowAddr,
      receiverAddr,
      poolManagerAppId,
      poolAppId,
      assetId,
      fAssetId,
      amount,
      isfAssetAmount,
      remainDeposited,
      poolManagerIndex,
    ],
    suggestedParams: { ...params, flatFee: true, fee: remainDeposited ? 2000 : 6000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to withdraw from a user's wallet
 *
 * @param pool - pool to withdraw from
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param receiverAddr - account address to receive the withdrawal (typically the same as the user address)
 * @param fAssetAmount - the amount of f asset to send to the pool
 * @param receivedAssetAmount - the amount of asset to receive. Any excess f asset sent will be returned to the deposit escrow. If zero then interpreted as variable withdrawal.
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] withdraw from user's wallet group transaction
 */
function prepareWithdrawFromPool(
  pool: Pool,
  poolManagerAppId: number,
  userAddr: string,
  receiverAddr: string,
  fAssetAmount: number | bigint,
  receivedAssetAmount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const { appId: poolAppId, assetId, fAssetId } = pool;

  const sendfAsset = transferAlgoOrAsset(fAssetId, userAddr, getApplicationAddress(poolAppId), fAssetAmount, {
    ...params,
    flatFee: true,
    fee: 0,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: poolAppId,
    method: getMethodByName(poolABIContract.methods, "withdraw"),
    methodArgs: [{ txn: sendfAsset, signer }, receivedAssetAmount, receiverAddr, assetId, fAssetId, poolManagerAppId],
    suggestedParams: { ...params, flatFee: true, fee: 5000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a transaction to update a pool's interest indexes
 *
 * @param pool - pool to update
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] update pool's interest indexes transaction
 */
function prepareUpdatePoolInterestIndexes(
  pool: Pool,
  poolManagerAppId: number,
  userAddr: string,
  params: SuggestedParams,
): Transaction {
  const { appId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: appId,
    method: getMethodByName(poolABIContract.methods, "update_pool_interest_indexes"),
    methodArgs: [poolManagerAppId],
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
 * Returns a transaction to remove asset from deposit escrow
 *
 * @param depositsAppId - deposits application of escrow
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit escrow
 * @param pool - pool to remove f asset of
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction opt out deposit escrow from asset transaction
 */
function prepareOptOutDepositEscrowFromAssetInDeposits(
  depositsAppId: number,
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
    appID: depositsAppId,
    method: getMethodByName(depositsABIContract.methods, "close_out_escrow_from_asset"),
    methodArgs: [escrowAddr, getApplicationAddress(poolAppId), fAssetId],
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
 * Returns a group transaction to remove a user's deposit escrow and return its minimum balance to the user.
 *
 * @param depositsAppId - deposits application of escrow
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit escrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] remove and close out deposit escrow group transaction
 */
function prepareRemoveDepositEscrowFromDeposits(
  depositsAppId: number,
  userAddr: string,
  escrowAddr: string,
  params: SuggestedParams,
): Transaction[] {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositsAppId,
    method: getMethodByName(depositsABIContract.methods, "remove_deposit_escrow"),
    methodArgs: [escrowAddr],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  const optOutTx = makeApplicationCloseOutTxn(escrowAddr, { ...params, flatFee: true, fee: 0 }, depositsAppId);
  const closeToTx = removeEscrowNoteTransaction(escrowAddr, userAddr, "dr ", { ...params, flatFee: true, fee: 0 });
  return [txns[0], optOutTx, closeToTx];
}

export {
  retrievePoolManagerInfo,
  retrievePoolInfo,
  retrieveUserDepositsInfo,
  retrieveUserDepositsFullInfo,
  retrieveUserDepositInfo,
  prepareAddDepositEscrowToDeposits,
  prepareOptDepositEscrowIntoAssetInDeposits,
  prepareDepositIntoPool,
  prepareWithdrawFromDepositEscrowInDeposits,
  prepareWithdrawFromPool,
  prepareUpdatePoolInterestIndexes,
  prepareOptOutDepositEscrowFromAssetInDeposits,
  prepareRemoveDepositEscrowFromDeposits,
};
