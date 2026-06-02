import { ethers } from 'ethers';
import type { BigNumberish, BytesLike, InterfaceAbi, Provider, Signer, TransactionReceipt } from 'ethers';

import { FACTORY_ADDRESS, FactoryABI, RPC_URLs } from './constants';

export { FACTORY_ADDRESS, FactoryABI, RPC_URLs } from './constants';

export type Address = string;
export type Bytes32 = string;

export interface FactoryConnectionOptions {
  chainId?: number;
  factoryAddress?: Address;
  rpcUrl?: string;
  signer?: Signer;
  provider?: Provider;
  privateKey?: string;
}

export interface DeployContractOptions extends FactoryConnectionOptions {
  abi: InterfaceAbi;
  bytecode: BytesLike;
  args?: readonly unknown[];
}

export interface DeployContractResult {
  address: Address;
  txHash: string;
  receipt: TransactionReceipt;
}

export interface SetImplementationOptions extends FactoryConnectionOptions {
  implementation: Address;
  contractType: string;
  initSignature?: string;
}

export interface SetImplementationResult {
  factoryAddress: Address;
  implementation: Address;
  contractType: string;
  contractTypeHash: Bytes32;
  version: number;
  initSelector?: string;
  policy?: {
    cloneable: boolean;
    initRequired: boolean;
    initSelector: string;
  };
  txHash: string;
  receipt: TransactionReceipt;
}

export interface DeployViaFactoryOptions extends FactoryConnectionOptions {
  implementationOwner: Address;
  contractType: string;
  fnSignature: string;
  fnArgs?: readonly unknown[];
}

export interface DeployViaFactoryByVersionOptions extends DeployViaFactoryOptions {
  version: BigNumberish;
}

export interface DeployViaFactoryResult {
  factoryAddress: Address;
  implementationOwner: Address;
  contractType: string;
  contractTypeHash: Bytes32;
  initData: string;
  proxy: Address;
  predictedProxy?: Address;
  txHash: string;
  receipt: TransactionReceipt;
}

export interface ImplementationPolicy {
  isSet: boolean;
  cloneable: boolean;
  initRequired: boolean;
  initSelector: string;
}

export interface GetImplementationPolicyOptions extends FactoryConnectionOptions {
  owner: Address;
  contractType: string;
  version: BigNumberish;
}

export interface GetLatestImplementationOptions extends FactoryConnectionOptions {
  owner: Address;
  contractType: string;
}

export interface GetImplementationByVersionOptions extends GetLatestImplementationOptions {
  version: BigNumberish;
}

export interface ImplementationVersion {
  implementation: Address;
  timestamp: bigint;
}

export interface GetDeployedContractOptions extends FactoryConnectionOptions {
  owner: Address;
  index: BigNumberish;
}

export function getContractTypeHash(contractType: string): Bytes32 {
  return ethers.keccak256(ethers.toUtf8Bytes(contractType)) as Bytes32;
}

export function getInitSelector(initSignature: string): string {
  const normalizedSignature = normalizeFunctionSignature(initSignature);
  const iface = new ethers.Interface([normalizedSignature]);
  const fragment = iface.getFunction(getFunctionName(normalizedSignature));
  if (!fragment) throw new Error(`Invalid initSignature: ${initSignature}`);
  return fragment.selector;
}

export function encodeInitData(fnSignature: string, fnArgs: readonly unknown[] = []): string {
  const normalizedSignature = normalizeFunctionSignature(fnSignature);
  const iface = new ethers.Interface([normalizedSignature]);
  const fnName = getFunctionName(normalizedSignature);
  return iface.encodeFunctionData(fnName, [...fnArgs]);
}

export function resolveRpcUrl(chainId?: number, rpcUrl?: string): string {
  if (rpcUrl) return rpcUrl;
  if (chainId === undefined) throw new Error('chainId or rpcUrl is required');

  const envKey = `RPC_URL_${chainId}`;
  const fromEnv = process.env[envKey] ?? process.env.RPC_URL;
  if (fromEnv) return fromEnv;

  const fallback = RPC_URLs[chainId];
  if (!fallback) throw new Error(`RPC URL not set (expected ${envKey} or RPC_URL)`);
  return fallback;
}

export function resolveFactoryAddress(chainId?: number, factoryAddress?: Address): Address {
  if (factoryAddress) return ethers.getAddress(factoryAddress) as Address;
  if (chainId === undefined) throw new Error('chainId or factoryAddress is required');

  const resolved = FACTORY_ADDRESS[chainId];
  if (!resolved) throw new Error(`Factory not deployed on chainId ${chainId}`);
  return ethers.getAddress(resolved) as Address;
}

