# TMR Wallet

Trust Wallet-style standalone frontend for TMR Blockchain.

Default API: `https://tmr-blockchain.vercel.app`

Reads:
- `/api/network`
- `/api/address/:address`

Wallet:
- Ed25519 key pair generated locally
- `TMR1...` address
- local balance/activity display
- receive address
- backup/restore

Send is intentionally disabled until the blockchain provides a signed-transaction verification endpoint with nonce, balance and replay protection.
