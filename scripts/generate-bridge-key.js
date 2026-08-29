const crypto=require('node:crypto');
function b32(b){const a='abcdefghijklmnopqrstuvwxyz234567';let bits=0,v=0,o='';for(const x of b){v=(v<<8)|x;bits+=8;while(bits>=5){o+=a[(v>>>(bits-5))&31];bits-=5}}if(bits>0)o+=a[(v<<(5-bits))&31];return o}
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const raw=publicKey.export({format:'der',type:'spki'}).subarray(-32);
const addr='TMR1'+b32(crypto.createHash('sha256').update(raw).digest().subarray(0,20));
const pkcs8=privateKey.export({format:'der',type:'pkcs8'}).toString('hex');
console.log(JSON.stringify({tmrBridgeVaultAddress:addr,tmrBridgePrivateKeyPkcs8Hex:pkcs8,publicKeyBase64:raw.toString('base64')},null,2));
