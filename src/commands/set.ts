import inquirer from 'inquirer';
import { ethers } from 'ethers';
import { FACTORY_ADDRESS, FactoryABI } from '../constants';
import ora from 'ora';

/* -------------------------------------------------------------- */
/*  Types                                                         */
/* -------------------------------------------------------------- */
interface SetOpts {
  chainId: number;
  contractType: string;
  gasless?: boolean;
  accessToken?: string;
  clientKey?: string;
}

/* -------------------------------------------------------------- */
/*  Public entry                                                  */
/* -------------------------------------------------------------- */
export async function setImplementation(
  implAddr: string,
  opts: SetOpts
) {
  // RPC／Signer
  const provider = new ethers.JsonRpcProvider(resolveRpc(opts.chainId));
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY env missing');
  }
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Factory
  const factoryAddress = FACTORY_ADDRESS[opts.chainId];
  if (!factoryAddress) {
    throw new Error(`Factory not deployed on chainId ${opts.chainId}`);
  }

  //
  const factoryCtr = new ethers.Contract(factoryAddress, FactoryABI, signer);

  // — on-chain path —
  if (!opts.gasless) {
    console.log('🚀  setting implementation on-chain ...');

    const contractTypeHash = ethers.keccak256(ethers.toUtf8Bytes(opts.contractType));
    const data = factoryCtr.interface.encodeFunctionData('setImplementation', [contractTypeHash, implAddr]);
    const unsignedTx = { to: factoryAddress, data, from: await signer.getAddress() };
    
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

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue with setImplementation?',
        default: true,
      },
    ]);
    if (!proceed) {
      console.log('❌  Aborted by user.');
      process.exit(0);
    }

    const spinner = ora('Sending setImplementation tx…').start();
    const tx = await factoryCtr.setImplementation(contractTypeHash, implAddr);
    spinner.text = 'Waiting for transaction confirmation…';
    await tx.wait();
    spinner.succeed(`✅ setImplementation tx ${tx.hash}`);
    return;
  }

  console.log(
    '⚠️  Gas-less setImplementation is not yet supported in this version.'
  );
  console.log(
    '    The --gasless flag will be enabled in a future release.'
  );
  process.exit(1);

  /* --- Future -------------------------------
  if (!opts.accessToken || !(opts.clientKey || process.env.CLIENT_KEY)) {
    throw new Error('accessToken and clientKey required for gasless set');
  }
  setClientKey(opts.clientKey ?? process.env.CLIENT_KEY!);
  await ensureClientKeyActive();

  const txHash = await forwardCall({
    signer,
    chainId: opts.chainId,
    accessToken: opts.accessToken,
    contractAddress: factoryAddress,
    abi: factoryAbi,
    method: 'setImplementation',
    args: [implAddr],
  });
  console.log('✅ gas-less setImplementation tx', txHash);
  ------------------------------------------------- */
}

/* -------------------------------------------------------------- */
/*  Helper: RPC URL Solver                                        */
/* -------------------------------------------------------------- */
function resolveRpc(chainId: number): string {
  const key = `RPC_URL_${chainId}`;
  const url = process.env[key] ?? process.env.RPC_URL;
  if (!url) {
    throw new Error(`RPC URL not set (expected ${key} or RPC_URL)`);
  }
  return url;
}
