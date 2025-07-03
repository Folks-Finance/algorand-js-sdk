import {
  AtomicTransactionComposer,
  decodeAddress,
  encodeAddress,
  getApplicationAddress,
  getMethodByName,
  LogicSigAccount,
  makeApplicationCloseOutTxn,
  makeKeyRegistrationTxnWithSuggestedParamsFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
  OnApplicationComplete,
} from "algosdk";

import {
  addEscrowNoteTransaction,
  enc,
  getAccountApplicationLocalState,
  getAccountDetails,
  getApplicationGlobalState,
  getParsedValueFromState,
  PAYOUTS_GO_ONLINE_FEE,
  signer,
  transferAlgoOrAsset,
} from "../../utils";

import { abiDistributor } from "./constants/abi-contracts";

import type { DistributorInfo, EscrowGovernanceStatus, UserCommitmentInfo } from "./types";
import type { Dispenser, Distributor } from "../common";
import type { Algodv2, Indexer, SuggestedParams, Transaction } from "algosdk";

function getDistributorLogicSig(userAddr: string): LogicSigAccount {
  const prefix = Uint8Array.from([
    7, 32, 1, 1, 128, 36, 70, 79, 76, 75, 83, 95, 70, 73, 78, 65, 78, 67, 69, 95, 65, 76, 71, 79, 95, 76, 73, 81, 85,
    73, 68, 95, 71, 79, 86, 69, 82, 78, 65, 78, 67, 69, 72, 49, 22, 34, 9, 56, 16, 34, 18, 68, 49, 22, 34, 9, 56, 0,
    128, 32,
  ]);
  const suffix = Uint8Array.from([
    18, 68, 49, 22, 34, 9, 56, 8, 20, 68, 49, 22, 34, 9, 56, 32, 50, 3, 18, 68, 49, 22, 34, 9, 56, 9, 50, 3, 18, 68, 49,
    22, 34, 9, 56, 21, 50, 3, 18, 68, 34, 67,
  ]);
  return new LogicSigAccount(new Uint8Array([...prefix, ...decodeAddress(userAddr).publicKey, ...suffix]));
}

/**
 *
 * Returns information regarding the given liquid governance distributor.
 *
 * @param client - Algorand client to query
 * @param distributor - distributor to query about
 * @returns DistributorInfo[] distributor info
 */
async function getDistributorInfo(client: Algodv2 | Indexer, distributor: Distributor): Promise<DistributorInfo> {
  const { appId } = distributor;
  const { currentRound, globalState: state } = await getApplicationGlobalState(client, appId);
  if (state === undefined) throw Error("Could not find Distributor");

  const dispenserAppId = Number(getParsedValueFromState(state, "dispenser_app_id") || 0);
  const premintEnd = BigInt(getParsedValueFromState(state, "premint_end") || 0);
  const commitEnd = BigInt(getParsedValueFromState(state, "commit_end") || 0);
  const periodEnd = BigInt(getParsedValueFromState(state, "period_end") || 0);
  const fee = BigInt(getParsedValueFromState(state, "fee") || 0);
  const totalCommitment = BigInt(getParsedValueFromState(state, "total_commitment") || 0);
  const isBurningPaused = Boolean(getParsedValueFromState(state, "is_burning_paused") || 0);

  return {
    currentRound,
    dispenserAppId,
    premintEnd,
    commitEnd,
    periodEnd,
    fee,
    totalCommitment,
    isBurningPaused,
  };
}

/**
 *
 * Returns information regarding a user's liquid governance commitment.
 *
 * @param client - Algorand client to query
 * @param distributor - distributor to query about
 * @param userAddr - user address to get governance info about
 * @returns UserCommitmentInfo user commitment info
 */
async function getUserLiquidGovernanceInfo(
  client: Algodv2 | Indexer,
  distributor: Distributor,
  userAddr: string,
): Promise<UserCommitmentInfo> {
  const { appId } = distributor;
  const escrowAddr = getDistributorLogicSig(userAddr).address();

  // get user account local state
  const { currentRound, localState: state } = await getAccountApplicationLocalState(client, appId, escrowAddr);
  if (state === undefined) throw Error(`Could not find user ${userAddr} in liquid gov ${appId}`);

  // user local state
  const canDelegate = Boolean(getParsedValueFromState(state, "d"));
  const premint = BigInt(getParsedValueFromState(state, "p") || 0);
  const commitment = BigInt(getParsedValueFromState(state, "c") || 0);
  const nonCommitment = BigInt(getParsedValueFromState(state, "n") || 0);

  return {
    currentRound,
    userAddress: userAddr,
    canDelegate,
    premint,
    commitment,
    nonCommitment,
  };
}

