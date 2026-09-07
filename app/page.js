import { cfg } from "../lib/store.js";
import { CopyPlate } from "./ui.js";
import { HeroMeta, HeroStage, LiveTerminal, TokenTiles, VoicePosts, BuyLink } from "./landing-client.js";

export const dynamic = "force-dynamic";

export default function Home() {
  const c = cfg();
  const x = c.xUsername;
  const bot = x || "mochi";
  return (
    <>
      {/* section links scroll without writing #fragments into the url */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var el=document.getElementById(a.getAttribute("href").slice(1));if(!el)return;e.preventDefault();el.scrollIntoView({behavior:"smooth",block:"start"})});`,
        }}
      />
      <div className="ambient" aria-hidden="true" />
      <div className="site">
        <header className="nav">
          <div className="nav-inner">
            <a href="/" className="brand">
              <img src="/logo.png" alt="" />
              <span className="wordmark">mochi</span>
            </a>
            <nav className="nav-menu" aria-label="primary">
              <a href="#vault">the vault</a>
              <a href="#staking">staking</a>
              <a href="#wardrobe">the wardrobe</a>
              <a href="#token">$mochi</a>
              <a href="#faq">faq</a>
            </nav>
            <div className="nav-actions">
              {x && <a className="nav-follow" href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer"><XLogo /> @{x}</a>}
              <a className="btn nav-cta" href="/app">open the app</a>
            </div>
          </div>
        </header>

        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="pill"><i className="dot" />real yield on robinhood chain · epoch every {c.epochHours}h</span>
              <h1 className="h1">yield with a <em>face</em>.</h1>
              <p className="sub hero-sub">
                mochi is a real-value protocol with a mascot who takes her job seriously. deposit <b>USDG</b> into her
                vault and it earns spark's savings rate. the share price does the compounding. stake{" "}
                <b>$MOCHI</b> and her performance fee pays you in USDG, never in emissions. and every epoch, the
                holders still vote on what she wears.
              </p>
              <div className="hero-ctas">
                <a className="btn" href="/app">open the app</a>
                <a className="btn-ghost" href="#vault">how it works</a>
              </div>
              <CopyPlate
                label="$mochi contract on robinhood chain"
                value={c.tokenCa || null}
                explorer={c.tokenCa ? `${c.explorer}/token/${c.tokenCa}` : null}
              />
              <HeroMeta />
            </div>
            <HeroStage />
          </div>
        </section>

        <section className="container">
          <LiveTerminal />
        </section>

        <section className="section container" id="vault">
          <div className="section-head">
            <div>
              <span className="eyebrow"><span className="num">01</span><span className="rule" />the vault</span>
              <h2 className="h2"><span className="nowrap"><img className="usdg-mark" src="/usdg.png" alt="" aria-hidden="true" />USDG</span> in, mUSD out, spark in between.</h2>
            </div>
            <p className="caption">
              mUSD is a standard erc-4626 share. the interest comes from spark's savings vault on robinhood chain,
              outside this protocol, visible on the explorer.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <span className="n">1</span>
              <div className="h3">deposit</div>
              <code>deposit(USDG)</code>
              <p>put USDG in, get mUSD back at the current share price. the position is a plain token in your own wallet.</p>
            </div>
            <div className="step">
              <span className="n">2</span>
              <div className="h3">route</div>
              <code>underlying.deposit()</code>
              <p>the vault pushes every idle USDG into spark's spUSDG, the open savings vault with eight figures already in it.</p>
            </div>
            <div className="step">
              <span className="n">3</span>
              <div className="h3">earn</div>
              <code>pricePerShare ↑</code>
              <p>interest accrues into the mUSD share price. no rebase, no claim step, no points. your balance never changes; its value does.</p>
            </div>
            <div className="step">
              <span className="n">4</span>
              <div className="h3">withdraw</div>
              <code>withdraw(USDG)</code>
              <p>burn shares, take USDG, same block. no queue, no epoch gate, no exit fee. the limit is spark's own liquidity, shown honestly.</p>
            </div>
          </div>
        </section>

        <section className="section container" id="staking">
          <div className="section-head">
            <div>
              <span className="eyebrow"><span className="num">02</span><span className="rule" />the fee loop</span>
              <h2 className="h2">stake $mochi. get paid in USDG.</h2>
            </div>
            <p className="caption">the protocol's only revenue is a cut of realized yield, and all of it goes to stakers.</p>
          </div>
          <div className="split">
            <div>
              <p className="sub" style={{ marginBottom: 22 }}>
                the vault charges a performance fee on yield, <b className="em">never on principal</b>, against a
                high-water mark, so losses are never billed and recovery is not "profit". the fee is minted as mUSD
                straight to the staking contract. stake $MOCHI and it streams to you: claim whenever, redeem to USDG
                whenever, unstake whenever.
              </p>
              <div className="grammar" style={{ marginTop: 0 }}>
                <div className="row head"><span>flow</span><span>where it goes</span></div>
                <div className="row"><code>100% of deposits</code><span>into spark. the protocol never holds a private key over them.</span></div>
                <div className="row"><code>90% of yield</code><span>stays in the mUSD share price, for depositors.</span></div>
                <div className="row"><code>10% of yield</code><span>minted as mUSD to $MOCHI stakers. hard-capped at 20% in the contract.</span></div>
                <div className="row"><code>0% of principal</code><span>can be touched by anyone but its depositor. there is no admin withdrawal.</span></div>
              </div>
            </div>
            <div className="never">
              <span className="eyebrow">by design</span>
              <div className="never-item"><b>no emissions</b><span>staking APY is real fee revenue in mUSD, not inflation of $MOCHI.</span></div>
              <div className="never-item"><b>no lockup</b><span>unstake and withdraw any time. rewards already earned stay yours.</span></div>
              <div className="never-item"><b>no claim treadmill</b><span>vault yield compounds in the share price by itself; staking rewards claim in one call.</span></div>
              <div className="never-item"><b>no keeper</b><span>fees accrue inside user transactions. nothing breaks if nobody shows up.</span></div>
              <div className="never-item"><b>no rug lever</b><span>the owner can set the fee (≤20%) and nothing else. the contracts are short enough to read over coffee.</span></div>
            </div>
          </div>
        </section>

        <section className="section container" id="wardrobe">
          <div className="section-head">
            <div>
              <span className="eyebrow"><span className="num">03</span><span className="rule" />the wardrobe</span>
              <h2 className="h2">the mascot is not a metaphor.</h2>
            </div>
            <p className="caption">
              every {c.epochHours}h epoch mints ribbons to holders and stakers, pro-rata. ribbons buy her outfits,
              and the holders vote on what she wears in public, right here on the site.
            </p>
          </div>
          <div className="split">
            <div>
              <p className="sub" style={{ marginBottom: 22 }}>
                mochi is the ledger's face. she announces every epoch with the exact numbers: tvl, yield, fees paid,
                the winning look. she reads them straight off the ledger and is not allowed to improvise. ribbons are
                loyalty points, not tokens: they cannot be sold or redeemed, only spent on her, or gifted to any wallet.
              </p>
              <div className="grammar" style={{ marginTop: 0 }}>
                <div className="row head"><span>in the wardrobe</span><span>what it does</span></div>
                <div className="row"><code>colors</code><span>her hair, eyes, outfit, shoes, and the ribbon in it.</span></div>
                <div className="row"><code>fabric prints</code><span>stripes, dots, checker, composited into the garment itself.</span></div>
                <div className="row"><code>headwear</code><span>real 3d pieces: cat ears, halo, witch hat, glasses, horns.</span></div>
                <div className="row"><code>gifts</code><span>send ribbons or any item you own to any wallet. delivered instantly.</span></div>
              </div>
            </div>
            <div className="tweets">
              <div className="tweet reply">
                <div className="who"><img src="/logo.png" alt="" /><b>mochi</b><span>epoch report</span></div>
                <p>epoch 42 closed. 1,000 ribbons to 214 wallets. the vault holds $58,120 at 6.94% apy. you chose seafoam ink, witch hat. i'm wearing it.</p>
              </div>
              <div className="tweet">
                <div className="who"><b>gift receipt</b><span>on her ledger</span></div>
                <p>0x9a4c…e1f2 sent <code>headwear-cat-ears</code> to 0x51b0…77c3. delivered.</p>
              </div>
              <div className="tweet">
                <div className="who"><b>gift receipt</b><span>on her ledger</span></div>
                <p>0x51b0…77c3 sent <code>50 ribbons</code> back. she considers this a friendship.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section container" id="token">
          <div className="section-head">
            <div>
              <span className="eyebrow"><span className="num">04</span><span className="rule" />$mochi</span>
              <h2 className="h2">hold it, stake it, vote with it.</h2>
            </div>
            <p className="caption">
              fixed supply, launched fair on pons. stake it for the fee stream, hold it for ribbons, and either way
              your balance weighs your vote on her look.
            </p>
          </div>
          <TokenTiles />
          <div className="token-grid">
            <div>
              <CopyPlate label="contract" value={c.tokenCa || null} explorer={c.tokenCa ? `${c.explorer}/token/${c.tokenCa}` : null} />
              <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <BuyLink />
                <a className="btn-ghost" href="/story">read her story</a>
              </div>
            </div>
            <div className="card">
              <div className="h3">staked and held count the same</div>
              <p>
                the epoch snapshot reads wallet balances from the chain and staked balances from the staking
                contract, adds them, and weighs both the ribbon mint and the outfit vote by the total. staking never
                costs you her wardrobe. it adds the fee stream on top.
              </p>
            </div>
          </div>
        </section>

        <section className="section container">
          <div className="voice">
            <div>
              <span className="eyebrow"><span className="rule" />her voice</span>
              <h2 className="h2">{x ? `@${x}` : "the epoch report"}</h2>
              <p className="sub">
                every epoch she posts what closed: the vault's tvl and apy, ribbons minted, the winning look. the
                numbers come from the ledger and the chain, not from her imagination.
              </p>
              {x && <a className="btn" href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer"><XLogo /> follow @{x}</a>}
            </div>
            <VoicePosts />
          </div>
        </section>

        <section className="section container" id="faq">
          <div className="section-head">
            <div>
              <span className="eyebrow"><span className="num">05</span><span className="rule" />faq</span>
              <h2 className="h2">before you put USDG in.</h2>
            </div>
          </div>
          <div className="faq one">
            <div>
              <details open>
                <summary>what is mochi?</summary>
                <p>
                  a savings vault with a mascot. you deposit USDG and receive mUSD, a share whose price only goes up
                  as yield comes in. stake $MOCHI to earn a cut of the vault's fee, and spend ribbons dressing the
                  girl everyone shares.
                </p>
              </details>
              <details>
                <summary>where does the yield come from?</summary>
                <p>
                  from spark, one of the largest savings protocols in defi, funded by real revenue rather than token
                  printing. the vault routes every deposit there and the mUSD share price compounds on its own. if
                  the rate is 7%, depositors see about 6.3% and stakers split the rest.
                </p>
              </details>
              <details>
                <summary>what does staking $MOCHI pay?</summary>
                <p>
                  the vault's fee stream, paid in mUSD, a claim on real USDG. there are no emissions, so the return
                  scales with how much the vault holds, not with a token printer. staked $MOCHI still earns ribbons
                  and still weighs your vote.
                </p>
              </details>
              <details>
                <summary>can anyone touch my deposit?</summary>
                <p>
                  only your wallet. there is no pause button, no upgrade, no admin withdrawal. the one thing the team
                  can adjust is the fee, and it is hard-capped at 20% forever.
                </p>
              </details>
              <details>
                <summary>what are ribbons?</summary>
                <p>
                  points she hands out every epoch to holders, stakers, and voters. they buy her hair colors, outfits,
                  and headwear, and they can be gifted to any wallet. they are not a token and never will be.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="closing">
          <img className="coin" src="/usdg.png" alt="" aria-hidden="true" />
          <img className="girl" src="/hero.png" alt="" aria-hidden="true" />
          <div className="container">
            <h2 className="h1">real yield, worn in public.</h2>
            <p className="sub">
              deposit USDG and watch the share price. stake and watch the fees. or just connect, cast a vote, and
              dress her. the next epoch closes on the clock either way.
            </p>
            <a className="btn" href="/app">open the app</a>
            <a className="builton" href="https://robinhood.com/chain" target="_blank" rel="noopener noreferrer">
              <span>built on</span>
              <img src="/robinhood-chain.svg" alt="Robinhood Chain" />
            </a>
          </div>
        </section>

        <footer className="footer">
          <div className="container">
            <div className="footer-grid">
              <div>
                <a href="/" className="brand"><img src="/logo.png" alt="" /><span className="wordmark">mochi</span></a>
                <p className="brand-line">
                  yield with a face. a real-value protocol on robinhood chain: a USDG vault on spark, fee staking in
                  mUSD, and a mascot the holders dress every epoch.
                </p>
                <div className="footer-ca"><b>$MOCHI</b>{c.tokenCa || "not launched yet"}</div>
                <a className="builton left" href="https://robinhood.com/chain" target="_blank" rel="noopener noreferrer">
                  <span>built on</span>
                  <img src="/robinhood-chain.svg" alt="Robinhood Chain" />
                </a>
              </div>
              <div>
                <h4>app</h4>
                <ul>
                  <li><a href="/app">the vault</a></li>
                  <li><a href="/app?tab=stake">staking</a></li>
                  <li><a href="/app?tab=wardrobe">the wardrobe</a></li>
                  <li><a href="/app?tab=vote">the ballot</a></li>
                </ul>
              </div>
              <div>
                <h4>protocol</h4>
                <ul>
                  <li><a href="#vault">the vault</a></li>
                  <li><a href="#staking">the fee loop</a></li>
                  <li><a href="#token">$mochi</a></li>
                  <li><a href="/story">story</a></li>
                </ul>
              </div>
              <div>
                <h4>elsewhere</h4>
                <ul>
                  {x && <li><a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><XLogo /> @{x}</a></li>}
                  {c.vaultCa && <li><a href={`${c.explorer}/address/${c.vaultCa}`} target="_blank" rel="noopener noreferrer">vault on blockscout</a></li>}
                  {c.tokenCa && <li><a href={`${c.explorer}/token/${c.tokenCa}`} target="_blank" rel="noopener noreferrer">$mochi on blockscout</a></li>}
                  <li><a href="https://robinhood.com/chain" target="_blank" rel="noopener noreferrer">robinhood chain</a></li>
                </ul>
              </div>
            </div>
            <div className="footer-bottom">
              <span>© 2026 mochi. not affiliated with robinhood, spark, or paxos.</span>
              <span>unaudited defi. yield is variable, principal is at risk, ribbons are not tokens.</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

function XLogo() {
  return (
    <svg className="xlogo" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
