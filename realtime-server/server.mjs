import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const port=Number(process.env.PORT||8787);
const secret=process.env.ADMIN_TOKEN;
if(!secret||secret.length<32)throw Error('Set ADMIN_TOKEN to a random secret of at least 32 characters');
const allowed=new Set((process.env.ALLOWED_ORIGINS||'http://127.0.0.1:8766,http://localhost:8766,https://jonessssenator-art.github.io').split(',').map(x=>x.trim()));
const dir=resolve(process.env.DATA_DIR||'./data');mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(resolve(dir,'orders.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT UNIQUE NOT NULL, tracking TEXT UNIQUE NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY, available INTEGER NOT NULL)');
const prices={pie:750,dumplings:350,adjika:250,chudu:180,meat:850,butter:320};
const clients=new Set();const limits=new Map();
const catalog=()=>Object.fromEntries(db.prepare('SELECT * FROM catalog').all().map(x=>[x.id,!!x.available]));
const list=()=>db.prepare('SELECT id,data FROM orders ORDER BY id DESC').all().map(x=>({...JSON.parse(x.data),id:x.id}));
const snapshot=()=>({orders:list(),availability:catalog()});
function broadcast(){const message='data: '+JSON.stringify(snapshot())+'\n\n';for(const res of clients){if(res.writableLength>1024*1024){res.destroy();clients.delete(res)}else res.write(message)}}
function isAdmin(req){const raw=req.headers.authorization||'';const val=raw.startsWith('Bearer ')?raw.slice(7):'';const a=Buffer.from(val),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b)}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
async function body(req){let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw Error('Слишком большой запрос');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw Error('Некорректный JSON')}}
function text(v,max,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Проверьте заполнение полей');return v.trim()}
function validateOrder(b){const avail=catalog();if(!Array.isArray(b.items)||!b.items.length||b.items.length>20)throw Error('Пустой или слишком большой заказ');const seen=new Set();const items=b.items.map(i=>{if(!Object.hasOwn(prices,i.id)||seen.has(i.id)||!Number.isInteger(i.qty)||i.qty<1||i.qty>50||avail[i.id]===false)throw Error('Проверьте товары и их наличие');seen.add(i.id);return {id:i.id,qty:i.qty,price:prices[i.id]}});const method=text(b.method,30,true);if(!['Самовывоз','Доставка'].includes(method))throw Error('Выберите способ получения');const channel=['Сайт','Telegram'].includes(b.channel)?b.channel:'Сайт';return {customer:text(b.customer,60,true),phone:text(b.phone,25,true),method,time:text(b.time,80,true),address:method==='Доставка'?text(b.address,200,true):'',note:text(b.note||'',400),channel,items,status:0,quote:items.reduce((s,i)=>s+i.qty*i.price,0),createdAt:new Date().toISOString(),demo:true}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin;if(origin&&!allowed.has(origin)){send(res,403,{error:'Этот адрес сайта не подключён'});return}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const path=new URL(req.url,'http://localhost').pathname;
 try{
  if(path==='/health'){send(res,200,{ok:true});return}
  if(path==='/api/catalog'&&req.method==='GET'){send(res,200,{availability:catalog()});return}
  if(path==='/api/orders'&&req.method==='POST'){
   const key=req.socket.remoteAddress;const now=Date.now();let rate=limits.get(key);if(!rate||now-rate.since>60000){rate={since:now,count:0};limits.set(key,rate)}if(++rate.count>30){send(res,429,{error:'Слишком много заявок. Попробуйте через минуту.'});return}
   const b=await body(req);const requestId=text(b.requestId,100,true);if(!/^[a-zA-Z0-9-]{20,100}$/.test(requestId))throw Error('Некорректный идентификатор заявки');
   const order=validateOrder(b);const existing=db.prepare('SELECT id,tracking FROM orders WHERE request_id=?').get(requestId);if(existing){send(res,200,existing);return}
   const tracking=randomBytes(32).toString('hex');const result=db.prepare('INSERT INTO orders(request_id,tracking,data) VALUES(?,?,?)').run(requestId,tracking,JSON.stringify(order));send(res,201,{id:Number(result.lastInsertRowid),tracking});broadcast();return;
  }
  if(path.startsWith('/api/track/')&&req.method==='GET'){const token=path.slice('/api/track/'.length);const row=db.prepare('SELECT id,data FROM orders WHERE tracking=?').get(token);if(!row){send(res,404,{error:'Заказ не найден'});return}const o=JSON.parse(row.data);send(res,200,{id:row.id,status:o.status,quote:o.quote,items:o.items,time:o.time});return}
  if(!isAdmin(req)){send(res,401,{error:'Для CRM нужен ключ администратора'});return}
  if(path==='/api/state'&&req.method==='GET'){send(res,200,snapshot());return}
  if(path==='/api/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('data: '+JSON.stringify(snapshot())+'\n\n');clients.add(res);const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),20000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res)});return}
  if(path.startsWith('/api/orders/')&&req.method==='PATCH'){const id=Number(path.split('/').pop());const row=db.prepare('SELECT data FROM orders WHERE id=?').get(id);if(!row){send(res,404,{error:'Заказ не найден'});return}const b=await body(req),o=JSON.parse(row.data);if(Object.hasOwn(b,'status')){if(!Number.isInteger(b.status)||b.status<0||b.status>3)throw Error('Неверный статус');o.status=b.status}if(Object.hasOwn(b,'quote')){if(!Number.isInteger(b.quote)||b.quote<1||b.quote>10000000)throw Error('Неверная сумма');o.quote=b.quote}db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o),id);send(res,200,{ok:true});broadcast();return}
  if(path.startsWith('/api/catalog/')&&req.method==='PATCH'){const id=path.split('/').pop();if(!Object.hasOwn(prices,id))throw Error('Товар не найден');const b=await body(req);if(typeof b.available!=='boolean')throw Error('Неверное наличие');db.prepare('INSERT INTO catalog(id,available) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET available=excluded.available').run(id,Number(b.available));send(res,200,{ok:true});broadcast();return}
  send(res,404,{error:'Не найдено'});
 }catch(e){send(res,400,{error:e.message})}
});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Orders server ready on port '+port));
setInterval(()=>{for(const [key,value] of limits)if(Date.now()-value.since>120000)limits.delete(key)},60000).unref();
function stop(){for(const res of clients)res.end();server.close(()=>{db.close();process.exit(0)})}process.on('SIGTERM',stop);process.on('SIGINT',stop);
