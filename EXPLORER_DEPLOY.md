# Thanvi Testnet Explorer Deployment

## Vercel

1. Set the project root to this repository.
2. Keep the provided `vercel.json`.
3. Add a PostgreSQL `DATABASE_URL` in Vercel Environment Variables.
4. Set `TMR_NETWORK=testnet`.
5. Keep `TMR_REQUEST_BLOCK_PRODUCTION=false` for a read-only Explorer.
6. Redeploy.

## Existing database with old/demo data

Set this for one deployment:

```env
TMR_RESET_TESTNET_CHAIN=true
```

After the deployment successfully initializes the database, remove the variable and redeploy again.

## Verification

Open:

- `/api/health`
- `/api/network`
- `/api/coin`
- `/api/blocks`
- `/wallet.html`

On a clean database, `/api/blocks` must contain only genesis block `#0` until a real transaction is finalized.

## Continuous testnet block production

Vercel is serverless. For continuous testnet operation, run a persistent validator/worker that calls:

```http
POST /api/blocks/produce
```

If `TMR_BLOCK_PRODUCER_KEY` is configured, send the value in the `x-tmr-producer-key` header.
