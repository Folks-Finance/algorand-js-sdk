import type { Account, Algodv2, Indexer, SuggestedParams, Transaction } from "algosdk";
import {
  AtomicTransactionComposer,
  generateAccount,
  getApplicationAddress,
  getMethodByName,
  makeApplicationCloseOutTxn,
  OnApplicationComplete,
} from "algosdk";
import { maximum } from "../math-lib";
import {
  addEscrowNoteTransaction,
  fromIntToByteHex,
  getAccountApplicationLocalState,
  getAccountDetails,
  getApplicationGlobalState,
  getParsedValueFromState,
  removeEscrowNoteTransaction,
  signer,
  unixTime,
} from "../utils";
import { depositStakingABIContract } from "./abi-contracts";
import type { DepositStakingInfo, Pool, UserDepositStakingLocalState } from "./types";
import { depositStakingLocalState, depositStakingProgramsInfo, getEscrows, userDepositStakingInfo } from "./utils";

/**
 *
 * Returns information regarding the given deposit staking application.
 *
 * @param client - Algorand client to query
 * @param depositStakingAppId - deposit staking application to query about
 * @returns Promise<DepositStakingInfo> pool info
 */
async function retrieveDepositStakingInfo(
  client: Algodv2 | Indexer,
  depositStakingAppId: number,
): Promise<DepositStakingInfo> {
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, depositStakingAppId);
  if (state === undefined) throw Error("Could not find Deposit Staking");

  // initialise staking program
  const stakingPrograms = [];
  for (let i = 0; i <= 5; i++) {
    const prefix = "S".charCodeAt(0).toString(16);
    const stakeBase64Value = String(getParsedValueFromState(state, prefix + fromIntToByteHex(i), "hex"));
    const stakeValue = Buffer.from(stakeBase64Value, "base64").toString("hex");

    for (let j = 0; j <= 4; j++) {
      const basePos = j * 46;

      const rewards: {
        rewardAssetId: number;
        endTimestamp: bigint;
        rewardRate: bigint;
        rewardPerToken: bigint;
      }[] = [];
      stakingPrograms.push({
        poolAppId: Number("0x" + stakeValue.slice(basePos, basePos + 12)),
        totalStaked: BigInt("0x" + stakeValue.slice(basePos + 12, basePos + 28)),
        minTotalStaked: BigInt("0x" + stakeValue.slice(basePos + 28, basePos + 44)),
        stakeIndex: i * 5 + j,
        numRewards: Number("0x" + stakeValue.slice(basePos + 44, basePos + 46)),
        rewards,
      });
    }
  }

  // add rewards
  for (let i = 0; i <= 22; i++) {
    const prefix = "R".charCodeAt(0).toString(16);
    const rewardBase64Value = String(getParsedValueFromState(state, prefix + fromIntToByteHex(i), "hex"));
    const rewardValue = Buffer.from(rewardBase64Value, "base64").toString("hex");
    for (let j = 0; j <= (i !== 22 ? 3 : 1); j++) {
      const basePos = j * 60;

      const stakeIndex = Number(BigInt(i * 4 + j) / BigInt(3));
      const localRewardIndex = Number(BigInt(i * 4 + j) % BigInt(3));
      const { totalStaked, minTotalStaked, rewards, numRewards } = stakingPrograms[stakeIndex];
      if (localRewardIndex >= numRewards) continue;

      const ts = maximum(totalStaked, minTotalStaked);
      const endTimestamp = BigInt("0x" + rewardValue.slice(basePos + 12, basePos + 20));
      const lu = BigInt("0x" + rewardValue.slice(basePos + 20, basePos + 28));
      const rewardRate = BigInt("0x" + rewardValue.slice(basePos + 28, basePos + 44));
      const rpt = BigInt("0x" + rewardValue.slice(basePos + 44, basePos + 60));
      const currTime = BigInt(unixTime());
      const dt = currTime <= endTimestamp ? currTime - lu : lu <= endTimestamp ? endTimestamp - lu : BigInt(0);
      const rewardPerToken = rpt + (rewardRate * dt) / ts;

      rewards.push({
        rewardAssetId: Number("0x" + rewardValue.slice(basePos, basePos + 12)),
        endTimestamp,
        rewardRate,
        rewardPerToken,
      });
    }
  }

  // combine
  return { currentRound, stakingPrograms };
}

