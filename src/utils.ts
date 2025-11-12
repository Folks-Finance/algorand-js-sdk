import {
  Algodv2,
  decodeAddress,
  getApplicationAddress,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
} from "algosdk";

import type { Indexer, SuggestedParams, Transaction } from "algosdk";
import type { Box, TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";

const enc = new TextEncoder();

/**
 * Transfer algo or asset. 0 assetId indicates algo transfer, else asset transfer.
 */
function transferAlgoOrAsset(
  assetId: number,
  sender: string,
  receiver: string,
  amount: number | bigint,
  params: SuggestedParams,
): Transaction {
  return assetId !== 0
    ? makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender,
        receiver,
        amount,
        suggestedParams: params,
        assetIndex: assetId,
      })
    : makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver, amount, suggestedParams: params });
}

const signer = async () => [];

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

const PAYOUTS_GO_ONLINE_FEE = BigInt(2e6);

/**
 * Wraps a call to Algorand client (algod/indexer) and returns global state
 */
async function getApplicationGlobalState(
  client: Algodv2 | Indexer,
  appId: number,
): Promise<{
  currentRound?: bigint;
  globalState?: TealKeyValue[];
}> {
  console.log("client instanceof Algodv2", client instanceof Algodv2);
  if (client instanceof Algodv2) {
    const res = await client.getApplicationByID(appId).do();
    return { globalState: res.params.globalState };
  } else {
    const { currentRound, application } = await client.lookupApplications(appId).do();
    return { currentRound, globalState: application?.params.globalState };
  }
}

/**
 * Wraps a call to Algorand client (algod/indexer) and returns local state
 */
async function getAccountApplicationLocalState(
  client: Algodv2 | Indexer,
  appId: number,
  addr: string,
): Promise<{
  currentRound?: bigint;
  localState?: TealKeyValue[];
}> {
  if (client instanceof Algodv2) {
    const res = await client.accountApplicationInformation(addr, appId).do();
    return { localState: res.appLocalState?.keyValue };
  } else {
    const { currentRound, appsLocalStates } = await client.lookupAccountAppLocalStates(addr).applicationID(appId).do();
    const localState = appsLocalStates.find(({ id }) => id === BigInt(appId));
    return { currentRound, localState: localState?.keyValue };
  }
}

/**
 * Wraps a call to Algorand client (algod/indexer) and returns box value
 */
async function getApplicationBox(client: Algodv2 | Indexer, appId: number, boxName: Uint8Array): Promise<Box> {
  return await (
    client instanceof Algodv2
      ? client.getApplicationBoxByName(appId, boxName)
      : client.lookupApplicationBoxByIDandName(appId, boxName)
  ).do();
}

/**
 * Wraps a call to Algorand client (algod/indexer) and returns account details
 */
async function getAccountDetails(
  client: Algodv2 | Indexer,
  addr: string,
): Promise<{
  currentRound?: bigint;
  isOnline: boolean;
  holdings: Map<number, bigint>;
}> {
  const holdings: Map<number, bigint> = new Map();

  try {
    if (client instanceof Algodv2) {
      const account = await client.accountInformation(addr).do();

      const assets = account.assets || [];
      for (const asset of assets) holdings.set(Number(asset.assetId), asset.amount);
      holdings.set(0, account.amount); // includes min balance

      return { isOnline: account.status === "Online", holdings };
    } else {
      const { currentRound, account } = await client
        .lookupAccountByID(addr)
        .exclude("apps-local-state,created-apps")
        .do();

      const assets = account.assets || [];
      for (const asset of assets) holdings.set(Number(asset.assetId), asset.amount);
      holdings.set(0, account.amount); // includes min balance

      return { currentRound, isOnline: account.status === "Online", holdings };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.status === 404 && e.response?.text?.includes("no accounts found for address")) {
      holdings.set(0, BigInt(0));

      return {
        isOnline: false,
        holdings,
      };
    }
    throw e;
  }
}

/**
 * Convert an int to its hex representation with a fixed length of 8 bytes.
 */
function fromIntToBytes8Hex(num: number | bigint) {
  return num.toString(16).padStart(16, "0");
}

/**
 * Convert an int to its hex representation with a fixed length of 1 byte.
 */
function fromIntToByteHex(num: number | bigint) {
  return num.toString(16).padStart(2, "0");
}

function encodeToBase64(str: string, encoding: BufferEncoding = "utf8") {
  return Buffer.from(str, encoding).toString("base64");
}

function getParsedValueFromState(
  state: TealKeyValue[],
  key: string,
  encoding: BufferEncoding = "utf8",
): string | bigint | undefined {
  const encodedKey: string = encoding ? encodeToBase64(key, encoding) : key;
  const keyValue: TealKeyValue | undefined = state.find(
    (entry) => Buffer.from(entry.key).toString("base64") === encodedKey,
  );
  if (keyValue === undefined) return;
  const { value } = keyValue;
  if (value.type === 1) return Buffer.from(value.bytes).toString("base64");
  if (value.type === 2) return value.uint;
  return;
}

function parseUint64s(base64Value: string): bigint[] {
  const value = Buffer.from(base64Value, "base64").toString("hex");

  // uint64s are 8 bytes each
  const uint64s: bigint[] = [];
  for (let i = 0; i < value.length; i += 16) {
    uint64s.push(BigInt("0x" + value.slice(i, i + 16)));
  }
  return uint64s;
}

function parseUint8s(base64Value: string): bigint[] {
  const value = Buffer.from(base64Value, "base64").toString("hex");
  // uint8s are 1 byte each
  const uint8s: bigint[] = [];
  for (let i = 0; i < value.length; i += 2) {
    uint8s.push(BigInt("0x" + value.slice(i, i + 2)));
  }
  return uint8s;
}

function parseBitsAsBooleans(base64Value: string): boolean[] {
  const value = Buffer.from(base64Value, "base64").toString("hex");
  const bits = ("00000000" + Number("0x" + value).toString(2)).slice(-8);
  const bools: boolean[] = [];
  for (const bit of bits) {
    bools.push(Boolean(parseInt(bit)));
  }
  return bools;
}

function addEscrowNoteTransaction(
  userAddr: string,
  escrowAddr: string,
  appId: number,
  notePrefix: string,
  params: SuggestedParams,
): Transaction {
  const note = Uint8Array.from([...enc.encode(notePrefix), ...decodeAddress(escrowAddr).publicKey]);
  return makePaymentTxnWithSuggestedParamsFromObject({
    sender: userAddr,
    receiver: getApplicationAddress(appId),
    amount: 0,
    note,
    suggestedParams: params,
  });
}

function removeEscrowNoteTransaction(
  escrowAddr: string,
  userAddr: string,
  notePrefix: string,
  params: SuggestedParams,
): Transaction {
  const note = Uint8Array.from([...enc.encode(notePrefix), ...decodeAddress(escrowAddr).publicKey]);
  return makePaymentTxnWithSuggestedParamsFromObject({
    sender: escrowAddr,
    receiver: userAddr,
    amount: 0,
    closeRemainderTo: userAddr,
    note,
    suggestedParams: params,
  });
}

export {
  enc,
  transferAlgoOrAsset,
  signer,
  PAYOUTS_GO_ONLINE_FEE,
  unixTime,
  getApplicationGlobalState,
  getAccountApplicationLocalState,
  getApplicationBox,
  getAccountDetails,
  fromIntToBytes8Hex,
  fromIntToByteHex,
  getParsedValueFromState,
  parseUint64s,
  parseUint8s,
  parseBitsAsBooleans,
  addEscrowNoteTransaction,
  removeEscrowNoteTransaction,
};
