import { ABIContract } from "algosdk";

import stakeAndDepositABI from "./stake_and_deposit.json";
import xAlgoABI from "./xalgo.json";

export const xAlgoABIContract = new ABIContract(xAlgoABI);
export const stakeAndDepositABIContract = new ABIContract(stakeAndDepositABI);
