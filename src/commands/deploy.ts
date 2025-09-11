import { execa } from 'execa';
import { readFileSync } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { ethers, ParamType } from 'ethers';
import ora from 'ora';
import { RPC_URLs } from '../constants';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface DeployOpts {
  chainId: number;
  gasless?: boolean;
  accessToken?: string;
  clientKey?: string;
  args: string;               // JSON array string
  initializer?: string;
  initArgs: string;           // JSON array string
  contract?: string;
}

function parseTupleArg(raw: string, param: ParamType): any {
  const cleaned = raw.trim().replace(/^[\[(]/, "").replace(/[\])\s]*$/, "");
  const parts   = cleaned.split(",").map((s) => s.trim());

  return param.components!.map((comp, i) => {
    const v = parts[i];
    if (comp.type.startsWith("uint") || comp.type.startsWith("int")) {
      return BigInt(v);
    }
    if (comp.type === "bool")  return v === "true";
    if (comp.type === "address" || comp.type.startsWith("bytes"))
      return v;
    if (comp.type.startsWith("tuple")) {
      return parseTupleArg(v, comp);
    }
    throw new Error(`Unsupported type ${comp.type}`);
  });
}

/* ------------------------------------------------------------------ */
/*  Public entry                                                      */
/* ------------------------------------------------------------------ */
export async function deployContract(opts: DeployOpts) {
  /* 0. Compile ------------------------------------------------------ */
  await execa('npx', ['hardhat', 'compile'], { stdio: 'inherit' });

  /* 1. Load first real artifact ------------------------------------- */
  const {data: artifact, path: artifactPath} = await loadArtifact(opts);
  const abi       = artifact.abi as any[];
  const bytecode  = artifact.bytecode as string;

  /* 2. Extract contract name and display --------------------------- */
  // Hardhat JSON may include `contractName`, otherwise use filename
  const contractName =
    typeof artifact.contractName === 'string'
      ? artifact.contractName
      : path.basename(artifactPath, '.json');
  console.log(`📦 Deploying contract: ${contractName}`);

  /* 2. Determine constructor inputs and possibly prompt ------------ */
  // find the "constructor" ABI entry
  const ctorAbi = abi.find((item) => item.type === 'constructor');
  let constructorArgs: unknown[] = JSON.parse(opts.args);

  if (ctorAbi && Array.isArray(ctorAbi.inputs) && ctorAbi.inputs.length > 0) {
    const needed = ctorAbi.inputs.length;
    if (constructorArgs.length !== needed) {
      console.log(`🔍 Detected constructor requires ${needed} argument(s).`);
      // build prompt questions
      const questions = ctorAbi.inputs.map((input: any, idx: number) => ({
        type: 'input',
        name: `arg${idx}`,
        message: `Enter value for constructor parameter "${input.name || `arg${idx}`}": (${input.type})`
      }));
      const answers = await inquirer.prompt(questions);
      constructorArgs = ctorAbi.inputs.map((_input: any, idx: any) => {
        // raw input is string; for numeric types let ethers.parse handle
        const raw = answers[`arg${idx}`];
        if (_input.type.startsWith("tuple")) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          return parseTupleArg(raw, _input as ParamType);
        }
        if (_input.type.startsWith("uint") || _input.type.startsWith("int")) {
          return BigInt(raw);
        }
        return raw;
      });
      
    }
  }

  /* 3. Signer ------------------------------------------------------- */
  const provider = new ethers.JsonRpcProvider(resolveRpc(opts.chainId));
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY env missing');
  }
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  /* ---------------------------------------------------------------- */
  /*  On-chain deployment path                                        */
  /* ---------------------------------------------------------------- */
  if (!opts.gasless) {
    console.log('🚀  deploying on-chain ...');

    /* Estimate gas -------------------------------------------------- */
    const factory     = new ethers.ContractFactory(abi, bytecode, signer);
    const unsignedTx  = await factory.getDeployTransaction(...constructorArgs);
    const estimatedGas = await provider.estimateGas(unsignedTx);
    const feeData     = await provider.getFeeData();
    const gasPrice    = feeData.maxFeePerGas ?? feeData.gasPrice!;
    const costWei     = estimatedGas * gasPrice;
    const costEth     = Number(ethers.formatEther(costWei));

    console.log(
      `🧮  Estimated gas: ${estimatedGas.toString()} @ ${ethers.formatUnits(gasPrice, 'gwei')} gwei`
    );
    console.log(`💸  ≈ ${costEth.toFixed(6)} ETH`);

    /* Confirm ------------------------------------------------------- */
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue with deployment?',
        default: true
      }
    ]);
    if (!proceed) {
      console.log('❌  Deployment aborted by user.');
      process.exit(0);
    }

    /* Deploy -------------------------------------------------------- */
    const spinner = ora('Sending deployment tx…').start();
    const contract = await factory.deploy(...constructorArgs);
    spinner.text = 'Waiting for transaction confirmation…';
    await contract.waitForDeployment();
    spinner.succeed(`✅ Deployed at ${await contract.getAddress()}`);
    return;
  }

  /* ---------------------------------------------------------------- */
  /*  Gas-less deployment path (To be implemented)                    */
  /* ---------------------------------------------------------------- */

  console.log('⚠️  Gas-less deployment is not yet supported in this version.');
  console.log('    The --gasless flag will be enabled in a future release.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Helper functions                                                  */
/* ------------------------------------------------------------------ */

function loadFirstArtifact(): any {
  const base = path.resolve('artifacts/contracts');
  function walk(dir: string): string | null {
    for (const f of require('fs').readdirSync(dir)) {
      const p = path.join(dir, f);
      if (f.endsWith('.json')) {
        const json = JSON.parse(readFileSync(p, 'utf8'));
        if (Array.isArray(json.abi) && typeof json.bytecode === 'string') {
          return p;
        }
      }
      if (require('fs').lstatSync(p).isDirectory()) {
        const r = walk(p);
        if (r) return r;
      }
    }
    return null;
  }
  const file = walk(base);
  if (!file) throw new Error('No artifact found. Did you compile?');
  return { data: JSON.parse(readFileSync(file, 'utf8')), path: file };
}

function collectArtifacts(): {name: string; file: string}[] {
  const base = path.resolve('artifacts/contracts');
  const list: {name: string; file: string}[] = [];

  function walk(dir: string) {
    for (const f of require('fs').readdirSync(dir)) {
      const p = path.join(dir, f);
      if (f.endsWith('.json')) {
        const j = JSON.parse(require('fs').readFileSync(p, 'utf8'));
        if (Array.isArray(j.abi) && j.bytecode) {
          const name = j.contractName ?? path.basename(p, '.json');
          if (!/Mock|Test|Lib/i.test(name)) list.push({name, file: p});
        }
      } else if (require('fs').lstatSync(p).isDirectory()) walk(p);
    }
  }
  walk(base);
  return list;
}

async function chooseArtifact(opts: DeployOpts) {
  const all = collectArtifacts();

  if (opts.contract) {
    const hit = all.find(a =>
      a.name === opts.contract || a.file.includes(opts.contract || '')
    );
    if (!hit) throw new Error(`Artifact not found for ${opts.contract}`);
    return hit;
  }

  if (all.length === 0) throw new Error('No artifacts found.');
  if (all.length === 1) return all[0];

  const {pick} = await inquirer.prompt([
    {
      type: 'list',
      name: 'pick',
      message: 'Deploy which contract?',
      choices: all.map(a => ({name: a.name, value: a}))
    }
  ]);
  return pick;
}

async function loadArtifact(opts: DeployOpts) {
  const { file } = await chooseArtifact(opts);
  if (!file) throw new Error('No artifact found. Did you compile?');
  return { data: JSON.parse(readFileSync(file, 'utf8')), path: file };
}

function resolveRpc(chainId: number): string {
  const envKey = `RPC_URL_${chainId}`;
  let url    = process.env[envKey] ?? process.env.RPC_URL;
  if (!url) {
    url = RPC_URLs[chainId];
    if (!url) throw new Error(`RPC URL not set (expected ${envKey} or RPC_URL)`);
  }
  return url;
}
