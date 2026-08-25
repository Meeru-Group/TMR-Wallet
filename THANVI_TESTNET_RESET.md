# Thanvi Testnet reset

This release removes the explorer demo transaction UI and stops automatic empty blocks.

For an existing database that contains old/demo blocks, set `TMR_RESET_TESTNET_CHAIN=true` in Vercel for one deployment. The migration keeps only genesis block #0, clears transactions/faucet claims/reputation events, and resets the three initial validators. Remove the variable after the migration.

The native asset remains **TMR** with total genesis supply **10,000,000,000 TMR**. The network display name is **Thanvi Testnet**.
