import { getParsedValueFromState, parseUint64s } from "../../utils";

import type { Dispenser, DispenserInfo } from "./types";
import type { Indexer } from "algosdk";

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
  const { currentRound, application } = await indexerClient.lookupApplications(appId).do();
  const state = application?.params.globalState;
  if (!state) throw new Error(`Cannot find global state for app id ${appId}`);

  const distributorAppIds = parseUint64s(String(getParsedValueFromState(state, "distribs"))).map((appId) =>
    Number(appId),
  );
  const isMintingPaused = Boolean(getParsedValueFromState(state, "is_minting_paused") || 0);

  return {
    currentRound,
    distributorAppIds,
    isMintingPaused,
  };
}
