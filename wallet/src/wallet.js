const $=id=>document.getElementById(id);
const STORE="tmr_wallet_real_v2";
const API=(localStorage.getItem("tmr_api")||"http://localhost:3000").replace(/\/+$/,"");

const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
const fromHex=h=>new Uint8Array(h.match(/.{2}/g).map(x=>parseInt(x,16)));

async function sha256(b){return new Uint8Array(await crypto.subtle.digest("SHA-256",b))}
async function makeWallet(){
  const keys=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
  const pub=new Uint8Array(await crypto.subtle.exportKey("raw",keys.publicKey));
  const priv=new Uint8Array(await crypto.subtle.exportKey("pkcs8",keys.privateKey));
  const digest=await sha256(pub);
  return {version:5,network:"TMR",curve:"Ed25519",address:"TMR1"+hex(digest).slice(0,40),publicKey:hex(pub),privateKeyPkcs8:hex(priv),createdAt:new Date().toISOString()};
}
function get(){try{return JSON.parse(localStorage.getItem(STORE)||"null")}catch{return null}}
function save(w){localStorage.setItem(STORE,JSON.stringify(w))}
function show(w){$("walletCard").classList.remove("hidden");$("address").textContent=w.address;$("receiveAddress").textContent=w.address;$("fullAddress").textContent=w.address;$("publicKey").textContent=w.publicKey}
async function api(path,options={}){const r=await fetch(API+path,{...options,cache:"no-store",headers:{"Accept":"application/json",...(options.headers||{})}});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error("API returned non-JSON ("+r.status+")")};if(!r.ok)throw Error(d.error||d.message||("HTTP "+r.status));return d}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function renderTx(xs){if(!Array.isArray(xs)||!xs.length){$("activity").textContent="No transactions yet.";return}$("activity").innerHTML=xs.map(x=>`<div class="tx"><b>${esc(x.hash||"—")}</b><div class="muted">${esc(x.from||"—")} → ${esc(x.to||"—")} • ${esc(x.amount??0)} TMR • ${esc(x.status||"—")}</div></div>`).join("")}

async function refresh(){
  try{
    await api("/api/health"); $("status").textContent="● Online";$("status").style.color="#22c55e";$("networkText").textContent="TMR Blockchain • Connected";
    const w=get();if(!w)return;
    const d=await api("/api/address/"+encodeURIComponent(w.address));
    $("balance").textContent=String(d.balance??0)+" TMR";renderTx(d.transactions||[]);
  }catch(e){$("status").textContent="● Offline";$("status").style.color="#ef4444";$("networkText").textContent=e.message}
}

$("create").onclick=async()=>{try{const w=await makeWallet();save(w);show(w);$("msg").textContent="Real TMR wallet created locally.";await refresh()}catch(e){$("msg").textContent=e.message}};
$("copy").onclick=$("copyReceive").onclick=async()=>{const w=get();if(!w)return;await navigator.clipboard.writeText(w.address);$("msg").textContent="TMR address copied."};
$("receive").onclick=()=>{const w=get();if(!w)return alert("Create wallet first.");$("receivePanel").classList.remove("hidden");$("receiveAddress").textContent=w.address};
$("closeReceive").onclick=()=>$("receivePanel").classList.add("hidden");
$("send").onclick=()=>{$("sendPanel").classList.remove("hidden");$("sendMsg").textContent=""};
$("closeSend").onclick=()=>$("sendPanel").classList.add("hidden");

$("sendConfirm").onclick=async()=>{
  const w=get(),to=$("recipient").value.trim(),amount=Number($("amount").value);
  if(!w)return;
  if(!/^TMR1[0-9a-fA-F]{40}$/.test(to))return $("sendMsg").textContent="Invalid TMR1 address.";
  if(!Number.isSafeInteger(amount)||amount<=0)return $("sendMsg").textContent="Amount must be a positive whole TMR.";
  $("sendConfirm").disabled=true;$("sendMsg").textContent="Signing locally…";
  try{
    const publicKey=await crypto.subtle.importKey("raw",fromHex(w.publicKey),{name:"Ed25519"},true,["verify"]);
    const privateKey=await crypto.subtle.importKey("pkcs8",fromHex(w.privateKeyPkcs8),{name:"Ed25519"},false,["sign"]);
    const account=await api("/api/address/"+encodeURIComponent(w.address));
    const nonce=Number(account.nonce??0);
    const tx={version:1,network:"TMR",from:w.address,to,amount,nonce,publicKey:w.publicKey};
    const canonical=JSON.stringify(tx);
    const signature=await crypto.subtle.sign("Ed25519",privateKey,new TextEncoder().encode(canonical));
    tx.signature=hex(new Uint8Array(signature));
    $("sendMsg").textContent="Broadcasting signed transaction…";
    const result=await api("/api/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tx)});
    $("sendMsg").textContent="Accepted: "+(result.hash||result.transaction?.hash||"transaction");
    await refresh();
  }catch(e){$("sendMsg").textContent="Send failed: "+e.message}
  finally{$("sendConfirm").disabled=false}
};

$("refresh").onclick=refresh;
$("backup").onclick=()=>{const w=get();if(!w)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(w,null,2)],{type:"application/json"}));a.download="tmr-wallet-backup.json";a.click()};
$("delete").onclick=()=>{if(confirm("Delete local wallet? Backup first.")){localStorage.removeItem(STORE);location.reload()}};
$("restoreFile").onchange=async e=>{try{const w=JSON.parse(await e.target.files[0].text());if(w.network!=="TMR"||w.curve!=="Ed25519"||!w.address||!w.publicKey||!w.privateKeyPkcs8)throw Error("Invalid TMR backup");save(w);show(w);await refresh();$("msg").textContent="Wallet restored."}catch(x){$("msg").textContent="Restore failed: "+x.message}};
const w=get();if(w)show(w);refresh();
