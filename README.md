# @hazbase/factory
[![npm version](https://badge.fury.io/js/@hazbase%2Ffactory.svg)](https://badge.fury.io/js/@hazbase%2Ffactory)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Overview
`@hazbase/factory` is a CLI / SDK helper for deploying smart contracts via a shared Factory in the hazBase stack. The package is shipped as ESM (`"type": "module"`) and exposes the executable `hazbase-factory`.

- `name`: `@hazbase/factory`
- `bin`: `hazbase-factory`
- `files`: `dist`, `bin`, `hardhat`
- Core dependencies: `commander`, `inquirer`, `dotenv`, `ora`, `execa`, `chalk`, `figlet`, `@hazbase/auth`, `@hazbase/relayer`

The package is designed to reduce deployment mistakes around implementation registration, initializer wiring, and chain-specific rollout.

---

## Requirements
- Node.js 18+
- HTTPS RPC endpoint for the target chain
- Deployer private key, or relayer credentials when using `--gasless`
- A deployed shared `ContractFactory` on the target chain

---

## Installation
```bash
npm i -D @hazbase/factory
# or
npx @hazbase/factory --help
```

---

## Environment variables
The CLI loads `.env` through `dotenv`. RPC resolution order is `RPC_URL_<chainId>` first, then `RPC_URL`.

```dotenv
RPC_URL=https://rpc.example.org
RPC_URL_137=https://polygon.drpc.org
RPC_URL_8453=https://mainnet.base.org
RPC_URL_11155111=https://1rpc.io/sepolia

HAZBASE_ACCESS_TOKEN=xxxxxx
HAZBASE_CLIENT_KEY=xxxxxx
```

---

## Quick start
```bash
npx @hazbase/factory deploy --chainId 137
```

---

## Command reference

### 1) `hazbase-factory deploy`
Deploys a contract through the shared `ContractFactory`. The CLI supports artifact selection, initializer naming, and initializer argument encoding in both interactive and non-interactive flows.

Key options:
- `--chainId <number>`
- `--gasless`
- `--accessToken <token>`
- `--clientKey <key>`
- `--args <json>`
- `--initializer <name>`
- `--initArgs <json>`

Examples:
```bash
npx @hazbase/factory deploy --chainId 8453

npx @hazbase/factory deploy \
  --chainId 137 \
  --args '["MyBond","BOND",18]' \
  --initializer initialize \
  --initArgs '["0xDeployer...","0xTimelock..."]'
```

Common errors:
- `RPC URL not set (... expected RPC_URL_<chainId> or RPC_URL)`
- `insufficient funds`
- `nonce too low`
- `No artifact found. Did you compile?`

### 2) `hazbase-factory create`
Generates a Hardhat starter with a minimal contract and deploy script.

```bash
npx @hazbase/factory create
```

### 3) `hazbase-factory set`
Registers a deployed implementation under a `contractType` in the shared factory.

Each registration is chain-scoped and append-only. Re-running `set` creates a new version for the same `contractType`; it does not overwrite the previous version.

CLI examples:
```bash
# Register an implementation with the legacy registration path
npx @hazbase/factory set 0xAbCd...1234 --chainId 137 --contractType BondToken

# Register an implementation with policy metadata for clone-safe initialization
npx @hazbase/factory set 0xAbCd...1234 \
  --chainId 137 \
  --contractType BondToken \
  --initSignature 'initialize(address,address[])'
```

When `--initSignature` is provided, the CLI stores deployment policy metadata alongside the implementation version. This allows the factory to reject clone deployments that omit required initializer calldata or use the wrong initializer selector.

Operational notes:
- Make sure the implementation address belongs to the same target chain as `--chainId`.
- Use `--initSignature` for implementations that must always be initialized after cloning.
- Leave `--initSignature` unset only when the implementation intentionally uses the legacy, policy-free registration path.

---

## Programmatic usage

### `deployViaFactory(options)`
Calls the shared factory deploy path and clone-deploys a registered implementation.

```ts
import { deployViaFactory } from '@hazbase/factory';

await deployViaFactory({
  chainId: 11155111,
  gasless: false,
});
```

The factory deploy flow follows the policy registered for the selected implementation version. If a version was registered with initializer metadata, deployments must provide matching initializer calldata.

---

## Deployment policy notes
- `setImplementation(...)`: legacy registration path, no explicit deployment policy metadata
- `setImplementationWithPolicy(...)`: registration path with cloneability and initializer policy metadata
- `getImplementationPolicy(...)`: reads the stored deployment policy for a specific version

Use policy-aware registration when:
- the implementation must be initialized immediately after cloning
- the initializer selector should be pinned for operational safety
- different versions of the same contract type have different initialization requirements

---

## Best practices
- Centralize `RPC_URL_<chainId>` values in `.env`
- Roll out via testnet, then staging, then production
- Transfer privileged roles away from the deployer after initialization
- Keep a runbook for pause, recovery, and version cutover operations

---

## Troubleshooting
- Validate RPC reachability and rate limits
- Check gas budget for EOA or relayer
- Confirm artifacts are compiled and match the deployed implementation
- Confirm signer chain ID, factory address, and target chain alignment

---

## Appendix A: Sample constants
- `FACTORY_ADDRESS` example
  - `11155111 (Sepolia)`: `0x7d4B0E58A871DBB35C7DFd131ba1eEdD3a767e67`

---

## Appendix B: Factory ABI (sketch)
- `event ImplementationVersionAdded(address indexed owner, bytes32 indexed contractType, uint32 indexed version, address implementation)`
- `event ImplementationPolicySet(address indexed owner, bytes32 indexed contractType, uint32 indexed version, bool cloneable, bool initRequired, bytes4 initSelector)`
- `event ContractDeployed(address indexed implementationOwner, bytes32 indexed contractType, address indexed proxy, address deployer)`
- `function setImplementation(bytes32 contractType, address impl)`
- `function setImplementationWithPolicy(bytes32 contractType, address impl, bool cloneable, bool initRequired, bytes4 initSelector)`
- `function getImplementationPolicy(address owner, bytes32 contractType, uint32 version) view returns ((bool isSet, bool cloneable, bool initRequired, bytes4 initSelector))`
- `function deployContract(address implementationOwner, bytes32 contractType, bytes initData) returns (address)`
- `function deployContractByVersion(address implementationOwner, bytes32 contractType, uint32 version, bytes initData) returns (address)`
- `function deployedContracts(address owner, uint256 index) view returns (address)`

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
