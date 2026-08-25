#!/usr/bin/env node
const crypto = require("node:crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" }
});

console.log("Ed25519 validator key generated.");
console.log("PUBLIC_KEY_BASE64=" + publicKey.toString("base64"));
console.log("PRIVATE_KEY_PKCS8_BASE64=" + privateKey.toString("base64"));
console.log("\nPut ONLY the public key in TMR_VALIDATORS_JSON. Keep the private key offline/secret.");
