// Beauty Chic / Cloudflare Worker Codespaces webhook.
// SOURCE-ONLY: no deploy, no GitHub Actions, no arbitrary commands.
export const SETTINGS = Object.freeze({
  repositoryId: 1293587013,
  repositoryName: 'claudiomarino002/beautify-your-shop',
  ownerId: 301307069,
  ownerLogin: 'claudiomarino002',
  issueNumber: 82,
  codespace: 'organic-rotary-phone-wvv5gpj47xjg3g6q7',
  maxPayloadBytes: 256 * 1024,
  maxRequestAgeMs: 5 * 60 * 1000,
  maxFutureSkewMs: 2 * 60 * 1000,
});
const encoder = new TextEncoder();
function reply(status, text = 'OK') {
  return new Response(text, {status, headers: {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
}
function bytesFromHex(hex) {
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return null;
  const out=new Uint8Array(32);
  for(let i=0;i<32;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}
export async function verifyGitHubSignature(rawBytes, signatureHeader, secret) {
  if(typeof secret!=='string'||secret.length<24)return false;
  if(typeof signatureHeader!=='string'||!signatureHeader.startsWith('sha256='))return false;
  const signatureBytes=bytesFromHex(signatureHeader.slice(7));
  if(!signatureBytes)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,signatureBytes,rawBytes);
}
export function validateEvent(event, nowMs=Date.now()) {
  if(!event||event.action!=='created')return null;
  if(event.repository?.id!==SETTINGS.repositoryId||event.repository?.full_name!==SETTINGS.repositoryName||event.repository?.private!==true)return null;
  if(event.issue?.number!==SETTINGS.issueNumber||!event.issue?.pull_request||event.issue?.state!=='open')return null;
  if(event.sender?.id!==SETTINGS.ownerId||event.sender?.login!==SETTINGS.ownerLogin)return null;
  if(event.comment?.user?.id!==SETTINGS.ownerId||event.comment?.user?.login!==SETTINGS.ownerLogin)return null;
  if(typeof event.comment?.body!=='string'||event.comment.body.length>80)return null;
  const commands={BC_CODESPACE_PING_V1:'ping',BC_CODESPACE_START_V1:'start',BC_CODESPACE_STOP_V1:'stop'};
  const op=Object.hasOwn(commands,event.comment.body)?commands[event.comment.body]:null;
  if(!op)return null;
  const created=Date.parse(event.comment?.created_at??'');
  if(!Number.isFinite(created)||nowMs-created>SETTINGS.maxRequestAgeMs||created-nowMs>SETTINGS.maxFutureSkewMs)return null;
  if(!Number.isSafeInteger(event.comment.id)||event.comment.id<=0)return null;
  return op;
}
export default {
  async fetch(request,env) {
    if(request.method==='GET'&&new URL(request.url).pathname==='/health')return reply(200,'BC_CONTROLLER_AVAILABLE (no lifecycle request)');
    if(request.method!=='POST'||new URL(request.url).pathname!=='/github-webhook')return reply(404,'Not found');
    if(request.headers.get('x-github-event')!=='issue_comment')return reply(202,'Ignored event');
    const n=Number(request.headers.get('content-length')||0);
    if(n>SETTINGS.maxPayloadBytes)return reply(413,'Payload too large');
    const rawBytes=new Uint8Array(await request.arrayBuffer());
    if(rawBytes.byteLength>SETTINGS.maxPayloadBytes)return reply(413,'Payload too large');
    if(!(await verifyGitHubSignature(rawBytes,request.headers.get('x-hub-signature-256'),env.GITHUB_WEBHOOK_SECRET)))return reply(403,'Invalid signature');
    let event;
    try{event=JSON.parse(new TextDecoder().decode(rawBytes))}catch{return reply(400,'Invalid JSON')}
    const operation=validateEvent(event);
    if(!operation)return reply(202,'Ignored request');
    if(operation==='ping')return reply(200,'BC_SIGNED_WEBHOOK_PING_PASS');
    if(typeof env.GITHUB_CODESPACE_TOKEN!=='string'||env.GITHUB_CODESPACE_TOKEN.length<20)return reply(503,'Lifecycle token not configured');
    const url='https://api.github.com/user/codespaces/'+SETTINGS.codespace+'/'+operation;
    let result;
    try {
      result=await fetch(url,{method:'POST',redirect:'manual',headers:{
        Authorization:'Bearer '+env.GITHUB_CODESPACE_TOKEN,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'bc-codespace-lifecycle/1.0'
      }});
    }catch{return reply(502,'GitHub lifecycle API unavailable')}
    if([200,202,204,304].includes(result.status))return reply(200,'BC_CODESPACE_'+operation.toUpperCase()+'_ACCEPTED');
    return reply(502,'GitHub lifecycle request failed (HTTP '+result.status+')');
  }
};
