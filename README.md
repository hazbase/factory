# @hazbase/factory
[![npm version](https://badge.fury.io/js/@hazbase%2Ffactory.svg)](https://badge.fury.io/js/@hazbase%2Ffactory)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Overview
`@hazbase/factory` is a CLI / SDK helper for deploying smart contracts via a shared Factory in the hazBase stack. The package is shipped as ESM (`"type": "module"`) and exposes the executable `hazbase-factory`.

- `name`: `@hazbase/factory`
- `bin`: `hazbase-factory`
- `exports`: ESM SDK at `@hazbase/factory`, CLI types at `@hazbase/factory/cli`
- Core dependencies: `commander`, `inquirer`, `dotenv`, `ora`, `execa`, `chalk`, `figlet`, `ethers`

Gasless deployment flags are present for CLI compatibility, but gasless execution is not implemented in this package version. The package does not currently depend on `@hazbase/auth` or `@hazbase/relayer`.

The package is designed to reduce deployment mistakes around implementation registration, initializer wiring, and chain-specific rollout.

## Requirements
- Node.js 18+
- HTTPS RPC endpoint for the target chain
- `PRIVATE_KEY` for write operations, or an explicit ethers `signer` when using the SDK
- A deployed hazBase `ContractFactory` on the target chain

## Installation
```bash
npm i @hazbase/factory
# or
npx @hazbase/factory --help
```

## Environment Variables
The CLI loads `.env` through `dotenv`. RPC resolution order is `RPC_URL_<chainId>`, then `RPC_URL`, then the package fallback table when available.

```dotenv
PRIVATE_KEY=0x...
RPC_URL=https://rpc.example.org
RPC_URL_137=https://polygon.drpc.org
RPC_URL_8453=https://mainnet.base.org
RPC_URL_11155111=https://1rpc.io/sepolia
```

## CLI Usage

Run `npx @hazbase/factory --help` or `npx @hazbase/factory <command> --help` to inspect the current CLI options.

### `hazbase-factory deploy`
Compiles the current Hardhat project, selects an artifact, and deploys that contract directly with `ethers.ContractFactory`. This command does not register the implementation in the shared factory by itself. If `--initializer` is provided, the initializer is sent as a separate transaction after deployment.

```bash
npx @hazbase/factory deploy --chainId 8453

npx @hazbase/factory deploy \
  --chainId 137 \
  --args '["MyBond","BOND",18]'

npx @hazbase/factory deploy \
  --chainId 137 \
  --args '[]' \
  --initializer initialize \
  --initArgs '["0xDeployer...","0xTimelock..."]'
```

### `hazbase-factory set`
Registers a deployed implementation under the caller's `contractType` namespace. Registration is append-only: running `set` again creates the next version.

```bash
npx @hazbase/factory set 0xAbCd...1234 --chainId 137 --contractType BondToken

npx @hazbase/factory set 0xAbCd...1234 \
  --chainId 137 \
  --contractType BondToken \
  --initSignature 'initialize(address,address[])'
```

When `--initSignature` is provided, the CLI calls `setImplementationWithPolicy(contractTypeHash, impl, true, true, initSelector)`. This pins the initializer selector for clone deployments.

`--initSignature` accepts either `initialize(address,address[])` or `function initialize(address,address[])`.

The signer must be allowed to register implementations by the deployed Factory. In the standard Factory contract, this means `ADMIN_ROLE` or `DEPLOYER_ROLE`.

### `hazbase-factory deployViaFactory`
Clone-deploys the latest registered implementation for an implementation owner and contract type. `implementationOwner` is the namespace owner that registered the implementation with `setImplementation`.

```bash
npx @hazbase/factory deployViaFactory \
  0xImplementationOwner... \
  BondToken \
  'initialize(address,address[])' \
  '["0xAdmin...",["0xOperator..."]]' \
  --chainId 137
```

### `hazbase-factory deployViaFactoryByVersion`
Clone-deploys a specific 1-based implementation version.

```bash
npx @hazbase/factory deployViaFactoryByVersion \
  0xImplementationOwner... \
  BondToken \
  1 \
  'initialize(address,address[])' \
  '["0xAdmin...",["0xOperator..."]]' \
  --chainId 137
```

### `hazbase-factory create`
Generates a Hardhat starter project.

```bash
npx @hazbase/factory create
```

## SDK Usage

```ts
import { ethers } from 'ethers';
import {
  deployContract,
  deployViaFactory,
  encodeInitData,
  getDeployedContract,
  getImplementationPolicy,
  setImplementation,
} from '@hazbase/factory';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_11155111);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const registered = await setImplementation({
  chainId: 11155111,
  signer,
  implementation: '0xImplementation...',
  contractType: 'BondToken',
  initSignature: 'initialize(address,address[])',
});

const deployed = await deployViaFactory({
  chainId: 11155111,
  signer,
  implementationOwner: await signer.getAddress(),
  contractType: 'BondToken',
  fnSignature: 'initialize(address,address[])',
  fnArgs: ['0xAdmin...', ['0xOperator...']],
});

const policy = await getImplementationPolicy({
  chainId: 11155111,
  provider,
  owner: await signer.getAddress(),
  contractType: 'BondToken',
  version: registered.version,
});

const initData = encodeInitData('initialize(address,address[])', [
  '0xAdmin...',
  ['0xOperator...'],
]);

const firstDeployment = await getDeployedContract({
  chainId: 11155111,
  provider,
  owner: await signer.getAddress(),
  index: 0,
});
```

### Connection options

SDK write helpers accept a `signer`, `privateKey`, or `PRIVATE_KEY` environment variable. Read helpers can use either `provider` or `rpcUrl`. Pass `factoryAddress` when using a Factory deployment that is not included in the package defaults.

### SDK API
- `deployContract({ abi, bytecode, args?, signer? | privateKey?, chainId?, rpcUrl? })` -> `{ address, txHash, receipt }`
- `setImplementation({ implementation, contractType, initSignature?, ...connection })` -> `{ factoryAddress, implementation, contractTypeHash, version, initSelector?, policy?, txHash, receipt }`
- `deployViaFactory({ implementationOwner, contractType, fnSignature, fnArgs?, ...connection })` -> `{ proxy, predictedProxy?, initData, txHash, receipt }`
- `deployViaFactoryByVersion({ version, implementationOwner, contractType, fnSignature, fnArgs?, ...connection })` -> `{ proxy, predictedProxy?, initData, txHash, receipt }`
- `getLatestImplementation({ owner, contractType, ...connection })` -> `address`
- `getImplementationByVersion({ owner, contractType, version, ...connection })` -> `{ implementation, timestamp }`
- `getImplementationPolicy({ owner, contractType, version, ...connection })` -> `{ isSet, cloneable, initRequired, initSelector }`
- `getDeployedContract({ owner, index, ...connection })` -> `address`
- Helpers: `getContractTypeHash`, `getInitSelector`, `encodeInitData`, `resolveRpcUrl`, `resolveFactoryAddress`, `getFactoryContract`, `createProvider`, `createSigner`

`fnSignature` accepts either `initialize(address,address[])` or `function initialize(address,address[])`.

## Behavior Notes
- `contractType` is hashed with `keccak256(toUtf8Bytes(contractType))` before it is sent on-chain.
- `setImplementation(...)` registers an implementation without initializer policy metadata.
- `setImplementationWithPolicy(...)` stores cloneability and initializer checks for the new version.
- `deployContract(...)` and `deployContractByVersion(...)` revert if no implementation is registered, the version is invalid, policy validation fails, or initializer execution fails.
- `deployedContracts(address owner, uint256 index)` returns one deployment at the requested index; it does not return the full list.

## Gasless Status
The CLI currently accepts `--gasless`, `--accessToken`, and `--clientKey` on selected commands, but all gasless paths exit with an unsupported message. Treat gasless as a future integration point, not a production feature of this package version.

## Troubleshooting
- `RPC URL not set`: configure `RPC_URL_<chainId>` or `RPC_URL`, or pass `rpcUrl` in SDK usage.
- `Factory not deployed on chainId`: pass `factoryAddress` explicitly or add the address to package constants.
- `signer or PRIVATE_KEY is required`: provide an ethers signer, `privateKey`, or `PRIVATE_KEY`.
- `Invalid fnSignature`: pass an ABI-style function signature such as `initialize(address,address[])`.
- `Init failed`: initializer calldata reached the clone but reverted.

## Appendix: Factory ABI Sketch
- `event ImplementationVersionAdded(address indexed owner, bytes32 indexed contractType, uint32 indexed version, address implementation)`
- `event ImplementationPolicySet(address indexed owner, bytes32 indexed contractType, uint32 indexed version, bool cloneable, bool initRequired, bytes4 initSelector)`
- `event ContractDeployed(address indexed implementationOwner, bytes32 indexed contractType, address indexed proxy, address deployer)`
- `function setImplementation(bytes32 contractType, address impl)`
- `function setImplementationWithPolicy(bytes32 contractType, address impl, bool cloneable, bool initRequired, bytes4 initSelector)`
- `function getLatestImplementation(address owner, bytes32 contractType) view returns (address)`
- `function getImplementationByVersion(address owner, bytes32 contractType, uint32 version) view returns (address impl, uint256 timestamp)`
- `function getImplementationPolicy(address owner, bytes32 contractType, uint32 version) view returns ((bool isSet, bool cloneable, bool initRequired, bytes4 initSelector))`
- `function deployContract(address implementationOwner, bytes32 contractType, bytes initData) returns (address)`
- `function deployContractByVersion(address implementationOwner, bytes32 contractType, uint32 version, bytes initData) returns (address)`
- `function deployedContracts(address owner, uint256 index) view returns (address)`

## License
Apache-2.0
