# TMR Wallet — Fixed Build

Trust Wallet-inspired non-custodial UI for TMR Blockchain.

## Included
- TMR1 address
- Ed25519 local signing
- TMR Blockchain API connection
- live balance and nonce
- activity/transaction history
- real Receive address
- signed Send/Broadcast flow
- backup/restore
- blockchain status panel
- responsive mobile design

## API
Default:
`https://tmr-blockchain.vercel.app`

Change without editing code:
```js
localStorage.setItem("tmr_api","https://YOUR-TMR-API")
```

## Important
The wallet only considers a transaction successful when the blockchain API accepts the signed transaction. There is no fake balance or fake transaction generator in the wallet UI.

The exact server-side transaction schema must match the deployed TMR Blockchain. If the deployed API does not implement `POST /api/transactions` with Ed25519 verification, Send will correctly show an API error rather than pretending that a transfer happened.

The existing project files from the uploaded ZIP are preserved under `original/`.