/**
 *
 * Returns local state regarding the deposit staking escrows of a given user.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param depositStakingAppId - deposit staking application to query about
 * @param userAddr - account address for the user
 * @returns Promise<UserDepositStakingLocalState[]> deposit staking escrows' local state
 */
async function retrieveUserDepositStakingsLocalState(
  indexerClient: Indexer,
  depositStakingAppId: number,
  userAddr: string,
): Promise<UserDepositStakingLocalState[]> {
  const depositStakingsLocalState: UserDepositStakingLocalState[] = [];

  const escrows = await getEscrows(indexerClient, userAddr, depositStakingAppId, "fa ", "fr ");

  // get all remaining deposit stakings' local state
  for (const escrowAddr of escrows) {
    const [{ holdings }, { currentRound, localState: state }] = await Promise.all([
      getAccountDetails(indexerClient, escrowAddr),
      getAccountApplicationLocalState(indexerClient, depositStakingAppId, escrowAddr),
    ]);

    const optedIntoAssets: Set<number> = new Set(holdings.keys());
    if (state === undefined)
      throw Error(`Could not find deposit staking ${depositStakingAppId} in escrow ${escrowAddr}`);

    depositStakingsLocalState.push({
      ...depositStakingLocalState(state, depositStakingAppId, escrowAddr),
      currentRound,
      optedIntoAssets,
    });
  }

  return depositStakingsLocalState;
}

/**
 *
 * Returns local state regarding the deposit staking escrows of a given user.
 * Use for advanced use cases where optimising number of network request.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param depositStakingAppId - deposit staking application to query about
 * @param escrowAddr - account address for the deposit staking escrow
 * @returns Promise<UserDepositStakingLocalState> deposit staking escrows' local state
 */
async function retrieveUserDepositStakingLocalState(
  indexerClient: Indexer,
  depositStakingAppId: number,
  escrowAddr: string,
): Promise<UserDepositStakingLocalState> {
  const { currentRound, localState: state } = await getAccountApplicationLocalState(
    indexerClient,
    depositStakingAppId,
    escrowAddr,
  );
  if (state === undefined) throw Error(`Could not find deposit staking ${depositStakingAppId} in escrow ${escrowAddr}`);
  return { currentRound, ...depositStakingLocalState(state, depositStakingAppId, escrowAddr) };
}

/**
 *
 * Returns a group transaction to deposit staking escrow.
 *
 * @param depositStakingAppId - deposit staking application to query about
 * @param userAddr - account address for the user
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: Account } object containing group transaction and generated escrow account
 */