/**
 *
 * Returns information regarding a user's escrow governance status.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param userAddr - user address to get governance info about
 * @param signUpAddr - sign up address for the governance period
 * @returns EscrowGovernanceStatus escrow governance status
 */
async function getEscrowGovernanceStatus(
  indexerClient: Indexer,
  userAddr: string,
  signUpAddr: string,
): Promise<EscrowGovernanceStatus> {
  const escrowAddr = getDistributorLogicSig(userAddr).address();
  const notePrefix = "af/gov";

  const req = indexerClient
    .searchForTransactions()
    .address(escrowAddr)
    .addressRole("sender")
    .txType("pay")
    .notePrefix(enc.encode(notePrefix));
  const [res, bal] = await Promise.all([req.do(), getAccountDetails(indexerClient, escrowAddr)]);
  const { currentRound, isOnline, holdings: assetHoldings } = bal;
  const algoBalance = assetHoldings.get(0)!;

  for (const txn of res["transactions"]) {
    const payTxn = txn["tx-type"] === "appl" ? txn["inner-txns"][0] : txn;
    const receiver: string = payTxn["payment-transaction"]["receiver"];
    if (receiver === signUpAddr) {
      const note: string = Buffer.from(payTxn["note"], "base64").toString();
      const NOTE_SPECS_REGEX = new RegExp(String.raw`^${notePrefix}(?<version>\d+):j(?<jsonData>.*)$`);
      const match = note.match(NOTE_SPECS_REGEX);

      if (!match?.groups) continue;
      const { version, jsonData } = match.groups;

      try {
        const data = JSON.parse(jsonData);
        const commitment = data["com"];
        if (commitment !== undefined)
          return {
            currentRound,
            balance: algoBalance,
            isOnline,
            status: {
              version: Number(version),
              commitment: BigInt(commitment),
              beneficiaryAddress: data["bnf"],
              xGovControlAddress: data["xGv"],
            },
          };
      } catch (e) {
        console.error(e);
      }
    }
  }

  return {
    currentRound,
    balance: algoBalance,
    isOnline,
  };
}

/**
 *
 * Returns a group transaction to add liquid governance escrow.
 *
 * @param distributor - distributor that adding escrow to
 * @param userAddr - account address for the user
 * @param delegatable - whether governance action for escrow can be delegated to gov admin
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: LogicSigAccount } object containing group transaction and generated escrow account
 */
