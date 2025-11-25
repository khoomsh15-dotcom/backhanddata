const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const ASSETS = ["BTC","ETH","USDT","SOL","BNB","DOGE","LTC","USDC"];
// persistent data file
const DATA_FILE = "data.json";
let state = { wallets: {} };
// load if exists
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE);
    state = JSON.parse(raw);
  }
} catch (e) {
  console.error("Failed to load data file", e);
}
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } catch (e) {}
}
function randHex40() {
  const chars = "abcdef0123456789";
  let s = "0x";
  for (let i=0;i<40;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function createWallet(name) {
  const id = randHex40();
  const addresses = {};
  ASSETS.forEach(a => { addresses[a] = randHex40(); });
  const balances = {};
  ASSETS.forEach(a => balances[a] = 0);
  const w = { id, name, addresses, balances, transactions: [] };
  state.wallets[id] = w;
  save();
  return w;
}
app.get("/", (req,res) => res.json({ ok: true, message: "Wallet backend running" }));
app.post("/register", (req,res) => {
  const name = req.body.name || "Unnamed";
  const pin = req.body.pin || null;
  const w = createWallet(name);
  if (pin) w.pin = pin;
  save();
  return res.json({ success: true, wallet: w });
});
app.get("/wallet/:id", (req,res) => {
  const id = req.params.id;
  const w = state.wallets[id];
  if (!w) return res.status(404).json({ success:false, error:"Wallet not found" });
  return res.json({ success:true, wallet: w });
});
app.get("/wallet-by-address/:addr", (req,res) => {
  const addr = req.params.addr;
  for (const id in state.wallets) {
    const w = state.wallets[id];
    if (Object.values(w.addresses).includes(addr)) {
      return res.json({ success:true, wallet: w });
    }
  }
  return res.status(404).json({ success:false, error:"Wallet not found" });
});
app.post("/admin/credit", (req,res) => {
  const { address, asset, amount } = req.body;
  // find wallet by id or address
  let w = state.wallets[address] || null;
  if (!w) {
    for (const id in state.wallets) {
      if (Object.values(state.wallets[id].addresses).includes(address)) { w = state.wallets[id]; break; }
    }
  }
  if (!w) return res.status(404).json({ success:false, error:"Wallet not found" });
  if (!ASSETS.includes(asset)) return res.status(400).json({ success:false, error:"Unknown asset" });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ success:false, error:"Invalid amount" });
  w.balances[asset] += amt;
  const tx = { type:"ADMIN_CREDIT", asset, amount: amt, time: new Date().toISOString() };
  w.transactions.push(tx);
  save();
  return res.json({ success:true, wallet: w });
});
app.post("/send", (req,res) => {
  const { from, to, asset, amount } = req.body;
  const fromW = state.wallets[from] || null;
  if (!fromW) return res.status(404).json({ success:false, error:"Sender wallet not found" });
  if (!ASSETS.includes(asset)) return res.status(400).json({ success:false, error:"Unknown asset" });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ success:false, error:"Invalid amount" });
  if (fromW.balances[asset] < amt) return res.status(400).json({ success:false, error:"Insufficient balance" });
  // find recipient by address
  let toW = null;
  for (const id in state.wallets) {
    if (Object.values(state.wallets[id].addresses).includes(to)) { toW = state.wallets[id]; break; }
  }
  if (!toW) return res.status(404).json({ success:false, error:"Recipient wallet not found" });
  fromW.balances[asset] -= amt;
  toW.balances[asset] += amt;
  const tx = { type:"TRANSFER", asset, amount: amt, from: fromW.id, to: toW.id, time: new Date().toISOString() };
  fromW.transactions.push(tx);
  toW.transactions.push(tx);
  save();
  return res.json({ success:true, tx });
});
app.post("/set-pin", (req,res) => {
  const { walletId, pin } = req.body;
  const w = state.wallets[walletId];
  if (!w) return res.status(404).json({ success:false, error:"Wallet not found" });
  w.pin = pin;
  save();
  return res.json({ success:true, message:"PIN set" });
});
app.post("/verify-pin", (req,res) => {
  const { walletId, pin } = req.body;
  const w = state.wallets[walletId];
  if (!w) return res.status(404).json({ success:false, error:"Wallet not found" });
  return res.json({ success: w.pin === pin });
});
app.post("/reset-pin", (req,res) => {
  const { walletId, newPin } = req.body;
  const w = state.wallets[walletId];
  if (!w) return res.status(404).json({ success:false, error:"Wallet not found" });
  w.pin = newPin;
  save();
  return res.json({ success:true, message:"PIN reset" });
});
app.listen(PORT, () => console.log("Wallet backend running on port", PORT));
