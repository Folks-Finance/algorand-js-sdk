import { randomBytes } from "crypto";

import {
  AtomicTransactionComposer,
  decodeAddress,
  encodeAddress,
  getApplicationAddress,
  getMethodByName,
  makeEmptyTransactionSigner,
  modelsv2,
} from "algosdk";

import { mulScale } from "../math-lib.js";
import {
  enc,
  getApplicationBox,
  getApplicationGlobalState,
  getParsedValueFromState,
  parseUint64s,
  signer,
  transferAlgoOrAsset,
} from "../utils.js";

import { xAlgoABIContract } from "./abi-contracts/index.js";
import {
  greedyStakeAllocationStrategy as defaultStakeAllocationStrategy,
  greedyUnstakeAllocationStrategy as defaultUnstakeAllocationStrategy,
} from "./allocation-strategies/index.js";

import type { ConsensusConfig, ConsensusState } from "./types.js";
import type { Address, Algodv2, SuggestedParams, Transaction } from "algosdk";

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
  const minProposerBalance = BigInt(getParsedValueFromState(state, "min_proposer_balance") || 0);
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
    minProposerBalance,
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

// assumes txns has either structure:
// period 1 [appl call, appl call, ...]
// period 2 [transfer, appl call, transfer, appl call, ...]
function getTxnsAfterResourceAllocation(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  txnsToAllocateTo: Transaction[],
  additionalAddresses: Address[],
  period: number,
  senderAddr: string,
  params: SuggestedParams,
): Transaction[] {
  const { appId, xAlgoId } = consensusConfig;

  // make copy of txns
  const txns = txnsToAllocateTo.slice();
  const availableCalls = txns.length / period;

  // add xALGO asset and proposers box
  txns[period - 1].appForeignAssets = [xAlgoId];
  const box = { appIndex: appId, name: enc.encode("pr") };
  const { boxes } = txns[period - 1];
  if (boxes) {
    boxes.push(box);
  } else {
    txns[period - 1].boxes = [box];
  }

  // get all accounts we need to add
  const accounts: Address[] = additionalAddresses;
  for (const { address } of consensusState.proposersBalances) accounts.push(decodeAddress(address));

  // add accounts in groups of 4
  const MAX_FOREIGN_ACCOUNT_PER_TXN = 4;
  for (let i = 0; i < accounts.length; i += MAX_FOREIGN_ACCOUNT_PER_TXN) {
    // which txn to use
    const callNum = Math.floor(i / MAX_FOREIGN_ACCOUNT_PER_TXN) + 1;
    let txnIndex: number;

    // check if we need to add dummy call
    if (callNum <= availableCalls) {
      txnIndex = callNum * period - 1;
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
 * @param amount - amount of ALGO to send
 * @param minReceivedAmount - min amount of xALGO expected to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param proposerAllocations - determines which proposers the ALGO sent goes to
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] stake transactions
 */
function prepareImmediateStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  amount: number | bigint,
  minReceivedAmount: number | bigint,
  params: SuggestedParams,
  proposerAllocations = defaultStakeAllocationStrategy(consensusState, amount),
  note?: Uint8Array,
): Transaction[] {
  const { appId } = consensusConfig;

  const atc = new AtomicTransactionComposer();
  for (const [proposerIndex, splitMintAmount] of proposerAllocations.entries()) {
    if (splitMintAmount === BigInt(0)) continue;

    // calculate min received amount by proportional of total mint amount
    const splitMinReceivedAmount = mulScale(BigInt(minReceivedAmount), splitMintAmount, BigInt(amount));

    // generate txns for single proposer
    const { address: proposerAddress } = consensusState.proposersBalances[proposerIndex];
    const sendAlgo = {
      txn: transferAlgoOrAsset(0, senderAddr, proposerAddress, splitMintAmount, params),
      signer,
    };
    atc.addMethodCall({
      sender: senderAddr,
      signer,
      appID: appId,
      method: getMethodByName(xAlgoABIContract.methods, "immediate_mint"),
      methodArgs: [sendAlgo, proposerIndex, splitMinReceivedAmount],
      suggestedParams: { ...params, flatFee: true, fee: 2000 },
      note,
    });
  }

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [], 2, senderAddr, params);
}

/**
 *
 * Returns a group transaction to stake ALGO and get xALGO after 320 rounds.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param amount - amount of ALGO to send
 * @param params - suggested params for the transactions with the fees overwritten
 * @param includeBoxMinBalancePayment - whether to include ALGO payment to app for box min balance
 * @param proposerAllocations - determines which proposers the ALGO sent goes to
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] stake transactions
 */
function prepareDelayedStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
  includeBoxMinBalancePayment = true,
  proposerAllocations = defaultStakeAllocationStrategy(consensusState, amount),
  note?: Uint8Array,
): Transaction[] {
  const { appId } = consensusConfig;

  const atc = new AtomicTransactionComposer();
  for (const [proposerIndex, splitMintAmount] of proposerAllocations.entries()) {
    if (splitMintAmount === BigInt(0)) continue;

    // generate txns for single proposer
    const { address: proposerAddress } = consensusState.proposersBalances[proposerIndex];
    const sendAlgo = {
      txn: transferAlgoOrAsset(0, senderAddr, proposerAddress, splitMintAmount, params),
      signer,
    };
    const nonce = randomBytes(2); // TODO: safeguard against possible clash?
    const boxName = Uint8Array.from([...enc.encode("dm"), ...decodeAddress(senderAddr).publicKey, ...nonce]);
    atc.addMethodCall({
      sender: senderAddr,
      signer,
      appID: appId,
      method: getMethodByName(xAlgoABIContract.methods, "delayed_mint"),
      methodArgs: [sendAlgo, proposerIndex, nonce],
      boxes: [{ appIndex: appId, name: boxName }],
      suggestedParams: { ...params, flatFee: true, fee: 2000 },
      note,
    });
  }

  // allocate resources
  let txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  txns = getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [], 2, senderAddr, params);

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
 * @param receiverAddr - account address for the receiver
 * @param nonce - what was used to generate the delayed mint box
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] stake transactions
 */
function prepareClaimDelayedStakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  receiverAddr: string,
  nonce: Uint8Array,
  params: SuggestedParams,
): Transaction[] {
  const { appId } = consensusConfig;

  const atc = new AtomicTransactionComposer();
  const boxName = Uint8Array.from([...enc.encode("dm"), ...decodeAddress(receiverAddr).publicKey, ...nonce]);
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: appId,
    method: getMethodByName(xAlgoABIContract.methods, "claim_delayed_mint"),
    methodArgs: [receiverAddr, nonce],
    boxes: [{ appIndex: appId, name: boxName }],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(
    consensusConfig,
    consensusState,
    txns,
    [decodeAddress(receiverAddr)],
    1,
    senderAddr,
    params,
  );
}

/**
 *
 * Returns a group transaction to unstake xALGO and get ALGO.
 *
 * @param consensusConfig - consensus application and xALGO config
 * @param consensusState - current state of the consensus application
 * @param senderAddr - account address for the sender
 * @param amount - amount of xALGO to send
 * @param minReceivedAmount - min amount of ALGO expected to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param proposerAllocations - determines which proposers the ALGO received comes from
 * @param note - optional note to distinguish who is the burner (must pass to be eligible for revenue share)
 * @returns Transaction[] unstake transactions
 */
function prepareUnstakeTransactions(
  consensusConfig: ConsensusConfig,
  consensusState: ConsensusState,
  senderAddr: string,
  amount: number | bigint,
  minReceivedAmount: number | bigint,
  params: SuggestedParams,
  proposerAllocations = defaultUnstakeAllocationStrategy(consensusState, amount),
  note?: Uint8Array,
): Transaction[] {
  const { appId, xAlgoId } = consensusConfig;

  const atc = new AtomicTransactionComposer();
  for (const [proposerIndex, splitBurnAmount] of proposerAllocations.entries()) {
    if (splitBurnAmount === BigInt(0)) continue;

    // calculate min received amount by proportional of total burn amount
    const splitMinReceivedAmount = mulScale(BigInt(minReceivedAmount), splitBurnAmount, BigInt(amount));

    // generate txns for single proposer
    const sendXAlgo = {
      txn: transferAlgoOrAsset(xAlgoId, senderAddr, getApplicationAddress(appId), splitBurnAmount, params),
      signer,
    };
    atc.addMethodCall({
      sender: senderAddr,
      signer,
      appID: appId,
      method: getMethodByName(xAlgoABIContract.methods, "burn"),
      methodArgs: [sendXAlgo, proposerIndex, splitMinReceivedAmount],
      suggestedParams: { ...params, flatFee: true, fee: 2000 },
      note,
    });
  }

  // allocate resources
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return getTxnsAfterResourceAllocation(consensusConfig, consensusState, txns, [], 2, senderAddr, params);
}

export {
  getConsensusState,
  prepareDummyTransaction,
  prepareImmediateStakeTransactions,
  prepareDelayedStakeTransactions,
  prepareClaimDelayedStakeTransactions,
  prepareUnstakeTransactions,
};
