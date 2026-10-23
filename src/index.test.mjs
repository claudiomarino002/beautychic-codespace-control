import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker,{SETTINGS,verifyGitHubSignature,validateEvent} from './index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const e=new TextEncoder();
const secret='a'.repeat(48);
function event(command='BC_CODESPACE_PING_V1',overrides={}){
return {action:'created',repository:{id:SETTINGS.repositoryId,full_name:SETTINGS.repositoryName,private:true},
issue:{number:82,state:'open',pull_request:{url:'https://api.github.com/x'}},
sender:{id:SETTINGS.ownerId,login:SETTINGS.ownerLogin},
comment:{id:123,created_at:new Date().toISOString(),user:{id:SETTINGS.ownerId,login:SETTINGS.ownerLogin},body:command},...overrides};
}
async function sign(obj){
const bytes=e.encode(JSON.stringify(obj));
const key=await crypto.subtle.importKey('raw',e.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const mac=Buffer.from(await crypto.subtle.sign('HMAC',key,bytes)).toString('hex');
return {bytes,header:'sha256='+mac};
}
async function deliver(obj,sig,badSecret=false){
const {bytes,header}=await sign(obj);
return worker.fetch(new Request('https://bc.example/github-webhook',{method:'POST',headers:{'x-github-event':'issue_comment','x-hub-signature-256':sig??header},body:bytes}),
{GITHUB_WEBHOOK_SECRET:badSecret?'b'.repeat(40):secret});
}
test('GitHub HMAC reference vector and changed body denial',async()=>{
const reference=e.encode('Hello, World!');
assert.equal(await verifyGitHubSignature(reference,'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',"It's a Secret to Everybody"),true);
assert.equal(await verifyGitHubSignature(e.encode('Hello, World?'),'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',"It's a Secret to Everybody"),false);
});
test('signed ping passes without API token',async()=>{const res=await deliver(event());assert.equal(res.status,200);assert.equal(await res.text(),'BC_SIGNED_WEBHOOK_PING_PASS')});
test('unsigned and malformed MAC rejected',async()=>{assert.equal((await deliver(event(),'sha256=aaaaaaaa')).status,403);assert.equal((await deliver(event(),null,true)).status,403)});
test('spoofed actor and repository denied',async()=>{for(const override of [{sender:{id:999,login:'evil'}},{repository:{id:SETTINGS.repositoryId,full_name:SETTINGS.repositoryName,private:false}},{issue:{number:1,state:'open',pull_request:{}}},{action:'edited'}])assert.equal(validateEvent(event('BC_CODESPACE_PING_V1',override)),null)});
test('command injection and unknown actions denied',()=>{for(const cmd of ['BC_CODESPACE_START_V1\nrm -rf /','BC_CODESPACE_CLONE_V1','BC_CODESPACE_START_V1 ','rm -rf /'])assert.equal(validateEvent(event(cmd)),null)});
test('stale and future comments denied',()=>{const ev=event();ev.comment.created_at=new Date(Date.now()-6*60*1000).toISOString();assert.equal(validateEvent(ev),null);ev.comment.created_at=new Date(Date.now()+3*60*1000).toISOString();assert.equal(validateEvent(ev),null)});
test('lifecycle API is never called without token',async()=>{for(const cmd of ['BC_CODESPACE_START_V1','BC_CODESPACE_STOP_V1'])assert.equal((await deliver(event(cmd))).status,503)});
test('public health endpoint has no side effects',async()=>{assert.equal((await worker.fetch(new Request('https://bc.example/health'),{})).status,200)});


test('authorized start uses one exact Codespace API endpoint',async()=>{
  const original=globalThis.fetch;let calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:200})};
  try{
    const {bytes,header}=await sign(event('BC_CODESPACE_START_V1'));
    const r=await worker.fetch(new Request('https://bc.example/github-webhook',{method:'POST',headers:{'x-github-event':'issue_comment','x-hub-signature-256':header},body:bytes}),{GITHUB_WEBHOOK_SECRET:secret,GITHUB_CODESPACE_TOKEN:'a'.repeat(40)});
    assert.equal(r.status,200);assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://api.github.com/user/codespaces/'+SETTINGS.codespace+'/start');
    assert.equal(calls[0].options.method,'POST');
  }finally{globalThis.fetch=original}
});
test('forged command never calls lifecycle even with token',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('unexpected call')};
  try{
    const {bytes,header}=await sign(event('BC_CODESPACE_START_V1; rm -rf /'));
    const r=await worker.fetch(new Request('https://bc.example/github-webhook',{method:'POST',headers:{'x-github-event':'issue_comment','x-hub-signature-256':header},body:bytes}),{GITHUB_WEBHOOK_SECRET:secret,GITHUB_CODESPACE_TOKEN:'a'.repeat(40)});
    assert.equal(r.status,202);
  }finally{globalThis.fetch=original}
});
