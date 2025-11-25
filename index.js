// index.js
// Simple demo wallet backend (in-memory). NOT for production.
// Stores data in memory and stores pin in plain text (per demo request).
// Node >= 14 recommended

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Assets list used by both frontend & backend
const ASSETS = ['BTC','ETH','USDT','SOL','BNB','DOGE','LTC','USDC'];

// In-memory stores
// walletsById: walletId -> walletObject
const walletsById = {};
// addressToWallet: assetAddress -> walletId
const addressToWallet = {};

// Helpers: hex id generation
function makeHex40() {
  return crypto.randomBytes(20).toString('hex'); // 40 hex chars
}
function makeWalletId() {
  return '0x' + makeHex40();
}
function makeAssetAddress() {
  return '0x' + makeHex40();
}

function createEmptyBalances() {
  const b = {};
  ASSETS.forEach(sym => b[sym] = 0.0);
  return b;
}

// Resolve an input id/address to a walletId
// Accepts either a master wallet id or an asset address (0x...)
function resolveToWalletId(idOrAddress) {
  if (!idOrAddress) return null;
  // direct wallet id
  if (walletsById[idOrAddress]) return idOrAddress;
  // asset address mapping
  const mapped = addressToWallet[idOrAddress];
  if (mapped) return mapped;
  return null;
}

// ---- ROUTES ----
// Health
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Wallet backend running' });
});

