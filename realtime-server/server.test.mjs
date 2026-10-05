import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';

test('shared orders, authorization, realtime delivery and persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mekegi-test-'));const secret=randomBytes(32).toString('hex');const base='http://127.0.0.1:18787';let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:'18787',ADMIN_TOKEN:secret,DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data')}
 async function stop(){const done=once(child,'exit');child.kill('SIGTERM');await done}
 const headers={'Content-Type':'application/json'},auth={...headers,Authorization:'Bearer '+secret};
 const input={requestId:randomBytes(20).toString('hex'),customer:'Test',phone:'test-phone',method:'Самовывоз',time:'15:00',items:[{id:'pie',qty:2,price:1}],channel:'Telegram',note:''};
 try{
  await start();assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/api/catalog',{headers:{Origin:'https://untrusted.example'}})).status,403);
  const control=new AbortController();const events=await fetch(base+'/api/events',{headers:auth,signal:control.signal});assert.equal(events.status,200);const reader=events.body.getReader();await reader.read();
  const response=await fetch(base+'/api/orders',{method:'POST',headers,body:JSON.stringify(input)});assert.equal(response.status,201);const receipt=await response.json();assert.ok(receipt.tracking.length===64);
  const update=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Missing realtime event')),2000))]);assert.match(new TextDecoder().decode(update.value),/Test/);
  const duplicate=await fetch(base+'/api/orders',{method:'POST',headers,body:JSON.stringify(input)});assert.equal((await duplicate.json()).id,receipt.id);
  let state=await (await fetch(base+'/api/state',{headers:auth})).json();assert.equal(state.orders.length,1);assert.equal(state.orders[0].quote,1500);
  assert.equal((await fetch(base+'/api/orders/'+receipt.id,{method:'PATCH',headers,body:'{"status":3}'})).status,401);
  assert.equal((await fetch(base+'/api/orders/'+receipt.id,{method:'PATCH',headers:auth,body:'{"status":1}'})).status,200);
  const tracked=await (await fetch(base+'/api/track/'+receipt.tracking)).json();assert.equal(tracked.status,1);assert.equal(tracked.phone,undefined);
  const bad=await fetch(base+'/api/orders',{method:'POST',headers,body:JSON.stringify({...input,requestId:randomBytes(20).toString('hex'),items:[{id:'pie',qty:-1}]})});assert.equal(bad.status,400);
  control.abort();await stop();await start();state=await (await fetch(base+'/api/state',{headers:auth})).json();assert.equal(state.orders[0].status,1);
 }finally{if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true})}
});
