const $ = (id) => document.getElementById(id);
const STORAGE = "tmr_wallet_v1";

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid key");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return out;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

/*
  TMR address:
  TMR1 + first 39 hexadecimal characters of SHA-256(publicKey).
  This is a wallet-local address format for the standalone wallet.
  The blockchain must implement the same derivation before accepting it
  as a native account address.
*/
async function makeAddress(publicKeyHex) {
  const hash = await sha256(hexToBytes(publicKeyHex));
  return "TMR1" + bytesToHex(hash).slice(0, 39);
}

async function generateWallet() {
  if (!crypto?.subtle || !crypto.getRandomValues) {
    throw new Error("Secure Web Crypto is not available.");
  }

  // Generate a 32-byte secret locally.
  const privateKey = crypto.getRandomValues(new Uint8Array(32));

  // For this standalone first wallet build, derive a deterministic public
  // identifier from the private key. Real Ed25519 signing should be added
  // with a reviewed crypto library before production value is used.
  const publicHash = await sha256(privateKey);
  const publicKey = bytesToHex(publicHash);

  const address = await makeAddress(publicKey);

  return {
    version: 1,
    network: "TMR",
    address,
    publicKey,
    privateKey: bytesToHex(privateKey),
    createdAt: new Date().toISOString()
  };
}

function save(wallet) {
  localStorage.setItem(STORAGE, JSON.stringify(wallet));
}

function show(wallet) {
  $("wallet").classList.remove("hidden");
  $("address").textContent = wallet.address;
  $("publicKey").textContent = wallet.publicKey;
  $("privateKey").textContent = wallet.privateKey;
}

function download(wallet) {
  const blob = new Blob([JSON.stringify(wallet, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tmr-wallet-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("create").onclick = async () => {
  try {
    const wallet = await generateWallet();
    save(wallet);
    show(wallet);
    $("message").textContent = "Wallet created locally.";
  } catch (e) {
    $("message").textContent = e.message;
  }
};

$("download").onclick = () => {
  const raw = localStorage.getItem(STORAGE);
  if (raw) download(JSON.parse(raw));
};

$("clear").onclick = () => {
  if (confirm("Delete this wallet from this browser? Make sure you have a backup first.")) {
    localStorage.removeItem(STORAGE);
    $("wallet").classList.add("hidden");
    $("message").textContent = "Local wallet deleted.";
  }
};

$("restore").onclick = () => {
  try {
    const wallet = JSON.parse($("backup").value.trim());
    if (!wallet || wallet.network !== "TMR" || !wallet.privateKey || !wallet.publicKey || !wallet.address) {
      throw new Error("Invalid TMR wallet backup.");
    }
    save(wallet);
    show(wallet);
    $("message").textContent = "Wallet restored locally.";
  } catch (e) {
    $("message").textContent = "Restore failed: " + e.message;
  }
};

const existing = localStorage.getItem(STORAGE);
if (existing) {
  try { show(JSON.parse(existing)); } catch {}
}
