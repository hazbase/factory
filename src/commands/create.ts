import { existsSync, readFileSync, writeFileSync } from 'fs';
import { mkdir, copyFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import { execa } from 'execa';

export async function createHardhatProject(): Promise<void> {
  const { projectDir, contractName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectDir',
      message: 'Project directory name:',
      default: 'my-contract'
    },
    {
      type: 'input',
      name: 'contractName',
      message: 'Contract name:',
      default: 'Example',
      validate: v => /^[A-Z][A-Za-z0-9_]*$/.test(v) || 'PascalCase only'
    }
  ]);

  const root = resolve(process.cwd(), projectDir);
  if (!existsSync(root)) {
    await mkdir(root, { recursive: true });
  } else {
    console.log(`⚠️  Directory "${projectDir}" already exists; files may be overwritten.`);
  }

  process.chdir(root);

  if (!existsSync('package.json')) {
    await execa('npm', ['init', '-y'], { stdio: 'inherit' });
  }

  await execa('npm', [
    'install', '--save-dev',
    'hardhat',
    'hardhat-contract-sizer',
    '@nomicfoundation/hardhat-toolbox',
    'typescript',
    'ts-node',
    '@openzeppelin/hardhat-upgrades',
    '@openzeppelin/contracts',
    '@openzeppelin/contracts-upgradeable'
], { stdio: 'inherit' });

  const configTs = `import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{ version: '0.8.22' }],
    version: "0.8.22",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 50
      }
    }
  },
  paths: { sources: './contracts', tests: './test', cache: './cache', artifacts: './artifacts' },
  networks: {
    sepolia: {
      url: process.env.RPC_URL_11155111 || process.env.RPC_URL || '',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  contractSizer: {
    runOnCompile: true,
    strict: true,
    only: ['${contractName}'],
  }
};

export default config;
`;
  writeFileSync('hardhat.config.ts', configTs, 'utf8');
  console.log('✅ Created hardhat.config.ts');

  const dotEnv = `RPC_URL=
PRIVATE_KEY=
`;
  writeFileSync('.env', dotEnv, 'utf8');
  console.log('✅ Created .env');

  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      moduleResolution: 'node',
      strict: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    },
    include: ['hardhat.config.ts', 'contracts', 'scripts', 'test']
  };
  writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2), 'utf8');
  console.log('✅ Created tsconfig.json');

  await mkdir('contracts', { recursive: true });
  await mkdir('scripts', { recursive: true });

  const tplDir = resolve(dirname(fileURLToPath(import.meta.url)), '../hardhat');
  const exampleSrc = readFileSync(join(tplDir, 'template/contracts/Example.sol'), 'utf8');
  const customized = exampleSrc
    .replace(/contract Example/g, `contract ${contractName}`)
    .replace(/constructor\(string memory initialMessage\)/g, `constructor(string memory initialMessage)`);
  writeFileSync(join('contracts', `${contractName}.sol`), customized, 'utf8');
  console.log(`✅ contracts/${contractName}.sol created`);

  await copyFile(join(tplDir, 'scripts/deploy.ts'), join('scripts', 'deploy.ts'));
  console.log('✅ scripts/deploy.ts created');

  console.log(`🎉 Project scaffolded in ./${projectDir}`);
}
