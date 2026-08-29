# Real TMR RPC + Validator Worker

This package exposes a real TMR-native JSON-RPC endpoint at `/rpc`, backed by the same PostgreSQL chain state used by the wallet. It does not fabricate blocks or balances.

## RPC

GET `/rpc` returns the supported methods. POST JSON-RPC methods include:
- `tmr_chainId`
- `tmr_blockNumber`
- `tmr_getBlockByNumber`
- `tmr_getTransactionByHash`
- `tmr_getBalance`
- `tmr_sendTransaction`

## Real block production

Vercel is request-driven and cannot be relied upon as a permanently running validator process. Run `validator-worker.js` on a persistent worker service with:

```env
TMR_API_URL=https://tmr-blockchain.vercel.app
TMR_BLOCK_PRODUCER_KEY=<same secret configured on the API>
TMR_VALIDATOR_POLL_MS=5000
```

The API must also have a real PostgreSQL `DATABASE_URL`, a real `TMR_BLOCK_PRODUCER_KEY`, and at least one real validator in `TMR_VALIDATORS_JSON`.

This is a persistent single-operator testnet implementation, not a decentralized multi-node consensus network. Do not market it as trustless until independent validator nodes, peer networking, block signatures, vote aggregation, and durable consensus state are deployed.
