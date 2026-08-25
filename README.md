# TMR Wallet + Real Transaction API

This package separates the wallet from the blockchain API.

## What is real

The wallet:
- generates an Ed25519 key pair locally
- derives a TMR1 address from the public key
- signs the canonical transaction locally
- sends only the signed transaction to the API
- reads balance/nonce/transactions from the API

The blockchain API:
- validates TMR1 address format
- verifies public-key/address binding
- verifies the Ed25519 signature
- checks nonce
- checks balance
- places valid transactions in a mempool
- finalizes them into a block and updates balances

## Important deployment note

The supplied TMR Blockchain server did not contain a public signed-transaction endpoint. This package therefore includes the required real transaction engine as `blockchain/server.js`.

For production, the `/api/blocks/finalize` local finalizer MUST be replaced by the existing Proof-of-Reputation validator voting/finalization engine. Do not expose that endpoint publicly as an unrestricted block producer.

## Initial supply

`TMR_TOTAL_SUPPLY=10000000000` defines the declared supply, but it does NOT secretly credit a wallet. A real genesis allocation must explicitly assign supply to one or more genesis addresses in the blockchain genesis state.

## Run

```bash
cd blockchain
npm install
npm start
```

Then open `wallet/index.html` from a local HTTPS/localhost web server and create a wallet.

## Real Receive

Receive is the wallet's real TMR1 address. Another funded account must send a signed transaction to it. There is no fake faucet.

## Real Send

The sender signs locally. The API verifies the signature, nonce and balance before accepting the transaction.

## Production hardening

Use PostgreSQL or another durable consensus-backed state store, HTTPS, validator signatures/voting, replay protection across forks, deterministic serialization, rate limits, audit logs and a security review before real-value deployment.
