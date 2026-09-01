# launch runbook

everything below is prepared. on launch day it is: launch token, paste one address, run one command.

## 0. already done
- deployer wallet: `0xbe69D2EEAC49C3CAF117260d6D23D2DaF4e49EEd` (~0.00065 ETH left; covers the staking deploy + wiring at ~0.4 gwei)
- key sits in `contracts/.env` (never commit, never share). foundry auto-loads it.
- contracts tested: 25 unit + 5 fork tests green; full ui flow rehearsed on a mainnet fork.
- **VAULT IS LIVE ON MAINNET**: `0x3fFd93282A54ECAF49A9813562579A561D0E58c5` (mUSD), source verified
  on blockscout, wired into the site .env. fee is OFF until staking is wired in step 2b, so
  depositors keep 100% of the yield until then. step 2a below is DONE.

## 1. launch $MOCHI on pons
- from any wallet EXCEPT the deployer (its balance is budgeted for the contract deploy only)
- name/ticker/image as you like; copy the token contract address (CA)

## 2a. (can happen BEFORE the token) deploy the vault
the vault does not need the token. deploy it any time; depositors keep 100% of
the yield until staking is wired in step 2b.
```
cd d:/mochi/contracts
forge script script/DeployVaultOnly.s.sol --tc DeployVaultOnly --rpc-url robinhood --broadcast
```
put the printed address in the site .env as `VAULT_CA=` and restart. the vault tab goes live.

## 2b. (after the token) deploy staking and wire it (~1 min)
- paste the token CA into `contracts/.env` as `MOCHI_CA=0x...` and the vault as `VAULT_CA=0x...`
- then:
```
cd d:/mochi/contracts
forge script script/DeployStaking.s.sol --tc DeployStaking --rpc-url robinhood --broadcast
```
- it deploys staking, points its rewards at the vault, and switches the vault fee on (set-once).
- fresh full deploy in one go instead: `forge script script/Deploy.s.sol --tc Deploy --rpc-url robinhood --broadcast`
- if gas complains, check `cast gas-price --rpc-url robinhood` first

## 3. verify source on blockscout (free, makes "read the contracts" real)
```
forge verify-contract <STAKING_ADDR> src/MochiStaking.sol:MochiStaking \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api \
  --constructor-args $(cast abi-encode "c(address,address)" <MOCHI_CA> 0xbe69D2EEAC49C3CAF117260d6D23D2DaF4e49EEd)

forge verify-contract <VAULT_ADDR> src/MochiVault.sol:MochiVault \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api \
  --constructor-args $(cast abi-encode "c(address,address,uint256,address)" \
    0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 0xde770c84FE66E063336b31737cFE9790f18c4087 \
    1000 0xbe69D2EEAC49C3CAF117260d6D23D2DaF4e49EEd)
```

## 4. flip the site live
in `d:/mochi/.env` set:
```
TOKEN_CA=<mochi token CA>
VAULT_CA=<vault addr>
STAKING_CA=<staking addr>
BUY_URL=            # optional; empty = auto dexscreener link once the pool is indexed
```
restart: `npm run up` (on railway: redeploy with the same vars)

## 5. five-minute smoke test (the only manual part)
- open /app with metamask: connect, sign in (message, not a tx)
- deposit 1 USDG, see the position, withdraw it back
- stake a little $MOCHI, unstake it
- cast a vote; check the landing shows tvl and the countdown
- (apy tile shows "–" for the first ~6h while it samples the real share price. expected.)

## 6. hosting (vercel free + neon free)
- neon.tech -> new project -> copy DATABASE_URL
- vercel.com -> import github repo serie77/mochi -> env vars:
  DATABASE_URL, VAULT_CA=0x3fFd93282A54ECAF49A9813562579A561D0E58c5, X_USERNAME=mochistaking,
  AUTH_SECRET=<long random>, NEXT_PUBLIC_CHARACTER_MODEL=/mochi.vrm, SITE_URL=<your url>
  (add TOKEN_CA + STAKING_CA after launch and redeploy)
- point cloudflare dns at the vercel domain
- optional: free uptime pinger hitting /api/state every 5 min so epochs close on the dot

## 7. optional, any time later
- x keys in .env for her voice (free tier); `X_BEARER_TOKEN` (basic tier) for gifts-by-tweet
- point dns at railway
