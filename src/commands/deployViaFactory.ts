import inquirer from 'inquirer';
import { ethers } from 'ethers';
import { FACTORY_ADDRESS, FactoryABI } from '../constants';
import ora from 'ora';

interface DeployFactoryOpts {
  chainId: number;
  gasless?: boolean;
  accessToken?: string;
  clientKey?: string;
}

/**
 * Calls Factory.deployToken(bytes32 contractType, bytes initData)
 */
export async function deployViaFactory(
  implementationOwner: string,
  contractType: string,
  fnSignature: string,
  fnArgsJson: string,
  opts: DeployFactoryOpts
) {
  // 1) RPC & Signer
  const rpc = resolveRpc(opts.chainId);
  const provider = new ethers.JsonRpcProvider(rpc);
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY env missing');
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // 2) Build the initialize-data
  //   fnSignature: 'function initialize(string name,string sym,uint256 supply)'
  //   fnArgsJson:   '["MyToken","TTK",1000]'
  const iface = new ethers.Interface([fnSignature]);
  // extract method name from signature
  const fnNameMatch = fnSignature.match(/function\s+(\w+)\s*\(/);
  if (!fnNameMatch) throw new Error(`Invalid fnSignature: ${fnSignature}`);
  const fnName = fnNameMatch[1];
  const fnArgs = JSON.parse(fnArgsJson);
  const initData = iface.encodeFunctionData(fnName, fnArgs);

  // 3) Factory instance
  const factoryAddr = FACTORY_ADDRESS[opts.chainId];
  if (!factoryAddr) throw new Error(`No Factory on chain ${opts.chainId}`);
  const factoryCtr = new ethers.Contract(factoryAddr, FactoryABI, signer);

  // 4) contractType → bytes32
  const contractTypeHash = ethers.keccak256(ethers.toUtf8Bytes(contractType));

  // 5) on-chain path (gasless TBD)
  if (!opts.gasless) {
    console.log('🚀  deploying via Factory on-chain …');

    // unsigned tx
    const data = factoryCtr.interface.encodeFunctionData('deployContract', [implementationOwner, contractTypeHash, initData]);
    const unsignedTx = { to: factoryAddr, data, from: await signer.getAddress() };

    // estimate gas
    const estimatedGas = await provider.estimateGas(unsignedTx);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice!;
    const costWei = estimatedGas * gasPrice;
    const costEth = Number(ethers.formatEther(costWei));

    console.log(
      `🧮  Estimated gas: ${estimatedGas.toString()} @ ${ethers.formatUnits(
        gasPrice,
        'gwei'
      )} gwei`
    );
    console.log(`💸  ≈ ${costEth.toFixed(6)} ETH`);

    // confirm
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue with deployViaFactory?',
        default: true
      }
    ]);
    if (!proceed) {
      console.log('❌  Aborted by user.');
      process.exit(0);
    }

    // execute
    const spinner = ora('Sending deployContract tx…').start();
    const tx = await factoryCtr.deployContract(implementationOwner, contractTypeHash, initData);
    spinner.text = 'Waiting for transaction confirmation…';
    const receipt = await tx.wait();
    
    let proxy: string | undefined;
    if (receipt.logs) {
        for (const log of receipt.logs) {
            try {
                const parsed = factoryCtr.interface.parseLog(log);
                if (parsed?.name === 'ContractDeployed') {
                proxy = parsed.args[2] as string;
                break;
                }
            } catch {}
        }
    }
    if (!proxy) {
        try {
            const owner = await signer.getAddress();
            const all = await factoryCtr.deployedContracts(owner);
            if (all.length === 0) {
                console.warn('⚠️ deployedTokens mapping is empty for', owner);
            } else {
                proxy = all[all.length - 1];
            }
        } catch(e) {
            console.log('deployedContracts error', e)
        }
    }

    spinner.succeed(`✅ Proxy deployed at ${proxy}`);
    console.log('   txHash:', tx.hash);
    return;
  }

  console.log('⚠️  Gas-less deployViaFactory not yet supported.');
  process.exit(1);
}

/**
 * Clone specific implementation version & initialize
 */
export async function deployViaFactoryByVersion(
  implementationOwner: string,
  contractType: string,
  version: number,
  fnSignature: string,
  fnArgsJson: string,
  opts: DeployFactoryOpts
) {
  const provider = new ethers.JsonRpcProvider(resolveRpc(opts.chainId));
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY env missing');
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // initData
  const iface = new ethers.Interface([fnSignature]);
  const fnName = (fnSignature.match(/function\s+(\w+)/) || [])[1];
  if (!fnName) throw new Error(`Invalid fnSignature: ${fnSignature}`);
  const fnArgs = JSON.parse(fnArgsJson);
  const initData = iface.encodeFunctionData(fnName, fnArgs);

  // ABI + instance
  const factoryAddr = FACTORY_ADDRESS[opts.chainId];
  if (!factoryAddr) throw new Error(`No Factory on chain ${opts.chainId}`);
  const factoryCtr = new ethers.Contract(factoryAddr, FactoryABI, signer);

  // contractType hash
  const contractTypeHash = ethers.keccak256(
    ethers.toUtf8Bytes(contractType)
  );

  // estimate & confirm
  console.log('🚀  deploying via Factory (v' + version + ') ...');
  const data = factoryCtr.interface.encodeFunctionData('deployContractByVersion', [implementationOwner, contractTypeHash, version, initData]);
  const unsignedTx = { to: factoryAddr, data, from: await signer.getAddress() };
  unsignedTx.from = await signer.getAddress();

  const estimatedGas = await provider.estimateGas(unsignedTx);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice!;
  console.log(
    `🧮  Estimated gas: ${estimatedGas.toString()} @ ${ethers.formatUnits(
      gasPrice,
      'gwei'
    )} gwei`
  );
  console.log(
    `💸  ≈ ${Number(ethers.formatEther(estimatedGas * gasPrice)).toFixed(6)} ETH`
  );
  const { proceed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Continue with deployViaFactoryByVersion?',
    default: true
  }]);
  if (!proceed) {
    console.log('❌  Aborted by user.');
    process.exit(0);
  }

  // execute & parse
  const spinner = ora('Sending deployContractByVersion tx…').start();
  const tx = await factoryCtr.deployContractByVersion(
    implementationOwner, contractTypeHash, version, initData
  );
  spinner.text = 'Waiting for transaction confirmation…';
  const receipt = await tx.wait();

  let proxy: string | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = factoryCtr.interface.parseLog(log);
      if (parsed?.name === 'ContractDeployed') {
        proxy = parsed.args[2] as string;
        break;
      }
    } catch {}
  }
  if (!proxy) {
    const owner = await signer.getAddress();
    const all = await factoryCtr.deployedContracts(owner);
    proxy = all[all.length - 1];
  }

  spinner.succeed(`✅ Proxy (v${version}) deployed at ${proxy}`);
  console.log('   txHash:', tx.hash);
}

function resolveRpc(chainId: number): string {
  const key = `RPC_URL_${chainId}`;
  const url = process.env[key] ?? process.env.RPC_URL;
  if (!url) throw new Error(`RPC URL not set (expected ${key} or RPC_URL)`);
  return url;
}
