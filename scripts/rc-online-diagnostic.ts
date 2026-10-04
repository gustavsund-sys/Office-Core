import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,signInAnonymously,deleteUser} from 'firebase/auth';
import {Client,type Room} from 'colyseus.js';
import {MSG,type Snapshot} from '../shared/protocol';
import {SnapshotReceiver} from '../src/network/streams';
const endpoint='wss://office-core-server-4ds43hbu6q-lz.a.run.app';
const origin='https://officecore-ad307.web.app';
const rooms:Room[]=[], identities:any[]=[], states:Snapshot[]=[], seq=[0,0], sent=[-1,-1];
let phase='setup'; const samples:any[]=[]; const lastTime=[0,0],lastAck=[-1,-1],ackTime=[0,0];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function wait(fn:()=>boolean,ms=12000){const until=Date.now()+ms;while(!fn()){if(Date.now()>until)throw Error('Timeout '+phase);await sleep(50);}}
function own(i:number){return states[i]?.players.find(p=>p.id===rooms[i]?.sessionId);}
function send(i:number,extra:any={}){const p=own(i)!;const n=seq[i]++;sent[i]=n;rooms[i].send(MSG.input,{seq:n,moveX:0,moveZ:0,aimX:p.x,aimZ:p.z+5,fire:false,pressed:false,jump:false,interact:false,slot:0,...extra});}
async function run(label:string,seconds:number,rc=false){phase=label;const start=performance.now();let tick=0;while(performance.now()-start<seconds*1000){const car=states[0]?.rcCars?.[0];send(0,rc&&car?{rc:{throttle:Math.floor(tick/90)%2?-.7:1,yaw:Math.atan2(Math.sin(car.yaw+Math.sin(tick/24)*.8),Math.cos(car.yaw+Math.sin(tick/24)*.8)),detonate:false}}:{});send(1,{moveX:Math.floor(tick/60)%2?-.7:.7,moveZ:Math.floor(tick/120)%2?-.7:.7});tick++;await sleep(Math.max(0,start+tick*1000/30-performance.now()));}console.log('Completed',label);}
try{
 const data=await(await fetch(endpoint.replace('wss:','https:')+'/rooms')).json();const lobby=data.rooms.find((r:any)=>!r.started&&r.players.length===0);assert.ok(lobby,'An empty lobby is required');
 for(let i=0;i<2;i++){
  const app=initializeApp({apiKey:'AIzaSyAkgVLtGKDqojp40IdtA4ewaER_HyoIBRk',projectId:'officecore-ad307'},'rc-diagnostic-'+Date.now()+'-'+i);const user=(await signInAnonymously(getAuth(app))).user;identities.push({app,user});
  const room=await new Client(endpoint,{headers:{Origin:origin}}).joinById(lobby.id,{token:await user.getIdToken(),name:i?'RC diagnostic runner':'RC diagnostic pilot',team:i?'BLUE':'RED'});rooms.push(room);const receiver=new SnapshotReceiver();
  room.onMessage(MSG.snapshot,(packet:any)=>{const s:Snapshot|undefined='stream'in packet?receiver.decode(packet):packet;if(!s)return;states[i]=s;const t=performance.now(),p=own(i);if(p){if(p.ack!==lastAck[i]){lastAck[i]=p.ack;ackTime[i]=t;}if(phase!=='setup')samples.push({phase,client:i,t,gap:lastTime[i]?t-lastTime[i]:0,pending:Math.max(0,sent[i]-p.ack),ackAge:t-ackTime[i],ack:p.ack,x:p.x,z:p.z,rc:s.rcCars?.length??0});}lastTime[i]=t;});
  for(const m of [MSG.event,MSG.chat,MSG.ping,MSG.teamPing])room.onMessage(m,()=>{});room.send(MSG.netReady,{stream:2});
 }
 await wait(()=>states[0]?.players.length===2);rooms[0].send(MSG.start);await wait(()=>!!states[0]?.preparing);rooms[0].send(MSG.loadout,{weapon:'machineGun',skill:'rcCar'});rooms[1].send(MSG.loadout,{weapon:'machineGun',skill:'superMedkit'});await wait(()=>!!states[0]?.started);
 await run('baseline',15);
 for(let cycle=1;cycle<=2;cycle++){
  phase='deploy-'+cycle;send(0,{slot:3});await wait(()=>!!own(0)?.pulseTrapSelected);send(0,{pressed:true});await wait(()=>!!states[0]?.rcCars?.length);assert.ok(own(0)?.rcRemote);
  await run('rc-driving-'+cycle,25,true);
  const car=states[0].rcCars![0];send(0,{rc:{throttle:0,yaw:car.yaw,detonate:true}});await wait(()=>states[0]?.rcCars?.length===0);await run('after-explosion-'+cycle,8);assert.ok(!own(0)?.rcRemote);assert.equal(own(0)?.weapon,'machineGun');
 }
 const percentile=(a:number[],p:number)=>a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];const summary:any[]=[];
 for(const name of [...new Set(samples.map(s=>s.phase))])for(let i=0;i<2;i++){const a=samples.filter(s=>s.phase===name&&s.client===i);if(!a.length)continue;summary.push({phase:name,client:i,snapshots:a.length,pendingP95:percentile(a.map(s=>s.pending),.95),pendingMax:Math.max(...a.map(s=>s.pending)),snapshotGapP95Ms:Math.round(percentile(a.map(s=>s.gap),.95)),snapshotGapMaxMs:Math.round(Math.max(...a.map(s=>s.gap))),ackAgeMaxMs:Math.round(Math.max(...a.map(s=>s.ackAge))),distanceTravelled:+a.slice(1).reduce((sum,s,j)=>sum+Math.hypot(s.x-a[j].x,s.z-a[j].z),0).toFixed(2)});}
 await writeFile('/tmp/office-rc-online-diagnostic.json',JSON.stringify({time:new Date().toISOString(),summary,samples},null,2));console.log(JSON.stringify(summary,null,2));assert.ok(summary.filter(s=>s.client===1).every(s=>s.pendingMax<64),'Runner must not hit pending cap');console.log('PASS: two online clients, two RC deployments, driving while opponent moves, detonation, restored weapon, no 64-input backlog');
}finally{await Promise.allSettled(rooms.map(r=>r.leave()));for(const {app,user}of identities){await deleteUser(user);await deleteApp(app);}}
