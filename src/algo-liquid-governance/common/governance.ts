import type { Indexer } from "algosdk";
import type { Dispenser, DispenserInfo } from "./types";
import { getParsedValueFromState, parseUint64s } from "../../utils";

/**
 *
 * Returns information regarding the given liquid governance dispenser.
 *
 * @param indexerClient - Algorand indexer client to query
 * @param dispenser - dispenser to query about
 * @returns DispenserInfo[] dispenser info
 */
export async function getDispenserInfo(indexerClient: Indexer, dispenser: Dispenser): Promise<DispenserInfo> {
  const { appId } = dispenser;
  const res = await indexerClient.lookupApplications(appId).do();
  const state = res["application"]["params"]["global-state"];

  const distributorAppIds = parseUint64s(String(getParsedValueFromState(state, "distribs"))).map((appId) =>
    Number(appId),
  );
  const isMintingPaused = Boolean(getParsedValueFromState(state, "is_minting_paused") || 0);

  return {
    currentRound: res["current-round"],
    distributorAppIds,
    isMintingPaused,
  };
}
