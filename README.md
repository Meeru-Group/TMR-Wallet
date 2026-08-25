# Thanvi Testnet — TMR Blockchain Explorer + Wallet

This package contains the **Thanvi Testnet** Explorer and a browser-based, non-custodial TMR wallet.

## Important: no fake chain data

The Explorer does **not** generate demo blocks, sample transactions, mock balances, or fake validator counts.

- PostgreSQL is the persistent testnet state layer.
- Genesis is block `#0`.
- Total block count includes the genesis block.
- A new block is created only when there are real pending transactions.
- The Explorer page itself does not manufacture blocks when refreshed.
- Transaction sending uses Ed25519 signatures generated locally in the wallet.
- The 10,000,000,000 TMR testnet supply is recorded in the genesis allocation state.

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

The Explorer no longer calls the block producer on every page/API refresh by default.

Set:

```env
TMR_REQUEST_BLOCK_PRODUCTION=false
```

for a read-only Explorer deployment.

For a private testnet where request-driven finalization is acceptable, set it to `true`.

For a more correct deployment, run `POST /api/blocks/produce` from a persistent validator/worker. If `TMR_BLOCK_PRODUCER_KEY` is configured, send it as the `x-tmr-producer-key` header.

**This package is a PostgreSQL-backed testnet implementation. It is not a decentralized mainnet validator network by itself.** A real multi-node PoR network requires independent validator processes, peer networking, vote aggregation, and durable consensus state.

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
2. Deletes non-genesis blocks.
3. Deletes faucet claims.
4. Deletes reputation events.
5. Resets validator counters.
6. Keeps only genesis block `#0`.
7. Restores the 10B TMR genesis allocation.

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
