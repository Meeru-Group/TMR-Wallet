# Thanvi Testnet — TMR Blockchain Explorer

This folder contains a simple mobile-friendly explorer frontend.

## Run locally
Open `index.html` with a static server.

## API
The frontend defaults to:
https://tmr-blockchain.vercel.app

It uses:
- `/api/network`
- `/api/blocks`
- `/api/blocks/:height`

The frontend is intentionally separate from the blockchain backend.


# TMR Blockchain — Persistent Database Edition

This version replaces the previous in-memory explorer data with PostgreSQL persistence.

## What is persistent?

- Blocks
- Transactions
- Validators
- Validator reputation fields
- Reputation events
- Chain metadata

## Important

The repository does NOT contain a database password or database server.

You must create a PostgreSQL database and add `DATABASE_URL` to Vercel Environment Variables.

The application automatically creates its tables and a genesis block on first successful connection.

It does NOT seed demo transactions or demo blocks.

## Vercel

1. Create a PostgreSQL database (Neon/Supabase/Vercel Postgres or another PostgreSQL provider).
2. Copy its connection string.
3. In Vercel:
   Project → Settings → Environment Variables
4. Add:
   `DATABASE_URL`
5. Redeploy.
6. Open:
   `/api/health`

Expected storage response:

```json
{
  "storage": "PostgreSQL",
  "persistent": true
}
```

## Local

Create `.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
NODE_ENV=development
```

Then:

```bash
npm install
npm start
```

The database tables are created automatically.

## API

- GET `/api`
- GET `/api/health`
- GET `/api/network`
- GET `/api/blocks`
- GET `/api/blocks/:height`
- GET `/api/transactions`
- GET `/api/transactions/:hash`
- GET `/api/validators`
- GET `/api/validators/:id`
- GET `/api/address/:address`
- GET `/api/search?q=...`

## Security

Do not upload `.env` or a real `DATABASE_URL` to GitHub.


## Transaction submission

The Explorer now exposes `POST /api/transactions` .

Example request:

```json
{
  "from": "TMR-ADDRESS-A",
  "to": "TMR-ADDRESS-B",
  "amount": 100,
  "nonce": 0
}
```

This creates a `pending` transaction in PostgreSQL. The existing request-driven block producer includes pending transactions when the next block interval is due.

**Security note:** this v1.2.0 demo endpoint does not verify cryptographic wallet signatures. Do not treat it as a production money-transfer API until signed transactions, replay protection, balance/state validation, and authorization are implemented.


## TMR Wallet v1.3

The explorer now includes a native browser wallet at `/wallet.html`. Wallet keys are generated with the browser Web Crypto API using Ed25519. The private key is kept in memory and is never sent to the server. Encrypted backups use PBKDF2-SHA256 + AES-256-GCM.

TMR addresses use the `TMR1...` prefix and are derived from the SHA-256 hash of the raw Ed25519 public key. Signed transaction submission includes the public key and Ed25519 signature; the server verifies both the signature and the sender/address binding before accepting a transaction.

The current PostgreSQL transaction amount column is an integer base unit (`NUMERIC(78,0)`). Decimal TMR denomination/18-decimal accounting should be added only when the native balance/state model is introduced.


## Testnet v1.4
See `TESTNET_DEPLOYMENT.md` for the 10B TMR genesis supply, faucet and wallet integration.


## Reset an existing testnet once

If an existing PostgreSQL database already contains old/demo blocks or transactions, add this Vercel environment variable for the next deployment:

```env
TMR_RESET_TESTNET_CHAIN=true
```

The migration deletes old transactions, non-genesis blocks, faucet claims and reputation events, then restores the three initial validators. A database marker prevents the reset from running again on every request. Remove the environment variable after the reset deployment.
