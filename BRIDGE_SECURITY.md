# Bridge Security Notes

The current implementation is intended for a real public testnet, not for valuable mainnet funds.

## Trust model

The bridge relayer currently has two powers:

- EVM: mint wTMR for confirmed TMR locks.
- TMR: release TMR from the bridge vault for confirmed EVM burns.

Compromise of either relayer key can cause loss or unauthorized issuance. The TMR vault is also a custody account.

## Recommended next version

Use a validator threshold scheme:

- TMR lock is accepted only after N-of-M TMR validators attest.
- EVM mint requires N-of-M signatures.
- EVM burn requires N-of-M signatures before TMR release.
- Enforce daily limits and per-order limits.
- Store finalized source block heights and event IDs.
- Never allow an order ID to be processed twice.
