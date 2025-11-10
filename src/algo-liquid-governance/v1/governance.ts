import {
  assignGroupID,
  AtomicTransactionComposer,
  getApplicationAddress,
  getMethodByName,
  makeApplicationOptInTxnFromObject,
} from "algosdk";

import { getParsedValueFromState, signer, transferAlgoOrAsset } from "../../utils";

import { abiDistributor } from "./constants/abi-contracts";

import type { DistributorInfo, UserCommitmentInfo } from "./types";
import type { Dispenser, Distributor } from "../common";
import type { Indexer, SuggestedParams, Transaction } from "algosdk";

/**
 *
 * Returns information regarding the given liquid governance distributor.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param distributor - distributor to query about
 * @returns DistributorInfo[] distributor info
 */
async function getDistributorInfo(indexerClient: Indexer, distributor: Distributor): Promise<DistributorInfo> {
  const { appId } = distributor;
  const { currentRound, application } = await indexerClient.lookupApplications(appId).do();
  const state = application?.params.globalState;
  if (!state) throw new Error(`Cannot find global state for app id ${appId}`);

  const dispenserAppId = Number(getParsedValueFromState(state, "dispenser_app_id") || 0);
  const commitEnd = BigInt(getParsedValueFromState(state, "commit_end") || 0);
  const periodEnd = BigInt(getParsedValueFromState(state, "period_end") || 0);
  const totalCommitment = BigInt(getParsedValueFromState(state, "total_commitment") || 0);
  const totalCommitmentClaimed = BigInt(getParsedValueFromState(state, "total_commitment_claimed") || 0);
  const canClaimAlgoRewards = Boolean(getParsedValueFromState(state, "can_claim_algo_rewards") || 0);
  const rewardsPerAlgo = BigInt(getParsedValueFromState(state, "rewards_per_algo") || 0);
  const totalRewardsClaimed = BigInt(getParsedValueFromState(state, "total_rewards_claimed") || 0);
  const isBurningPaused = Boolean(getParsedValueFromState(state, "is_burning_paused") || 0);

  // optional
  const premintEndState = getParsedValueFromState(state, "premint_end");
  const premintEnd = premintEndState !== undefined ? BigInt(premintEndState) : undefined;

  return {
    currentRound,
    dispenserAppId,
    premintEnd,
    commitEnd,
    periodEnd,
    totalCommitment,
    totalCommitmentClaimed,
    canClaimAlgoRewards,
    rewardsPerAlgo,
    totalRewardsClaimed,
    isBurningPaused,
  };
}

/**
 *
 * Returns information regarding a user's liquid governance commitment.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param distributor - distributor to query about
 * @param userAddr - user address to get governance info about
 * @returns UserCommitmentInfo[] user commitment info
 */
async function getUserLiquidGovernanceInfo(
  indexerClient: Indexer,
  distributor: Distributor,
  userAddr: string,
): Promise<UserCommitmentInfo> {
  const { appId } = distributor;

  // get user account local state
  const { currentRound, appsLocalStates } = await indexerClient
    .lookupAccountAppLocalStates(userAddr)
    .applicationID(appId)
    .do();
  if (!appsLocalStates) throw new Error(`Cannot find local state for app id ${appId} address ${userAddr}`);

  // user local state
  const state = appsLocalStates.find((app) => app.id === BigInt(appId))?.keyValue;
  if (state === undefined) throw new Error("Unable to find commitment for: " + userAddr + ".");
  const commitment = BigInt(getParsedValueFromState(state, "commitment") || 0);
  const commitmentClaimed = BigInt(getParsedValueFromState(state, "commitment_claimed") || 0);

  // optional
  const premintState = getParsedValueFromState(state, "premint");
  const premint = premintState !== undefined ? BigInt(premintState) : undefined;

  return {
    currentRound,
    premint,
    commitment,
    commitmentClaimed,
  };
}

/**
 *
 * Returns a group transaction to mint gALGO for ALGO at a one-to-one rate.
 * If in the commitment period then also commits user into governance.
 *
 * @param dispenser - dispenser to mint gALGO from
 * @param distributor - distributor that calls dispenser and to send ALGO to
 * @param senderAddr - account address for the sender
 * @param amount - amount of ALGO to send and gALGO to mint
 * @param includeOptIn - whether to include an opt in transaction (must be opted in if minting in commitment period)
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] mint transactions
 */
