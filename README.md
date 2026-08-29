# Thanvi Testnet — TMR Blockchain Explorer + Wallet

This package contains the **Thanvi Testnet** Explorer and a browser-based, non-custodial TMR wallet.

## Real-only testnet build

This build deliberately contains **no demo blocks, sample transactions, mock balances, or hard-coded validators**. The only initial chain record is the real genesis block `#0`.

- PostgreSQL is the persistent testnet state layer.
- Genesis is block `#0`.
- Total block count includes the genesis block.
- A new block is created only when there are real pending transactions.
- The Explorer page itself does not manufacture blocks when refreshed.
- Transaction sending uses Ed25519 signatures generated locally in the wallet.
- The 10,000,000,000 TMR testnet supply is recorded in the genesis allocation state.
- Validator identities are loaded only from `TMR_VALIDATORS_JSON`; if it is absent, the Explorer reports zero validators and cannot finalize blocks.

If an old database already contains demo blocks, use the one-time reset described below.

## Network

- Network: `Thanvi Testnet`
- Native coin: `TMR`
- Chain ID: `TMR-CHAIN-1`
- Consensus label: `Proof-of-Reputation`
- Signature: Ed25519
- Address prefix: `TMR1`
- Genesis supply: `10,000,000,000 TMR`

## Wallet

Open `/wallet.html`.

The wallet supports:

- Create a new TMR1 wallet
- Local Ed25519 signing
- Encrypted backup/restore
- Real balance from PostgreSQL-backed chain state
- Real nonce
- Real signed send transaction
- Receive address
- Testnet faucet transaction
- Transaction activity

Private keys are not sent to the API.

## API

- `GET /api`
- `GET /api/health`
- `GET /api/network`
- `GET /api/coin`
- `GET /api/validators`
- `GET /api/validators/:id`
- `GET /api/blocks`
- `GET /api/blocks/:height`
- `GET /api/transactions`
- `GET /api/transactions/:hash`
- `GET /api/address/:address`
- `GET /api/search?q=...`
- `POST /api/transactions`
- `POST /api/faucet` (testnet only)
- `POST /api/blocks/produce` (testnet block finalizer)

## Block production

The Explorer never creates blocks just because a page is opened or refreshed. A block is finalized only when real pending transactions exist and an active validator is configured.

Set:

```env
TMR_REQUEST_BLOCK_PRODUCTION=false
TMR_BLOCK_PRODUCER_KEY=change-this-to-a-long-random-secret
TMR_VALIDATORS_JSON=[{"id":"validator-01","publicKey":"BASE64_RAW_ED25519_PUBLIC_KEY","reputation":500}]
```

for a read-only Explorer deployment.

For a private testnet where request-driven finalization is acceptable, set it to `true`.

For production-style testnet operation, run `POST /api/blocks/produce` from a persistent validator/worker. If `TMR_BLOCK_PRODUCER_KEY` is configured, send it as the `x-tmr-producer-key` header. The worker must be paired with a real validator identity in `TMR_VALIDATORS_JSON`.

**This package is a real, persistent testnet implementation, but it is not a decentralized multi-node mainnet protocol.** A multi-node PoR network still requires independent validator processes, peer networking, block/vote signatures, and durable consensus state. This build intentionally does not pretend those components exist.


## Real validator configuration

Do not use placeholder validator IDs or public keys. Generate a real Ed25519 key pair for each validator and register only the public key here.

```env
TMR_VALIDATORS_JSON=[{"id":"validator-01","publicKey":"BASE64_RAW_ED25519_PUBLIC_KEY","reputation":500}]
```

If `TMR_VALIDATORS_JSON` is missing, a clean deployment is expected to show:

```text
Latest Block: 0
Blocks (including genesis): 1
Transactions: 0
Validators: 0
```

That is intentional: the application will not invent validators or blocks.

## PostgreSQL

Set `DATABASE_URL` in Vercel or your server environment.

Example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
NODE_ENV=production
TMR_NETWORK=testnet
TMR_BLOCK_TIME_MS=12000
TMR_FAUCET_AMOUNT=1000
TMR_REQUEST_BLOCK_PRODUCTION=false
TMR_BLOCK_PRODUCER_KEY=change-this-to-a-long-random-secret
TMR_VALIDATORS_JSON=[{"id":"validator-01","publicKey":"BASE64_RAW_ED25519_PUBLIC_KEY","reputation":500}]
```

Do not commit `.env` or a real database URL.

## Reset old/demo data once

If the database currently contains the old fake/demo blocks visible in the screenshots, set:

```env
TMR_RESET_TESTNET_CHAIN=true
```

Deploy/start the application once, wait for `/api/health` to return successfully, then **remove the variable** and redeploy.

The migration:

1. Deletes transactions.
2. Deletes all old blocks and recreates the cryptographic genesis block `#0`.
3. Deletes faucet claims.
4. Deletes reputation events.
5. Deletes old validator rows, then loads only validators from `TMR_VALIDATORS_JSON`.
6. Restores the 10B TMR genesis allocation.

The migration marker prevents it from running on every request.

## Local run

```bash
npm install
npm run db:init
npm start
```

Then open `/` for the Explorer and `/wallet.html` for the wallet.

## License

MIT. See `LICENSE`.


## Real Cross-Chain Testnet

The wallet now includes a **real TMR ↔ EVM testnet bridge**. TMR is locked in a dedicated bridge vault and an ERC-20-compatible wTMR contract mints the corresponding EVM-side balance. wTMR burns create a real event that the relayer settles by sending TMR from the bridge vault.

Endpoints:

- `GET /api/crosschain/config`
- `POST /api/crosschain/quote`
- `POST /api/crosschain/evm-burn-calldata`
- `GET /api/crosschain/status?orderId=...`
- `GET /api/crosschain/orders`

See [`REAL_BRIDGE_TESTNET.md`](REAL_BRIDGE_TESTNET.md) for deployment and [`BRIDGE_SECURITY.md`](BRIDGE_SECURITY.md) for the trust model.

### 0x integration

Set `ZEROX_API_KEY` in the server environment. The API key stays server-side and is never exposed to the browser. 0x Cross-Chain remains available for EVM ↔ EVM routes where both chains are supported. `TMR-CHAIN-1` is not currently a 0x-supported chain, so TMR ↔ EVM uses the native TMR bridge adapter instead of pretending 0x supports TMR.
