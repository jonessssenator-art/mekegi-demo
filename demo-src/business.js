/* Shared, deterministic calculations for the owner dashboard. All amounts are rubles. */
(function(root){
'use strict';
const defaultCosts={pie:430,dumplings:210,adjika:125,chudu:72,meat:620,butter:230};
function customerKey(o){const digits=String(o.phone||'').replace(/\D/g,'');return digits ? (digits.length===11&&digits[0]==='8'?'7'+digits.slice(1):digits) : (o.customerId||'order-'+o.id)}
function dayKey(value){const d=new Date(value);return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:''}
function completedWithin(orders,days,now=new Date()){const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);return orders.filter(o=>o.status===3&&new Date(o.completedAt||o.createdAt)>=start&&new Date(o.completedAt||o.createdAt)<=now)}
function summarize(orders,products,costs,days=30,now=new Date()){
 const list=completedWithin(orders,days,now),rows=products.map(p=>({id:p.id,name:p.name,qty:0,revenue:0,cost:0,profit:0,margin:0})),byId=Object.fromEntries(rows.map(r=>[r.id,r])),channels={},clients=new Map(),daily={};
 for(let n=days-1;n>=0;n--){const d=new Date(now);d.setDate(d.getDate()-n);daily[dayKey(d)]=0}
 let totalCents=0;
 for(const o of list){
  const base=o.items.reduce((s,i)=>s+i.qty*(i.price??products.find(p=>p.id===i.id)?.price??0),0);const cents=Math.round((o.quote??base)*100);let allocated=0;
  o.items.forEach((i,n)=>{const r=byId[i.id];if(!r)return;const value=i.qty*(i.price??products.find(p=>p.id===i.id).price);const part=n===o.items.length-1?cents-allocated:Math.round(cents*(base?value/base:0));allocated+=part;r.qty+=i.qty;r.revenue+=part/100;r.cost+=i.qty*(costs[i.id]??0)});
  const sum=cents/100;totalCents+=cents;channels[o.channel]=(channels[o.channel]||0)+sum;const day=dayKey(o.completedAt||o.createdAt);daily[day]=(daily[day]||0)+sum;
  const key=customerKey(o);if(!clients.has(key))clients.set(key,{key,name:o.customer,phone:o.phone||'',orders:[],sum:0});const client=clients.get(key);client.orders.push(o);client.sum+=sum;
 }
 rows.forEach(r=>{r.cost=Math.round(r.cost*100)/100;r.profit=r.revenue-r.cost;r.margin=r.revenue?r.profit/r.revenue*100:0});
 const revenue=totalCents/100,cost=rows.reduce((s,r)=>s+r.cost,0),returning=[...clients.values()].filter(c=>c.orders.length>1).length;
 return {list,rows,channels,daily,clients:[...clients.values()],revenue,cost,profit:revenue-cost,margin:revenue?(revenue-cost)/revenue*100:0,average:list.length?revenue/list.length:0,returning};
}
function seedHistory(products,now=new Date()){
 return Array.from({length:120},(_,n)=>{const d=new Date(now);d.setDate(d.getDate()-Math.floor(n*90/120));d.setHours(10+(n%7),0,0,0);if(d>now)d.setDate(d.getDate()-1);const p=products[n%products.length],q=products[(n+2)%products.length];return {id:800+n,customer:'Гость '+String(n%11+1).padStart(2,'0'),customerId:'demo-guest-'+(n%11),channel:['Сайт','Telegram','Телефон'][n%3],items:[{id:p.id,qty:n%3+1,price:p.price},{id:q.id,qty:1,price:q.price}],status:3,method:n%2?'Самовывоз':'Доставка',time:'Выдан',note:'Демонстрационный заказ для аналитики.',createdAt:d.toISOString(),completedAt:d.toISOString(),demo:true,analyticsSeed:true}});
}
root.MekegiBusiness={defaultCosts,customerKey,dayKey,completedWithin,summarize,seedHistory};
if(typeof module!=='undefined')module.exports=root.MekegiBusiness;
})(globalThis);
