import { ABIContract } from "algosdk";

import depositStakingABI from "./deposit-staking.json" with { type: "json" };
import depositsABI from "./deposits.json" with { type: "json" };
import loanABI from "./loan.json" with { type: "json" };
import lpTokenOracleABI from "./lp-token-oracle.json" with { type: "json" };
import oracleAdapterABI from "./oracle-adapter.json" with { type: "json" };
import poolABI from "./pool.json" with { type: "json" };

export const depositsABIContract = new ABIContract(depositsABI);
export const depositStakingABIContract = new ABIContract(depositStakingABI);
export const loanABIContract = new ABIContract(loanABI);
export const lpTokenOracleABIContract = new ABIContract(lpTokenOracleABI);
export const oracleAdapterABIContract = new ABIContract(oracleAdapterABI);
export const poolABIContract = new ABIContract(poolABI);
