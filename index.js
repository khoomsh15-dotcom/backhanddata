const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Supported assets
const ASSETS = ["BTC", "ETH", "USDT", "SOL", "BNB", "DOGE", "LTC", "USDC"];

// In-memory DB (for demo)
const wallets = {};

// -------------------------------------------------------------
//  ADDRESS GENERATION (Ethereum-style 0x + 40 hex characters)
// -------------------------------------------------------------
function makeHexAddress() {
  const chars = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 40; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// -------------------------------------------------------------
//  Find wallet by master OR any asset address
// -------------------------------------------------------------
function findWalletByAnyAddress(addr) {
  // Exact master match
  if (wallets[addr]) return wallets[addr];

  // Search inside asset-specific addresses
  for (const master in wallets) {
    const w = wallets[master];
    for (const sym in w.addresses) {
      if (w.addresses[sym].toLowerCase() === addr.toLowerCase()) {
        return w;
      }
    }
  }
  return null;
}

// -------------------------------------------------------------
//  ROUTES
// -------------------------------------------------------------

// Health check
app.get("/", (req, res) => {
  res.send("Wallet backend running");
});

// -------------------------------------------------------------
//  REGISTER
// -------------------------------------------------------------
app.post("/register", (req, res) => {
  const name = req.body.name || "Unnamed";
  const pin = req.body.pin || null; // storing plaintext as requested for demo

  const master = makeHexAddress();

  // Generate per-asset addresses
  const addresses = {};
  ASSETS.forEach((sym) => {
    addresses[sym] = makeHexAddress();
  });

  const balances = {};
  ASSETS.forEach((s) => (balances[s] = 0));

  const wallet = {
    name,
    masterAddress: master,
    addresses,
    balances,
    transactions: [],
    pin,
  };

  wallets[master] = wallet;

  return res.json({
    success: true,
    wallet: {
      masterAddress: wallet.masterAddress,
      name: wallet.name,
      addresses: wallet.addresses,
      balances: wallet.balances,
      transactions: wallet.transactions,
    },
  });
});

// -------------------------------------------------------------
//  GET WALLET (supports master + asset address)
// -------------------------------------------------------------
app.get("/wallet/:address", (req, res) => {
  const address = req.params.address;
  const wallet = findWalletByAnyAddress(address);

  if (!wallet) {
    return res.status(404).json({
      success: false,
      error: "wallet_not_found",
      userMessage: "Wallet not found.",
    });
  }

  return res.json({
    success: true,
    wallet: {
      masterAddress: wallet.masterAddress,
      name: wallet.name,
      addresses: wallet.addresses,
      balances: wallet.balances,
      transactions: wallet.transactions,
    },
  });
});

// -------------------------------------------------------------
//  ADMIN CREDIT (accepts master OR asset address)
// -------------------------------------------------------------
app.post("/admin/credit", (req, res) => {
  const { address, asset, amount } = req.body;

  if (!address || !asset || amount === undefined) {
    return res.status(400).json({
      success: false,
      userMessage: "Address, asset and amount are mandatory.",
    });
  }

  const wallet = findWalletByAnyAddress(address);
  if (!wallet) {
    return res.status(404).json({
      success: false,
      userMessage: "Wallet not found.",
    });
  }

  if (!ASSETS.includes(asset)) {
    return res.status(400).json({
      success: false,
      userMessage: "Unknown crypto asset.",
    });
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({
      success: false,
      userMessage: "Invalid amount.",
    });
  }

  wallet.balances[asset] += amt;

  const tx = {
    type: "ADMIN_CREDIT",
    asset,
    amount: amt,
    from: "ADMIN",
    to: wallet.masterAddress,
    time: new Date().toISOString(),
  };

  wallet.transactions.push(tx);

  return res.json({
    success: true,
    wallet: {
      masterAddress: wallet.masterAddress,
      balances: wallet.balances,
    },
  });
});

// -------------------------------------------------------------
//  SEND MONEY (works with ANY address - master or asset)
// -------------------------------------------------------------
app.post("/send", (req, res) => {
  const { from, to, asset, amount } = req.body;

  if (!from || !to || !asset || amount === undefined) {
    return res.status(400).json({
      success: false,
      userMessage: "Missing parameters.",
    });
  }

  const fromWallet = findWalletByAnyAddress(from);
  const toWallet = findWalletByAnyAddress(to);

  if (!fromWallet) {
    return res.status(404).json({
      success: false,
      userMessage: "Sender wallet not found.",
    });
  }

  if (!toWallet) {
    return res.status(404).json({
      success: false,
      userMessage: "Recipient wallet not found.",
    });
  }

  if (!ASSETS.includes(asset)) {
    return res.status(400).json({
      success: false,
      userMessage: "Unknown crypto asset.",
    });
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({
      success: false,
      userMessage: "Invalid amount.",
    });
  }

  if ((fromWallet.balances[asset] || 0) < amt) {
    return res.status(400).json({
      success: false,
      userMessage: "Insufficient funds.",
    });
  }

  // Transfer ledger update
  fromWallet.balances[asset] -= amt;
  toWallet.balances[asset] += amt;

  const time = new Date().toISOString();

  const txSend = {
    type: "SEND",
    asset,
    amount: amt,
    from: fromWallet.masterAddress,
    to: toWallet.masterAddress,
    time,
  };

  const txReceive = {
    type: "RECEIVE",
    asset,
    amount: amt,
    from: fromWallet.masterAddress,
    to: toWallet.masterAddress,
    time,
  };

  fromWallet.transactions.push(txSend);
  toWallet.transactions.push(txReceive);

  return res.json({
    success: true,
    fromWallet: {
      masterAddress: fromWallet.masterAddress,
      balances: fromWallet.balances,
    },
    toWallet: {
      masterAddress: toWallet.masterAddress,
      balances: toWallet.balances,
    },
  });
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log("Wallet backend running on port", PORT);
});
