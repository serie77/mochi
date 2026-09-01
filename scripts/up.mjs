// runs the site and the agent together: npm run up
import { spawn } from "child_process";

const procs = [
  spawn("npx", ["next", "start"], { stdio: "inherit", shell: true }),
  spawn("node", ["agent/index.js"], { stdio: "inherit", shell: true }),
];

const bail = (code) => {
  for (const p of procs) p.kill();
  process.exit(code ?? 0);
};
for (const p of procs) p.on("exit", bail);
process.on("SIGINT", () => bail(0));
process.on("SIGTERM", () => bail(0));
