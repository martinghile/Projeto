const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBinary = require("electron");
const projectRoot = path.join(__dirname, "..");

const child = spawn(electronBinary, ["."], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_START_URL: process.env.ELECTRON_START_URL || "http://localhost:5173",
    ELECTRON_RUN_AS_NODE: undefined,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
