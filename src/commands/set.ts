import inquirer from 'inquirer';
import { ethers } from 'ethers';
import { FactoryABI } from '../constants';
import ora from 'ora';
import {
  getContractTypeHash,
  getInitSelector,
  resolveFactoryAddress,
  resolveRpcUrl,
  setImplementation as setImplementationOnChain,
} from '../index';

/* -------------------------------------------------------------- */
/*  Types                                                         */
/* -------------------------------------------------------------- */
interface SetOpts {
  chainId: number;
  contractType: string;
  initSignature?: string;
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
  const provider = new ethers.JsonRpcProvider(resolveRpcUrl(opts.chainId));
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY env missing');
  }
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Factory
  const factoryAddress = resolveFactoryAddress(opts.chainId);

  //
  const factoryCtr = new ethers.Contract(factoryAddress, FactoryABI, signer);

  // — on-chain path —
  if (!opts.gasless) {
    console.log('🚀  setting implementation on-chain ...');

    const implementation = ethers.getAddress(implAddr);
    const contractTypeHash = getContractTypeHash(opts.contractType);
    const initSelector = opts.initSignature
      ? getInitSelector(opts.initSignature)
      : undefined;
    const method = initSelector ? 'setImplementationWithPolicy' : 'setImplementation';
    const args = initSelector
      ? [contractTypeHash, implementation, true, true, initSelector]
      : [contractTypeHash, implementation];
    const data = factoryCtr.interface.encodeFunctionData(method, args);
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

    const spinner = ora('Sending setImplementation tx...').start();
    const result = await setImplementationOnChain({
      chainId: opts.chainId,
      signer,
      implementation,
      contractType: opts.contractType,
      initSignature: opts.initSignature,
    });
    spinner.text = 'Waiting for transaction confirmation…';
    spinner.succeed(
      `✅ setImplementation tx ${result.txHash}${result.version ? ` (version ${result.version})` : ''}`,
    );
    return result;
  }

  console.log(
    '⚠️  Gas-less setImplementation is not yet supported in this version.'
  );
  console.log(
    '    The --gasless flag will be enabled in a future release.'
  );
  process.exit(1);
}
