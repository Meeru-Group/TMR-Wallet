# Real TMR RPC

The wallet server exposes a real PostgreSQL-backed JSON-RPC endpoint at `/rpc`.

Browser read-only examples:
- `/rpc?method=tmr_chainId`
- `/rpc?method=tmr_blockNumber`
- `/rpc?method=tmr_getNetwork`
- `/rpc?method=tmr_getBlockByNumber&height=48`
- `/rpc?method=tmr_getBlockByHash&hash=<hash>`
- `/rpc?method=tmr_getTransactionByHash&hash=<hash>`
- `/rpc?method=tmr_getBalance&address=<TMR1-address>`

Standard clients should use POST `/rpc` with JSON-RPC 2.0.

This endpoint reads the same PostgreSQL-backed chain state used by the Explorer and wallet; it does not generate demo blocks or simulated balances.
