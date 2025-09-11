# @hazbase/factory

## Overview
`@hazbase/factory` is a **CLI / SDK helper** for deploying smart contracts **via a shared Factory** in the HAZAMA BASE stack. The package is shipped as **ESM** (`"type": "module"`) and exposes the executable **`hazbase-factory`**.

- **name**: `@hazbase/factory`
- **bin**: `hazbase-factory`
- **files**: `dist`, `bin`, `hardhat` (Hardhat starter included)
- **Core deps**: `commander`, `inquirer`, `dotenv`, `ora`, `execa`, `chalk`, `figlet`, `@hazbase/auth`, `@hazbase/relayer`

> Intent: minimize human errors during **initialization and go‑live** in line with the whitepaper’s operational principles (multi‑layer governance, staged recovery, and circuit breakers).

---

## Requirements
- **Node.js**: 18+ (recommended for stable ESM)
- **RPC access**: HTTPS endpoint for the target chain (supports `RPC_URL_<chainId>` resolution)
- **Credentials**: 
  - Default: deployer EOA private key (use test keys in development only)
  - Optional: `--gasless` via relayer with `--accessToken` and `--clientKey`
- **Target networks**: Some environments ship predefined `FACTORY_ADDRESS` values (e.g., Sepolia).

---

## Installation
```bash
# Local install
npm i -D @hazbase/factory

# Or run on demand (recommended)
npx @hazbase/factory --help
```

---

## Environment variables (examples)
The CLI loads `.env` through `dotenv`. RPC is resolved with the order **per‑chain > common**.

```dotenv
# Common RPC (fallback)
RPC_URL=https://rpc.example.org

# Per‑chain (e.g., 137/Polygon, 8453/Base, 11155111/Sepolia)
RPC_URL_137=https://polygon.drpc.org
RPC_URL_8453=https://mainnet.base.org
RPC_URL_11155111=https://1rpc.io/sepolia

# Optional: relayer auth if you use --gasless
HAZBASE_ACCESS_TOKEN=xxxxxx
HAZBASE_CLIENT_KEY=xxxxxx
```

> Resolution: use `RPC_URL_<chainId>` if set; otherwise use `RPC_URL`. If neither is present, a built‑in table may be used; if still missing, the CLI throws an error.

---

## Quick start
```bash
# Example: deploy to a specified chain (missing inputs are asked via prompts)
npx @hazbase/factory deploy --chainId 137
```

---

## Command reference

### 1) `hazbase-factory deploy`
Deploy (and optionally initialize) a contract **via the shared Factory**. The CLI supports artifact selection, `initializer` naming, and `initArgs` encoding in both interactive and non‑interactive modes.

**Key options (selected)**
- `--chainId <number>`: target chain ID (required)
- `--gasless`: execute via relayer
- `--accessToken <token>`: relayer access token
- `--clientKey <key>`: relayer client key
- `--args <json>`: constructor args as a JSON string (default `[]`)
- `--initializer <name>`: initializer function name (e.g., `initialize`)
- `--initArgs <json>`: initializer args as a JSON string (default `[]`)

**Examples**
```bash
# Minimal: specify only the chain (the rest is prompted)
npx @hazbase/factory deploy --chainId 8453

# Non‑interactive: full parameters (CI friendly)
npx @hazbase/factory deploy   --chainId 137   --args '["MyBond","BOND",18]'   --initializer initialize   --initArgs '["0xDeployer...","0xTimelock..."]'
```

**Common errors**
- `RPC URL not set (... expected RPC_URL_<chainId> or RPC_URL)`: check `.env`
- `insufficient funds`: top up your EOA or relayer budget
- `nonce too low`: nonce race; retry or sync nonce
- `No artifact found. Did you compile?`: compile your artifacts first

---

### 2) `hazbase-factory create`
Generate a Hardhat starter. It scaffolds minimal files like `contracts/<Name>.sol` and `scripts/deploy.ts` so you can start quickly.

**Example**
```bash
npx @hazbase/factory create
# → answer prompts for project name and contract name
```

---

### 3) `hazbase-factory set`  ← updated section

Registers an **Implementation** on the Factory by **binding a deployed implementation address** with a **contract type**.  
After this registration, you can **clone‑deploy** by simply specifying the **contract name/type** with `deployViaFactory`.

**CLI example**
```bash
# Register an implementation: bind a BondToken-type implementation address
npx @hazbase/factory set 0xAbCd...1234 --chainId 137 --contractType BondToken
```