// Register new wallet
// POST /register { name: "Khush", pin: "1234" }
app.post('/register', (req, res) => {
  try {
    const name = (req.body.name || 'Unnamed').toString();
    const pin = req.body.pin ? req.body.pin.toString() : null;

    // create wallet id and per-asset addresses
    const walletId = makeWalletId();
    const addresses = {};
    ASSETS.forEach(sym => {
      const addr = makeAssetAddress();
      addresses[sym] = addr;
      addressToWallet[addr] = walletId;
    });

    const wallet = {
      id: walletId,
      name,
      pin: pin || null, // plain (demo)
      addresses, // map asset -> address (0x...)
      balances: createEmptyBalances(),
      transactions: []
    };

    walletsById[walletId] = wallet;

    return res.json({
      success: true,
      wallet: {
        id: wallet.id,
        name: wallet.name,
        addresses: wallet.addresses,
        balances: wallet.balances,
        transactions: wallet.transactions
      }
    });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// Get wallet by wallet id
// GET /wallet/:id
app.get('/wallet/:id', (req, res) => {
  const id = req.params.id;
  const wallet = walletsById[id];
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }
  return res.json({
    success: true,
    wallet: {
      id: wallet.id,
      name: wallet.name,
      addresses: wallet.addresses,
      balances: wallet.balances,
      transactions: wallet.transactions
    }
  });
});

// Lookup wallet by ANY asset address
// GET /wallet-by-address/:address
app.get('/wallet-by-address/:address', (req, res) => {
  const address = req.params.address;
  const walletId = resolveToWalletId(address);
  if (!walletId) {
    return res.status(404).json({ success: false, error: 'Wallet not found for given address' });
  }
  const wallet = walletsById[walletId];
  return res.json({
    success: true,
    wallet: {
      id: wallet.id,
      name: wallet.name,
      addresses: wallet.addresses,
      balances: wallet.balances,
      transactions: wallet.transactions
    }
  });
});

// Admin credit to a wallet (address or wallet id)
// POST /admin/credit { address: "<assetAddress or walletId>", asset: "BTC", amount: 12.5 }
app.post('/admin/credit', (req, res) => {
  try {
    const { address, asset, amount } = req.body;
    if (!address || !asset || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Missing address, asset, or amount' });
    }
    if (!ASSETS.includes(asset)) {
      return res.status(400).json({ success: false, error: 'Unknown asset symbol' });
    }
    const walletId = resolveToWalletId(address);
    if (!walletId) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }
    const w = walletsById[walletId];
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

    w.balances[asset] += amt;
    const tx = {
      type: 'ADMIN_CREDIT',
      asset,
      amount: amt,
      from: 'ADMIN',
      to: w.id,
      time: new Date().toISOString()
    };
    w.transactions.push(tx);
    return res.json({ success: true, wallet: { id: w.id, balances: w.balances } });
  } catch (err) {
    console.error('admin credit error', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// Send between wallets using asset addresses (fromAddress, toAddress are asset addresses or wallet ids)
// POST /send { from: "<addrOrWalletId>", to: "<addrOrWalletId>", asset: "BTC", amount: 1.2 }
app.post('/send', (req, res) => {
  try {
    const { from, to, asset, amount } = req.body;
    if (!from || !to || !asset || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Missing from/to/asset/amount' });
    }
    if (!ASSETS.includes(asset)) {
      return res.status(400).json({ success: false, error: 'Unknown asset symbol' });
    }

    const fromWalletId = resolveToWalletId(from);
    const toWalletId = resolveToWalletId(to);

    if (!fromWalletId) return res.status(404).json({ success: false, error: 'Sender wallet not found' });
    if (!toWalletId) return res.status(404).json({ success: false, error: 'Recipient wallet not found' });

    const fromW = walletsById[fromWalletId];
    const toW = walletsById[toWalletId];

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

    if (fromW.balances[asset] < amt) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    // Transfer
    fromW.balances[asset] -= amt;
    toW.balances[asset] += amt;

    const time = new Date().toISOString();
    const txSend = { type: 'SEND', asset, amount: amt, from: fromW.id, to: toW.id, time };
    const txReceive = { type: 'RECEIVE', asset, amount: amt, from: fromW.id, to: toW.id, time };

    fromW.transactions.push(txSend);
    toW.transactions.push(txReceive);

    return res.json({ success: true, fromWallet: { id: fromW.id, balances: fromW.balances }, toWallet: { id: toW.id, balances: toW.balances } });
  } catch (err) {
    console.error('send error', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// PIN endpoints (plain-text pins stored for demo)
// POST /set-pin { walletId, pin }
// POST /verify-pin { walletId, pin } -> success true/false
// POST /reset-pin { walletId, oldPin, newPin } -> resets if oldPin matches
app.post('/set-pin', (req, res) => {
  const { walletId, pin } = req.body;
  if (!walletId || !pin) return res.status(400).json({ success: false, error: 'Missing walletId or pin' });
  const w = walletsById[walletId];
  if (!w) return res.status(404).json({ success: false, error: 'Wallet not found' });
  w.pin = pin.toString();
  return res.json({ success: true, message: 'PIN set' });
});

app.post('/verify-pin', (req, res) => {
  const { walletId, pin } = req.body;
  if (!walletId || !pin) return res.status(400).json({ success: false, error: 'Missing walletId or pin' });
  const w = walletsById[walletId];
  if (!w) return res.status(404).json({ success: false, error: 'Wallet not found' });
  const ok = (w.pin && w.pin === pin.toString());
  return res.json({ success: ok, message: ok ? 'PIN valid' : 'Invalid PIN' });
});

app.post('/reset-pin', (req, res) => {
  const { walletId, oldPin, newPin } = req.body;
  if (!walletId || !oldPin || !newPin) return res.status(400).json({ success: false, error: 'Missing walletId/oldPin/newPin' });
  const w = walletsById[walletId];
  if (!w) return res.status(404).json({ success: false, error: 'Wallet not found' });
  if (w.pin !== oldPin.toString()) return res.status(403).json({ success: false, error: 'Old PIN incorrect' });
  w.pin = newPin.toString();
  return res.json({ success: true, message: 'PIN changed' });
});

// List wallets (for debug) - remove or protect in production
app.get('/_all_wallets', (req, res) => {
  const all = Object.values(walletsById).map(w => ({ id: w.id, name: w.name, addresses: w.addresses, balances: w.balances }));
  return res.json({ success: true, wallets: all });
});

// Start
app.listen(PORT, () => {
  console.log('Wallet backend running on port', PORT);
});
