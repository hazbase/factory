import inquirer from 'inquirer';
import { ethers } from 'ethers';
import ora from 'ora';

import { FactoryABI } from '../constants';
import {
  deployViaFactory as deployViaFactoryOnChain,
  deployViaFactoryByVersion as deployViaFactoryByVersionOnChain,
  encodeInitData,
  getContractTypeHash,
  resolveFactoryAddress,
  resolveRpcUrl,
} from '../index';

interface DeployFactoryOpts {
  chainId: number;
  gasless?: boolean;
  accessToken?: string;
  clientKey?: string;
}

/**
 * Calls Factory.deployContract(address,bytes32,bytes) with encoded initializer data.
 */
export async function deployViaFactory(
  implementationOwner: string,
  contractType: string,
  fnSignature: string,
  fnArgsJson: string,
  opts: DeployFactoryOpts,
) {
  if (opts.gasless) {
    console.log('⚠️  Gas-less deployViaFactory is not yet supported in this version.');
    console.log('    The --gasless flag will be enabled in a future release.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(resolveRpcUrl(opts.chainId));
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY env missing');
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const normalizedOwner = ethers.getAddress(implementationOwner);
  const fnArgs = parseJsonArray(fnArgsJson, 'fnArgs');
  const initData = encodeInitData(fnSignature, fnArgs);
  const factoryAddr = resolveFactoryAddress(opts.chainId);
  const factoryCtr = new ethers.Contract(factoryAddr, FactoryABI, signer);
  const contractTypeHash = getContractTypeHash(contractType);

  console.log('🚀  deploying via Factory on-chain ...');

  const data = factoryCtr.interface.encodeFunctionData('deployContract', [
    normalizedOwner,
    contractTypeHash,
    initData,
  ]);
  await printEstimate(provider, {
    to: factoryAddr,
    data,
    from: await signer.getAddress(),
  });

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Continue with deployViaFactory?',
      default: true,
    },
  ]);
  if (!proceed) {
    console.log('❌  Aborted by user.');
    process.exit(0);
  }

  const spinner = ora('Sending deployContract tx...').start();
  const result = await deployViaFactoryOnChain({
    chainId: opts.chainId,
    signer,
    implementationOwner: normalizedOwner,
    contractType,
    fnSignature,
    fnArgs,
  });
  spinner.text = 'Waiting for transaction confirmation…';
  spinner.succeed(`✅ Proxy deployed at ${result.proxy}`);
  if (result.predictedProxy) console.log('   predicted:', result.predictedProxy);
  console.log('   txHash:', result.txHash);
  return result;
}

/**
 * Clone a specific implementation version and initialize it.
 */
export async function deployViaFactoryByVersion(
  implementationOwner: string,
  contractType: string,
  version: number,
  fnSignature: string,
  fnArgsJson: string,
  opts: DeployFactoryOpts,
) {
  if (opts.gasless) {
    console.log('⚠️  Gas-less deployViaFactoryByVersion is not yet supported in this version.');
    console.log('    The --gasless flag will be enabled in a future release.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(resolveRpcUrl(opts.chainId));
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY env missing');
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const normalizedOwner = ethers.getAddress(implementationOwner);
  const fnArgs = parseJsonArray(fnArgsJson, 'fnArgs');
  const initData = encodeInitData(fnSignature, fnArgs);
  const factoryAddr = resolveFactoryAddress(opts.chainId);
  const factoryCtr = new ethers.Contract(factoryAddr, FactoryABI, signer);
  const contractTypeHash = getContractTypeHash(contractType);

  console.log(`🚀  deploying via Factory (v${version}) ...`);
  const data = factoryCtr.interface.encodeFunctionData('deployContractByVersion', [
    normalizedOwner,
    contractTypeHash,
    version,
    initData,
  ]);
  await printEstimate(provider, {
    to: factoryAddr,
    data,
    from: await signer.getAddress(),
  });

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Continue with deployViaFactoryByVersion?',
      default: true,
    },
  ]);
  if (!proceed) {
    console.log('❌  Aborted by user.');
    process.exit(0);
  }

  const spinner = ora('Sending deployContractByVersion tx...').start();
  const result = await deployViaFactoryByVersionOnChain({
    chainId: opts.chainId,
    signer,
    implementationOwner: normalizedOwner,
    contractType,
    version,
    fnSignature,
    fnArgs,
  });
  spinner.text = 'Waiting for transaction confirmation…';
  spinner.succeed(`✅ Proxy (v${version}) deployed at ${result.proxy}`);
  if (result.predictedProxy) console.log('   predicted:', result.predictedProxy);
  console.log('   txHash:', result.txHash);
  return result;
}

function parseJsonArray(raw: string, label: string): readonly unknown[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed;
}

async function printEstimate(
  provider: ethers.JsonRpcProvider,
  tx: { to: string; data: string; from: string },
): Promise<void> {
  const estimatedGas = await provider.estimateGas(tx);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice!;
  const costWei = estimatedGas * gasPrice;

  console.log(
    `🧮  Estimated gas: ${estimatedGas.toString()} @ ${ethers.formatUnits(gasPrice, 'gwei')} gwei`,
  );
  console.log(`💸  ≈ ${Number(ethers.formatEther(costWei)).toFixed(6)} ETH`);
}
