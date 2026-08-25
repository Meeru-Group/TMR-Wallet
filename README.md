# TMR Wallet

Standalone TMR Wallet frontend.

## Address format

Wallet addresses start with `TMR1`.

## Security

Private keys are generated and stored locally in the browser. Do not share them.

## Important production note

Before using real value, integrate a reviewed Ed25519 implementation for actual signing and make the TMR Blockchain verify signatures, account state, nonce, and balances server-side.
