// Manual repro: parent pi with discovery + explicit -e extension spawns a
// subagent; we then capture the child pane's startup [Extensions] section.
import { createSurface, sendLongCommand, readScreen, closeSurface } from "../pi-extension/subagents/tmux.ts";
import { execSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PI = "/home/pplcf/.nvm/versions/node/v24.21.0/bin/pi";
const EXT = "/home/pplcf/src/pi-interactive-subagents/pi-extension/subagents/index.ts";

const prePanes = new Set(execSync("tmux list-panes -a -F '#{pane_id}'").toString().trim().split("\n"));
const s = createSurface("exttest");
await sleep(1000);
const task =
  'Call the subagent tool once with these exact parameters: name "ExtReport", agent "scout", task "Reply with the single word OK". Do nothing else.';
sendLongCommand(s, `cd /home/pplcf/src/pi-interactive-subagents && ${PI} -e ${EXT} --model usergate/Qwen3.8-27B ${JSON.stringify(task)}`);
console.log("PARENT=" + s);

// wait until a second pane appears (child), then capture both
let child = null;
for (let i = 0; i < 90; i++) {
  await sleep(2000);
  const panes = execSync("tmux list-panes -a -F '#{pane_id}'").toString().trim().split("\n");
  child = panes.find((p) => !prePanes.has(p)) ?? null;
  if (child) break;
}
if (!child) {
  console.log("NO CHILD PANE APPEARED");
  console.log(readScreen(s, 40).split("\n").filter((l) => l.trim()).slice(-15).join("\n"));
  process.exit(1);
}
// give child's startup banner a moment to settle
await sleep(8000);
const pscreen = readScreen(s, 100);
const cscreen = readScreen(child, 100);
const show = (label, scr) => {
  const i = scr.indexOf("[Extensions]");
  console.log(`=== ${label} [Extensions] section ===`);
  console.log(i >= 0 ? scr.slice(i, i + 900).replace(/\n{3,}/g, "\n\n") : "(no [Extensions] banner found)");
};
show("PARENT", pscreen);
show("CHILD", cscreen);
console.log("=== child tail ===");
console.log(cscreen.split("\n").filter((l) => l.trim()).slice(-10).join("\n"));
