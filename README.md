# mochi

yield with a face. a real-value protocol on robinhood chain with a mascot the holders dress:

- **the vault (mUSD)**: deposit USDG into an erc-4626 vault that routes into spark's spUSDG savings vault. the share price accrues real lending yield; withdraw any time.
- **staking (sMOCHI)**: stake `$MOCHI`, earn the vault's performance fee (10% of yield, hard-capped 20%, never principal) paid in mUSD. no emissions, no lockup.
- **the wardrobe**: every epoch mints **ribbons** to holders + stakers pro-rata; ribbons buy her outfits, holders vote what she wears in public, gifts work by tweet. loyalty layer, not a token.

## parts

- **contracts/**: foundry project: `MochiVault.sol` (4626 wrapper, high-water-mark fee), `MochiStaking.sol` (index-based fee distribution). unit tests on mocks + fork tests against the real chain (`anvil --fork-url https://rpc.mainnet.chain.robinhood.com --hardfork shanghai`, then `forge test --match-contract ForkTest --fork-url http://127.0.0.1:8545`).
- **site**: next.js (`app/`). `/` the protocol page, `/app` the app (vault / stake / wardrobe / vote / gifts / ledger), `/story`. wallet sign-in by message; deposits/stakes are built client-side (`app/tx.js`) and signed by the visitor's own wallet.
- **machine**: `agent/index.js`. heartbeats, closes the epoch (snapshot holders from blockscout + stakers from contract events, mint ribbons, tally the balance-weighted vote, change her look), posts the report with vault tvl/apy, and optionally reads x mentions for `gift` / `claim`.
- **data**: flat json in `data/`, shared file lock between site and machine.

## run it

```
cp .env.example .env
npm install
npm run build
npm run up          # site :3000 + machine
npm run selftest    # exercises every endpoint with a throwaway wallet
```

## real outfits from vroid studio

colors, fabric prints and 3d headwear are built in. for entirely different clothing (a
dress, a uniform), export the SAME character from vroid studio wearing the new outfit,
drop the file at `public/models/<name>.vrm`, and add one line to `OUTFITS` in
`lib/catalog.js`. it becomes a buyable wardrobe item and can win epochs like anything
else; colors, prints and headwear still apply on top.

## deploy the contracts (~$10 of ETH on chain 4663, one time)

```
cd contracts
export MOCHI_CA=0x...     # after $MOCHI launches on pons
export PRIVATE_KEY=0x...  # deployer key
forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
# then put the printed addresses in .env as VAULT_CA / STAKING_CA and restart
```

verify on blockscout with `forge verify-contract --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api`.

known addresses (mainnet, verified live): USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, spark spUSDG `0xde770c84FE66E063336b31737cFE9790f18c4087`.

## modes

- no `TOKEN_CA`: pre-launch. epochs tick, votes count once, voters earn ribbons, vault/stake tabs show "deploys at launch".
- `TOKEN_CA` set: live token. ribbons pro-rata by (held + staked) balance, votes weighted the same.
- `VAULT_CA`/`STAKING_CA` set: full protocol. vault stats and positions live, deposits/stakes from the app, epoch reports include tvl/apy.

running costs: none. all contract state transitions happen inside user transactions; the machine only reads the chain and posts.

## x

her voice posts on the free tier (`X_API_KEY`…). gifts by tweet need the basic-tier `X_BEARER_TOKEN`:
`@mochi gift @friend 50 ribbons` · `@mochi gift @friend hair-midnight` · `@mochi claim 0xWallet`. fixed grammar, no model reads tweets.

## deploy the site (vercel, free)

the site runs serverless: with `DATABASE_URL` set, all state lives in postgres and epochs
close on demand inside requests (no background process needed).

1. create a free postgres at neon.tech (github sign-in, no card) and copy the connection string
2. import the github repo on vercel (hobby tier, free)
3. set the env vars: `DATABASE_URL`, `VAULT_CA`, `X_USERNAME`, `AUTH_SECRET` (any long random
   string), `NEXT_PUBLIC_CHARACTER_MODEL=/mochi.vrm`, `SITE_URL` (and `TOKEN_CA`/`STAKING_CA`
   after launch) — then deploy
4. epochs close when someone loads the site after the 4h mark. optional: point any free
   uptime pinger at `/api/state` so closes never wait for a visitor

## deploy the site (railway / self-host)

start command `node agent/index.js & npm start`, volume at `/app/data`, env vars in service settings.
