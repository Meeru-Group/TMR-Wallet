# Block Production Rules

The Explorer must never manufacture blocks merely because someone opens or refreshes the website.

## Rule

A block is finalized only when the PostgreSQL transaction pool contains at least one real pending transaction.

## Vercel

Vercel functions are request-driven. For a private testnet, request-driven finalization can be enabled with:

```env
TMR_REQUEST_BLOCK_PRODUCTION=true
```

For a more reliable testnet, run the finalizer from a persistent validator/worker:

```http
POST /api/blocks/produce
x-tmr-producer-key: <configured-key>
```

If there are no pending transactions, the endpoint returns `produced: false` and does not create a block.

This implementation intentionally does not claim to be a decentralized multi-node PoR network. Independent validators and vote aggregation are required for that.