function prepareAddLiquidGovernanceEscrowTransactions(
  distributor: Distributor,
  userAddr: string,
  delegatable: boolean,
  params: SuggestedParams,
): { txns: Transaction[]; escrow: LogicSigAccount } {
  const { appId } = distributor;
  const escrow = getDistributorLogicSig(userAddr);

  const userCall = addEscrowNoteTransaction(userAddr, escrow.address(), appId, "ga ", {
    ...params,
    flatFee: true,
    fee: 2000,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: escrow.address(),
    signer,
    appID: appId,
    onComplete: OnApplicationComplete.OptInOC,
    method: getMethodByName(abiDistributor.methods, "add_escrow"),
    methodArgs: [{ txn: userCall, signer }, delegatable],
    rekeyTo: getApplicationAddress(appId),
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
 * Returns a group transaction to mint gALGO for ALGO at a one-to-one rate.
 *
 * If you want to commit then MUST be paired with prepareCommitOrVoteTransaction
 * as to send the required note to the signup address.
 *
 * @param dispenser - dispenser to mint gALGO from
 * @param distributor - distributor that calls dispenser and to send ALGO to
 * @param senderAddr - account address for the sender
 * @param amount - amount of ALGO to send and gALGO to mint
 * @param ensureCommit - whether to ensure in commitment period
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the minter (must pass to be eligible for revenue share)
 * @returns Transaction[] mint transactions
 */
function prepareMintTransactions(
  dispenser: Dispenser,
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  ensureCommit: boolean,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  const sendAlgo = {
    txn: transferAlgoOrAsset(0, senderAddr, escrowAddr, amount, { ...params, flatFee: true, fee: 0 }),
    signer,
  };

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "mint"),
    methodArgs: [sendAlgo, escrowAddr, dispenser.appId, dispenser.gAlgoId, ensureCommit],
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
 * Returns a transaction to unmint pre-minted gALGO for ALGO at a one-to-one rate.
 * Must be in commitment period. By unminting, you will lose your governance rewards.
 *
 * @param distributor - distributor that calls dispenser and to send ALGO to
 * @param senderAddr - account address for the sender
 * @param amount - amount of gALGO to unmint and ALGO to receive
 * @param params - suggested params for the transactions with the fees overwritten
 * @param note - optional note to distinguish who is the unminter (must pass to be eligible for revenue share)
 * @returns Transaction unmint pre-mint transaction
 */
function prepareUnmintPremintTransaction(
  distributor: Distributor,
  senderAddr: string,
  amount: number | bigint,
  params: SuggestedParams,
  note?: Uint8Array,
): Transaction[] {
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "unmint_premint"),
    methodArgs: [escrowAddr, amount],
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
 * Returns a transaction to unmint pre-minted gALGO for ALGO at a one-to-one rate.
 * Must be in commitment period. By unminting, you will lose your governance rewards.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor that calls dispenser and to send ALGO to
 * @param senderAddr - account address for the sender
 * @param amount - amount of gALGO to unmint and ALGO to receive
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
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  const sendgALGO = {
    txn: transferAlgoOrAsset(dispenser.gAlgoId, senderAddr, getApplicationAddress(dispenser.appId), amount, {
      ...params,
      flatFee: true,
      fee: 0,
    }),
    signer,
  };

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "unmint"),
    methodArgs: [sendgALGO, escrowAddr, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
    note,
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
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
  const escrowAddr = getDistributorLogicSig(receiverAddr).address();

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "claim_premint"),
    methodArgs: [escrowAddr, receiverAddr, dispenser.appId, dispenser.gAlgoId],
    suggestedParams: { ...params, flatFee: true, fee: 4000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  return txns[0];
}

/**
 *
 * Returns a group transaction to register an escrow online.
 *
 * @param distributor - distributor that has escrow
 * @param senderAddr - account address for the sender
 * @param registerFeeAmount - the register online transaction fee (to be used for consensus rewards)
 * @param voteKey - vote key
 * @param selectionKey - selection key
 * @param stateProofKey - state proof key
 * @param voteFirstRound - vote first round
 * @param voteLastRound - vote last round
 * @param voteKeyDilution - vote key dilution
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction register online transaction
 */
function prepareRegisterEscrowOnlineTransactions(
  distributor: Distributor,
  senderAddr: string,
  registerFeeAmount: number | bigint,
  voteKey: Buffer,
  selectionKey: Buffer,
  stateProofKey: Buffer,
  voteFirstRound: number | bigint,
  voteLastRound: number | bigint,
  voteKeyDilution: number | bigint,
  params: SuggestedParams,
): Transaction[] {
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  // check register fee is either 0 ALGO or 0.2 ALGO
  if (BigInt(registerFeeAmount) !== BigInt(0) && BigInt(registerFeeAmount) !== PAYOUTS_GO_ONLINE_FEE)
    throw Error("Unexpected register fee amount");

  const sendAlgo = {
    txn: transferAlgoOrAsset(0, senderAddr, escrowAddr, registerFeeAmount, { ...params, flatFee: true, fee: 0 }),
    signer,
  };

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "register_online"),
    methodArgs: [
      sendAlgo,
      escrowAddr,
      encodeAddress(voteKey),
      encodeAddress(selectionKey),
      stateProofKey,
      voteFirstRound,
      voteLastRound,
      voteKeyDilution,
    ],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a transaction to register an escrow offline.
 *
 * @param distributor - distributor that has escrow
 * @param senderAddr - account address for the sender
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction register offline transaction
 */
function prepareRegisterEscrowOfflineTransaction(
  distributor: Distributor,
  senderAddr: string,
  params: SuggestedParams,
): Transaction {
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "register_offline"),
    methodArgs: [escrowAddr],
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
 * Returns a transaction to commit or vote in governance.
 *
 * @param distributor - distributor that has escrow
 * @param senderAddr - account address for the sender
 * @param destAddr - destination address
 * @param note - note to send
 * @param params - suggested params the transactions with the fees overwritten
 * @returns Transaction commit/vote transaction
 */
function prepareCommitOrVoteTransaction(
  distributor: Distributor,
  senderAddr: string,
  destAddr: string,
  note: string,
  params: SuggestedParams,
): Transaction {
  const escrowAddr = getDistributorLogicSig(senderAddr).address();

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "governance"),
    methodArgs: [escrowAddr, destAddr, note],
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
 * Returns a group transaction to remove escrow from distributor.
 * Must have zero balance or be after period end.
 *
 * @param distributor - distributor that removing escrow from
 * @param senderAddr - account address for the sender
 * @param ownerAddr - account address for the owner of the escrow
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns Transaction[] burn transactions
 */
function prepareRemoveLiquidGovernanceEscrowTransactions(
  distributor: Distributor,
  senderAddr: string,
  ownerAddr: string,
  params: SuggestedParams,
): Transaction[] {
  const escrowAddr = getDistributorLogicSig(ownerAddr).address();

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "remove_escrow"),
    methodArgs: [escrowAddr],
    appAccounts: [ownerAddr],
    suggestedParams: { ...params, flatFee: true, fee: 5000 },
  });
  const txns = atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
  const optOutTx = makeApplicationCloseOutTxn(
    escrowAddr,
    { ...params, flatFee: true, fee: 0 },
    distributor.appId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    escrowAddr,
  );
  return [txns[0], optOutTx];
}

