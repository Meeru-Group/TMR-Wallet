const $=id=>document.getElementById(id);
const STORE="tmr_wallet_v3";
const API=(localStorage.getItem("tmr_api")||"https://tmr-blockchain.vercel.app").replace(/\/+$/,"");

const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(b){return new Uint8Array(await crypto.subtle.digest("SHA-256",b))}
async function create(){
  const k=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
  const pub=new Uint8Array(await crypto.subtle.exportKey("raw",k.publicKey));
  const priv=new Uint8Array(await crypto.subtle.exportKey("pkcs8",k.privateKey));
  const h=await hash(pub);
  return {version:3,network:"TMR",curve:"Ed25519",address:"TMR1"+hex(h).slice(0,40),publicKey:hex(pub),privateKeyPkcs8:hex(priv),createdAt:new Date().toISOString()};
}
function save(w){localStorage.setItem(STORE,JSON.stringify(w))}
function get(){try{return JSON.parse(localStorage.getItem(STORE)||"null")}catch{return null}}
function show(w){$("walletCard").classList.remove("hidden");$("address").textContent=w.address;$("fullAddress").textContent=w.address;$("publicKey").textContent=w.publicKey}
async function api(path){const r=await fetch(API+path,{cache:"no-store",headers:{Accept:"application/json"}});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error("API JSON error "+r.status)}if(!r.ok)throw Error(d.error||d.message||"HTTP "+r.status);return d}
function renderTx(xs){$("activity").innerHTML=xs.length?xs.map(x=>`<div class="tx"><b>${esc(x.hash||x.txHash||"—")}</b><div class="muted">${esc(x.from||x.sender||"—")} → ${esc(x.to||x.receiver||"—")} • ${esc(x.amount??x.value??0)} TMR</div></div>`).join(""):"No transactions for this wallet yet."}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function connect(){
  try{
    const n=await api("/api/network"); const net=n.network||n;
    $("dot").style.color="#22c55e";$("networkText").textContent="Online";
    const w=get(); if(!w)return;
    try{
      const d=await api("/api/address/"+encodeURIComponent(w.address));
      $("balance").textContent=(d.balance??0)+" TMR";
      renderTx(Array.isArray(d.transactions)?d.transactions:[]);
    }catch{ $("balance").textContent="0.0000 TMR";renderTx([])}
  }catch(e){$("dot").style.color="#ef4444";$("networkText").textContent="Offline"}
}
$("create").onclick=async()=>{try{const w=await create();save(w);show(w);$("msg").textContent="TMR wallet created locally.";connect()}catch(e){$("msg").textContent=e.message}};
$("copy").onclick=async()=>{const w=get();if(w){await navigator.clipboard.writeText(w.address);$("msg").textContent="Address copied."}};
$("refresh").onclick=connect;
$("receive").onclick=()=>{const w=get();if(w){alert("Your TMR address:\\n\\n"+w.address)}else alert("Create a wallet first.")};
$("send").onclick=()=>alert("Send will be enabled after the TMR Blockchain has a signed-transaction verification endpoint.");
$("backup").onclick=()=>{const w=get();if(!w)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(w,null,2)],{type:"application/json"}));a.download="tmr-wallet-backup.json";a.click()};
$("delete").onclick=()=>{if(confirm("Delete wallet from this browser? Backup first.")){localStorage.removeItem(STORE);location.reload()}};
$("restoreFile").onchange=async e=>{try{const w=JSON.parse(await e.target.files[0].text());if(w.network!=="TMR"||!w.address||!w.privateKeyPkcs8)throw Error("Invalid backup");save(w);show(w);connect();$("msg").textContent="Wallet restored."}catch(x){$("msg").textContent=x.message}}};
const w=get();if(w)show(w);connect();