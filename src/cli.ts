import { Command } from 'commander';
import { createHardhatProject } from './commands/create';
import { deployContract } from './commands/deploy';
import { setImplementation } from './commands/set';

import dotenv from 'dotenv';
import figlet from 'figlet';
import chalk from 'chalk';

dotenv.config({ path: '.env' });

function printBanner() {
  const banner = figlet.textSync('HazBase Factory', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });
  console.log(chalk.cyan(banner));
  console.log(chalk.green('🚀  HazBase Contract Factory CLI  🚀\n'));
}

export async function main(argv: string[]) {
  const program = new Command()
    .name('hazbase-factory')
    .description('HAZAMA BASE factory helper CLI')
    .version('0.1.0');

  program.hook('preAction', () => {
    printBanner();
  });

  /* create ----------------------------------------------------------- */
  program
    .command('create')
    .description('Generate a Hardhat + TS project scaffold')
    .action(async () => {
      await createHardhatProject();
    });

  /* deploy ----------------------------------------------------------- */
  program
    .command('deploy')
    .requiredOption('--chainId <number>', 'target chainId', v => Number(v))
    .option('--gasless', 'use relayer (requires --accessToken & --clientKey)')
    .option('--accessToken <token>', 'JWT from @hazbase/auth')
    .option('--clientKey <key>', 'HAZAMA BASE client key')
    .option('--args <json>', 'constructor args as JSON array', '[]')
    .option('--initializer <name>', 'initializer function name')
    .option('--initArgs <json>', 'initializer args JSON array', '[]')
    .action(async (opts) => {
      await deployContract(opts);
    });

  /* set -------------------------------------------------------------- */
  program
    .command('set <implAddress>')
    .requiredOption('--chainId <number>', 'target chainId', v => Number(v))
    .requiredOption(
       '--contractType <contractType>',
       'contractType identifier (e.g. "MyToken")'
    )
    .option('--gasless', 'use relayer (requires --accessToken & --clientKey)')
    .option('--accessToken <token>', 'JWT')
    .option('--clientKey <key>', 'client key')
    .action(async (implAddress, opts) => {
      await setImplementation(implAddress, opts);
    });

  /* deployViaFactory -------------------------------------------------- */
  program
    .command('deployViaFactory <implementationOwner> <contractType> <fnSignature> <fnArgs>')
    .description(
      'Use Factory to clone & initialize a proxy: ' +
      '<fnSignature> e.g. "function initialize(string,string,uint256)" ' +
      '<fnArgs> JSON array, e.g. \'["MyToken","TTK",1000]\''
    )
    .requiredOption('--chainId <number>', 'target chainId', (v) => Number(v))
    .option('--gasless', 'use relayer (requires --accessToken & --clientKey)')
    .option('--accessToken <token>', 'JWT for gasless')
    .option('--clientKey <key>', 'HAZAMA BASE client key')
    .action(async (implementationOwner: string, contractType: string, fnSignature: string, fnArgs: string, opts) => {
      const { deployViaFactory } = await import('./commands/deployViaFactory');
      await deployViaFactory(implementationOwner, contractType, fnSignature, fnArgs, opts);
    });

  program
    .command('deployViaFactoryByVersion <implementationOwner> <contractType> <version> <fnSignature> <fnArgs>')
    .description(
      'Clone specific version & initialize proxy: ' +
      '<version> 1-based version index; ' +
      'then <fnSignature> and <fnArgs> as above'
    )
    .requiredOption('--chainId <number>', 'target chainId', (v) => Number(v))
    .action(async (implementationOwner: string, contractType: string, version: number, fnSignature, fnArgs, opts) => {
      const { deployViaFactoryByVersion } = await import('./commands/deployViaFactory');
      await deployViaFactoryByVersion(
        implementationOwner,
        contractType,
        Number(version),
        fnSignature,
        fnArgs,
        opts
      );
    });

  await program.parseAsync(argv);
}
