# TMR Real Cross-Chain Testnet

This package now uses a **real on-chain lock/release bridge** for TMR <-> one configured EVM testnet. It is not a simulator.

## Architecture

### TMR -> EVM
1. User requests a bridge order.
2. Wallet creates a real signed TMR transaction to `TMR_BRIDGE_VAULT_ADDRESS`.
3. Transaction is finalized on TMR-CHAIN-1.
4. The bridge relayer detects the confirmed `bridge_lock` transaction.
5. Relayer calls `mintForBridge(orderId, recipient, amount)` on `TMRWrapped`.
6. wTMR is minted 1:1 at 18 decimals on the EVM testnet.

### EVM -> TMR
1. User creates a bridge order.
2. Wallet asks the API for real ABI calldata.
3. User signs `burnToTMR(orderId, amount, tmrRecipient)` on the deployed wTMR contract.
4. Relayer detects the real `BridgeBurned` event.
5. Relayer signs a real TMR transaction from the bridge vault to the recipient.
6. The TMR transaction is finalized and the bridge order becomes `COMPLETED`.

The bridge is **custodial at the bridge-vault layer**: the EVM contract is controlled by the EVM relayer key and the TMR backing is held by the TMR bridge vault. Do not describe this as trustless until multi-validator/multisig verification is added.

## Deploy

### 1. Generate the TMR bridge vault key

```bash
node scripts/generate-bridge-key.js
```

Store the returned address and PKCS#8 private key securely. Fund the returned TMR address on your TMR testnet with enough TMR to back expected EVM redemptions.

### 2. Configure EVM testnet

Use a real EVM testnet RPC. Sepolia (`11155111`) is the default example, but another EVM testnet can be used by changing `EVM_CHAIN_ID`.

Fund the EVM relayer address with native testnet gas.

### 3. Deploy wTMR

```bash
npm install
npm run bridge:deploy
```

The deployment script prints the deployed `wrappedTMR` address. Put it into `WRAPPED_TMR_ADDRESS`.

The contract's `bridgeRelayer` is the EVM account used by `EVM_RELAYER_PRIVATE_KEY`.

### 4. Configure the TMR API

Add the bridge variables from `.env.bridge.example` to the TMR API environment. The TMR API needs `DATABASE_URL` as usual.

### 5. Start the bridge relayer

```bash
npm run bridge:relayer
```

Keep the relayer running continuously. It polls both chains and writes bridge state into PostgreSQL.

### 6. Open the wallet

The wallet's Cross-Chain panel now exposes:

- real TMR lock transaction
- real EVM wTMR burn transaction
- real transaction hashes
- real bridge order status
- real EVM/TMR settlement status

## 0x integration

0x remains available for **EVM -> EVM** routes where both chains are supported by the live 0x Cross-Chain API. TMR-CHAIN-1 cannot be passed to 0x directly because it is not a 0x-supported chain.

## Production hardening before mainnet

- Replace the single relayer with a threshold/multisig bridge.
- Add validator attestations for every lock and burn.
- Add replay protection and finalized-block depth checks.
- Add rate limits and bridge limits.
- Add emergency pause and recovery procedures.
- Use a dedicated HSM/KMS for relayer keys.
- Add independent monitoring and alerting.
- Audit the Solidity contract and relayer before handling valuable assets.
