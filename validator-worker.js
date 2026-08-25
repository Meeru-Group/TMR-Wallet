#!/usr/bin/env node
require("dotenv").config();

const API_URL = (process.env.TMR_API_URL || "http://localhost:3000").replace(/\/$/, "");
const INTERVAL_MS = Math.max(Number(process.env.TMR_VALIDATOR_POLL_MS || 5000), 1000);
const producerKey = process.env.TMR_BLOCK_PRODUCER_KEY || "";

async function tick() {
  const headers = { "Accept": "application/json", "Content-Type": "application/json" };
  if (producerKey) headers["x-tmr-producer-key"] = producerKey;
  const response = await fetch(API_URL + "/api/blocks/produce", { method: "POST", headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  if (body.produced) {
    console.log(`Finalized block #${body.block.height}: ${body.block.hash}`);
  }
}

console.log(`Thanvi Testnet validator worker -> ${API_URL}`);
setInterval(() => tick().catch(err => console.error("Validator tick:", err.message)), INTERVAL_MS);
tick().catch(err => console.error("Validator tick:", err.message));
