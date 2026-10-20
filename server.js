// MinhaAgenda v2 - servidor sem dependências externas (Node >= 18)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public'),DIR=process.env.DATA_DIR||path.join(__dirname,'data'),DB=path.join(DIR,'db.json'),DAY=864e5;
fs.mkdirSync(DIR,{recursive:true});
let db={users:[],sessions:{},clients:[],services:[],appointments:[],expenses:[]};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(DB)))}catch{}
const save=()=>{fs.writeFileSync(DB+'.tmp',JSON.stringify(db));fs.renameSync(DB+'.tmp',DB)};
const id=()=>crypto.randomBytes(6).toString('hex');
const hash=(p,s=crypto.randomBytes(16).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>{const a=Buffer.from(hash(p,h.split(':')[0])),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const H={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'};
const send=(r,c,o)=>{r.writeHead(c,{...H,'Content-Type':'application/json'});r.end(JSON.stringify(o))};
const slugify=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'negocio';
const str=(v,n=200)=>String(v??'').trim().slice(0,n),num=v=>Number.isFinite(+v)?+v:NaN;
const isD=v=>/^\d{4}-\d\d-\d\d$/.test(v)&&!isNaN(new Date(v)),isT=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const mi=t=>+t.slice(0,2)*60+ +t.slice(3);
const ST=['pendente','agendado','concluído','cancelado'],PM=['','Pix','Dinheiro','Cartão','Transferência'];
const pub=u=>({name:u.name,business:u.business,email:u.email,slug:u.slug,online:u.online,start:u.start||'08:00',end:u.end||'18:00',step:u.step||30});
const overlap=(uid,date,time,dur,ig)=>db.appointments.some(x=>x.uid===uid&&x.id!==ig&&x.date===date&&x.status!=='cancelado'&&mi(x.time)<mi(time)+dur&&mi(time)<mi(x.time)+(+x.duration||30));
const tries={},limited=ip=>{const t=tries[ip]=(tries[ip]||[]).filter(x=>Date.now()-x<6e5);t.push(Date.now());return t.length>20};
const getUid=t=>{const s=db.sessions[t];if(!s)return;if(typeof s==='string')return s;if(s.exp<Date.now()){delete db.sessions[t];return}return s.uid};
function login(r,u){const t=crypto.randomBytes(24).toString('hex');db.sessions[t]={uid:u.id,exp:Date.now()+30*DAY};save();send(r,200,{token:t,user:pub(u)})}

// Validação: cada coleção só aceita os campos conhecidos (retorna [objeto] ou [0,'erro'])
const SCH={
 clients:b=>!str(b.name,80)?[0,'Informe o nome do cliente']:[{name:str(b.name,80),phone:str(b.phone,30),notes:str(b.notes,500)}],
 services:b=>{const d=num(b.duration),p=num(b.price);return !str(b.name,80)?[0,'Informe o nome do serviço']:!(d>0&&d<=1440)?[0,'Duração inválida']:!(p>=0)?[0,'Preço inválido']:[{name:str(b.name,80),duration:d,price:p}]},
 expenses:b=>{const a=num(b.amount);return !str(b.description,100)?[0,'Informe a descrição']:!(a>=0)?[0,'Valor inválido']:!isD(b.date)?[0,'Data inválida']:[{description:str(b.description,100),amount:a,date:b.date}]},
 appointments:(b,uid)=>{const d=num(b.duration),p=num(b.price);
  if(!db.clients.some(c=>c.id===b.clientId&&c.uid===uid))return[0,'Selecione um cliente'];
  if(b.serviceId&&!db.services.some(s=>s.id===b.serviceId&&s.uid===uid))return[0,'Serviço inválido'];
  if(!isD(b.date)||!isT(b.time))return[0,'Data ou hora inválida'];
  if(!(d>0&&d<=1440))return[0,'Duração inválida'];if(!(p>=0))return[0,'Valor inválido'];
  if(!ST.includes(b.status))return[0,'Status inválido'];
  return[{clientId:b.clientId,serviceId:b.serviceId||'',date:b.date,time:b.time,duration:d,price:p,status:b.status,paid:b.paid?1:0,method:PM.includes(b.method)?b.method:'',notes:str(b.notes,500)}]}
};

function api(q,r,p,b){
 const m=q.method,[a,i]=p,ip=q.socket.remoteAddress;
 if((a==='register'||a==='login')&&m==='POST'){
  if(limited(ip))return send(r,429,{error:'Muitas tentativas. Aguarde alguns minutos.'});
  if(a==='login'){
   const u=db.users.find(x=>x.email===str(b.email,120).toLowerCase());
   if(!u||!check(String(b.password||''),u.pass))return send(r,401,{error:'E-mail ou senha inválidos'});
   return login(r,u);
  }
  const email=str(b.email,120).toLowerCase();
  if(!str(b.name,80)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||String(b.password||'').length<6)return send(r,400,{error:'Preencha nome, um e-mail válido e senha (mín. 6 caracteres)'});
  if(db.users.find(x=>x.email===email))return send(r,409,{error:'E-mail já cadastrado'});
  let slug=slugify(str(b.business||b.name,80));while(db.users.find(x=>x.slug===slug))slug+=Math.floor(Math.random()*10);
  const u={id:id(),name:str(b.name,80),business:str(b.business||b.name,80),email,pass:hash(String(b.password)),slug,online:true,start:'08:00',end:'18:00',step:30};
  db.users.push(u);return login(r,u);
 }
 if(a==='public'){ // página pública de agendamento online
  const u=db.users.find(x=>x.slug===i&&x.online);if(!u)return send(r,404,{error:'Página não encontrada'});
  const c=pub(u);
  if(m==='GET')return send(r,200,{business:u.business,start:c.start,end:c.end,step:c.step,services:db.services.filter(s=>s.uid===u.id).map(s=>({id:s.id,name:s.name,duration:s.duration,price:s.price})),busy:db.appointments.filter(x=>x.uid===u.id&&x.status!=='cancelado').map(x=>({date:x.date,time:x.time,duration:x.duration}))});
  if(m==='POST'){
   if(limited(ip))return send(r,429,{error:'Muitas tentativas. Aguarde alguns minutos.'});
   const s=db.services.find(x=>x.id===b.serviceId&&x.uid===u.id),phone=str(b.phone,30);
   if(!str(b.name,80)||phone.replace(/\D/g,'').length<10||!s||!isD(b.date)||!isT(b.time))return send(r,400,{error:'Confira nome, WhatsApp, serviço, data e horário'});
   if(b.date<new Date(Date.now()-DAY).toISOString().slice(0,10))return send(r,400,{error:'Data no passado'});
   if(mi(b.time)<mi(c.start)||mi(b.time)+s.duration>mi(c.end)||(mi(b.time)-mi(c.start))%c.step)return send(r,400,{error:'Horário fora do atendimento'});
   if(overlap(u.id,b.date,b.time,+s.duration))return send(r,409,{error:'Horário indisponível. Escolha outro.'});
   let cl=db.clients.find(x=>x.uid===u.id&&x.phone===phone);
   if(!cl){cl={id:id(),uid:u.id,name:str(b.name,80),phone,notes:''};db.clients.push(cl)}
   db.appointments.push({id:id(),uid:u.id,clientId:cl.id,serviceId:s.id,date:b.date,time:b.time,duration:s.duration,price:s.price,status:'pendente',paid:0,method:'',notes:'Agendado online'});
   save();return send(r,201,{ok:1});
  }
  return send(r,405,{error:'Método não permitido'});
 }
 const t=(q.headers.authorization||'').slice(7),uid=getUid(t);
 if(!uid)return send(r,401,{error:'Não autenticado'});
 const u=db.users.find(x=>x.id===uid);if(!u)return send(r,401,{error:'Não autenticado'});
 if(a==='me'){
  if(m==='PUT'){
   if(b.newPassword!==undefined){
    if(!check(String(b.password||''),u.pass))return send(r,400,{error:'Senha atual incorreta'});
    if(String(b.newPassword).length<6)return send(r,400,{error:'A nova senha precisa de 6+ caracteres'});
    u.pass=hash(String(b.newPassword));
   }
   if(b.business!==undefined){if(!str(b.business,80))return send(r,400,{error:'Informe o nome do negócio'});u.business=str(b.business,80)}
   if(b.online!==undefined)u.online=!!b.online;
   if(b.start!==undefined){if(!isT(b.start)||!isT(b.end)||mi(b.start)>=mi(b.end)||![15,20,30,45,60].includes(+b.step))return send(r,400,{error:'Horário de atendimento inválido'});u.start=b.start;u.end=b.end;u.step=+b.step}
   save();
  }
  return send(r,200,pub(u));
 }
 if(a==='logout'){delete db.sessions[t];save();return send(r,200,{})}
 if(!SCH[a])return send(r,404,{error:'Rota inexistente'});
 const L=db[a];
 if(m==='GET')return send(r,200,L.filter(x=>x.uid===uid));
 if(m==='POST'){const[o,e]=SCH[a]({...b},uid);if(!o)return send(r,400,{error:e});const n={...o,id:id(),uid};L.push(n);save();return send(r,201,n)}
 const k=L.findIndex(x=>x.id===i&&x.uid===uid);if(k<0)return send(r,404,{error:'Não encontrado'});
 if(m==='PUT'){const[o,e]=SCH[a]({...L[k],...b},uid);if(!o)return send(r,400,{error:e});L[k]={...o,id:L[k].id,uid};save();return send(r,200,L[k])}
 if(m==='DELETE'){
  if(a==='clients')db.appointments=db.appointments.filter(x=>!(x.uid===uid&&x.clientId===i));
  if(a==='services')db.appointments.forEach(x=>{if(x.uid===uid&&x.serviceId===i)x.serviceId=''});
  L.splice(k,1);save();return send(r,200,{});
 }
 send(r,405,{error:'Método não permitido'});
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
function serve(pn,r){
 let f;try{f=path.join(PUB,pn==='/'||pn.startsWith('/b/')?'index.html':decodeURIComponent(pn))}catch{r.writeHead(400,H);return r.end()}
 if(!f.startsWith(PUB+path.sep)){r.writeHead(403,H);return r.end()}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404,H);return r.end('Não encontrado')}
  const x=path.extname(f);r.writeHead(200,{...H,'Content-Type':mime[x]||'application/octet-stream','Cache-Control':x==='.html'||f.endsWith('sw.js')?'no-cache':'public, max-age=3600'});r.end(d)});
}
http.createServer((q,r)=>{
 let b='';q.on('data',d=>{b+=d;if(b.length>1e6)q.destroy()});q.on('error',()=>{});
 q.on('end',()=>{
  try{
   const u=new URL(q.url,'http://x'),p=u.pathname.split('/').filter(Boolean);
   if(p[0]!=='api')return serve(u.pathname,r);
   let body={};try{body=b?JSON.parse(b):{}}catch{return send(r,400,{error:'JSON inválido'})}
   if(!body||typeof body!=='object'||Array.isArray(body))body={};
   api(q,r,p.slice(1),body);
  }catch(e){console.error(e);if(!r.headersSent)send(r,500,{error:'Erro interno'})}
 });
}).listen(PORT,()=>console.log('MinhaAgenda rodando em http://localhost:'+PORT));
