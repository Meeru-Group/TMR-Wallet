/**
 * TMR real cross-chain bridge API.
 *
 * TMR-CHAIN-1 is not a 0x-supported chain. Therefore TMR <-> EVM uses a
 * real lock/release bridge with an EVM wrapped-TMR contract and a relayer.
 * EVM <-> EVM continues to use the live 0x Cross-Chain API when configured.
 */
const crypto = require('node:crypto');
const { Interface } = require('ethers');
const db = require('./database');

const ZEROX_BASE = 'https://api.0x.org';
const ZEROX_VERSION = 'v2';
const TMR_CHAIN_ID = 'TMR-CHAIN-1';
const ZEROX_CHAIN_IDS = new Set([
  '1','2741','42161','43114','8453','80094','56','999','57073','59144',
  '5000','143','10','9745','137','4663','534352','146','4217','130','480'
]);

function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
function now(){return new Date().toISOString();}
function isTmrAddress(x){return /^TMR1[a-z2-7]{32}$/.test(String(x||''));}
function isHexAddress(x){return /^0x[a-fA-F0-9]{40}$/.test(String(x||''));}
function orderId(){return '0x'+crypto.randomBytes(32).toString('hex');}
function isBytes32(x){return /^0x[a-fA-F0-9]{64}$/.test(String(x||''));}

async function zeroXQuote(params){
  const apiKey=process.env.ZEROX_API_KEY;
  if(!apiKey) throw new Error('ZEROX_API_KEY is not configured on the server');
  const required=['originChain','destinationChain','sellToken','buyToken','sellAmount','originAddress','destinationAddress'];
  for(const key of required) if(!params[key]) throw new Error(`Missing ${key}`);
  if(!ZEROX_CHAIN_IDS.has(String(params.originChain))||!ZEROX_CHAIN_IDS.has(String(params.destinationChain))) throw new Error('0x route requires 0x-supported chains');
  if(!isHexAddress(params.sellToken)||!isHexAddress(params.buyToken)||!isHexAddress(params.originAddress)||!isHexAddress(params.destinationAddress)) throw new Error('0x route requires EVM addresses');
  const qs=new URLSearchParams({originChain:String(params.originChain),destinationChain:String(params.destinationChain),sellToken:String(params.sellToken),buyToken:String(params.buyToken),sellAmount:String(params.sellAmount),originAddress:String(params.originAddress),destinationAddress:String(params.destinationAddress),sortQuotesBy:String(params.sortQuotesBy||'price'),maxNumQuotes:String(params.maxNumQuotes||1)});
  const r=await fetch(`${ZEROX_BASE}/cross-chain/quotes?${qs}`,{headers:{'0x-api-key':apiKey,'0x-version':ZEROX_VERSION,Accept:'application/json'}});
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok){const e=new Error(data?.message||data?.reason||`0x API HTTP ${r.status}`);e.statusCode=r.status;throw e;}
  return data;
}

async function createOrder(body){
  const from=String(body.originChain), to=String(body.destinationChain);
  const isTmrFrom=from===TMR_CHAIN_ID, isTmrTo=to===TMR_CHAIN_ID;
  if(!isTmrFrom&&!isTmrTo) return null;
  if(isTmrFrom && !isTmrAddress(body.originAddress)) throw new Error('originAddress must be a TMR1 address');
  if(isTmrTo && !isTmrAddress(body.destinationAddress)) throw new Error('destinationAddress must be a TMR1 address');
  if(!isTmrFrom && !isHexAddress(body.originAddress)) throw new Error('originAddress must be an EVM address');
  if(!isTmrTo && !isHexAddress(body.destinationAddress)) throw new Error('destinationAddress must be an EVM address');
  const amount=String(body.sellAmount||'');
  if(!/^\d+$/.test(amount)||BigInt(amount)<=0n) throw new Error('sellAmount must be a positive integer in base units');
  if(isTmrFrom && body.sellToken && body.sellToken!=='TMR') throw new Error('TMR origin asset must be TMR');
  if(isTmrTo && body.buyToken && body.buyToken!=='TMR') throw new Error('TMR destination asset must be TMR');
  const id=orderId();
  await db.query(`INSERT INTO bridge_orders (order_id,origin_chain,destination_chain,sell_token,buy_token,sell_amount,origin_address,destination_address,status,evm_order_hash,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CREATED',$9,NOW(),NOW())`,[id,from,to,String(body.sellToken||'TMR'),String(body.buyToken||'TMR'),amount,String(body.originAddress),String(body.destinationAddress),id]);
  return {orderId:id,status:'CREATED',originChain:from,destinationChain:to,sellToken:String(body.sellToken||'TMR'),buyToken:String(body.buyToken||'TMR'),sellAmount:amount,originAddress:body.originAddress,destinationAddress:body.destinationAddress,bridgeProvider:'TMR Native Lock/Release Bridge',requiresUserAction:isTmrFrom?'Send a signed TMR transaction to the bridge vault with the returned orderId.':'Call burnToTMR(orderId, amount, tmrRecipient) on the deployed wTMR contract.'};
}

