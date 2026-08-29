const crypto = require('node:crypto');
const db = require('./database');
const TMRBlockchain = require('./blockchain');
const { ethers } = require('ethers');
require('dotenv').config();

const chain = new TMRBlockchain();
const ABI = [
  'function mintForBridge(bytes32 orderId,address to,uint256 amount) external',
  'function burnToTMR(bytes32 orderId,uint256 amount,string tmrRecipient) external',
  'event BridgeBurned(bytes32 indexed orderId,address indexed from,uint256 amount,string tmrRecipient)'
];
const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_URL);
const evmRelayer = new ethers.Wallet(process.env.EVM_RELAYER_PRIVATE_KEY, provider);
const wrapped = new ethers.Contract(process.env.WRAPPED_TMR_ADDRESS, ABI, evmRelayer);
const TMR_VAULT = process.env.TMR_BRIDGE_VAULT_ADDRESS;
const TMR_PKCS8_HEX = process.env.TMR_BRIDGE_PRIVATE_KEY_PKCS8_HEX;

function addressFromPublicKey(rawPublicKey) {
  const digest = crypto.createHash('sha256').update(rawPublicKey).digest();
  return 'TMR1' + base32Encode(digest.subarray(0, 20));
}
function base32Encode(buffer) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'; let bits=0,value=0,out='';
  for (const byte of buffer) { value=(value<<8)|byte; bits+=8; while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;} }
  if(bits>0) out+=alphabet[(value<<(5-bits))&31]; return out;
}
function signTmrTx({from,to,amount,nonce,data}) {
  const key = crypto.createPrivateKey({key:Buffer.from(TMR_PKCS8_HEX,'hex'),format:'der',type:'pkcs8'});
  const pub = crypto.createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32);
  if(addressFromPublicKey(pub)!==from) throw new Error('TMR bridge key does not match vault address');
  const message = JSON.stringify({from,to,amount:String(amount),nonce:Number(nonce),data:data??null});
  const sig = crypto.sign(null,Buffer.from(message),key);
  return { publicKey:pub.toString('base64'), signature:sig.toString('base64') };
}
async function tmrApi(path, body) {
  const base=process.env.TMR_API_URL || 'http://127.0.0.1:3000';
  const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json(); if(!r.ok) throw new Error(d.error||'TMR API error'); return d;
}
async function processTmrLocks(){
  const rows=await db.query(`SELECT hash,from_address,to_address,amount,nonce,timestamp,data,status FROM transactions WHERE status='confirmed' AND to_address=$1 AND data->>'type'='bridge_lock' ORDER BY timestamp ASC LIMIT 25`,[TMR_VAULT]);
  for(const tx of rows.rows){
    const d=tx.data||{}; const orderId=d.orderId;
    if(!orderId) continue;
    const existing=await db.query(`SELECT id,status FROM bridge_orders WHERE order_id=$1 LIMIT 1`,[orderId]);
    if(!existing.rowCount) continue;
    const order=existing.rows[0];
    if(order.status==='COMPLETED') continue;
    if(String(tx.from_address)!==String(d.originAddress||'') || String(tx.from_address)!==String((await db.query('SELECT origin_address FROM bridge_orders WHERE order_id=$1',[orderId])).rows[0].origin_address)) continue;
    const expected=BigInt(String((await db.query('SELECT sell_amount FROM bridge_orders WHERE order_id=$1',[orderId])).rows[0].sell_amount));
    if(BigInt(String(tx.amount))!==expected) continue;
    await db.query(`UPDATE bridge_orders SET status='MINT_PENDING',tmr_lock_tx_hash=$1,updated_at=NOW() WHERE order_id=$2`,[tx.hash,orderId]);
    if(!process.env.WRAPPED_TMR_ADDRESS || !process.env.EVM_RPC_URL) continue;
    const to=d.destinationAddress; const amount=expected * 10n**18n;
    const oid=orderId;
    try {
      const receipt=await wrapped.mintForBridge(oid,to,amount).then(x=>x.wait());
      await db.query(`UPDATE bridge_orders SET status='COMPLETED',evm_tx_hash=$1,updated_at=NOW() WHERE order_id=$2`,[receipt.hash,orderId]);
      console.log('Minted',orderId,receipt.hash);
    } catch (e) {
      await db.query(`UPDATE bridge_orders SET status='MINT_PENDING',updated_at=NOW() WHERE order_id=$1`,[orderId]);
      console.error('Mint failed',orderId,e.message);
    }
  }
}
async function processEvmBurns(){
  const latest=await provider.getBlockNumber();
  const from=Math.max(0,latest-100);
  const logs=await wrapped.queryFilter(wrapped.filters.BridgeBurned(),from,latest);
  for(const log of logs){
    const orderId=log.args.orderId; const hexOrder=String(orderId).toLowerCase();
    const order=await db.query(`SELECT * FROM bridge_orders WHERE evm_order_hash=$1 LIMIT 1`,[hexOrder]);
    if(!order.rowCount) continue;
    const o=order.rows[0]; if(['COMPLETED','RELEASE_PENDING'].includes(o.status)) continue;
    const recipient=log.args.tmrRecipient; const amount=BigInt(log.args.amount)/10n**18n;
    if(amount<=0n) continue;
    const acct=await chain.getAddress(TMR_VAULT); const nonce=acct.nextNonce;
    const data={type:'bridge_release',orderId:o.order_id,sourceTxHash:log.transactionHash};
    const sig=signTmrTx({from:TMR_VAULT,to:recipient,amount:amount.toString(),nonce,data});
    const r=await tmrApi('/api/transactions',{from:TMR_VAULT,to:recipient,amount:amount.toString(),nonce,data,...sig});
    await db.query(`UPDATE bridge_orders SET status='RELEASE_PENDING',tmr_release_tx_hash=$1,updated_at=NOW() WHERE order_id=$2`,[r.transaction.hash,o.order_id]);
  }
}
async function processTmrReleases(){
  const rows=await db.query(`SELECT order_id,tmr_release_tx_hash FROM bridge_orders WHERE status='RELEASE_PENDING' AND tmr_release_tx_hash IS NOT NULL LIMIT 25`);
  for(const row of rows.rows){
    const tx=await chain.getTransaction(row.tmr_release_tx_hash);
    if(tx && tx.status==='confirmed') await db.query(`UPDATE bridge_orders SET status='COMPLETED',updated_at=NOW() WHERE order_id=$1`,[row.order_id]);
  }
}

async function main(){
  if(!TMR_VAULT||!TMR_PKCS8_HEX||!process.env.WRAPPED_TMR_ADDRESS) throw new Error('Bridge relayer env is incomplete');
  await chain.initialize();
  console.log('Real bridge relayer online. TMR vault:',TMR_VAULT,'wTMR:',process.env.WRAPPED_TMR_ADDRESS);
  setInterval(()=>processTmrLocks().catch(e=>console.error('TMR lock error',e)),Number(process.env.BRIDGE_POLL_MS||5000));
  setInterval(()=>processEvmBurns().catch(e=>console.error('EVM burn error',e)),Number(process.env.BRIDGE_POLL_MS||5000));
  setInterval(()=>processTmrReleases().catch(e=>console.error('TMR release error',e)),Number(process.env.BRIDGE_POLL_MS||5000));
  await processTmrLocks(); await processEvmBurns(); await processTmrReleases();
}
main().catch(e=>{console.error(e);process.exit(1)});
