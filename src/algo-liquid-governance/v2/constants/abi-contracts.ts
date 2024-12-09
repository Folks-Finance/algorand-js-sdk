import { ABIContract } from "algosdk";

const abiDistributor = new ABIContract({
  name: "algo-liquid-governance-distributor",
  desc: "Mints gALGO when called by verified distributor applications",
  methods: [
    {
      name: "add_escrow",
      desc: "",
      args: [
        { type: "pay", name: "user_call", desc: "" },
        { type: "bool", name: "delegate", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "mint",
      desc: "",
      args: [
        { type: "pay", name: "send_algo", desc: "" },
        { type: "account", name: "escrow", desc: "" },
        { type: "application", name: "dispenser", desc: "" },
        { type: "asset", name: "g_algo", desc: "" },
        { type: "bool", name: "ensure_commit", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "unmint_premint",
      desc: "",
      args: [
        { type: "account", name: "escrow", desc: "" },
        { type: "uint64", name: "unmint_amount", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "unmint",
      desc: "",
      args: [
        { type: "axfer", name: "send_galgo", desc: "" },
        { type: "account", name: "escrow", desc: "" },
        { type: "application", name: "dispenser", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "claim_premint",
      desc: "",
      args: [
        { type: "account", name: "escrow", desc: "" },
        { type: "account", name: "receiver", desc: "" },
        { type: "application", name: "dispenser", desc: "" },
        { type: "asset", name: "g_algo", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "register_online",
      desc: "",
      args: [
        { type: "account", name: "escrow", desc: "" },
        { type: "address", name: "vote_key", desc: "" },
        { type: "address", name: "sel_key", desc: "" },
        { type: "byte[64]", name: "state_proof_key", desc: "" },
        { type: "uint64", name: "vote_first", desc: "" },
        { type: "uint64", name: "vote_last", desc: "" },
        { type: "uint64", name: "vote_key_dilution", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "register_offline",
      desc: "",
      args: [{ type: "account", name: "escrow", desc: "" }],
      returns: { type: "void" },
    },
    {
      name: "governance",
      desc: "",
      args: [
        { type: "account", name: "escrow", desc: "" },
        { type: "account", name: "dest", desc: "" },
        { type: "string", name: "note", desc: "" },
      ],
      returns: { type: "void" },
    },
    {
      name: "remove_escrow",
      desc: "",
      args: [{ type: "account", name: "escrow", desc: "" }],
      returns: { type: "void" },
    },
    {
      name: "burn",
      desc: "",
      args: [
        { type: "axfer", name: "send_galgo", desc: "" },
        { type: "application", name: "dispenser", desc: "" },
      ],
      returns: { type: "void" },
    },
  ],
});

export { abiDistributor };
