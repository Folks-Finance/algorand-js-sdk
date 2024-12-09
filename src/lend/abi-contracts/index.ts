import { ABIContract } from "algosdk";

import depositStakingABI from "./deposit-staking.json";
import depositsABI from "./deposits.json";
import loanABI from "./loan.json";
import lpTokenOracleABI from "./lp-token-oracle.json";
import oracleAdapterABI from "./oracle-adapter.json";
import poolABI from "./pool.json";

export const depositsABIContract = new ABIContract(depositsABI);
export const depositStakingABIContract = new ABIContract(depositStakingABI);
export const loanABIContract = new ABIContract(loanABI);
export const lpTokenOracleABIContract = new ABIContract(lpTokenOracleABI);
export const oracleAdapterABIContract = new ABIContract(oracleAdapterABI);
export const poolABIContract = new ABIContract(poolABI);
