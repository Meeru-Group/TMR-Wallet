# TMR Blockchain Testnet + Wallet v1.4

## Network
- Chain ID: `TMR-CHAIN-1`
- Environment: testnet
- Native coin: TMR
- Total supply: **10,000,000,000 TMR**
- Consensus: Proof-of-Reputation
- Signatures: Ed25519
- Wallet address: `TMR1...` derived from SHA-256(public key) + base32

## Genesis deployment
The database seeds a genesis allocation of the full 10B TMR supply to the testnet faucet address. The allocation is recorded in `chain_meta` and is used as the initial balance source. Normal transfers cannot create supply because `addTransaction()` checks sender balance and nonce.

## Faucet
`POST /api/faucet` with `{ "address": "TMR1..." }` creates a real 1,000 TMR pending transaction from the genesis faucet treasury. One claim per address per 24 hours. The transaction becomes confirmed when the automatic block producer finalizes the next block.

## Wallet
Open `/wallet`. It supports: local Ed25519 wallet creation, encrypted backup/restore, live balance, nonce, real signed send, receive address, testnet faucet and activity. Private keys never go to the server.

## Required Vercel variables
```
DATABASE_URL=your-postgresql-url
TMR_NETWORK=testnet
TMR_FAUCET_ADDRESS=TMR1faucet000000000000000000000000
TMR_FAUCET_AMOUNT=1000
TMR_BLOCK_TIME_MS=12000
```

Do not put `DATABASE_URL` in GitHub.
