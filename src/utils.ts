import {
  Algodv2,
  decodeAddress,
  getApplicationAddress,
  Indexer,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
  SuggestedParams,
  Transaction,
} from "algosdk";
import { Box, TealKeyValue } from "algosdk/dist/types/client/v2/algod/models/types";

const enc = new TextEncoder();

/**
 * Transfer algo or asset. 0 assetId indicates algo transfer, else asset transfer.
 */
function transferAlgoOrAsset(
  assetId: number,
  from: string,
  to: string,
  amount: number | bigint,
  params: SuggestedParams,
): Transaction {
  return assetId !== 0
    ? makeAssetTransferTxnWithSuggestedParamsFromObject({
        from,
        to,
        amount,
        suggestedParams: params,
        assetIndex: assetId,
      })
    : makePaymentTxnWithSuggestedParamsFromObject({ from, to, amount, suggestedParams: params });
}

const signer = async () => [];

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Wraps a call to Algorand client (algod/indexer) and returns global state
 */
async function getApplicationGlobalState(
  client: Algodv2 | Indexer,
  appId: number,
): Promise<{
  currentRound?: number;
  globalState?: TealKeyValue[];
}> {
  const res = await (
    client instanceof Algodv2 ? client.getApplicationByID(appId) : client.lookupApplications(appId)
  ).do();

  // algod https://developer.algorand.org/docs/rest-apis/algod/#application
  // indexer https://developer.algorand.org/docs/rest-apis/indexer/#lookupapplicationbyid-response-200
  const app = client instanceof Algodv2 ? res : res["application"];

  return {
    currentRound: res["current-round"],
    globalState: app["params"]["global-state"],
  };
}

/**
 * Wraps a call to Algorand client (algod/indexer) and returns local state
 */
async function getAccountApplicationLocalState(
  client: Algodv2 | Indexer,
  appId: number,
  addr: string,
): Promise<{
  currentRound?: number;
  localState?: TealKeyValue[];
}> {
  const res = await (
    client instanceof Algodv2
      ? client.accountApplicationInformation(addr, appId)
      : client.lookupAccountAppLocalStates(addr).applicationID(appId)
  ).do();

  // algod https://developer.algorand.org/docs/rest-apis/algod/#accountapplicationinformation-response-200
  // indexer https://developer.algorand.org/docs/rest-apis/indexer/#lookupaccountapplocalstates-response-200
  const localState =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client instanceof Algodv2 ? res["app-local-state"] : res["apps-local-states"]?.find(({ id }: any) => id === appId);

  return {
    currentRound: res["current-round"],
    localState: localState["key-value"],
  };
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
  currentRound?: number;
  isOnline: boolean;
  holdings: Map<number, bigint>;
}> {
  const holdings: Map<number, bigint> = new Map();

  try {
    const res = await (
      client instanceof Algodv2
        ? client.accountInformation(addr)
        : client.lookupAccountByID(addr).exclude("apps-local-state,created-apps")
    ).do();

    // algod https://developer.algorand.org/docs/rest-apis/algod/#account
    // indexer https://developer.algorand.org/docs/rest-apis/indexer/#lookupaccountbyid-response-200
    const account = client instanceof Algodv2 ? res : res["account"];
    const assets = account["assets"] || [];

    holdings.set(0, BigInt(account["amount"])); // includes min balance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assets.forEach(({ "asset-id": assetId, amount }: any) => holdings.set(assetId, BigInt(amount)));

    return {
      currentRound: res["current-round"],
      isOnline: account["status"] === "Online",
      holdings,
    };
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
  const keyValue: TealKeyValue | undefined = state.find((entry) => entry.key === encodedKey);
  if (keyValue === undefined) return;
  const { value } = keyValue;
  if (value.type === 1) return value.bytes;
  if (value.type === 2) return BigInt(value.uint);
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
  for (let i = 0; i < bits.length; i++) {
    bools.push(Boolean(parseInt(bits[i])));
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
    from: userAddr,
    to: getApplicationAddress(appId),
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
    from: escrowAddr,
    to: userAddr,
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
