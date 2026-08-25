const express=require("express");
const cors=require("cors");
const crypto=require("crypto");
const fs=require("fs");
const path=require("path");

const app=express();
app.use(cors());
app.use(express.json({limit:"256kb"}));

const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.TMR_DATA_DIR||path.join(__dirname,"data");
const STATE_FILE=path.join(DATA_DIR,"state.json");
fs.mkdirSync(DATA_DIR,{recursive:true});

function sha256(s){return crypto.createHash("sha256").update(s).digest("hex")}
function addressFromPublicKey(publicKey){
  return "TMR1"+sha256(Buffer.from(publicKey,"hex")).slice(0,40);
}
function canonicalTx(tx){
  return JSON.stringify({version:tx.version,network:tx.network,from:tx.from,to:tx.to,amount:tx.amount,nonce:tx.nonce,publicKey:tx.publicKey});
}
function validAddress(a){return /^TMR1[0-9a-fA-F]{40}$/.test(a)}
function load(){
  if(fs.existsSync(STATE_FILE))return JSON.parse(fs.readFileSync(STATE_FILE,"utf8"));
  const s={chainId:"TMR-CHAIN-1",totalSupply:Number(process.env.TMR_TOTAL_SUPPLY||10000000000),blocks:[{height:0,hash:"0".repeat(64),previousHash:"0".repeat(64),timestamp:new Date().toISOString(),proposer:"genesis",status:"finalized",consensus:"Proof-of-Reputation",transactions:[]}],mempool:[],accounts:{}};
  save(s);return s;
}
function save(s){fs.writeFileSync(STATE_FILE,JSON.stringify(s,null,2))}
const state=load();

function account(address){
  if(!state.accounts[address])state.accounts[address]={balance:0,nonce:0};
  return state.accounts[address];
}
function confirmedTransactions(address){
  return state.blocks.flatMap(b=>b.transactions||[]).filter(t=>t.from===address||t.to===address);
}
function balanceOf(address){
  const a=account(address); return a.balance;
}
function verifyTx(tx){
  if(tx.network!=="TMR"||tx.version!==1)throw Error("Unsupported transaction");
  if(!validAddress(tx.from)||!validAddress(tx.to))throw Error("Invalid TMR1 address");
  if(!/^[0-9a-fA-F]{64}$/.test(tx.publicKey||""))throw Error("Invalid public key");
  if(addressFromPublicKey(tx.publicKey).toLowerCase()!==tx.from.toLowerCase())throw Error("Public key does not match sender address");
  if(!Number.isSafeInteger(tx.amount)||tx.amount<=0)throw Error("Amount must be a positive integer");
  if(!Number.isSafeInteger(tx.nonce)||tx.nonce<0)throw Error("Invalid nonce");
  if(!/^[0-9a-fA-F]{128}$/.test(tx.signature||""))throw Error("Invalid Ed25519 signature");
  const ok=crypto.verify(null,Buffer.from(canonicalTx(tx)),{key:Buffer.from("302a300506032b6570032100","hex").toString("base64")+tx.publicKey,format:"der",type:"spki"},Buffer.from(tx.signature,"hex"));
  if(!ok)throw Error("Invalid Ed25519 signature");
  const a=account(tx.from);
  if(tx.nonce!==a.nonce)throw Error("Invalid nonce; expected "+a.nonce);
  if(tx.amount>a.balance)throw Error("Insufficient balance");
  return true;
}
function addTransaction(tx){
  verifyTx(tx);
  const hash=sha256(canonicalTx(tx)+"|"+tx.signature);
  if(state.mempool.some(x=>x.hash===hash))return state.mempool.find(x=>x.hash===hash);
  const entry={...tx,hash,status:"pending",timestamp:new Date().toISOString()};
  state.mempool.push(entry);save(state);return entry;
}
function finalizePending(){
  if(!state.mempool.length)return null;
  const txs=state.mempool.splice(0);
  const previous=state.blocks[state.blocks.length-1];
  for(const tx of txs){
    const from=account(tx.from),to=account(tx.to);
    from.balance-=tx.amount;from.nonce+=1;to.balance+=tx.amount;
  }
  const block={height:previous.height+1,hash:"",previousHash:previous.hash,timestamp:new Date().toISOString(),proposer:"por-validator-001",status:"finalized",consensus:"Proof-of-Reputation",transactions:txs.map(t=>({...t,status:"finalized",blockHeight:previous.height+1}))};
  block.hash=sha256(JSON.stringify(block));
  state.blocks.push(block);save(state);return block;
}

app.get("/api/health",(req,res)=>res.json({success:true,status:"healthy",network:"online",blockchain:"TMR Blockchain",consensus:"Proof-of-Reputation"}));
app.get("/api/network",(req,res)=>res.json({success:true,network:{chainId:state.chainId,latestHeight:state.blocks.at(-1).height,totalBlocks:state.blocks.length,consensus:"Proof-of-Reputation"}}));
app.get("/api/address/:address",(req,res)=>{
  const a=req.params.address;if(!validAddress(a))return res.status(400).json({success:false,error:"Invalid TMR address"});
  const ac=account(a);
  res.json({success:true,address:a,balance:ac.balance,nonce:ac.nonce,transactions:confirmedTransactions(a).reverse()});
});
app.get("/api/transactions/:hash",(req,res)=>{
  for(const b of state.blocks){const t=(b.transactions||[]).find(x=>x.hash===req.params.hash);if(t)return res.json({success:true,transaction:t,block:b})}
  const p=state.mempool.find(x=>x.hash===req.params.hash);if(p)return res.json({success:true,transaction:p});
  res.status(404).json({success:false,error:"Transaction not found"});
});
app.post("/api/transactions",(req,res)=>{
  try{const tx=addTransaction(req.body);res.status(201).json({success:true,hash:tx.hash,status:"pending",transaction:tx})}
  catch(e){res.status(400).json({success:false,error:e.message})}
});
app.post("/api/blocks/finalize",(req,res)=>{
  // For production, replace this local finalizer with the real PoR validator voting/finalization engine.
  const block=finalizePending();if(!block)return res.status(409).json({success:false,error:"Mempool empty"});
  res.status(201).json({success:true,block});
});
app.get("/api/blocks",(req,res)=>res.json({success:true,total:state.blocks.length,blocks:state.blocks}));
app.listen(PORT,()=>console.log(`TMR Blockchain real wallet API listening on ${PORT}`));
