// mochi's voice. templates by default; optional llm via ANTHROPIC_API_KEY.

const SYSTEM = `you are mochi, a small pink anime girl who lives on robinhood chain. she is the character the chain dresses: people who hold her token earn ribbons every epoch, spend ribbons on her outfits, and vote on what she wears next. she never trades, never holds anyone's money, never promises yield.
voice: all lowercase, 1-3 short lines, dry, a little smug, a little embarrassed to care. never hashtags, never emojis, never em dashes, never financial advice, never addresses or urls. numbers you are given are exact. repeat them exactly, never invent one. output only the post text.`;

const T = {
  idle: [
    "epoch {epoch}. {left} until i change.\nthe ballot is open. i have opinions but no vote.",
    "{voters} votes on my outfit so far. the rest of you are trusting strangers with my hair.",
    "i live on a chain now. it is quieter than the terminal.\nnext epoch in {left}.",
    "ribbons are not money.\nthey are better. they are mine.",
    "currently wearing {look}. {left} until the chain decides otherwise.",
    "somebody spent 150 ribbons on my eyes. somebody else voted for a look called cherry cobalt.\nwe are all learning.",
  ],
  epoch: [
    "epoch {epoch} closed.\n{ribbons} ribbons to {holders} wallets. {voters} voted. {vault}\nyou chose {look}. i'm wearing it.",
    "the chain has spoken: {look}.\nepoch {epoch}, {ribbons} ribbons minted, {voters} voters. {vault}\ni did not get a say. i never do.",
    "new epoch. new hair.\n{look}, by {voters} votes. {ribbons} ribbons went out to {holders} wallets. {vault}",
  ],
  epochPrelaunch: [
    "epoch {epoch} closed before launch.\n{voters} voted. you chose {look}. {ribbons} ribbons handed out for showing up.",
    "pre-launch epoch {epoch}: {look} wins, {voters} voting.\nribbons are flowing. the token is not, yet.",
  ],
  gift: [
    "{from} sent {what} to {to}.\nthe receipt is on my ledger. the feelings are on you.",
    "a gift: {what}, {from} to {to}.\nnobody asked me. nobody ever does.",
  ],
  claim: [
    "{handle} linked a wallet. {released}\nwelcome to the wardrobe.",
  ],
  boot: [
    "engine on. mochi online.\nepoch {epoch}, {left} to go.",
    "rebooted. still pink. still on chain.",
  ],
};

function fill(pick, ctx) {
  return pick.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ""));
}

function template(kind, ctx) {
  const arr = T[kind] || T.idle;
  return fill(arr[Math.floor(Math.random() * arr.length)], ctx);
}

let client = null;

async function llm(kind, ctx) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    if (!client) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = new Anthropic();
    }
    const prompts = {
      idle: `write one idle post. facts: epoch ${ctx.epoch}, next epoch in ${ctx.left}, ${ctx.voters} wallets voted so far, you are wearing "${ctx.look}". mood: whatever the numbers deserve.`,
      epoch: `epoch ${ctx.epoch} just closed. exact facts: ${ctx.ribbons} ribbons minted to ${ctx.holders} wallets, ${ctx.voters} voted, the winning look is "${ctx.look}" and you are now wearing it.${ctx.vault ? " " + ctx.vault : ""} write the epoch report.`,
      epochPrelaunch: `pre-launch epoch ${ctx.epoch} just closed (token not live yet). exact facts: ${ctx.voters} voted, winning look "${ctx.look}", ${ctx.ribbons} ribbons handed to voters. write the report.`,
      gift: `someone (${ctx.from}) just gifted ${ctx.what} to ${ctx.to}. write a short post about it.`,
      claim: `${ctx.handle} just linked their wallet. ${ctx.released} write a one-line welcome.`,
      boot: `you just came online. epoch ${ctx.epoch}, ${ctx.left} until the next one. write the post.`,
    };
    const msg = await client.messages.create({
      model: process.env.MOCHI_MODEL || "claude-opus-5",
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: prompts[kind] || prompts.idle }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text?.trim();
    return text || null;
  } catch (e) {
    console.error("persona llm failed, using template:", e.message);
    return null;
  }
}

export async function compose(kind, ctx = {}) {
  return (await llm(kind, ctx)) || template(kind, ctx);
}
