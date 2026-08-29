const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
require('dotenv').config();

function compile() {
  const file = path.join(__dirname, '..', 'contracts', 'TMRWrapped.sol');
  const source = fs.readFileSync(file, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'TMRWrapped.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatal = output.errors.filter(x => x.severity === 'error');
    if (fatal.length) throw new Error(fatal.map(x => x.formattedMessage).join('\n'));
  }
  return output.contracts['TMRWrapped.sol'].TMRWrapped;
}

async function main() {
  const rpc = process.env.EVM_RPC_URL;
  const pk = process.env.EVM_RELAYER_PRIVATE_KEY;
  if (!rpc || !pk) throw new Error('Set EVM_RPC_URL and EVM_RELAYER_PRIVATE_KEY');
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const c = compile();
  const factory = new ethers.ContractFactory(c.abi, c.evm.bytecode.object, wallet);
  const contract = await factory.deploy(wallet.address);
  await contract.waitForDeployment();
  console.log(JSON.stringify({ network: (await provider.getNetwork()).chainId.toString(), relayer: wallet.address, wrappedTMR: await contract.getAddress() }, null, 2));
}
main().catch(err => { console.error(err); process.exit(1); });
