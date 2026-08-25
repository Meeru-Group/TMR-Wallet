const $ = id => document.getElementById(id);
const STORAGE = "tmr_wallet_v2";

const hex = bytes => [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
const bytes = h => new Uint8Array(h.match(/.{2}/g).map(x=>parseInt(x,16)));

async function sha256(data){
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function short(a){ return a ? a.slice(0,10)+"…"+a.slice(-8) : "TMR1…"; }

async function addressFromPublicKey(publicKeyRaw){
  const h = await sha256(publicKeyRaw);
  return "TMR1" + hex(h).slice(0,40);
}

async function createWallet(){
  if(!crypto?.subtle?.generateKey) throw new Error("Secure Web Crypto is unavailable.");
  let keys;
  try{
    keys = await crypto.subtle.generateKey({name:"Ed25519"}, true, ["sign","verify"]);
  }catch(e){
    throw new Error("This browser does not support native Ed25519. Use a current Chrome/Edge/Firefox.");
  }
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  return {
    version:2, network:"TMR", curve:"Ed25519",
    address: await addressFromPublicKey(pub),
    publicKey: hex(pub),
    privateKeyPkcs8: hex(priv),
    createdAt:new Date().toISOString()
  };
}

function save(w){ localStorage.setItem(STORAGE, JSON.stringify(w)); }
function current(){ try{return JSON.parse(localStorage.getItem(STORAGE)||"null")}catch{return null} }

function show(w){
  $("walletCard").classList.remove("hidden");
  $("address").textContent=w.address;
  $("shortAddress").textContent=short(w.address);
  $("publicKey").textContent=w.publicKey;
}

async function api(path, opts={}){
  const base=$("apiBase").value.trim().replace(/\/+$/,"");
  const r=await fetch(base+path,{...opts,headers:{"Accept":"application/json",...(opts.headers||{})}});
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{throw new Error("API returned non-JSON ("+r.status+")")}
  if(!r.ok) throw new Error(data.error||data.message||("HTTP "+r.status));
  return data;
}

async function connect(){
  $("connection").textContent="● Connecting…";
  $("connection").className="pill offline";
  try{
    const h=await api("/api/health");
    const n=await api("/api/network");
    const net=n.network||n;
    $("connection").textContent="● Online";
    $("connection").className="pill online";
    $("chainId").textContent=net.chainId||"TMR";
    $("height").textContent=net.latestBlockNumber??net.height??"—";
    $("validators").textContent=(net.activeValidators??"—")+" active";
    $("consensus").textContent=net.consensus||"Proof-of-Reputation";
    $("apiMessage").textContent="Connected: "+(h.blockchain||"TMR Blockchain")+" • PostgreSQL persistent API";
    const w=current(); if(w) await loadAddress(w);
  }catch(e){
    $("connection").textContent="● Offline";
    $("connection").className="pill offline";
    $("apiMessage").textContent="Connection failed: "+e.message;
  }
}

async function loadAddress(w){
  try{
    const d=await api("/api/address/"+encodeURIComponent(w.address));
    const balance=d.balance??0;
    $("balance").textContent=String(balance)+" TMR";
    $("balanceMeta").textContent=(d.transactionCount??0)+" transactions for this address";
    renderTx(d.transactions||[]);
  }catch(e){
    $("balance").textContent="0 TMR";
    $("balanceMeta").textContent="Address is not yet present on-chain";
    renderTx([]);
  }
}

function renderTx(list){
  const box=$("transactions");
  if(!list.length){box.textContent="No transactions for this address yet.";return}
  box.innerHTML=list.map(t=>`<div class="tx"><div><b>${escapeHtml(t.hash||"—")}</b><div class="muted">${escapeHtml(t.from||"—")} → ${escapeHtml(t.to||"—")}</div></div><div><b>${escapeHtml(t.amount||"0")} TMR</b><div class="muted">${escapeHtml(t.status||"—")}</div></div></div>`).join("");
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

$("create").onclick=async()=>{
  try{
    const w=await createWallet();
    save(w); show(w);
    $("message").textContent="Wallet created. Back up the encrypted/private-key material before changing devices.";
    await connect();
  }catch(e){$("message").textContent=e.message}
};

$("copyAddress").onclick=async()=>{
  const a=current()?.address;
  if(a){await navigator.clipboard.writeText(a);$("message").textContent="Address copied."}
};

$("refresh").onclick=connect;
$("connect").onclick=connect;
$("loadTx").onclick=async()=>{const w=current(); if(w) await loadAddress(w)};

$("delete").onclick=()=>{
  if(confirm("Delete this wallet from this browser? Make sure you have a secure backup first.")){
    localStorage.removeItem(STORAGE);
    $("walletCard").classList.add("hidden");
    $("message").textContent="Wallet deleted locally.";
  }
};

/*
  Backup contains the PKCS#8 private key material. It is NOT encrypted in
  this first standalone build. Do not upload the backup to GitHub or cloud
  storage. Password-encrypted backup is the next hardening step.
*/
$("backup").onclick=()=>{
  const w=current(); if(!w)return;
  const blob=new Blob([JSON.stringify(w,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="tmr-wallet-backup.json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

$("backupFile").onchange=async(e)=>{
  try{
    const f=e.target.files[0]; if(!f)return;
    const w=JSON.parse(await f.text());
    if(w.network!=="TMR"||w.curve!=="Ed25519"||!w.address||!w.publicKey||!w.privateKeyPkcs8) throw new Error("Invalid TMR wallet backup.");
    save(w); show(w); $("message").textContent="Wallet restored locally."; await connect();
  }catch(err){$("message").textContent="Restore failed: "+err.message}
};

const w=current(); if(w){show(w);connect()} else {connect();}