async function handle(req,res,pathname,searchParams){
  if(pathname==='/api/crosschain/config'&&req.method==='GET'){
    return json(res,200,{success:true,network:'Thanvi Testnet',testnet:true,tmrChainId:TMR_CHAIN_ID,bridge:{mode:'REAL_LOCK_RELEASE',vaultAddress:process.env.TMR_BRIDGE_VAULT_ADDRESS||null,wrappedTmrAddress:process.env.WRAPPED_TMR_ADDRESS||null,evmChainId:process.env.EVM_CHAIN_ID||null,relayerConfigured:Boolean(process.env.TMR_BRIDGE_VAULT_ADDRESS&&process.env.TMR_BRIDGE_PRIVATE_KEY_PKCS8_HEX&&process.env.WRAPPED_TMR_ADDRESS&&process.env.EVM_RPC_URL)},zeroX:{configured:Boolean(process.env.ZEROX_API_KEY),baseUrl:ZEROX_BASE,version:ZEROX_VERSION,supportedChains:[...ZEROX_CHAIN_IDS]},routes:{'TMR -> EVM':'REAL_LOCK_MINT','EVM -> TMR':'REAL_BURN_RELEASE','EVM -> EVM':process.env.ZEROX_API_KEY?'0X_LIVE':'KEY_REQUIRED'}});
  }
  if(pathname==='/api/crosschain/quote'&&req.method==='POST'){
    const body=await req.body();
    if(body.originChain===TMR_CHAIN_ID||body.destinationChain===TMR_CHAIN_ID){
      try{return json(res,200,{success:true,testnet:true,quote:await createOrder(body)})}catch(e){return json(res,400,{success:false,error:e.message});}
    }
    try{return json(res,200,{success:true,testnet:false,provider:'0x Cross-Chain API',quote:await zeroXQuote(body)})}catch(e){return json(res,e.statusCode||502,{success:false,provider:'0x Cross-Chain API',error:e.message});}
  }
  if(pathname==='/api/crosschain/evm-burn-calldata'&&req.method==='POST') {
    const body=await req.body();
    if(!isBytes32(body.orderId)) return json(res,400,{success:false,error:'Invalid orderId'});
    if(!isHexAddress(body.from)) return json(res,400,{success:false,error:'Invalid EVM address'});
    if(!isTmrAddress(body.tmrRecipient)) return json(res,400,{success:false,error:'Invalid TMR recipient'});
    if(!/^\d+$/.test(String(body.amount||''))||BigInt(body.amount)<=0n) return json(res,400,{success:false,error:'Invalid amount'});
    const amountWei=(BigInt(body.amount)*10n**18n).toString();
    const iface=new Interface(['function burnToTMR(bytes32 orderId,uint256 amount,string tmrRecipient)']);
    const data=iface.encodeFunctionData('burnToTMR',[body.orderId,amountWei,body.tmrRecipient]);
    return json(res,200,{success:true,contract:process.env.WRAPPED_TMR_ADDRESS||null,orderId:body.orderId,amountTmr:String(body.amount),amountWei,data});
  }

  if(pathname==='/api/crosschain/status'&&req.method==='GET'){
    const id=searchParams.get('quoteId')||searchParams.get('orderId');
    if(!isBytes32(id)) return json(res,400,{success:false,error:'Invalid orderId'});
    const r=await db.query(`SELECT order_id AS "orderId",origin_chain AS "originChain",destination_chain AS "destinationChain",sell_token AS "sellToken",buy_token AS "buyToken",sell_amount AS "sellAmount",origin_address AS "originAddress",destination_address AS "destinationAddress",status,tmr_lock_tx_hash AS "tmrLockTxHash",evm_tx_hash AS "evmTxHash",tmr_release_tx_hash AS "tmrReleaseTxHash",created_at AS "createdAt",updated_at AS "updatedAt" FROM bridge_orders WHERE order_id=$1 LIMIT 1`,[id]);
    if(!r.rowCount) return json(res,404,{success:false,error:'Bridge order not found'});
    return json(res,200,{success:true,testnet:true,status:r.rows[0]});
  }
  if(pathname==='/api/crosschain/orders'&&req.method==='GET'){
    const r=await db.query(`SELECT order_id AS "orderId",origin_chain AS "originChain",destination_chain AS "destinationChain",sell_amount AS "sellAmount",origin_address AS "originAddress",destination_address AS "destinationAddress",status,tmr_lock_tx_hash AS "tmrLockTxHash",evm_tx_hash AS "evmTxHash",tmr_release_tx_hash AS "tmrReleaseTxHash",created_at AS "createdAt",updated_at AS "updatedAt" FROM bridge_orders ORDER BY created_at DESC LIMIT 50`);
    return json(res,200,{success:true,orders:r.rows});
  }
  return false;
}
module.exports={handle};
