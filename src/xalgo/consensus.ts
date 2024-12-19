import {
  AtomicTransactionComposer,
  decodeAddress,
  encodeAddress,
  getApplicationAddress,
  getMethodByName,
  makeEmptyTransactionSigner,
  modelsv2,
} from "algosdk";

import {
  enc,
  getApplicationBox,
  getApplicationGlobalState,
  getParsedValueFromState,
  parseUint64s,
  signer,
  transferAlgoOrAsset,
} from "../utils";

import { xAlgoABIContract } from "./abi-contracts";

import type { ConsensusConfig, ConsensusState } from "./types";
import type { Algodv2, SuggestedParams, Transaction } from "algosdk";

/**
 *
 * Returns information regarding the given consensus application.
 *
 * @param algodClient - Algorand client to query
 * @param consensusConfig - consensus application and xALGO config
 * @returns ConsensusState current state of the consensus application
 */
async function getConsensusState(algodClient: Algodv2, consensusConfig: ConsensusConfig): Promise<ConsensusState> {
  const [{ globalState: state }, { round, value: boxValue }, params] = await Promise.all([
    getApplicationGlobalState(algodClient, consensusConfig.appId),
    await getApplicationBox(algodClient, consensusConfig.appId, enc.encode("pr")),
    await algodClient.getTransactionParams().do(),
  ]);
  if (state === undefined) throw Error("Could not find xAlgo application");

  // xALGO rate
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: "Q5Q5FC5PTYQIUX5PGNTEW22UJHJHVVUEMMWV2LSG6MGT33YQ54ST7FEIGA",
    signer: makeEmptyTransactionSigner(),
    appID: consensusConfig.appId,
    method: getMethodByName(xAlgoABIContract.methods, "get_xalgo_rate"),
    methodArgs: [],
    suggestedParams: params,
  });
  const simReq = new modelsv2.SimulateRequest({
    txnGroups: [],
    allowEmptySignatures: true,
    allowUnnamedResources: true,
    extraOpcodeBudget: 70000,
  });
  const { methodResults } = await atc.simulate(algodClient, simReq);
  const { returnValue } = methodResults[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [algoBalance, xAlgoCirculatingSupply, balances]: [bigint, bigint, Uint8Array] = returnValue as any;

  // proposers
  const proposersBalances = parseUint64s(Buffer.from(balances).toString("base64")).map((balance, index) => ({
    address: encodeAddress(boxValue.subarray(index * 32, (index + 1) * 32)),
    algoBalance: balance,
  }));

  // global state
  const timeDelay = BigInt(getParsedValueFromState(state, "time_delay") || 0);
  const numProposers = BigInt(getParsedValueFromState(state, "num_proposers") || 0);
  const maxProposerBalance = BigInt(getParsedValueFromState(state, "max_proposer_balance") || 0);
  const fee = BigInt(getParsedValueFromState(state, "fee") || 0);
  const premium = BigInt(getParsedValueFromState(state, "premium") || 0);
  const totalPendingStake = BigInt(getParsedValueFromState(state, "total_pending_stake") || 0);
  const totalActiveStake = BigInt(getParsedValueFromState(state, "total_active_stake") || 0);
  const totalRewards = BigInt(getParsedValueFromState(state, "total_rewards") || 0);
  const totalUnclaimedFees = BigInt(getParsedValueFromState(state, "total_unclaimed_fees") || 0);
  const canImmediateStake = Boolean(getParsedValueFromState(state, "can_immediate_mint"));
  const canDelayStake = Boolean(getParsedValueFromState(state, "can_delay_mint"));

  return {
    currentRound: Number(round),
    algoBalance,
    xAlgoCirculatingSupply,
    proposersBalances,
    timeDelay,
    numProposers,
    maxProposerBalance,
    fee,
    premium,
    totalPendingStake,
    totalActiveStake,
    totalRewards,
    totalUnclaimedFees,
    canImmediateStake,
    canDelayStake,
  };
}

function prepareDummyTransaction(
  consensusConfig: ConsensusConfig,
  senderAddr: string,
  params: SuggestedParams,
): Transaction {
  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: consensusConfig.appId,
    method: getMethodByName(xAlgoABIContract.methods, "dummy"),
    methodArgs: [],
    suggestedParams: { ...params, flatFee: true, fee: 1000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

function getTxnsAfterResourceAllocation(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  txnsToAllocateTo: Transaction[],
  additionalAddresses: string[],
  senderAddr: string,
  params: SuggestedParams,
): Transaction[] {
  const { appId, xAlgoId } = consensusConfig;

  // make copy of txns
  const txns = txnsToAllocateTo.slice();
  const appCallTxnIndex = txns.length - 1;

  // add xALGO asset and proposers box
  txns[appCallTxnIndex].appForeignAssets = [xAlgoId];
  const box = { appIndex: appId, name: enc.encode("pr") };
  const { boxes } = txns[appCallTxnIndex];
  if (boxes) {
    boxes.push(box);
  } else {
    txns[appCallTxnIndex].boxes = [box];
  }

  // get all accounts we need to add
  const uniqueAddresses: Set<string> = new Set(additionalAddresses);
  for (const { address } of consensusState.proposersBalances) uniqueAddresses.add(address);
  uniqueAddresses.delete(senderAddr);
  const accounts = Array.from(uniqueAddresses).map((address) => decodeAddress(address));

  // add accounts in groups of 4
  const MAX_FOREIGN_ACCOUNT_PER_TXN = 4;
  for (let i = 0; i < accounts.length; i += MAX_FOREIGN_ACCOUNT_PER_TXN) {
    // which txn to use and check to see if we need to add a dummy call
    let txnIndex: number;
    if (Math.floor(i / MAX_FOREIGN_ACCOUNT_PER_TXN) === 0) {
      txnIndex = appCallTxnIndex;
    } else {
      txns.unshift(prepareDummyTransaction(consensusConfig, senderAddr, params));
      txnIndex = 0;
    }

    // add proposer accounts
    txns[txnIndex].appAccounts = accounts.slice(i, i + 4);
  }

  return txns;
}

/**
 *
 * Returns a group transaction to stake ALGO and get xALGO immediately.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param receiverAddr - account address to receive the xALGO at (typically the user, user's deposit escrow or loan escrow)
 * @param amount - amount of ALGO to send
 * @param minReceivedAmount - min amount of xALGO expected to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] stake transactions
 */
function prepareImmediateStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  receiverAddr: string,
  amount: number | bigint,
  minReceivedAmount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const { appId } = consensusConfig;

  const sendAlgo = {
    txn: transferAlgoOrAsset(0, senderAddr, getApplicationAddress(appId), amount, params),
    signer,
  };
  const fee = 1000 * (2 + consensusState.proposersBalances.length);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: appId,
    method: getMethodByName(xAlgoABIContract.methods, "immediate_mint"),
    methodArgs: [sendAlgo, receiverAddr, minReceivedAmount],
    suggestedParams: { ...params, flatFee: true, fee },
    note,
  });

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [receiverAddr], senderAddr, params);
}