export function getFactoryContract(options: FactoryConnectionOptions): ethers.Contract {
  const runner = options.signer ?? options.provider ?? createProvider(options);
  return new ethers.Contract(resolveFactoryAddress(options.chainId, options.factoryAddress), FactoryABI, runner);
}

export async function createSigner(options: FactoryConnectionOptions): Promise<Signer> {
  if (options.signer) return options.signer;

  const privateKey = options.privateKey ?? process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('signer or PRIVATE_KEY is required');
  return new ethers.Wallet(privateKey, createProvider(options));
}

export function createProvider(options: FactoryConnectionOptions): Provider {
  if (options.provider) return options.provider;
  return new ethers.JsonRpcProvider(resolveRpcUrl(options.chainId, options.rpcUrl));
}

export async function deployContract(options: DeployContractOptions): Promise<DeployContractResult> {
  const signer = await createSigner(options);
  const factory = new ethers.ContractFactory(options.abi, options.bytecode, signer);
  const contract = await factory.deploy(...(options.args ?? []));
  await contract.waitForDeployment();
  const receipt = await waitForReceipt(contract.deploymentTransaction());
  return {
    address: ethers.getAddress(await contract.getAddress()) as Address,
    txHash: receipt.hash,
    receipt,
  };
}

export async function setImplementation(options: SetImplementationOptions): Promise<SetImplementationResult> {
  const signer = await createSigner(options);
  const factoryAddress = resolveFactoryAddress(options.chainId, options.factoryAddress);
  const factory = new ethers.Contract(factoryAddress, FactoryABI, signer);
  const contractTypeHash = getContractTypeHash(options.contractType);
  const implementation = ethers.getAddress(options.implementation) as Address;
  const initSelector = options.initSignature ? getInitSelector(options.initSignature) : undefined;
  const method = initSelector ? 'setImplementationWithPolicy' : 'setImplementation';
  const args = initSelector
    ? [contractTypeHash, implementation, true, true, initSelector]
    : [contractTypeHash, implementation];

  const tx = await factory[method](...args);
  const receipt = await waitForReceipt(tx);
  const event = parseImplementationVersionAdded(factory, receipt);
  if (!event) throw new Error('ImplementationVersionAdded event not found');

  return {
    factoryAddress,
    implementation,
    contractType: options.contractType,
    contractTypeHash,
    version: event.version,
    initSelector,
    policy: initSelector
      ? { cloneable: true, initRequired: true, initSelector }
      : undefined,
    txHash: tx.hash,
    receipt,
  };
}

export async function deployViaFactory(options: DeployViaFactoryOptions): Promise<DeployViaFactoryResult> {
  const signer = await createSigner(options);
  const factoryAddress = resolveFactoryAddress(options.chainId, options.factoryAddress);
  const factory = new ethers.Contract(factoryAddress, FactoryABI, signer);
  const implementationOwner = ethers.getAddress(options.implementationOwner) as Address;
  const contractTypeHash = getContractTypeHash(options.contractType);
  const initData = encodeInitData(options.fnSignature, options.fnArgs ?? []);
  const predictedProxy = await maybeStaticDeploy(factory, 'deployContract', [implementationOwner, contractTypeHash, initData]);

  const tx = await factory.deployContract(implementationOwner, contractTypeHash, initData);
  const receipt = await waitForReceipt(tx);
  const proxy = parseContractDeployed(factory, receipt)?.proxy ?? predictedProxy;
  if (!proxy) throw new Error('ContractDeployed event not found');

  return {
    factoryAddress,
    implementationOwner,
    contractType: options.contractType,
    contractTypeHash,
    initData,
    proxy,
    predictedProxy,
    txHash: tx.hash,
    receipt,
  };
}