/**
 *
 * Returns a group transaction to burn gALGO for ALGO at a one-to-one rate.
 * Must be after period end.
 *
 * @param dispenser - dispenser to send gALGO to
 * @param distributor - distributor that calls dispenser and to send ALGO to
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
  const sendgALGO = {
    txn: transferAlgoOrAsset(dispenser.gAlgoId, senderAddr, getApplicationAddress(dispenser.appId), amount, {
      ...params,
      flatFee: true,
      fee: 0,
    }),
    signer,
  };

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    sender: senderAddr,
    signer,
    appID: distributor.appId,
    method: getMethodByName(abiDistributor.methods, "burn"),
    methodArgs: [sendgALGO, dispenser.appId],
    suggestedParams: { ...params, flatFee: true, fee: 3000 },
  });
  return atc.buildGroup().map(({ txn }) => {
    txn.group = undefined;
    return txn;
  });
}

/**
 *
 * Returns a transaction to close out an escrow.
 *
 * @param client - Algorand client to query
 * @param senderAddr - account address for the sender
 * @param params - suggested params for the transactions with the fees overwritten
 * @returns { txns: Transaction[], escrow: LogicSigAccount } object containing group transaction and generated escrow account
 */
async function prepareCloseOutEscrowTransactions(
  client: Algodv2 | Indexer,
  senderAddr: string,
  params: SuggestedParams,
): Promise<{ txns: Transaction[]; escrow: LogicSigAccount }> {
  const txns: Transaction[] = [];
  const escrow = getDistributorLogicSig(senderAddr);

  // register offline txns if needed
  const { isOnline } = await getAccountDetails(client, escrow.address());
  if (isOnline) {
    const userPermissionToRegisterOffline = makePaymentTxnWithSuggestedParamsFromObject({
      from: senderAddr,
      to: escrow.address(),
      amount: 0,
      suggestedParams: { ...params, flatFee: true, fee: 2000 },
      note: enc.encode("register offline"),
    });
    const registerOffline = makeKeyRegistrationTxnWithSuggestedParamsFromObject({
      from: escrow.address(),
      suggestedParams: { ...params, flatFee: true, fee: 0 },
    });
    txns.push(...[userPermissionToRegisterOffline, registerOffline]);
  }

  const userPermissionToCloseOut = makePaymentTxnWithSuggestedParamsFromObject({
    from: senderAddr,
    to: escrow.address(),
    amount: 0,
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
    note: enc.encode("close out"),
  });
  const closeOut = makePaymentTxnWithSuggestedParamsFromObject({
    from: escrow.address(),
    to: senderAddr,
    amount: 0,
    closeRemainderTo: senderAddr,
    suggestedParams: { ...params, flatFee: true, fee: 0 },
  });
  txns.push(...[userPermissionToCloseOut, closeOut]);

  return { txns, escrow };
}

export {
  getDistributorLogicSig,
  getDistributorInfo,
  getUserLiquidGovernanceInfo,
  getEscrowGovernanceStatus,
  prepareAddLiquidGovernanceEscrowTransactions,
  prepareMintTransactions,
  prepareUnmintPremintTransaction,
  prepareUnmintTransactions,
  prepareClaimPremintTransaction,
  prepareRegisterEscrowOnlineTransactions,
  prepareRegisterEscrowOfflineTransaction,
  prepareCommitOrVoteTransaction,
  prepareRemoveLiquidGovernanceEscrowTransactions,
  prepareBurnTransactions,
  prepareCloseOutEscrowTransactions,
};