/**
 *
 * Returns a group transaction to stake ALGO and get xALGO after 320 rounds.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param receiverAddr - account address to receive the xALGO at (typically the user)
 * @param amount - amount of ALGO to send
 * @param nonce - used to generate the delayed mint box (must be two bytes in length)
 * @param params - suggested params for the transactions with the fees overwritten
 * @param includeBoxMinBalancePayment - whether to include ALGO payment to app for box min balance
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] stake transactions
 */
function prepareDelayedStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  receiverAddr: string,
  amount: number | bigint,
  nonce: Uint8Array,
  params: SuggestedParams,
  includeBoxMinBalancePayment = true,
  note?: Uint8Array,
): Transaction[] {
  const { appId } = consensusConfig;

  if (nonce.length !== 2) throw Error(`Nonce must be two bytes`);
  // we rely on caller to check nonce is not already in use for sender address

  const sendAlgo = {
    txn: transferAlgoOrAsset(0, senderAddr, getApplicationAddress(appId), amount, params),
    signer,
  };
  const fee = 1000 * (1 + consensusState.proposersBalances.length);

  const atc = new AtomicTransactionComposer();
  const boxName = Uint8Array.from([...enc.encode("dm"), ...decodeAddress(senderAddr).publicKey, ...nonce]);
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: appId,
    method: getMethodByName(xAlgoABIContract.methods, "delayed_mint"),
    methodArgs: [sendAlgo, receiverAddr, nonce],
    boxes: [{ appIndex: appId, name: boxName }],
    suggestedParams: { ...params, flatFee: true, fee },
    note,
  });

  // allocate resources
  let txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  txns = getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [], senderAddr, params);

  // add box min balance payment if specified
  if (includeBoxMinBalancePayment) {
    const minBalance = BigInt(36100);
    txns.unshift(transferAlgoOrAsset(0, senderAddr, getApplicationAddress(appId), minBalance, params));
  }
  return txns;
}

/**
 *
 * Returns a group transaction to claim xALGO from delayed stake after 320 rounds.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param minterAddr - account address for the user who submitted the delayed stake
 * @param receiverAddr - account address for the receiver of the xALGO
 * @param nonce - what was used to generate the delayed mint box
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] stake transactions
 */
function prepareClaimDelayedStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  minterAddr: string,
  receiverAddr: string,
  nonce: Uint8Array,
  params: SuggestedParams,
): Transaction[] {
  const { appId } = consensusConfig;

  const atc = new AtomicTransactionComposer();
  const boxName = Uint8Array.from([...enc.encode("dm"), ...decodeAddress(minterAddr).publicKey, ...nonce]);
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: appId,
    method: getMethodByName(xAlgoABIContract.methods, "claim_delayed_mint"),
    methodArgs: [minterAddr, nonce],
    boxes: [{ appIndex: appId, name: boxName }],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [receiverAddr], senderAddr, params);
}

/**
 *
 * Returns a group transaction to unstake xALGO and get ALGO.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param receiverAddr - account address to receive the xALGO at (typically the user)
 * @param amount - amount of xALGO to send
 * @param minReceivedAmount - min amount of ALGO expected to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the burner (must pass to be eligible for revenue share)
 * @returns Transaction[] unstake transactions
 */
function prepareUnstakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  receiverAddr: string,
  amount: number | bigint,
  minReceivedAmount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const { appId, xAlgoId } = consensusConfig;

  const sendXAlgo = {
    txn: transferAlgoOrAsset(xAlgoId, senderAddr, getApplicationAddress(appId), amount, params),
    signer,
  };
  const fee = 1000 * (2 + consensusState.proposersBalances.length);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: appId,
    method: getMethodByName(xAlgoABIContract.methods, "burn"),
    methodArgs: [sendXAlgo, receiverAddr, minReceivedAmount],
    suggestedParams: { ...params, flatFee: true, fee },
    note,
  });

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [receiverAddr], senderAddr, params);
}

export {
  getConsensusState,
  prepareDummyTransaction,
  prepareImmediateStakeTransactions,
  prepareDelayedStakeTransactions,
  prepareClaimDelayedStakeTransactions,
  prepareUnstakeTransactions,
};