function prepareMintTransactions(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  includeOptIn: boolean,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const atc = new AtomicTransactionComposer();
  const payment = {
    txn: transferAlgoOrAsset(0, senderAddr, getApplicationAddress(distributor.appId).toString(), amount, {
      ...params,
      fee: 0,
      flatFee: true,
    }),
    signer,
  };
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "mint"),
    methodArgs: [payment, dispenser.gAlgoId, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
    note,
  });

  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  // user must be opted in before they can mint in the commitment period
  if (includeOptIn)
    txns.unshift(
      makeApplicationOptInTxnFromObject({
        sender: senderAddr,
        appIndex: distributor.appId,
        suggestedParams: { ...params, fee: 1000, flatFee: true },
      }),
    );
  return assignGroupID(txns);
}

/**
 *
 * Returns a transaction to unmint pre-minted gALGO for ALGO at a one-to-one rate.
 * Must be in commitment period. By unminting, you will lose your governance rewards.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor to receive ALGO from
 * @param senderAddr - account address for the sender
 * @param amount - amount of gALGO to unmint and ALGO to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the unminter (must pass to be eligible for revenue share)
 * @returns Transaction unmint pre-mint transaction
 */
function prepareUnmintPremintTransaction(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "unmint_premint"),
    methodArgs: [amount, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
    note,
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to unmint gALGO for ALGO at a one-to-one rate.
 * Must be in commitment period. By unminting, you will lose your governance rewards.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor to receive ALGO from
 * @param senderAddr - account address for the sender
 * @param amount - amount of gALGO to send and ALGO to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the unminter (must pass to be eligible for revenue share)
 * @returns Transaction[] unmint transactions
 */
function prepareUnmintTransactions(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const atc = new AtomicTransactionComposer();
  const assetTransfer = {
    txn: transferAlgoOrAsset(dispenser.gAlgoId, senderAddr, getApplicationAddress(dispenser.appId).toString(), amount, {
      ...params,
      fee: 0,
      flatFee: true,
    }),
    signer,
  };
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "unmint"),
    methodArgs: [assetTransfer, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
    note,
  });

  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return assignGroupID(txns);
}

/**
 *
 * Returns a transaction to claim pre-minted gALGO.
 * Can be called on behalf of yourself or another user.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor to receive ALGO from
 * @param senderAddr - account address for the sender
 * @param receiverAddr - account address for the pre-minter that will receiver the gALGO
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction claim pre-mint transaction
 */
function prepareClaimPremintTransaction(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  receiverAddr: string,
  params: SuggestedParams,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "claim_premint"),
    methodArgs: [receiverAddr, dispenser.gAlgoId, dispenser.appId],
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
 * Returns a group transaction to burn gALGO for ALGO at a one-to-one rate.
 * Must be after period end.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor to receive ALGO from
 * @param senderAddr - account address for the sender
 * @param amount - amount of gALGO to send and ALGO to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] burn transactions
 */
function prepareBurnTransactions(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const atc = new AtomicTransactionComposer();
  const assetTransfer = {
    txn: transferAlgoOrAsset(dispenser.gAlgoId, senderAddr, getApplicationAddress(dispenser.appId).toString(), amount, {
      ...params,
      fee: 0,
      flatFee: true,
    }),
    signer,
  };
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "burn"),
    methodArgs: [assetTransfer, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });

  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return assignGroupID(txns);
}

/**
 *
 * Returns a group transaction to early claim governance rewards for a given amount of ALGO.
 * Must be after commitment end.
 * Rewards received is in gALGO. Amount of rewards is determined by rewards_per_algo.
 *
 * @param dispenser - distributor to receive gALGO from
 * @param distributor - distributor which has sender's commitment
 * @param senderAddr - account address for the sender
 * @param amount - amount of ALGO to early claim rewards on
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction early claim governance rewards transaction
 */
function prepareEarlyClaimGovernanceRewardsTransaction(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "early_claim_rewards"),
    methodArgs: [amount, dispenser.gAlgoId, dispenser.appId],
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
 * Returns a group transaction to claim governance rewards for unclaimed commitment.
 * Must be after period end and rewards have been distributed from Algorand Foundation.
 * Rewards received is in ALGO. Amount of rewards is determined by rewards_per_algo.
 *
 * @param distributor - distributor that calls dispenser and to send ALGO to
 * @param senderAddr - account address for the sender
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction claim governance rewards transaction
 */
function prepareClaimGovernanceRewardsTransaction(
  distributor: Distributor,
  senderAddr: string,
  params: SuggestedParams,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "claim_rewards"),
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

export {
  getDistributorInfo,
  getUserLiquidGovernanceInfo,
  prepareMintTransactions,
  prepareUnmintPremintTransaction,
  prepareUnmintTransactions,
  prepareClaimPremintTransaction,
  prepareBurnTransactions,
  prepareEarlyClaimGovernanceRewardsTransaction,
  prepareClaimGovernanceRewardsTransaction,
};
