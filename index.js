// index.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// assets set
const ASSETS = ["BTC", "ETH", "USDT", "SOL", "BNB", "DOGE", "LTC", "USDC"];

// in-memory wallets: address -> { name, address, balances, transactions, pin }
const wallets = {};

// Address format sample you requested (looks like an ETH address)
function createAddress() {
  // For demo: random ETH-like hex (kept simple)
  const r = () => Math.random().toString(16).slice(2, 10);
  return "0x" + (r() + r() + r()).slice(0, 40).padEnd(40, "0");
}

function createEmptyBalances() {
  const b = {};
  ASSETS.forEach((sym) => (b[sym] = 0));
  return b;
}

// --- ROUTES ---

// health
app.get("/", (req, res) => {
  res.send("Wallet backend running");
});

// register new wallet
// POST /register { name: "Khush", pin: "1234" }
app.post("/register", (req, res) => {
  const name = req.body.name || "Unnamed";
  const pin = req.body.pin || null; // stored plain (you asked)
  const address = createAddress();

  const wallet = {
    name,
    address,
    pin,
    balances: createEmptyBalances(),
    transactions: [],
    createdAt: new Date().toISOString(),
  };

  wallets[address] = wallet;

  return res.json({
    success: true,
    wallet: {
      address: wallet.address,
      name: wallet.name,
      balances: wallet.balances,
      transactions: wallet.transactions,
    },
  });
});

// get wallet details
// GET /wallet/:address
app.get("/wallet/:address", (req, res) => {
  const { address } = req.params;
  const wallet = wallets[address];
  if (!wallet) {
    return res.status(404).json({ success: false, error: "Wallet not found" });
  }
  return res.json({
    success: true,
    wallet: {
      address: wallet.address,
      name: wallet.name,
      balances: wallet.balances,
      transactions: wallet.transactions,
    },
  });
});

// admin credit - demo only
// POST /admin/credit { address, asset, amount }
app.post("/admin/credit", (req, res) => {
  const { address, asset, amount } = req.body;
  const wallet = wallets[address];
  if (!wallet) {
    return res.status(404).json({ success: false, error: "Wallet not found" });
  }
  if (!ASSETS.includes(asset)) {
    return res.status(400).json({ success: false, error: "Unknown asset symbol" });
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ success: false, error: "Invalid amount" });
  }

  wallet.balances[asset] += amt;

  const tx = {
    type: "ADMIN_CREDIT",
    asset,
    amount: amt,
    from: "ADMIN",
    to: wallet.address,
    time: new Date().toISOString(),
  };
  wallet.transactions.push(tx);

  return res.json({ success: true, wallet: { address: wallet.address, balances: wallet.balances } });
});

// send between wallets
// POST /send { from, to, asset, amount }
app.post("/send", (req, res) => {
  const { from, to, asset, amount } = req.body;
  const fromWallet = wallets[from];
  const toWallet = wallets[to];

  if (!fromWallet) return res.status(404).json({ success: false, error: "Sender wallet not found" });
  if (!toWallet) return res.status(404).json({ success: false, error: "Recipient wallet not found" });

  if (!ASSETS.includes(asset)) return res.status(400).json({ success: false, error: "Unknown asset symbol" });

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });

  if ((fromWallet.balances[asset] || 0) < amt) {
    return res.status(400).json({ success: false, error: "Insufficient balance" });
  }

  // transfer
  fromWallet.balances[asset] -= amt;
  toWallet.balances[asset] += amt;

  const time = new Date().toISOString();
  const txSend = { type: "SEND", asset, amount: amt, from, to, time };
  const txReceive = { type: "RECEIVE", asset, amount: amt, from, to, time };

  fromWallet.transactions.push(txSend);
  toWallet.transactions.push(txReceive);

  return res.json({
    success: true,
    fromWallet: { address: fromWallet.address, balances: fromWallet.balances },
    toWallet: { address: toWallet.address, balances: toWallet.balances },
  });
});

// simple address search (helper used by front-end)
app.get("/search/:addr", (req, res) => {
  const addr = req.params.addr;
  const found = wallets[addr];
  if (!found) return res.json({ success: false, found: false });
  return res.json({ success: true, found: true, wallet: { address: found.address, name: found.name } });
});

// --- start ---
app.listen(PORT, () => {
  console.log("Wallet backend running on port", PORT);
});