// ============================================================
// TMR BLOCKCHAIN
// Persistent PostgreSQL Explorer API + Web Server
// Vercel compatible
// ============================================================

const fs = require("fs");
const crypto = require("node:crypto");
const path = require("path");
const TMRBlockchain = require("./blockchain");
const db = require("./database");
const crosschain = require("./crosschain");

const NETWORK = {
  name: "Thanvi Testnet",
  symbol: "TMR",
  chainId: "TMR-CHAIN-1",
  consensus: "Proof-of-Reputation",
  algorithm: "proof-of-reputation",
  status: "online"
};

const chain = new TMRBlockchain();
const TESTNET = process.env.TMR_NETWORK !== "mainnet";
const TESTNET_TOTAL_SUPPLY = "10000000000";
const TESTNET_FAUCET_AMOUNT = Number(process.env.TMR_FAUCET_AMOUNT || 1000);

function deterministicFaucetAddress() {
  const digest = crypto.createHash("sha256").update("thanvi-testnet-genesis-faucet-v2").digest();
  return "TMR1" + base32Encode(digest.subarray(0, 20));
}

const TESTNET_FAUCET_ADDRESS = process.env.TMR_FAUCET_ADDRESS || deterministicFaucetAddress();

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function getContentType(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon"
    }[ext] || "application/octet-stream"
  );
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return sendJSON(res, 404, {
      success: false,
      error: "File not found"
    });
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return sendJSON(res, 404, {
      success: false,
      error: "File not found"
    });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", getContentType(filePath));
  res.setHeader("Cache-Control", "no-cache");
  res.end(fs.readFileSync(filePath));
}


function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    const MAX_BODY = 1024 * 1024;

    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function parseURL(req) {
  const url = new URL(
    req.url,
    `https://${req.headers.host || "tmr.local"}`
  );
  return {
    pathname: url.pathname,
    searchParams: url.searchParams
  };
}

function base32Encode(buffer) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function isValidAddress(address) {
  return /^TMR1[a-z2-7]{32}$/.test(String(address || ""));
}

function addressFromPublicKey(rawPublicKey) {
  const digest = crypto.createHash("sha256").update(rawPublicKey).digest();
  return "TMR1" + base32Encode(digest.subarray(0, 20));
}

function verifyWalletSignature({ from, to, amount, nonce, data, publicKey, signature }) {
  const rawPublicKey = Buffer.from(publicKey, "base64");
  const rawSignature = Buffer.from(signature, "base64");
  if (rawPublicKey.length !== 32) throw new Error("Invalid Ed25519 public key");
  if (rawSignature.length !== 64) throw new Error("Invalid Ed25519 signature");

  const derivedAddress = addressFromPublicKey(rawPublicKey);
  if (derivedAddress !== from) throw new Error("Public key does not match sender address");

  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    rawPublicKey
  ]);
  const publicKeyObject = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  const message = JSON.stringify({ from, to, amount: String(amount), nonce: Number(nonce), data: data ?? null });
  const valid = crypto.verify(null, Buffer.from(message, "utf8"), publicKeyObject, rawSignature);
  if (!valid) throw new Error("Invalid transaction signature");
  return true;
}

async function getValidators() {
  const result = await db.query(`
    SELECT
      validator_id AS "validatorId",
      public_key AS "publicKey",
      reputation,
      reputation_score AS "reputationScore",
      status,
      blocks_proposed AS "blocksProposed",
      blocks_validated AS "blocksValidated",
      missed_rounds AS "missedRounds",
      invalid_blocks AS "invalidBlocks",
      joined_at AS "joinedAt",
      last_active AS "lastActive",
      created_at AS "createdAt"
    FROM validators
    ORDER BY reputation DESC
  `);

  return result.rows;
}

async function getNetwork() {
  const stats = await chain.getNetworkStats();
  const validators = await getValidators();

  const active = validators.filter(v => v.status === "active").length;
  const suspended = validators.filter(v => v.status === "suspended").length;
  const averageReputation = validators.length
    ? Math.round(
        validators.reduce(
          (sum, v) => sum + Number(v.reputation || 0),
          0
        ) / validators.length
      )
    : 0;

  return {
    ...stats,
    name: NETWORK.name,
    symbol: NETWORK.symbol,
    chainId: NETWORK.chainId,
    consensus: NETWORK.consensus,
    totalValidators: validators.length,
    activeValidators: active,
    suspendedValidators: suspended,
    averageReputation,
    currentRound: stats.height + 1,
    latestBlockNumber: stats.height,
    // Vote-level metrics are not stored in this testnet database yet.
    // Do not invent approval/vote counts in the Explorer.
    approvalRate: null,
    votingStats: null
  };
}


