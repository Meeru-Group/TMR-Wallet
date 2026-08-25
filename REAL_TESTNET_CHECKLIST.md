# Thanvi Testnet — Real-only deployment checklist

## 1. PostgreSQL

Set a real PostgreSQL `DATABASE_URL`. Do not use a placeholder value.

## 2. Clean old state

For an existing database that contains the blocks/transactions visible in old screenshots, set `TMR_RESET_TESTNET_CHAIN=true` for one deployment, verify the chain is clean, then remove it.

A clean chain has only genesis block `#0`.

## 3. Validators

Set `TMR_VALIDATORS_JSON` with real Ed25519 public keys. Never use placeholder keys.

## 4. Block producer

Set a long random `TMR_BLOCK_PRODUCER_KEY`.

Run a persistent worker/validator process that calls `POST /api/blocks/produce`. Configure `TMR_BLOCK_PRODUCER_KEY` if the endpoint should be protected.

The chain will not manufacture empty blocks. A block appears only after a real pending transaction exists and the block interval has elapsed.

## 5. Wallet

The browser wallet creates Ed25519 keys locally. The private key is not sent to the server. Send transactions are signed locally and submitted to `POST /api/transactions`.

## 6. Testnet supply

Genesis state records exactly `10,000,000,000 TMR`. The testnet faucet is a real system transaction sourced from that genesis allocation; it is not a UI-only balance.

## 7. Verification

Check:

- `/api/network`
- `/api/blocks`
- `/api/transactions`
- `/api/validators`
- `/api/address/TMR1...`

The Explorer must never show a block, transaction, validator, or balance that is not backed by PostgreSQL chain state.
