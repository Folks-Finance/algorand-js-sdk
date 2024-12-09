import { ABIContract } from "algosdk";

const abiDistributor = new ABIContract({
  name: "algo-liquid-governance-distributor",
  desc: "Mints gALGO when called by verified distributor applications",
  methods: [
    {
      name: "mint",
      desc: "Mint equivalent amount of gALGO as ALGO sent (if in commitment period then also commits user)",
      args: [
        { type: "pay", name: "algo_sent", desc: "Send ALGO to the distributor application account" },
        { type: "asset", name: "g_algo", desc: "The gALGO asset" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "unmint_premint",
      desc: "Unmint in the commitment period pre-minted gALGO for equivalent amount of ALGO",
      args: [
        { type: "uint64", name: "unmint_amount", desc: "The amount of pre-minted gALGO to unmint" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "unmint",
      desc: "Unmint in the commitment period gALGO for equivalent amount of ALGO as gALGO sent",
      args: [
        { type: "axfer", name: "g_algo_sent", desc: "Send gALGO to the distributor application account" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "claim_premint",
      desc: "Claim pre-minted gALGO on behalf of yourself or another account",
      args: [
        { type: "account", name: "receiver", desc: "The user that pre-minted gALGO" },
        { type: "asset", name: "g_algo", desc: "The gALGO asset" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "burn",
      desc: "Burn after the governance period gALGO for equivalent amount of ALGO as gALGO sent",
      args: [
        { type: "axfer", name: "g_algo_sent", desc: "Send gALGO to the distributor application account" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "early_claim_rewards",
      desc: "Early claim governance rewards in the form of gALGO",
      args: [
        { type: "uint64", name: "amount", desc: "The amount of committed ALGO to early claim rewards on" },
        { type: "asset", name: "g_algo", desc: "The gALGO asset" },
        { type: "application", name: "dispenser", desc: "The dispenser application that mints gALGO" },
      ],
      returns: { type: "void" },
    },
    {
      name: "claim_rewards",
      desc: "Claim governance rewards in the form of ALGO after they have been distributed by the foundation",
      args: [],
      returns: { type: "void" },
    },
  ],
});

export { abiDistributor };