function prepareAddDepositStakingEscrow(
  depositStakingAppId: number,
  userAddr: string,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: Account } {
  const escrow = generateAccount();

  const userCall = addEscrowNoteTransaction(userAddr, escrow.addr, depositStakingAppId, "fa ", {
    ...params,
    flatFee: true,
    fee: 2000,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: escrow.addr,
    signer,
    appID: depositStakingAppId,
    onComplete: OnApplicationComplete.OptInOC,
    method: getMethodByName(depositStakingABIContract.methods, "add_f_staking_escrow"),
    methodArgs: [{ txn: userCall, signer }],
    rekeyTo: getApplicationAddress(depositStakingAppId),
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
 * Returns a transaction to opt deposit staking escrow into asset so that it can hold a given pool's f asset.
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param pool - pool to add f asset of
 * @param stakeIndex - staking program index
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction opt deposit staking escrow into asset transaction
 */
function prepareOptDepositStakingEscrowIntoAsset(
  depositStakingAppId: number,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  pool: Pool,
  stakeIndex: number,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, fAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "opt_escrow_into_asset"),
    methodArgs: [escrowAddr, poolAppId, fAssetId, stakeIndex],
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
 * Returns a transaction to sync stake of deposit staking escrow
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param pool - pool to sync stake of
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param stakeIndex - staking program index
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction sync stake of deposit staking escrow transaction
 */
function prepareSyncStakeInDepositStakingEscrow(
  depositStakingAppId: number,
  pool: Pool,
  userAddr: string,
  escrowAddr: string,
  stakeIndex: number,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, fAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "sync_stake"),
    methodArgs: [escrowAddr, poolAppId, fAssetId, stakeIndex],
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
 * Returns a transaction to claim the rewards of a deposit staking escrow
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param receiverAddr - account address to receive the withdrawal (typically the same as the user address)
 * @param stakeIndex - staking program index
 * @param rewardAssetIds - the asset ids of all the rewards assets claiming
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction withdraw from deposit staking escrow transaction
 */
function prepareClaimRewardsOfDepositStakingEscrow(
  depositStakingAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  stakeIndex: number,
  rewardAssetIds: number[],
  params: SuggestedParams,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "claim_rewards"),
    methodArgs: [escrowAddr, receiverAddr, stakeIndex],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  txns[0].appForeignAssets = rewardAssetIds;
  return txns[0];
}

/**
 *
 * Returns a transaction to withdraw from a deposit staking escrow
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param pool - pool to withdraw from
 * @param poolManagerAppId - pool manager application
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param receiverAddr - account address to receive the withdrawal (typically the same as the user address)
 * @param amount - the amount of asset / f asset to send to withdraw from escrow.
 * @param isfAssetAmount - whether the amount to withdraw is expressed in terms of f asset or asset
 * @param remainDeposited - whether receiver should get f asset or asset (cannot remain deposited and use asset amount)
 * @param stakeIndex - staking program index
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction withdraw from deposit staking escrow transaction
 */
function prepareWithdrawFromDepositStakingEscrow(
  depositStakingAppId: number,
  pool: Pool,
  poolManagerAppId: number,
  userAddr: string,
  escrowAddr: string,
  receiverAddr: string,
  amount: number | bigint,
  isfAssetAmount: boolean,
  remainDeposited: boolean,
  stakeIndex: number,
  params: SuggestedParams,
): Transaction {
  const { appId: poolAppId, assetId, fAssetId } = pool;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "withdraw_stake"),
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
      stakeIndex,
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
 * Returns a transaction to remove asset from deposit staking escrow
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param pool - pool to remove f asset of
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction opt out deposit staking escrow from asset transaction
 */
function prepareOptOutDepositStakingEscrowFromAsset(
  depositStakingAppId: number,
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
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "close_out_escrow_from_asset"),
    methodArgs: [escrowAddr, getApplicationAddress(poolAppId), fAssetId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to remove a user's deposit staking escrow and return its minimum balance to the user.
 *
 * @param depositStakingAppId - deposit staking application of escrow
 * @param userAddr - account address for the user
 * @param escrowAddr - account address for the deposit staking escrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] remove and close out deposit staking escrow group transaction
 */
function prepareRemoveDepositStakingEscrow(
  depositStakingAppId: number,
  userAddr: string,
  escrowAddr: string,
  params: SuggestedParams,
) {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: userAddr,
    signer,
    appID: depositStakingAppId,
    method: getMethodByName(depositStakingABIContract.methods, "remove_f_staking_escrow"),
    methodArgs: [escrowAddr],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  const optOutTx = makeApplicationCloseOutTxn(escrowAddr, params, depositStakingAppId);
  const closeToTx = removeEscrowNoteTransaction(escrowAddr, userAddr, "fr ", params);
  return [txns[0], optOutTx, closeToTx];
}

export {
  retrieveDepositStakingInfo,
  depositStakingProgramsInfo,
  retrieveUserDepositStakingsLocalState,
  retrieveUserDepositStakingLocalState,
  userDepositStakingInfo,
  prepareAddDepositStakingEscrow,
  prepareOptDepositStakingEscrowIntoAsset,
  prepareSyncStakeInDepositStakingEscrow,
  prepareClaimRewardsOfDepositStakingEscrow,
  prepareWithdrawFromDepositStakingEscrow,
  prepareOptOutDepositStakingEscrowFromAsset,
  prepareRemoveDepositStakingEscrow,
};
