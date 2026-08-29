/**
 * Thanvi/TMR Cross-Chain Testnet API
 *
 * - Provides a safe testnet bridge-intent simulator for TMR-CHAIN-1.
 * - Optionally proxies 0x Cross-Chain quotes for routes where 0x supports
 *   both origin and destination chains.
 *
 * IMPORTANT:
 * TMR-CHAIN-1 is not a 0x-supported chain. TMR <-> EVM settlement here is
 * intentionally TESTNET/SIMULATED until a real TMR bridge adapter is deployed.
 */

const crypto = require("node:crypto");

const ZEROX_BASE = "https://api.0x.org";
const ZEROX_VERSION = "v2";

const ZEROX_CHAIN_IDS = new Set([
  "1","2741","42161","43114","8453","80094","56","999","57073",
  "59144","5000","143","10","9745","137","4663","534352","146",
  "4217","130","480"
]);

const TMR_CHAIN_ID = "TMR-CHAIN-1";

const orders = new Map();

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function isTmrAddress(x) {
  return /^TMR1[a-z2-7]{32}$/.test(String(x || ""));
}

function isHexAddress(x) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(x || ""));
}

function isZeroXChain(x) {
  return ZEROX_CHAIN_IDS.has(String(x || ""));
}

function makeId(prefix = "TMRX") {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

async function zeroXQuote(params) {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) {
    throw new Error("ZEROX_API_KEY is not configured on the server");
  }

  const required = [
    "originChain",
    "destinationChain",
    "sellToken",
    "buyToken",
    "sellAmount",
    "originAddress",
    "destinationAddress"
  ];
  for (const key of required) {
    if (!params[key]) throw new Error(`Missing ${key}`);
  }

  if (!isZeroXChain(params.originChain) || !isZeroXChain(params.destinationChain)) {
    throw new Error("0x route requires 0x-supported EVM chain IDs");
  }
  if (!isHexAddress(params.sellToken) || !isHexAddress(params.buyToken)) {
    throw new Error("This testnet adapter expects EVM token addresses for 0x routes");
  }
  if (!isHexAddress(params.originAddress) || !isHexAddress(params.destinationAddress)) {
    throw new Error("This 0x adapter expects EVM origin/destination addresses");
  }

  const qs = new URLSearchParams({
    originChain: String(params.originChain),
    destinationChain: String(params.destinationChain),
    sellToken: String(params.sellToken),
    buyToken: String(params.buyToken),
    sellAmount: String(params.sellAmount),
    originAddress: String(params.originAddress),
    destinationAddress: String(params.destinationAddress),
    sortQuotesBy: String(params.sortQuotesBy || "price"),
    maxNumQuotes: String(params.maxNumQuotes || 1)
  });

  const r = await fetch(`${ZEROX_BASE}/cross-chain/quotes?${qs}`, {
    headers: {
      "0x-api-key": apiKey,
      "0x-version": ZEROX_VERSION,
      "Accept": "application/json"
    }
  });

  const body = await r.text();
  let data;
  try { data = JSON.parse(body); } catch { data = { raw: body }; }

  if (!r.ok) {
    const message = data?.message || data?.reason || `0x API HTTP ${r.status}`;
    const err = new Error(message);
    err.statusCode = r.status;
    throw err;
  }

  return data;
}

function createTmrTestnetOrder(body) {
  if (!isTmrAddress(body.originAddress)) {
    throw new Error("originAddress must be a valid TMR1 testnet address");
  }
  if (!isHexAddress(body.destinationAddress)) {
    throw new Error("destinationAddress must be a valid EVM 0x address");
  }

  const amount = String(body.sellAmount || "");
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("sellAmount must be a positive integer in base units");
  }

  const id = makeId();
  const created = now();
  const order = {
    quoteId: id,
    status: "TESTNET_PENDING",
    mode: "TMR_TESTNET_SIMULATION",
    originChain: TMR_CHAIN_ID,
    destinationChain: String(body.destinationChain || "8453"),
    sellToken: String(body.sellToken || "TMR"),
    buyToken: String(body.buyToken || "USDC"),
    sellAmount: amount,
    estimatedBuyAmount: String(body.estimatedBuyAmount || amount),
    originAddress: body.originAddress,
    destinationAddress: body.destinationAddress,
    bridgeProvider: "Thanvi Testnet Bridge Simulator",
    createdAt: created,
    updatedAt: created,
    steps: [
      { step: "LOCK", status: "READY" },
      { step: "BRIDGE", status: "PENDING" },
      { step: "MINT/RELEASE", status: "PENDING" },
      { step: "COMPLETE", status: "PENDING" }
    ]
  };
  orders.set(id, order);
  return order;
}

function advanceOrder(order) {
  const age = Date.now() - Date.parse(order.createdAt);
  if (age > 15000 && order.status === "TESTNET_PENDING") {
    order.status = "TESTNET_COMPLETED";
    order.updatedAt = now();
    order.steps = order.steps.map((s, i) => ({
      ...s,
      status: i === 0 ? "COMPLETED" : "COMPLETED"
    }));
  }
  return order;
}

async function handle(req, res, pathname, searchParams) {
  if (pathname === "/api/crosschain/config" && req.method === "GET") {
    return json(res, 200, {
      success: true,
      network: "Thanvi Testnet",
      testnet: true,
      tmrChainId: TMR_CHAIN_ID,
      zeroXConfigured: Boolean(process.env.ZEROX_API_KEY),
      zeroX: {
        baseUrl: ZEROX_BASE,
        version: ZEROX_VERSION,
        supportedEvmChains: [...ZEROX_CHAIN_IDS]
      },
      routes: {
        "TMR -> EVM": "TESTNET_SIMULATED",
        "EVM -> TMR": "TESTNET_SIMULATED",
        "EVM -> EVM": process.env.ZEROX_API_KEY ? "0X_LIVE_QUOTE" : "0X_KEY_REQUIRED"
      }
    });
  }

  if (pathname === "/api/crosschain/quote" && req.method === "POST") {
    const body = await req.body();

    const tmrOrigin = body.originChain === TMR_CHAIN_ID;
    const tmrDestination = body.destinationChain === TMR_CHAIN_ID;

    if (tmrOrigin || tmrDestination) {
      const order = createTmrTestnetOrder(body);
      return json(res, 200, {
        success: true,
        testnet: true,
        provider: order.bridgeProvider,
        quote: order
      });
    }

    try {
      const quote = await zeroXQuote(body);
      return json(res, 200, {
        success: true,
        testnet: false,
        provider: "0x Cross-Chain API",
        quote
      });
    } catch (e) {
      return json(res, e.statusCode || 502, {
        success: false,
        provider: "0x Cross-Chain API",
        error: e.message
      });
    }
  }

  if (pathname === "/api/crosschain/status" && req.method === "GET") {
    const id = searchParams.get("quoteId");
    if (!id || !orders.has(id)) {
      return json(res, 404, { success: false, error: "Testnet quoteId not found" });
    }
    return json(res, 200, { success: true, testnet: true, status: advanceOrder(orders.get(id)) });
  }

  return false;
}

module.exports = { handle };
