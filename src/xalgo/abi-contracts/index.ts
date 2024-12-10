import { ABIContract } from "algosdk";

import xAlgoABI from "./xalgo.json" with { type: "json" };

export const xAlgoABIContract = new ABIContract(xAlgoABI);
