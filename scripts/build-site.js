import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "build"], { stdio: "inherit" });

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
