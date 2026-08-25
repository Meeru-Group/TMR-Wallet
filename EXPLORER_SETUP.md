# Thanvi Testnet Explorer Setup

The current release uses **PostgreSQL** as the persistent chain state layer. The old in-memory/local blockchain API is not part of the release.

## Endpoints

- `GET /api/network`
- `GET /api/blocks?limit=20`
- `GET /api/blocks/:height`
- `GET /api/transactions`
- `GET /api/transactions/:hash`
- `GET /api/address/:address`
- `POST /api/transactions`
- `POST /api/faucet`
- `POST /api/blocks/produce`

## Clean chain behavior

The Explorer does not create blocks on page refresh unless `TMR_REQUEST_BLOCK_PRODUCTION=true` is explicitly enabled.

The block producer refuses to create empty blocks. It only finalizes pending transactions.

For a clean database, the expected initial state is:

```text
Latest block: 0
Total blocks including genesis: 1
Transactions: 0
```
