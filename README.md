# TMR Wallet

Standalone wallet frontend for TMR Blockchain.

## Current connection

Default API:
`https://tmr-blockchain.vercel.app`

The wallet connects to:
- `/api/health`
- `/api/network`
- `/api/address/:address`

It displays live network status, latest block, validator count, address balance and transaction history.

## Address

Wallet addresses are `TMR1...` and are derived from the SHA-256 hash of the raw Ed25519 public key.

**This derivation must be implemented identically by the TMR Blockchain before the address is treated as a consensus-valid native address.**

## Important production security

The current TMR Blockchain source exposes an unsigned transaction writer and does not yet expose a signature-verifying transaction endpoint. Therefore this wallet deliberately does not enable Send.

Before real-value transfers are enabled, the blockchain must verify:
1. Ed25519 signature
2. Public-key/address binding
3. Nonce/replay protection
4. Sender balance
5. Atomic state transition
6. Transaction hash
7. Validator/block inclusion

Private-key backups should also be password-encrypted before production use.
