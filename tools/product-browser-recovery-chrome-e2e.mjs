#!/usr/bin/env node
// Synthetic local-origin Chromium smoke. No real data, legal claims or certificate issuance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const HOST='127.0.0.1',WEB_PORT=18765,CDP_PORT=19226;
const ORIGIN=`http://${HOST}:${WEB_PORT}`;
const URL=`${ORIGIN}/product/`;
function chromePath(){
  const paths=[process.env.RPM_CHROME,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean);
  const found=paths.find(p=>fs.existsSync(p));
  if(!found)throw new Error('RPM_BROWSER_CHROME_MISSING');
  return found;
}
async function poll(task,label,limit=120,delay=100){
  let error=null;
  for(let i=0;i<limit;i++){
    try{const value=await task();if(value)return value;}catch(e){error=e;}
    await sleep(delay);
  }
  throw new Error(`RPM_BROWSER_WAIT_TIMEOUT:${label}:${error?.message??'no-match'}`);
}
function cdp(socket){
  let n=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    let message;try{message=JSON.parse(String(event.data));}catch{return;}
    const item=pending.get(message.id);
    if(!item)return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    message.error?item.reject(new Error(`CDP_${message.error.message}`)):item.resolve(message.result);
  });
  return (method,params={})=>new Promise((resolve,reject)=>{
    const id=++n;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_RESPONSE_TIMEOUT:'+method));},10000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rpm-browser-recovery-e2e-'));
  const server=spawn('python3',['-m','http.server',String(WEB_PORT),'--bind',HOST],{cwd:process.cwd(),stdio:'ignore'});
  let chrome=null,socket=null;
  try{
    await poll(async()=>{const r=await fetch(URL);return r.ok;},'local-test-origin');
    chrome=spawn(chromePath(),[
      '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
      '--disable-extensions','--no-first-run','--no-default-browser-check',
      `--remote-debugging-port=${CDP_PORT}`,'--remote-allow-origins=*',
      `--user-data-dir=${profile}`,URL
    ],{stdio:'ignore'});
    const target=await poll(async()=>{
      const r=await fetch(`http://${HOST}:${CDP_PORT}/json`);
      if(!r.ok)return null;
      const targets=await r.json();
      return targets.find(x=>x.type==='page'&&x.url.startsWith(URL)&&x.webSocketDebuggerUrl);
    },'chrome-target',160);
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      socket.addEventListener('open',resolve,{once:true});
      socket.addEventListener('error',reject,{once:true});
    });
    const call=cdp(socket);
    await call('Page.enable');await call('Runtime.enable');
    async function evaluate(expression){
      const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails)throw new Error('CDP_RUNTIME_EXCEPTION:'+JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    }
    async function until(expression,label){
      return poll(async()=>await evaluate(expression),label,140,100);
    }
    assert.equal(await until("document.querySelector('#learnerPanel')?.textContent?.includes('Ascultă și alege sensul.')",'first-exercise'),true);
    const click=await evaluate(`(()=>{const button=[...document.querySelectorAll('.answer')].find(b=>b.dataset.value==='Nu înțeleg.');if(!button)return false;button.click();return true})()`);
    assert.equal(click,true);
    assert.equal(await until("document.querySelector('#learnerPanel')?.textContent?.includes('Profesorul vorbește prea repede')",'second-exercise'),true);
    const progress=await evaluate("document.querySelector('#learnerPanel .metric b')?.textContent");
    assert.equal(progress,'1/8');
    const key=await evaluate("Object.keys(localStorage).find(x=>x.includes('recovery-v1'))");
    assert.ok(key,'recovery key must exist after a meaningful interaction');
    await call('Page.reload',{ignoreCache:true});
    assert.equal(await until("document.querySelector('#learnerPanel')?.textContent?.includes('Profesorul vorbește prea repede')",'reload-learner-progress'),true);
    assert.equal(await evaluate("document.querySelector('#learnerPanel .metric b')?.textContent"),'1/8');
    assert.equal(await evaluate("document.querySelector('.answer')!==null"),true);
    const checked=await evaluate(`(()=>{const k=Object.keys(localStorage).find(x=>x.includes('recovery-v1'));const v=JSON.parse(localStorage.getItem(k));v.lessonSnapshot='TAMPERED';localStorage.setItem(k,JSON.stringify(v));return true})()`);
    assert.equal(checked,true);
    await call('Page.reload',{ignoreCache:true});
    assert.equal(await until("document.querySelector('#learnerPanel')?.textContent?.includes('Progresul local nu poate fi verificat')",'corrupt-replay-fail-closed'),true);
    assert.equal(await evaluate("document.querySelector('#learnerPanel .answer')===null"),true);
    assert.equal(await evaluate("localStorage.getItem(Object.keys(localStorage).find(x=>x.includes('recovery-v1'))).includes('TAMPERED')"),true);
    console.log('RPM_BROWSER_RECOVERY_CHROME_E2E_PASS visual-first-step persisted-refresh-cursor corrupt-state-fail-closed no-silent-reset');
  }finally{
    try{socket?.close();}catch{}
    try{chrome?.kill('SIGTERM');}catch{}
    try{server.kill('SIGTERM');}catch{}
    await sleep(200);
    try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  }
}
main().catch(err=>{console.error('RPM_BROWSER_RECOVERY_CHROME_E2E_FAIL',err?.stack||String(err));process.exitCode=1;});
