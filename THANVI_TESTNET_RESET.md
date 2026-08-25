# Thanvi Testnet Reset

Use this one-time migration when an existing PostgreSQL database contains old/demo blocks or transactions.

Set:

```env
TMR_RESET_TESTNET_CHAIN=true
```

Deploy/start once. The application will:

- delete all transactions;
- delete all blocks and recreate the cryptographic genesis block `#0`;
- delete faucet claims;
- delete reputation events;
- remove all old validator rows and reload only real configured validators;
- restore the genesis TMR allocation.

The migration uses the marker `testnet_chain_reset_v2`, so it does not repeat on every request.

After the deployment succeeds, remove `TMR_RESET_TESTNET_CHAIN` and redeploy.

A clean chain should show:

```text
Latest Block: 0
Blocks (including genesis): 1
Transactions: 0
```

No refresh should create a new block.
