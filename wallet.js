const $=id=>document.getElementById(id);
const STORE="tmr_wallet_v6";
const API=(localStorage.getItem("tmr_api")||"https://tmr-blockchain.vercel.app").replace(/\/+$/,"");
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const bytes=h=>new Uint8Array((h.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function sha(b){return new Uint8Array(await crypto.subtle.digest("SHA-256",b))}
function get(){try{return JSON.parse(localStorage.getItem(STORE)||"null")}catch{return null}}
function save(w){localStorage.setItem(STORE,JSON.stringify(w))}
function valid(a){return /^TMR1[0-9a-fA-F]{40}$/.test(a)}
async function makeWallet(){
 const k=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
 const pub=new Uint8Array(await crypto.subtle.exportKey("raw",k.publicKey));
 const priv=new Uint8Array(await crypto.subtle.exportKey("pkcs8",k.privateKey));
 const d=await sha(pub);
 return {version:6,network:"TMR",curve:"Ed25519",address:"TMR1"+hex(d).slice(0,40),publicKey:hex(pub),privateKeyPkcs8:hex(priv),createdAt:new Date().toISOString()};
}
async function api(path,opt={}){const r=await fetch(API+path,{...opt,cache:"no-store",headers:{"Accept":"application/json",...(opt.headers||{})}});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error("API returned non-JSON ("+r.status+")")}if(!r.ok)throw Error(d.error||d.message||"HTTP "+r.status);return d}
function show(w){$("address").textContent=w.address;$("receiveAddress").textContent=w.address;$("fullAddress").textContent=w.address;$("publicKey").textContent=w.publicKey;$("walletPanel").classList.remove("hidden")}
function txs(xs){if(!xs?.length){$("activity").textContent="No transactions yet.";return}$("activity").innerHTML=xs.map(t=>`<div class="tx"><b>${esc(t.hash||"—")}</b><div class="muted">${esc(t.from||"—")} → ${esc(t.to||"—")} • ${esc(t.amount??0)} TMR • ${esc(t.status||"")}</div></div>`).join("")}
async function refresh(){
 try{
  const h=await api("/api/health");$("networkDot").style.color="#22c55e";$("networkText").textContent="TMR Blockchain • Online";$("consensus").textContent=h.consensus||"PoR";
  const n=await api("/api/network");const nn=n.network||n;$("height").textContent=nn.latestHeight??"—";$("blocks").textContent=nn.totalBlocks??nn.count??"—";$("chainId").textContent=nn.chainId||"";
  const w=get();if(!w)return;
  const a=await api("/api/address/"+encodeURIComponent(w.address));$("balance").innerHTML=esc(a.balance??0)+' <span>TMR</span>';$("nonce").textContent=a.nonce??0;txs(a.transactions||[]);
 }catch(e){$("networkDot").style.color="#ef4444";$("networkText").textContent="TMR Blockchain • Offline";$("message").textContent=e.message}
}
$("walletBtn").onclick=()=>{const w=get();if(w)show(w);else $("message").textContent="Create a wallet first."};
$("sendBtn").onclick=()=>{if(!get())return $("message").textContent="Create or restore a wallet first.";$("sendPanel").classList.remove("hidden")};
$("receiveBtn").onclick=()=>{if(!get())return $("message").textContent="Create or restore a wallet first.";$("receivePanel").classList.remove("hidden")};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.add("hidden"));
$("create").onclick=async()=>{try{const w=await makeWallet();save(w);show(w);$("message").textContent="Wallet created. Your private key stays local.";refresh()}catch(e){$("message").textContent=e.message}};
$("copyAddress").onclick=$("copyReceive").onclick=async()=>{const w=get();if(!w)return;await navigator.clipboard.writeText(w.address);$("message").textContent="TMR address copied."};
$("refresh").onclick=refresh;
$("backup").onclick=()=>{const w=get();if(!w)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(w,null,2)],{type:"application/json"}));a.download="tmr-wallet-backup.json";a.click()};
$("deleteWallet").onclick=()=>{if(confirm("Delete this wallet from this browser? Backup first.")){localStorage.removeItem(STORE);location.reload()}};
$("restore").onchange=async e=>{try{const w=JSON.parse(await e.target.files[0].text());if(w.network!=="TMR"||w.curve!=="Ed25519"||!valid(w.address)||!w.publicKey||!w.privateKeyPkcs8)throw Error("Invalid TMR wallet backup");save(w);show(w);await refresh();$("message").textContent="Wallet restored."}catch(x){$("message").textContent="Restore failed: "+x.message}};
$("signSend").onclick=async()=>{
 const w=get(),to=$("to").value.trim(),amount=Number($("amount").value);
 if(!w)return;$("sendStatus").textContent="";
 if(!valid(to))return $("sendStatus").textContent="Invalid TMR1 recipient address.";
 if(!Number.isSafeInteger(amount)||amount<=0)return $("sendStatus").textContent="Amount must be a positive whole TMR.";
 $("signSend").disabled=true;
 try{
  const a=await api("/api/address/"+encodeURIComponent(w.address));const nonce=Number(a.nonce??0);
  const tx={version:1,network:"TMR",from:w.address,to,amount,nonce,publicKey:w.publicKey};
  const key=await crypto.subtle.importKey("pkcs8",bytes(w.privateKeyPkcs8),{name:"Ed25519"},false,["sign"]);
  const signature=await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(JSON.stringify(tx)));
  tx.signature=hex(signature);
  const r=await api("/api/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tx)});
  $("sendStatus").textContent="Signed transaction accepted: "+(r.hash||r.transaction?.hash||"pending");
  await refresh();
 }catch(e){$("sendStatus").textContent="Broadcast failed: "+e.message}finally{$("signSend").disabled=false}
};
const w=get();if(w)show(w);refresh();