**Programmatic example**
```ts
// Programmatic clone deployment via Factory
import { deployViaFactory } from '@hazbase/factory';

await deployViaFactory({
  chainId: 137,
  // NOTE: After `set`, specifying the contract type enables cloning.
  //       Constructor/initializer data is encoded internally when provided.
  gasless: false,
});
```

> Notes:
> - Implementations are **chain‑scoped**. Ensure the address matches the target `--chainId`.
> - Re‑running `set` **overwrites** an existing mapping; follow your change‑management policy.

---

## Programmatic API (TS/Node)

### `deployViaFactory(options)`
Calls the Factory (e.g., `deployContract(...)` / `deployContractByVersion(...)`) and performs a **clone deployment** based on the registered Implementation.

**Sketch signature (excerpt)**
```ts
type DeployFactoryOpts = {
  chainId: number;
  gasless?: boolean;
  accessToken?: string;
  clientKey?: string;
};

// Return: prints the deployed address / tx hash to stdout (implementation may vary)
```

**Usage**
```ts
import { deployViaFactory } from '@hazbase/factory';

/* Deploy a clone via the shared Factory
 * - Resolves RPC from RPC_URL_<chainId> or RPC_URL
 * - Encodes initializer and args if you provide them
 */
await deployViaFactory({
  chainId: 11155111,  // Sepolia
  gasless: false,     // set true if using a relayer with tokens
});
```

---

## Best practices
- **Centralize config**: define `RPC_URL_<chainId>` in `.env`. Reuse the same values in CI.
- **Stage rollouts**: testnet → staging → mainnet, with explicit `--dry-run` where applicable.
- **Transfer roles**: do not leave privileged roles with the deployer; move to Timelock/Governor.
- **Pause/resume runbook**: document circuit‑breaker and recovery procedures.

---

## Troubleshooting (highlights)
- **RPC reachability**: validate URL/headers/reachability/rate‑limits
- **Gas budget**: ensure EOA or relayer funding
- **Artifact mismatch**: ABI/build mismatch or missing compile
- **Chain ID mismatches**: signer RPC, Factory address, and target chain must align

---

## Appendix A: Sample constants (non‑normative)
- **FACTORY_ADDRESS** (example)  
  - `11155111 (Sepolia)`: `0x7d4B0E58A871DBB35C7DFd131ba1eEdD3a767e67`
- **RPC URLs** (examples)  
  - `1`: `https://eth.llamarpc.com`  
  - `137`: `https://polygon.drpc.org`  
  - `11155111`: `https://1rpc.io/sepolia`  
  - `80002`: `https://rpc-amoy.polygon.technology/`  
  - `592`: `https://evm.astar.network`  
  - `1868`: `https://rpc.soneium.org`  
  - `1946`: `https://rpc.minato.soneium.org`  
  - `480`: `https://worldchain-mainnet.g.alchemy.com/public`  
  - `4801`: `https://worldchain-sepolia.g.alchemy.com/public`  
  - `336`: `https://shiden.api.onfinality.io/public`  
  - `42220`: `https://forno.celo.org`  
  - `56`: `https://bsc.publicnode.com`  
  - `97`: `https://bsc-testnet.publicnode.com`  
  - `43114`: `https://api.avax.network/ext/bc/C/rpc`  
  - `43113`: `https://api.avax-test.network/ext/bc/C/rpc`  
  - `1101`: `https://zkevm-rpc.com`  
  - `2442`: `https://etherscan.cardona.zkevm-rpc.com/`  

> The above endpoints are examples. Use your organization’s endpoints, quotas, and headers.

---

## Appendix B: Factory ABI (sketch)
- `event ContractDeployed(address indexed implementationOwner, bytes32 indexed contractType, address indexed proxy, address deployer)`  
- `function setImplementation(bytes32 contractType, address impl)`  
- `function deployContract(address implementationOwner, bytes32 contractType, bytes initData) returns (address)`  
- `function deployContractByVersion(address implementationOwner, bytes32 contractType, uint32 version, bytes initData) returns (address)`  
- `function deployedContracts(address owner) view returns (address[])`  

---

## Tip: `--help`
```bash
npx @hazbase/factory --help
npx @hazbase/factory deploy --help
npx @hazbase/factory create --help
npx @hazbase/factory set --help
```

---

## License
Apache-2.0
