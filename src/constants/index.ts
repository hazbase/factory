export const FACTORY_ADDRESS: Record<number, string> = {
  11155111: '0x7d4B0E58A871DBB35C7DFd131ba1eEdD3a767e67',
};

export const RPC_URLs: Record<number, string> = {
  1: `https://eth.llamarpc.com`,
  137: `https://polygon.drpc.org`,
  11155111: `https://1rpc.io/sepolia`,
  80002: `https://rpc-amoy.polygon.technology/`,
  592: `https://evm.astar.network`,
  1868: `https://rpc.soneium.org`,
  1946: `https://rpc.minato.soneium.org`,
  480: `https://worldchain-mainnet.g.alchemy.com/public`,
  4801: `https://worldchain-sepolia.g.alchemy.com/public`,
  336: `https://shiden.api.onfinality.io/public`,
  42220: `https://forno.celo.org`,
  44787: `https://alfajores-forno.celo-testnet.org`,
  56: `https://bsc.publicnode.com`,
  97: `https://bsc-testnet.publicnode.com`,
  43114: `https://api.avax.network/ext/bc/C/rpc`,
  43113: `https://api.avax-test.network/ext/bc/C/rpc`,
  1101: `https://zkevm-rpc.com`,
  2442: `https://etherscan.cardona.zkevm-rpc.com/`,
}

export const FactoryABI = [
  'event ContractDeployed(address indexed implementationOwner, bytes32 indexed contractType, address indexed proxy, address deployer)',
  'function setImplementation(bytes32 contractType, address impl)',
  'function deployContract(address implementationOwner, bytes32 contractType, bytes initData) returns (address)',
  'function deployContractByVersion(address implementationOwner, bytes32 contractType, uint32 version, bytes initData) returns (address)',
  'function deployedContracts(address owner) view returns (address[])'
] as const;