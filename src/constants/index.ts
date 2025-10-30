export const FACTORY_ADDRESS: Record<number, string> = {
  1:        '0x8347c687dF648634541744f26258Ec7aE2d7B0c8',
  11155111: '0x7d4B0E58A871DBB35C7DFd131ba1eEdD3a767e67',
  137:      '0x10ffF6E5b1e76D0092d891F88EBFE1D47608a2fF',
  80002:    '0x8C0cA4B09F86604944996a0ec3D198129AfaF95E',
  592:      '0x22A11a26685E8E0327E53Db439E8FEf6c8B0bDab',
  1868:     '',
  1946:     '0xf353e74fea27a4c6a835f24dE772F661E31b3823',
  480:      '',
  4801:     '0x6f2C82286713b2a5ff1aF213b48313393674d7EF',
  336:      '',
  42220:    '0x3A050F48A75cf55Bd5E40112a199ACEB081011A5',
  44787:    '',
  56:       '',
  97:       '',
  43114:    '0xf353e74fea27a4c6a835f24dE772F661E31b3823',
  43113:    '0xf353e74fea27a4c6a835f24dE772F661E31b3823',
  1101:     '',
  2442:     '',
};

export const RPC_URLs: Record<number, string> = {
  1:        `https://eth.llamarpc.com`,
  11155111: `https://1rpc.io/sepolia`,
  137:      `https://polygon.drpc.org`,
  80002:    `https://rpc-amoy.polygon.technology/`,
  592:      `https://evm.astar.network`,
  1868:     `https://rpc.soneium.org`,
  1946:     `https://rpc.minato.soneium.org`,
  480:      `https://worldchain-mainnet.g.alchemy.com/public`,
  4801:     `https://worldchain-sepolia.g.alchemy.com/public`,
  336:      `https://shiden.api.onfinality.io/public`,
  42220:    `https://forno.celo.org`,
  44787:    `https://alfajores-forno.celo-testnet.org`,
  56:       `https://bsc.publicnode.com`,
  97:       `https://bsc-testnet.publicnode.com`,
  43114:    `https://api.avax.network/ext/bc/C/rpc`,
  43113:    `https://api.avax-test.network/ext/bc/C/rpc`,
  1101:     `https://zkevm-rpc.com`,
  2442:     `https://etherscan.cardona.zkevm-rpc.com/`,
}

export const FactoryABI = [
  'event ContractDeployed(address indexed implementationOwner, bytes32 indexed contractType, address indexed proxy, address deployer)',
  'function setImplementation(bytes32 contractType, address impl)',
  'function deployContract(address implementationOwner, bytes32 contractType, bytes initData) returns (address)',
  'function deployContractByVersion(address implementationOwner, bytes32 contractType, uint32 version, bytes initData) returns (address)',
  'function deployedContracts(address owner) view returns (address[])'
] as const;