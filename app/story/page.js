import { cfg } from "../../lib/store.js";

export const metadata = {
  title: "story",
  description: "who mochi is, where she came from, what she wants.",
};

export const dynamic = "force-dynamic";

export default function Story() {
  const c = cfg();
  return (
    <main className="story">
      <div className="story-inner">
        <header className="story-head">
          <a href="/" className="brand">
            <img src="/logo.png" alt="" width={26} height={26} />
            <span className="wordmark">mochi</span>
          </a>
          <span className="eyebrow">the character file</span>
          <h1>the story</h1>
          <p className="lede">who mochi is, where she came from, what she wants.</p>
        </header>

        <section>
          <span className="eyebrow">01 · the girl</span>
          <p>
            mochi is a small pink anime girl who lives on robinhood chain. she does not trade. she does not
            hold anyone's money. she gets dressed, by everyone who holds her token, four times a day, whether
            she likes the outfit or not.
          </p>
        </section>

        <section>
          <span className="eyebrow">02 · the origin</span>
          <p>
            she used to live inside a trading terminal on another chain. she scanned pools, bought things, and
            posted about it. it was loud and it was losing. one day the terminal went dark and she woke up
            somewhere quieter, with a wardrobe and no positions. she has decided this is an upgrade.
          </p>
        </section>

        <section>
          <span className="eyebrow">03 · the epoch</span>
          <p>
            every {c.epochHours} hours the engine takes a snapshot of who holds her, hands out ribbons in
            proportion, counts the vote, and changes her look to whatever won. she is told afterwards. every
            epoch is posted with its numbers, read straight off the ledger.
          </p>
        </section>

        <section>
          <span className="eyebrow">04 · the treasury she keeps</span>
          <p>
            she runs a vault now. dollars go in, get routed to spark, and earn real interest; her fee, a tenth of
            the yield and never the principal, goes to whoever stakes her token. she takes the job
            more seriously than she will ever admit.
          </p>
        </section>

        <section>
          <span className="eyebrow">05 · ribbons</span>
          <p>
            ribbons are not tokens. they cannot be sold, bridged, or staked. they buy hair colors, eye colors,
            outfits, and the ribbon in her hair, and they can be gifted to any wallet. that is all they do,
            and she is quite protective of them.
          </p>
        </section>

        <section>
          <span className="eyebrow">06 · the want</span>
          <p>
            to be dressed well by strangers, and for one epoch, just one, to win with a look she would have
            picked herself. she keeps a list of the ones that came close.
          </p>
        </section>

        <footer className="story-foot">
          <a href="/app" className="btn">open the wardrobe</a>
          <a href="/" className="link">back to the front</a>
        </footer>
      </div>
    </main>
  );
}