export async function deployViaFactoryByVersion(
  options: DeployViaFactoryByVersionOptions,
): Promise<DeployViaFactoryResult> {
  const signer = await createSigner(options);
  const factoryAddress = resolveFactoryAddress(options.chainId, options.factoryAddress);
  const factory = new ethers.Contract(factoryAddress, FactoryABI, signer);
  const implementationOwner = ethers.getAddress(options.implementationOwner) as Address;
  const contractTypeHash = getContractTypeHash(options.contractType);
  const initData = encodeInitData(options.fnSignature, options.fnArgs ?? []);
  const version = ethers.toBigInt(options.version);
  const predictedProxy = await maybeStaticDeploy(factory, 'deployContractByVersion', [
    implementationOwner,
    contractTypeHash,
    version,
    initData,
  ]);

  const tx = await factory.deployContractByVersion(implementationOwner, contractTypeHash, version, initData);
  const receipt = await waitForReceipt(tx);
  const proxy = parseContractDeployed(factory, receipt)?.proxy ?? predictedProxy;
  if (!proxy) throw new Error('ContractDeployed event not found');

  return {
    factoryAddress,
    implementationOwner,
    contractType: options.contractType,
    contractTypeHash,
    initData,
    proxy,
    predictedProxy,
    txHash: tx.hash,
    receipt,
  };
}

export async function getLatestImplementation(options: GetLatestImplementationOptions): Promise<Address> {
  const factory = getFactoryContract(options);
  return ethers.getAddress(
    await factory.getLatestImplementation(
      ethers.getAddress(options.owner),
      getContractTypeHash(options.contractType),
    ),
  ) as Address;
}

export async function getImplementationByVersion(
  options: GetImplementationByVersionOptions,
): Promise<ImplementationVersion> {
  const factory = getFactoryContract(options);
  const version = await factory.getImplementationByVersion(
    ethers.getAddress(options.owner),
    getContractTypeHash(options.contractType),
    ethers.toBigInt(options.version),
  );

  return {
    implementation: ethers.getAddress(version.impl ?? version.implementation ?? version[0]) as Address,
    timestamp: BigInt(version.timestamp ?? version[1]),
  };
}

export async function getImplementationPolicy(
  options: GetImplementationPolicyOptions,
): Promise<ImplementationPolicy> {
  const factory = getFactoryContract(options);
  const rawPolicy = await factory.getImplementationPolicy(
    ethers.getAddress(options.owner),
    getContractTypeHash(options.contractType),
    ethers.toBigInt(options.version),
  );
  const policy = isTupleResult(rawPolicy[0]) ? rawPolicy[0] : rawPolicy;
  return {
    isSet: Boolean(policy.isSet ?? policy[0]),
    cloneable: Boolean(policy.cloneable ?? policy[1]),
    initRequired: Boolean(policy.initRequired ?? policy[2]),
    initSelector: String(policy.initSelector ?? policy[3]),
  };
}

export async function getDeployedContract(options: GetDeployedContractOptions): Promise<Address> {
  const factory = getFactoryContract(options);
  return ethers.getAddress(
    await factory.deployedContracts(
      ethers.getAddress(options.owner),
      ethers.toBigInt(options.index),
    ),
  ) as Address;
}

async function maybeStaticDeploy(
  factory: ethers.Contract,
  method: 'deployContract' | 'deployContractByVersion',
  args: readonly unknown[],
): Promise<Address | undefined> {
  try {
    return ethers.getAddress(await factory[method].staticCall(...args)) as Address;
  } catch {
    return undefined;
  }
}

function parseContractDeployed(factory: ethers.Contract, receipt: TransactionReceipt): { proxy: Address } | undefined {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === 'ContractDeployed') {
        return { proxy: ethers.getAddress(parsed.args.proxy ?? parsed.args[2]) as Address };
      }
    } catch {}
  }
  return undefined;
}

function parseImplementationVersionAdded(
  factory: ethers.Contract,
  receipt: TransactionReceipt,
): { version: number } | undefined {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === 'ImplementationVersionAdded') {
        return { version: Number(parsed.args.version ?? parsed.args[2]) };
      }
    } catch {}
  }
  return undefined;
}

function normalizeFunctionSignature(fnSignature: string): string {
  const trimmed = fnSignature.trim();
  return trimmed.startsWith('function ') ? trimmed : `function ${trimmed}`;
}

function getFunctionName(fnSignature: string): string {
  const match = fnSignature.match(/^(?:function\s+)?(\w+)\s*\(/);
  if (!match) throw new Error(`Invalid fnSignature: ${fnSignature}`);
  return match[1];
}

function isTupleResult(value: unknown): value is { [key: string]: unknown; [index: number]: unknown } {
  return typeof value === 'object' && value !== null;
}

async function waitForReceipt(tx: { wait(): Promise<TransactionReceipt | null> } | null): Promise<TransactionReceipt> {
  if (!tx) throw new Error('transaction not available');
  const receipt = await tx.wait();
  if (!receipt) throw new Error('transaction was not mined');
  return receipt;
}
