"use strict";
const API_BASE=window.location.origin;
const NETWORK="TMR-CHAIN-1";
const ADDRESS_RE=/^TMR1[a-z2-7]{32}$/;
const STORE="tmr_wallet_testnet_v2";
const $=id=>document.getElementById(id);
let wallet=null;
function b64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s)}
function unb64(s){const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0))}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}
const base32=bytes=>{const a="abcdefghijklmnopqrstuvwxyz234567";let bits=0,v=0,o="";for(const byte of bytes){v=(v<<8)|byte;bits+=8;while(bits>=5){o+=a[(v>>>(bits-5))&31];bits-=5}}if(bits>0)o+=a[(v<<(5-bits))&31];return o};
async function sha(x){return new Uint8Array(await crypto.subtle.digest("SHA-256",x))}
async function addressFromPub(pub){const d=await sha(pub);return "TMR1"+base32(d.slice(0,20))}
function save(w){localStorage.setItem(STORE,JSON.stringify(w))}
function load(){try{return JSON.parse(localStorage.getItem(STORE)||"null")}catch{return null}}
function msg(id,t,ok=false){$(id).textContent=t;$(id).style.color=ok?"#86efac":"#9eb2d3"}
function canonical(tx){return JSON.stringify({from:tx.from,to:tx.to,amount:String(tx.amount),nonce:Number(tx.nonce),data:tx.data??null})}
async function create(){try{const kp=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);const pub=new Uint8Array(await crypto.subtle.exportKey("raw",kp.publicKey));const pkcs8=new Uint8Array(await crypto.subtle.exportKey("pkcs8",kp.privateKey));const w={network:NETWORK,address:await addressFromPub(pub),publicKey:b64(pub),privateKey:b64(pkcs8),createdAt:new Date().toISOString()};save(w);wallet=w;show();await refresh()}catch(e){msg("welcomeMsg",e.message)}}
async function encryptBackup(){if(!wallet)return;const pass=prompt("Create backup password (12+ characters):");if(!pass||pass.length<12)throw Error("Backup password must be at least 12 characters");const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt"]);const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,unb64(wallet.privateKey)));const backup={format:"TMR-WALLET-BACKUP",version:2,network:NETWORK,address:wallet.address,publicKey:wallet.publicKey,kdf:"PBKDF2-SHA256",iterations:250000,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),ciphertext:b64(ct)};download(JSON.stringify(backup,null,2),wallet.address+"-backup.json","application/json")}
async function restore(file){const x=JSON.parse(await file.text());if(x.format!=="TMR-WALLET-BACKUP"||x.network!==NETWORK)throw Error("Invalid TMR testnet backup");const pass=prompt("Backup password:");if(!pass)throw Error("Backup password required");const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:unb64(x.salt),iterations:x.iterations,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);const pkcs8=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(x.iv)},key,unb64(x.ciphertext));const priv=await crypto.subtle.importKey("pkcs8",pkcs8,{name:"Ed25519"},true,["sign"]);const pub=unb64(x.publicKey);const address=await addressFromPub(pub);if(address!==x.address)throw Error("Backup address mismatch");wallet={network:NETWORK,address,publicKey:x.publicKey,privateKey:b64(new Uint8Array(pkcs8)),createdAt:new Date().toISOString()};save(wallet);show();await refresh()}
function download(text,name,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function show(){$("welcome").classList.add("hidden");$("dashboard").classList.remove("hidden");$("address").textContent=wallet.address;$("fullAddress").textContent=wallet.address;$("receiveAddress").textContent=wallet.address;$("publicKey").textContent=wallet.publicKey}
async function api(path,opt={}){const r=await fetch(API_BASE+path,{...opt,cache:"no-store",headers:{Accept:"application/json",...(opt.headers||{})}});const text=await r.text();let d={};try{d=JSON.parse(text)}catch{}if(!r.ok)throw Error(d.error||`API ${r.status}`);return d}
let refreshBusy=false;
async function refresh(){
  if(refreshBusy)return;
  refreshBusy=true;
  try{
    // Testnet block finalization is request-driven on Vercel. Trigger the
    // producer first, then read the confirmed PostgreSQL state.
    if(wallet){
      try{
        await api("/api/blocks/produce-testnet",{method:"POST"});
      }catch(_e){}
    }
    const [h,n,c]=await Promise.all([api("/api/health"),api("/api/network"),api("/api/coin")]);$("dot").style.color="#54e38e";$("networkText").textContent=`${c.network.toUpperCase()} • Online`;$('chainText').textContent=c.chainId;$("consensus").textContent=c.consensus;$("height").textContent=n.network?.height??n.height??"—";$("txCount").textContent=n.network?.totalTransactions??n.totalTransactions??"—";$("validators").textContent=n.network?.totalValidators??n.totalValidators??"—";if(wallet){const a=await api("/api/address/"+encodeURIComponent(wallet.address));$("balance").textContent=a.balance??0;$("nonce").textContent=`Nonce ${a.nextNonce??0}`;$("balanceStatus").textContent="Connected • Real blockchain balance";renderTx(a.transactions||[])}}catch(e){$("dot").style.color="#ef4444";$("networkText").textContent="Blockchain Offline";if(wallet)$("balanceStatus").textContent=e.message}
  finally{refreshBusy=false}
}
function renderTx(xs){if(!xs.length){$("activity").textContent="No transactions yet.";return}$("activity").innerHTML=xs.slice(0,8).map(t=>`<div class="tx"><b>${t.from===wallet.address?"Sent":"Received"} ${t.amount} TMR</b><span>${t.status} • block ${t.blockHeight??"pending"}</span><code>${t.hash}</code></div>`).join("");document.querySelectorAll(".tx").forEach(x=>x.style.cssText="padding:12px 0;border-bottom:1px solid #202d43;font-size:11px");document.querySelectorAll(".tx b,.tx span,.tx code").forEach((x,i)=>{x.style.display="block";x.style.marginTop=i%3===0?"0":"4px";x.style.color=i%3===0?"#e9effc":"#72809a";x.style.fontFamily=i%3===2?"ui-monospace,monospace":"inherit";x.style.wordBreak="break-all"})}
async function send(){if(!wallet)return;const to=$("recipient").value.trim(),amount=Number($("amount").value);if(!ADDRESS_RE.test(to))return msg("sendMsg","Invalid TMR1 address. Expected TMR1 + 32 lowercase base32 characters.");if(!Number.isSafeInteger(amount)||amount<=0)return msg("sendMsg","Enter a positive whole TMR amount");$("sendButton").disabled=true;msg("sendMsg","Signing locally…");try{const a=await api("/api/address/"+encodeURIComponent(wallet.address));const tx={from:wallet.address,to,amount:String(amount),nonce:Number(a.nextNonce||0),data:null};const key=await crypto.subtle.importKey("pkcs8",unb64(wallet.privateKey),{name:"Ed25519"},false,["sign"]);const sig=new Uint8Array(await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(canonical(tx))));const r=await api("/api/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...tx,publicKey:wallet.publicKey,signature:b64(sig)})});msg("sendMsg",`Accepted: ${r.transaction?.hash||"pending"}`,true);await refresh()}catch(e){msg("sendMsg","Broadcast failed: "+e.message)}finally{$("sendButton").disabled=false}}
async function faucet(){if(!wallet)return;$("claimFaucet").disabled=true;msg("faucetMsg","Creating real testnet faucet transaction…");try{const r=await api("/api/faucet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address:wallet.address})});msg("faucetMsg",`${r.message}. TX: ${r.transaction?.hash||"pending"}`,true);await refresh()}catch(e){msg("faucetMsg",e.message)}finally{$("claimFaucet").disabled=false}}
$("createWallet").onclick=create;$("restoreWallet").onclick=()=>$("backupFile").click();$("backupFile").onchange=e=>e.target.files[0]&&restore(e.target.files[0]).catch(x=>msg("welcomeMsg",x.message));$("refreshTop").onclick=$("refresh").onclick=refresh;$("sendBtn").onclick=()=>$("sendPanel").classList.remove("hidden");$("receiveBtn").onclick=()=>$("receivePanel").classList.remove("hidden");$("faucetBtn").onclick=()=>$("faucetPanel").classList.remove("hidden");document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.add("hidden"));$("sendButton").onclick=send;$("claimFaucet").onclick=faucet;setInterval(()=>{if(wallet)refresh()},5000);$("copyAddress").onclick=$("address").onclick=$("copyReceive").onclick=async()=>{if(wallet){await navigator.clipboard.writeText(wallet.address);alert("TMR address copied")}};$("exportBackup").onclick=()=>encryptBackup().catch(e=>alert(e.message));$("forgetWallet").onclick=()=>{if(confirm("Delete this wallet from this browser? Backup first.")){localStorage.removeItem(STORE);location.reload()}};

let crossConfig=null;
let lastCrossQuote=null;
let evmAccount=null;
async function crosschainConfig(){crossConfig=await api("/api/crosschain/config");return crossConfig}
function crossLabel(id){if(id==="TMR-CHAIN-1")return "TMR Testnet"; if(crossConfig?.bridge?.evmChainId && String(id)===String(crossConfig.bridge.evmChainId))return "EVM Bridge Testnet ("+id+")"; return ({"1":"Ethereum","8453":"Base","42161":"Arbitrum","137":"Polygon"}[id]||id)}
function isValidTmr(x){return /^TMR1[a-z2-7]{32}$/.test(String(x||""))}
function isEvm(x){return /^0x[a-fA-F0-9]{40}$/.test(String(x||""))}
function bridgeActionText(q){return q.originChain==="TMR-CHAIN-1"?"Execute TMR Lock":"Execute EVM Burn"}
async function connectEvm(){
  if(!window.ethereum)return msg("crossMsg","Install/open an EVM wallet such as MetaMask to use EVM → TMR.");
  try{
    const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
    evmAccount=accounts[0];
    $("connectEvm").textContent="EVM: "+evmAccount.slice(0,6)+"…"+evmAccount.slice(-4);
    msg("crossMsg","EVM wallet connected.",true);
  }catch(e){msg("crossMsg",e.message||"EVM wallet connection failed")}
}
async function ensureEvmNetwork(){
  const chainId=Number(crossConfig?.bridge?.evmChainId||0); if(!chainId)throw Error("EVM bridge chain is not configured");
  const hex="0x"+chainId.toString(16);
  const current=await window.ethereum.request({method:"eth_chainId"});
  if(current.toLowerCase()===hex.toLowerCase())return;
  try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:hex}]})}
  catch(e){throw Error("Switch your EVM wallet to the bridge testnet (chain "+chainId+")")}
}
async function crosschainQuote(){
  if(!wallet)return;
  const from=$("crossFrom").value,to=$("crossTo").value,amount=$("crossAmount").value.trim(),destination=$("crossDestination").value.trim();
  if(!/^\d+$/.test(amount)||BigInt(amount)<=0n)return msg("crossMsg","Enter a positive whole TMR amount");
  if(from===to)return msg("crossMsg","Choose two different networks");
  if(from==="TMR-CHAIN-1"&&!isEvm(destination))return msg("crossMsg","TMR → EVM requires a valid 0x destination");
  if(to==="TMR-CHAIN-1"&&!isValidTmr(destination))return msg("crossMsg","EVM → TMR requires a valid TMR1 destination");
  try{
    if(to==="TMR-CHAIN-1" && !evmAccount) await connectEvm();
    if(to==="TMR-CHAIN-1" && !evmAccount)return;
    const originAddress=from==="TMR-CHAIN-1"?wallet.address:evmAccount;
    const body={originChain:from,destinationChain:to,sellToken:from==="TMR-CHAIN-1"?"TMR":(crossConfig?.bridge?.wrappedTmrAddress||"wTMR"),buyToken:to==="TMR-CHAIN-1"?"TMR":(crossConfig?.bridge?.wrappedTmrAddress||"wTMR"),sellAmount:amount,originAddress,destinationAddress:destination};
    $("crossQuote").disabled=true;msg("crossMsg","Creating real bridge order…");
    const r=await api("/api/crosschain/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    lastCrossQuote=r.quote||r; window.lastCrossQuoteId=lastCrossQuote.orderId;
    $("crossExecute").disabled=false;$("crossExecute").textContent=bridgeActionText(lastCrossQuote);
    $("crossResult").classList.remove("hidden");
    $("crossResult").innerHTML=`<b>REAL TESTNET BRIDGE</b><br>${crossLabel(from)} → ${crossLabel(to)}<br>Amount: ${amount} TMR<br>Status: ${lastCrossQuote.status}<br>Order ID: <code>${lastCrossQuote.orderId}</code><br>Provider: TMR Native Lock/Release Bridge`;
    msg("crossMsg",from==="TMR-CHAIN-1"?"Order created. Execute the signed TMR lock transaction.":"Order created. Execute the wTMR burn transaction.",true);
  }catch(e){msg("crossMsg",e.message)}finally{$("crossQuote").disabled=false}
}
async function executeTmrLock(){
  const q=lastCrossQuote;if(!q||q.originChain!=="TMR-CHAIN-1")return;
  const amount=String(q.sellAmount),a=await api("/api/address/"+encodeURIComponent(wallet.address));
  const data={type:"bridge_lock",orderId:q.orderId,originAddress:wallet.address,destinationChain:q.destinationChain,destinationAddress:q.destinationAddress,asset:"TMR"};
  const tx={from:wallet.address,to:crossConfig.bridge.vaultAddress,amount,nonce:Number(a.nextNonce||0),data};
  const key=await crypto.subtle.importKey("pkcs8",unb64(wallet.privateKey),{name:"Ed25519"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(canonical(tx))));
  const r=await api("/api/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...tx,publicKey:wallet.publicKey,signature:b64(sig)})});
  msg("crossMsg",`TMR locked on-chain. TX: ${r.transaction.hash}`,true);await pollCrossStatus();await refresh();
}
async function executeEvmBurn(){
  if(!window.ethereum)return msg("crossMsg","Connect an EVM wallet first");
  await ensureEvmNetwork();
  const q=lastCrossQuote;if(!q||q.destinationChain!=="TMR-CHAIN-1")return;
  const c=await api("/api/crosschain/evm-burn-calldata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:q.orderId,from:evmAccount,amount:q.sellAmount,tmrRecipient:q.destinationAddress})});
  const txHash=await window.ethereum.request({method:"eth_sendTransaction",params:[{from:evmAccount,to:c.contract,data:c.data,value:"0x0"}]});
  msg("crossMsg",`wTMR burn submitted. TX: ${txHash}`,true);await pollCrossStatus();
}
async function executeCrosschain(){
  try{if(!lastCrossQuote)return msg("crossMsg","Create a bridge order first");if(lastCrossQuote.originChain==="TMR-CHAIN-1")await executeTmrLock();else await executeEvmBurn();}
  catch(e){msg("crossMsg",e.message||"Bridge transaction failed")}
}
async function pollCrossStatus(){
  if(!window.lastCrossQuoteId)return;
  for(let i=0;i<8;i++){
    const r=await api("/api/crosschain/status?orderId="+encodeURIComponent(window.lastCrossQuoteId));const s=r.status||{};
    $("crossResult").innerHTML=`<b>REAL BRIDGE STATUS</b><br>${crossLabel(s.originChain)} → ${crossLabel(s.destinationChain)}<br>Status: ${s.status}<br>Order ID: <code>${s.orderId}</code>${s.tmrLockTxHash?`<br>TMR Lock: <code>${s.tmrLockTxHash}</code>`:""}${s.evmTxHash?`<br>EVM Mint/Burn: <code>${s.evmTxHash}</code>`:""}${s.tmrReleaseTxHash?`<br>TMR Release: <code>${s.tmrReleaseTxHash}</code>`:""}`;
    if(s.status==="COMPLETED")return msg("crossMsg","Cross-chain transfer completed on both testnets.",true);
    await new Promise(r=>setTimeout(r,5000));
  }
}
async function crosschainStatus(){try{await pollCrossStatus()}catch(e){msg("crossMsg",e.message)}}
async function initCrosschain(){try{const c=await crosschainConfig();$("crossStatus").textContent=c.bridge.relayerConfigured?"REAL BRIDGE":"CONFIG NEEDED";$("crossExecute").disabled=true;if(c.bridge.evmChainId){$("evmFrom").value=String(c.bridge.evmChainId);$("evmTo").value=String(c.bridge.evmChainId);$("evmFrom").textContent="EVM Bridge Testnet ("+c.bridge.evmChainId+")";$("evmTo").textContent="EVM Bridge Testnet ("+c.bridge.evmChainId+")";}}catch(e){$("crossStatus").textContent="OFFLINE"}}
$("crossQuote").onclick=crosschainQuote;$("crossExecute").onclick=executeCrosschain;$("crossRefresh").onclick=crosschainStatus;$("connectEvm").onclick=connectEvm;

async function testRpc(method, params=[]){
  const r=await fetch("/rpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method,params,id:1}),cache:"no-store"});
  const d=await r.json();
  if(d.error) throw Error(d.error.message||"RPC error");
  return d.result;
}
async function initRpc(){
  try{
    const chainId=await testRpc("tmr_chainId");
    const height=await testRpc("tmr_blockNumber");
    $("rpcStatus").textContent="ONLINE";
    $("rpcStatus").style.color="#86efac";
    $("rpcEndpoint").textContent=window.location.origin+"/rpc";
    $("rpcMsg").textContent=`RPC connected • ${chainId} • block ${height}`;
  }catch(e){
    $("rpcStatus").textContent="OFFLINE";
    $("rpcStatus").style.color="#ef4444";
    $("rpcMsg").textContent="RPC unavailable: "+e.message;
  }
}
$("rpcChainTest").onclick=async()=>{try{const x=await testRpc("tmr_chainId");msg("rpcMsg","Chain ID: "+x,true)}catch(e){msg("rpcMsg","RPC failed: "+e.message)}};
$("rpcBlockTest").onclick=async()=>{try{const x=await testRpc("tmr_blockNumber");msg("rpcMsg","Latest block: "+x,true)}catch(e){msg("rpcMsg","RPC failed: "+e.message)}};

wallet=load();if(wallet)show();refresh();initCrosschain();initRpc();
