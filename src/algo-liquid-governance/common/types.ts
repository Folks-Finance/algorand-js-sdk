interface Dispenser {
  appId: number;
  gAlgoId: number;
}

interface DispenserInfo {
  currentRound: number; // round the data was read at
  distributorAppIds: number[]; // list of valid distributor app ids
  isMintingPaused: boolean; // flag indicating if users can mint gALGO
}

interface Distributor {
  appId: number;
}

export type { Dispenser, DispenserInfo, Distributor };
