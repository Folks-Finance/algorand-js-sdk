import {
  Algodv2,
  generateAccount,
  Indexer,
  //mnemonicToSecretKey
} from "algosdk";

// TODO: Replace
// export const sender = mnemonicToSecretKey("");
export const sender = generateAccount();

export const algodClient = new Algodv2("", "https://testnet-api.algonode.cloud/", 443);
export const indexerClient = new Indexer("", "https://testnet-idx.algonode.cloud/", 443);
