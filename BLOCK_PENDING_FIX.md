# TMR Testnet — Block Pending Fix

This build fixes the wallet `pending • block pending` issue for the testnet.

## What changed

- The wallet calls `POST /api/blocks/produce-testnet` every 5 seconds.
- The server allows that endpoint only when `TMR_NETWORK=testnet`.
- Request-driven block production defaults to enabled on testnet.
- If no `TMR_VALIDATORS_JSON` is configured, PostgreSQL automatically creates one clearly-labeled `testnet-validator-01`.
- A block is still created only when a real pending transaction exists and the 12-second block interval is due.
- PostgreSQL remains the source of truth.
- This is a single-validator testnet convenience, not decentralized mainnet consensus.

## Vercel environment

Set at minimum:

```env
DATABASE_URL=your-real-postgresql-url
NODE_ENV=production
TMR_NETWORK=testnet
TMR_BLOCK_TIME_MS=12000
TMR_FAUCET_AMOUNT=1000
TMR_REQUEST_BLOCK_PRODUCTION=true
```

After deployment, claim 1000 TMR from the faucet. Within the block interval, the wallet should change from:

`pending • block pending`

to:

`confirmed • block N`

and the balance should update from PostgreSQL.
