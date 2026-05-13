// Compile contracts/MineToken.sol with solc-js and emit the
// ABI + bytecode to src/lib/contracts/MineToken.json so that
// both the deploy script and the runtime app can import it
// without re-running solc.
//
// Usage:
//   node scripts/compile-contracts.mjs
//
// No CLI args. Output is deterministic; commit src/lib/contracts/MineToken.json
// alongside the .sol so contributors don't need solc installed to use the app.

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const solc = require("solc");

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contractsDir = join(repoRoot, "contracts");
const ozRoot = join(repoRoot, "node_modules", "@openzeppelin", "contracts");
const outDir = join(repoRoot, "src", "lib", "contracts");
const outPath = join(outDir, "MineToken.json");
const sourceFile = "MineToken.sol";

function readContract(path) {
  return readFileSync(path, "utf8");
}

function findImport(importPath) {
  // OpenZeppelin imports look like "@openzeppelin/contracts/token/ERC20/ERC20.sol".
  if (importPath.startsWith("@openzeppelin/contracts/")) {
    const rel = importPath.replace("@openzeppelin/contracts/", "");
    const full = join(ozRoot, rel);
    if (!existsSync(full)) {
      return { error: `Could not resolve ${importPath} at ${full}` };
    }
    return { contents: readContract(full) };
  }
  // Local imports relative to contracts/.
  const local = join(contractsDir, importPath);
  if (existsSync(local)) {
    return { contents: readContract(local) };
  }
  return { error: `Unknown import: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: {
    [sourceFile]: { content: readContract(join(contractsDir, sourceFile)) },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"],
      },
    },
  },
};

console.log(`→ Compiling ${sourceFile} with solc ${solc.version()}`);
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage ?? e.message);
  process.exit(1);
}
for (const w of output.errors ?? []) {
  console.warn(w.formattedMessage ?? w.message);
}

const contract = output.contracts?.[sourceFile]?.MineToken;
if (!contract) {
  console.error("Compiled output missing contracts[MineToken.sol].MineToken");
  process.exit(1);
}

const artifact = {
  contractName: "MineToken",
  sourceName: `contracts/${sourceFile}`,
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
  deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
  compiler: { name: "solc", version: solc.version() },
  settings: { optimizer: input.settings.optimizer, evmVersion: input.settings.evmVersion },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
console.log(`✓ wrote ${outPath} (${artifact.bytecode.length / 2 - 1} bytes runtime)`);