function crosschainRequestBody(req) {
  return parseJSONBody(req);
}

async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      return res.end();
    }

    // Initialize schema + genesis + validators.
    await chain.initialize();

    const { pathname, searchParams } = parseURL(req);

    // Cross-chain API. The handler is isolated so the wallet can use
    // a testnet TMR adapter and optional 0x Cross-Chain API proxy.
    if (pathname.startsWith("/api/crosschain/")) {
      req.body = () => parseJSONBody(req);
      const handled = await crosschain.handle(req, res, pathname, searchParams);
      if (handled !== false) return handled;
    }

    // ----------------------------------------------------------
    // REAL TMR JSON-RPC
    // ----------------------------------------------------------
    // POST /rpc implements JSON-RPC 2.0.
    // GET /rpc?method=... is read-only browser diagnostics.
    // Both paths read the same PostgreSQL-backed chain state.
    if (pathname === "/rpc") {
      const rpcResponse = (status, payload) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(payload));
      };

      const executeRpc = async (method, params) => {
        switch (method) {
          case "tmr_chainId":
            return "TMR-CHAIN-1";

          case "tmr_blockNumber": {
            const latest = await chain.getLatestBlock();
            return latest ? Number(latest.height) : 0;
          }

          case "tmr_getNetwork":
            return await chain.getNetworkStats();

          case "tmr_getBlockByNumber": {
            const value = params?.[0];
            if (value === undefined || value === null) {
              throw Object.assign(new Error("block height is required"), { code: -32602 });
            }
            const height = typeof value === "string" && /^0x/i.test(value)
              ? parseInt(value, 16)
              : Number(value);
            if (!Number.isInteger(height) || height < 0) {
              throw Object.assign(new Error("invalid block height"), { code: -32602 });
            }
            return await chain.getBlock(height);
          }

          case "tmr_getBlockByHash": {
            const hash = params?.[0];
            if (!hash) {
              throw Object.assign(new Error("block hash is required"), { code: -32602 });
            }
            return await chain.getBlock(String(hash));
          }

          case "tmr_getTransactionByHash": {
            const hash = params?.[0];
            if (!hash) {
              throw Object.assign(new Error("transaction hash is required"), { code: -32602 });
            }
            return await chain.getTransaction(String(hash));
          }

          case "tmr_getBalance": {
            const address = params?.[0];
            if (!address) {
              throw Object.assign(new Error("TMR address is required"), { code: -32602 });
            }
            return await chain.getAddress(String(address));
          }

          default:
            throw Object.assign(
              new Error("Method not found"),
              { code: -32601 }
            );
        }
      };

      // Browser-friendly GET: strictly read-only.
      if (req.method === "GET") {
        const method = searchParams.get("method");
        const params = [];
        for (const key of ["height", "hash", "address"]) {
          const value = searchParams.get(key);
          if (value !== null) params.push(value);
        }

        try {
          const result = await executeRpc(method, params);
          return rpcResponse(200, {
            jsonrpc: "2.0",
            result,
            id: null,
            mode: "browser-readonly"
          });
        } catch (e) {
          return rpcResponse(200, {
            jsonrpc: "2.0",
            error: { code: Number(e.code || -32000), message: e.message || "RPC error" },
            id: null,
            mode: "browser-readonly"
          });
        }
      }

      if (req.method === "POST") {
        try {
          const body = await parseJSONBody(req);
          if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
            return rpcResponse(200, {
              jsonrpc: "2.0",
              error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" },
              id: body?.id ?? null
            });
          }

          const result = await executeRpc(body.method, Array.isArray(body.params) ? body.params : []);
          return rpcResponse(200, {
            jsonrpc: "2.0",
            result,
            id: body.id ?? null
          });
        } catch (e) {
          const status = e?.code === -32600 ? 200 : 200;
          return rpcResponse(status, {
            jsonrpc: "2.0",
            error: { code: Number(e.code || -32000), message: e.message || "RPC error" },
            id: null
          });
        }
      }

      return rpcResponse(405, {
        jsonrpc: "2.0",
        error: { code: -32600, message: "RPC requires GET diagnostics or POST JSON-RPC" },
        id: null
      });
    }

    // ----------------------------------------------------------
    // STATIC WALLET ROUTES
    // ----------------------------------------------------------
    // The Explorer never creates blocks. Optional request-driven
    // finalization can be enabled explicitly for a private testnet
    // with TMR_REQUEST_BLOCK_PRODUCTION=true.
    if (pathname === "/wallet" || pathname === "/wallet.html") {
      return sendFile(res, path.join(__dirname, "public", "wallet.html"));
    }

    if (pathname === "/wallet.js") {
      return sendFile(res, path.join(__dirname, "public", "wallet.js"));
    }

    if (pathname === "/wallet.css") {
      return sendFile(res, path.join(__dirname, "public", "wallet.css"));
    }

    const requestBlockProduction =
      String(process.env.TMR_REQUEST_BLOCK_PRODUCTION ?? (TESTNET ? "true" : "false")).toLowerCase() === "true";

    if (pathname.startsWith("/api/") && requestBlockProduction) {
      try {
        await chain.produceNextBlockIfDue();
      } catch (productionError) {
        console.error("TMR block production warning:", productionError);
      }
    }

    // ---------------- WEBSITE ----------------
    if (pathname === "/" || pathname === "/index.html") {
      const publicIndex = path.join(
        __dirname,
        "public",
        "index.html"
      );
      const rootIndex = path.join(__dirname, "index.html");

      if (fs.existsSync(publicIndex)) {
        return sendFile(res, publicIndex);
      }
      if (fs.existsSync(rootIndex)) {
        return sendFile(res, rootIndex);
      }

      return sendJSON(res, 404, {
        success: false,
        error: "Explorer index.html not found"
      });
    }

    if (pathname === "/app.js") {
      return sendFile(
        res,
        path.join(__dirname, "public", "app.js")
      );
    }

    if (pathname === "/style.css") {
      const publicCSS = path.join(
        __dirname,
        "public",
        "style.css"
      );
      const rootCSS = path.join(__dirname, "style.css");

      if (fs.existsSync(publicCSS)) {
        return sendFile(res, publicCSS);
      }
      return sendFile(res, rootCSS);
    }

    // ---------------- API ROOT ----------------
    if (pathname === "/api" || pathname === "/api/") {
      return sendJSON(res, 200, {
        success: true,
        name: NETWORK.name,
        symbol: NETWORK.symbol,
        chainId: NETWORK.chainId,
        consensus: NETWORK.consensus,
        status: NETWORK.status,
        storage: "PostgreSQL",
        persistent: true,
        endpoints: [
          "/api/health",
          "/api/network",
          "/api/validators",
          "/api/blocks",
          "/api/blocks/:height",
          "/api/transactions",
          "POST /api/transactions",
          "/api/transactions/:hash",
          "/api/address/:address",
          "/api/search",
          "/api/crosschain/config",
          "POST /api/crosschain/quote",
          "GET /api/crosschain/status?quoteId=:id"
        ],
        timestamp: new Date().toISOString()
      });
    }

    // ---------------- HEALTH ----------------
    if (pathname === "/api/health") {
      const network = await getNetwork();

      return sendJSON(res, 200, {
        success: true,
        status: "healthy",
        blockchain: NETWORK.name,
        chainId: NETWORK.chainId,
        algorithm: NETWORK.algorithm,
        storage: "PostgreSQL",
        persistent: true,
        validators: network.totalValidators,
        consensus: "running",
        network: "online",
        latestBlock: network.latestBlockNumber,
        timestamp: new Date().toISOString()
      });
    }

    // ---------------- NETWORK ----------------
    if (pathname === "/api/network") {
      return sendJSON(res, 200, {
        success: true,
        network: await getNetwork(),
        timestamp: new Date().toISOString()
      });
    }

    // ---------------- VALIDATORS ----------------
    if (pathname === "/api/validators") {
      const validators = await getValidators();

      return sendJSON(res, 200, {
        success: true,
        totalValidators: validators.length,
        activeValidators: validators.filter(
          v => v.status === "active"
        ).length,
        validators,
        timestamp: new Date().toISOString()
      });
    }

    if (pathname.startsWith("/api/validators/")) {
      const id = decodeURIComponent(
        pathname.split("/").pop()
      );

      const result = await db.query(
        `SELECT
          validator_id AS "validatorId",
          public_key AS "publicKey",
          reputation,
          reputation_score AS "reputationScore",
          status,
          blocks_proposed AS "blocksProposed",
          blocks_validated AS "blocksValidated",
          missed_rounds AS "missedRounds",
          invalid_blocks AS "invalidBlocks",
          joined_at AS "joinedAt",
          last_active AS "lastActive",
          created_at AS "createdAt"
         FROM validators
         WHERE validator_id = $1
         LIMIT 1`,
        [id]
      );

      if (!result.rows[0]) {
        return sendJSON(res, 404, {
          success: false,
          error: "Validator not found"
        });
      }

      return sendJSON(res, 200, {
        success: true,
        validator: result.rows[0],
        timestamp: new Date().toISOString()
      });
    }

    // ---------------- BLOCKS ----------------
    if (pathname === "/api/blocks") {
      const blocks = await chain.getBlocks(
        searchParams.get("limit") || 20
      );

      const count = await db.query(
        "SELECT COUNT(*)::int AS count FROM blocks"
      );

      return sendJSON(res, 200, {
        success: true,
        total: count.rows[0].count,
        blocks,
        timestamp: new Date().toISOString()
      });
    }

    // Testnet-only request-driven producer. The wallet calls this endpoint
    // periodically so pending transactions do not remain stuck when the
    // backend is deployed as a request-driven service such as Vercel.
    if (pathname === "/api/blocks/produce-testnet" && req.method === "POST") {
      if (!TESTNET) {
        return sendJSON(res, 403, {
          success: false,
          produced: false,
          error: "Testnet block production endpoint only"
        });
      }

      try {
        const block = await chain.produceNextBlockIfDue();
        return sendJSON(res, block ? 201 : 200, {
          success: true,
          produced: Boolean(block),
          block: block || null,
          message: block
            ? "Testnet block finalized"
            : "No block produced. Waiting for a pending transaction, active validator, or block interval."
        });
      } catch (error) {
        console.error("Testnet block production error:", error);
        return sendJSON(res, 500, {
          success: false,
          produced: false,
          error: error.message
        });
      }
    }

    if (pathname === "/api/blocks/produce" && req.method === "POST") {
      const configuredKey = process.env.TMR_BLOCK_PRODUCER_KEY;
      const suppliedKey = req.headers["x-tmr-producer-key"];
      if (!configuredKey) {
        return sendJSON(res, 503, { success: false, error: "TMR_BLOCK_PRODUCER_KEY is not configured" });
      }
      if (suppliedKey !== configuredKey) {
        return sendJSON(res, 401, { success: false, error: "Invalid block producer key" });
      }

      const activeValidators = await getValidators();
      if (!activeValidators.some(v => v.status === "active")) {
        return sendJSON(res, 503, {
          success: false,
          produced: false,
          error: "No active real validator is configured. Set TMR_VALIDATORS_JSON before producing blocks."
        });
      }

      const block = await chain.produceNextBlockIfDue();
      if (!block) {
        return sendJSON(res, 200, {
          success: true,
          produced: false,
          message: "No block produced. The chain advances only when real pending transactions exist and the block interval is due."
        });
      }
      return sendJSON(res, 201, { success: true, produced: true, block });
    }

    if (pathname.startsWith("/api/blocks/")) {
      const id = decodeURIComponent(
        pathname.split("/").pop()
      );
      const block = await chain.getBlock(id);

      if (!block) {
        return sendJSON(res, 404, {
          success: false,
          error: "Block not found"
        });
      }

      return sendJSON(res, 200, {
        success: true,
        block,
        height: block.height,
        hash: block.hash,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        proposer: block.proposer,
        validator: block.validator,
        transactions: block.transactions,
        consensus: block.consensus,
        status: block.status
      });
    }

    // ---------------- COIN / TESTNET ----------------
    if (pathname === "/api/coin" && req.method === "GET") {
      const meta = await db.query(
        "SELECT value FROM chain_meta WHERE key = 'coin' LIMIT 1"
      );
      const coin = meta.rows[0]?.value || {
        network: TESTNET ? "testnet" : "mainnet",
        name: "TMR",
        symbol: "TMR",
        decimals: 0,
        totalSupply: TESTNET_TOTAL_SUPPLY,
        chainId: NETWORK.chainId,
        native: true,
        consensus: NETWORK.consensus,
        faucetAddress: TESTNET_FAUCET_ADDRESS,
        faucetAmount: String(TESTNET_FAUCET_AMOUNT)
      };
      return sendJSON(res, 200, { success: true, ...coin });
    }

    if (pathname === "/api/faucet" && req.method === "POST") {
      if (!TESTNET) return sendJSON(res, 403, { success:false, error:"Faucet is testnet-only" });
      const body = await parseJSONBody(req);
      const address = String(body.address || "").trim();
      if (!isValidAddress(address)) {
        return sendJSON(res, 400, { success:false, error:"Invalid TMR1 testnet address" });
      }
      const existing = await db.query(`SELECT last_claim_at FROM faucet_claims WHERE address = $1`, [address]);
      if (existing.rowCount) {
        const age = Date.now() - new Date(existing.rows[0].last_claim_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          return sendJSON(res, 429, { success:false, error:"Faucet claim already used. Try again after 24 hours.", nextClaimAt: new Date(new Date(existing.rows[0].last_claim_at).getTime()+24*60*60*1000).toISOString() });
        }
      }
      try {
        const faucetAccount = await chain.getAddress(TESTNET_FAUCET_ADDRESS);
        if (faucetAccount.balance < TESTNET_FAUCET_AMOUNT) {
          return sendJSON(res, 503, { success:false, error:"Testnet faucet treasury is empty" });
        }
        const nonce = faucetAccount.nextNonce;
        const transaction = await chain.addTransaction({
          from: TESTNET_FAUCET_ADDRESS,
          to: address,
          amount: TESTNET_FAUCET_AMOUNT,
          nonce,
          data: { type: "testnet-faucet", network: "TMR-CHAIN-1" },
          publicKey: null,
          signature: "FAUCET_SYSTEM"
        });
        await db.query(`INSERT INTO faucet_claims(address,last_claim_at) VALUES($1,NOW()) ON CONFLICT(address) DO UPDATE SET last_claim_at=NOW()`, [address]);
        return sendJSON(res, 201, { success:true, message:"Testnet TMR faucet transaction created", transaction, amount:TESTNET_FAUCET_AMOUNT, network:"testnet" });
      } catch (error) {
        return sendJSON(res, 400, { success:false, error:error.message });
      }
    }

    // ---------------- TRANSACTIONS ----------------
    // POST /api/transactions
    // Creates a pending transaction. The next eligible block
    // production request will include pending transactions.
    if (
      pathname === "/api/transactions" &&
      req.method === "POST"
    ) {
      const body = await parseJSONBody(req);

      const from = String(body.from || "").trim();
      const to = String(body.to || "").trim();
      const amount = body.amount;
      const nonce = body.nonce ?? 0;
      const data = body.data ?? null;
      const publicKey = String(body.publicKey || "").trim();
      const signature = String(body.signature || "").trim();

      if (!from || !to) {
        return sendJSON(res, 400, {
          success: false,
          error: "from and to are required"
        });
      }

      const numericAmount = Number(amount);

      if (
        !Number.isSafeInteger(numericAmount) ||
        numericAmount <= 0
      ) {
        return sendJSON(res, 400, {
          success: false,
          error: "amount must be a positive whole TMR amount"
        });
      }

      if (
        !Number.isInteger(Number(nonce)) ||
        Number(nonce) < 0
      ) {
        return sendJSON(res, 400, {
          success: false,
          error: "nonce must be a non-negative integer"
        });
      }

      const isSystemFaucet = from === TESTNET_FAUCET_ADDRESS && signature === "FAUCET_SYSTEM";
      if (!isSystemFaucet && (!publicKey || !signature)) {
        return sendJSON(res, 400, {
          success: false,
          error: "Signed transactions require publicKey and signature"
        });
      }

      if (!isSystemFaucet) {
        try {
          verifyWalletSignature({
            from,
            to,
            amount: numericAmount,
            nonce: Number(nonce),
            data,
            publicKey,
            signature
          });
        } catch (error) {
          return sendJSON(res, 401, {
            success: false,
            error: error.message
          });
        }
      }

      const duplicateNonce = await db.query(
        `SELECT hash FROM transactions WHERE from_address = $1 AND nonce = $2 LIMIT 1`,
        [from, Number(nonce)]
      );

      if (duplicateNonce.rowCount) {
        return sendJSON(res, 409, {
          success: false,
          error: "Nonce already used by this address",
          hash: duplicateNonce.rows[0].hash
        });
      }

      const transaction =
        await chain.addTransaction({
          from,
          to,
          amount: numericAmount,
          nonce: Number(nonce),
          data,
          publicKey,
          signature
        });

      return sendJSON(res, 201, {
        success: true,
        message: "Signed transaction accepted into the pending pool",
        transaction
      });
    }

    if (pathname === "/api/transactions") {
      const transactions = await chain.getTransactions(
        searchParams.get("limit") || 50
      );

      const count = await db.query(
        "SELECT COUNT(*)::int AS count FROM transactions"
      );

      return sendJSON(res, 200, {
        success: true,
        total: count.rows[0].count,
        transactions,
        timestamp: new Date().toISOString()
      });
    }

    if (pathname.startsWith("/api/transactions/")) {
      const hash = decodeURIComponent(
        pathname.split("/").pop()
      );

      const transaction = await chain.getTransaction(hash);

      if (!transaction) {
        return sendJSON(res, 404, {
          success: false,
          error: "Transaction not found"
        });
      }

      return sendJSON(res, 200, {
        success: true,
        transaction,
        ...transaction,
        amount: Number(transaction.amount)
      });
    }

    // ---------------- ADDRESS ----------------
    if (pathname.startsWith("/api/address/")) {
      const address = decodeURIComponent(
        pathname.split("/").pop()
      );

      const data = await chain.getAddress(address);

      return sendJSON(res, 200, {
        success: true,
        ...data,
        timestamp: new Date().toISOString()
      });
    }

    // ---------------- SEARCH ----------------
    if (pathname === "/api/search") {
      const query =
        searchParams.get("q") ||
        searchParams.get("query") ||
        "";

      if (!query.trim()) {
        return sendJSON(res, 400, {
          success: false,
          error: "Search query is required"
        });
      }

      const q = query.trim();

      const [blocks, transactions, validators] =
        await Promise.all([
          db.query(
            `SELECT
              height,
              hash,
              previous_hash AS "previousHash",
              timestamp,
              proposer,
              validator,
              transactions,
              transaction_count AS "transactionCount",
              consensus,
              status
             FROM blocks
             WHERE CAST(height AS TEXT) = $1
                OR hash ILIKE $2
             ORDER BY height DESC
             LIMIT 20`,
            [q, `%${q}%`]
          ),
          db.query(
            `SELECT
              hash,
              from_address AS "from",
              to_address AS "to",
              amount::text AS amount,
              nonce,
              timestamp,
              data,
              block_height AS "blockHeight",
              block_hash AS "blockHash",
              status
             FROM transactions
             WHERE hash ILIKE $1
                OR from_address ILIKE $1
                OR to_address ILIKE $1
             ORDER BY timestamp DESC
             LIMIT 20`,
            [`%${q}%`]
          ),
          db.query(
            `SELECT
              validator_id AS "validatorId",
              public_key AS "publicKey",
              reputation,
              reputation_score AS "reputationScore",
              status
             FROM validators
             WHERE validator_id ILIKE $1
                OR public_key ILIKE $1
             ORDER BY reputation DESC
             LIMIT 20`,
            [`%${q}%`]
          )
        ]);

      return sendJSON(res, 200, {
        success: true,
        query,
        results: {
          blocks: blocks.rows,
          transactions: transactions.rows,
          validators: validators.rows
        },
        counts: {
          blocks: blocks.rowCount,
          transactions: transactions.rowCount,
          validators: validators.rowCount
        },
        timestamp: new Date().toISOString()
      });
    }

    return sendJSON(res, 404, {
      success: false,
      error: "Endpoint not found",
      path: pathname
    });
  } catch (error) {
    console.error("TMR BLOCKCHAIN ERROR:", error);

    return sendJSON(res, 500, {
      success: false,
      error: "Internal Server Error",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  chain
    .initialize()
    .then(() => {
      require("http")
        .createServer(handler)
        .listen(PORT, () => {
          console.log(`TMR Blockchain API running on port ${PORT}`);
          console.log("Storage: PostgreSQL");
          console.log("Persistence: ENABLED");
        });
    })
    .catch(error => {
      console.error("Database initialization failed:", error);
      process.exit(1);
    });
}

module.exports = handler;
