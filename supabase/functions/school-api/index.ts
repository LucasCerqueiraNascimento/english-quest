import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

// The gateway JWT check is deliberately replaced by action-specific auth:
// staff: verified Supabase user + server-side allowlist;
// students: random 256-bit session token + live enrollment status;
// registration/login: strict validation and persistent atomic rate limiting.
const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-student-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const reply = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers});
const enc = new TextEncoder();
const hex = (v: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(v)).map(x=>x.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (v: string) => hex(await crypto.subtle.digest('SHA-256',enc.encode(v)));
async function pinHash(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw',enc.encode(pin+secret), 'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:210000},key,256));
}
function equal(a: string,b: string) { let d=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++) d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return d===0; }
function str(v: unknown,min: number,max: number,label: string) {
  if(typeof v!=='string'||v.trim().length<min||v.trim().length>max) throw new ApiError(400,`Confira ${label}.`);
  return v.trim();
}
function id(v: unknown) { const s=str(v,36,36,'o identificador'); if(!/^[0-9a-f-]{36}$/i.test(s)) throw new ApiError(400,'Identificador inválido.'); return s; }
function pin(v: unknown) { if(typeof v!=='string'||!/^\d{4}$/.test(v)) throw new ApiError(400,'O PIN deve ter quatro números.'); return v; }
function check<T>(r: {data:T;error:unknown}) { if(r.error) throw new ApiError(503,'Não foi possível salvar ou consultar. Tente novamente.'); return r.data; }
async function limit(key: string, n: number,seconds=900) {
  const ok=check(await db.rpc('eq_rate_limit',{p_key:await digest(key),p_limit:n,p_seconds:seconds}));
  if(!ok) throw new ApiError(429,'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
}
async function staff(req: Request) {
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
  if(!token) throw new ApiError(401,'Entre na conta da professora.');
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user?.email_confirmed_at||!user.email) throw new ApiError(401,'Entre novamente e confirme seu e-mail.');
  const access=check(await db.from('staff_access').select('email').eq('email',user.email.toLowerCase()).maybeSingle());
  if(!access) throw new ApiError(403,'Esta conta ainda não tem acesso à administração.');
  return user;
}
async function student(req: Request) {
  const token=req.headers.get('x-student-token');
  if(!token||!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401,'Entre novamente na sua turma.');
  const session=check(await db.from('student_sessions').select('student_id').eq('token_hash',await digest(token)).gt('expires_at',new Date().toISOString()).maybeSingle());
  if(!session) throw new ApiError(401,'Sua sessão terminou. Entre novamente.');
  const s=check(await db.from('students').select('*').eq('id',session.student_id).single());
  const c=check(await db.from('classes').select('id,name,meeting_days,archived').eq('id',s.class_id).single());
  if(c.archived||['disabled','rejected'].includes(s.status)) throw new ApiError(403,'Seu acesso não está disponível. Fale com a professora.');
  return {s,c};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return reply({error:'Método não permitido.'},405);
  try {
    const raw=await req.text();
    if(raw.length>8192) throw new ApiError(413,'Solicitação muito grande.');
    let b: Record<string,unknown>;
    try { b=JSON.parse(raw); } catch { throw new ApiError(400,'Solicitação inválida.'); }
    if(!b||Array.isArray(b)||typeof b!=='object') throw new ApiError(400,'Solicitação inválida.');
    const action=str(b.action,1,40,'a ação');
    if(action==='register'||action==='login') {
      // Supabase gateway forwards client IP. Only a hash is persisted; no raw IP.
      const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
      await limit(`${action}:ip:${ip}`,action==='login'?30:10);
      const code=str(b.code,8,8,'o código da turma').toUpperCase();
      if(!/^[A-F0-9]{8}$/.test(code)) throw new ApiError(400,'Confira o código da turma.');
      const nick=str(b.nickname,3,20,'o apelido').toLowerCase();
      if(!/^[a-z0-9_]+$/.test(nick)) throw new ApiError(400,'Use letras sem acento, números ou _ no apelido.');
      const p=pin(b.pin);
      await limit(`${action}:account:${code}:${nick}`,action==='login'?5:3);
      const c=check(await db.from('classes').select('id').eq('join_code',code).eq('archived',false).maybeSingle());
      if(!c) throw new ApiError(400,'Confira o código, apelido e PIN com a professora.');
      if(action==='register') {
        const name=str(b.name,2,40,'seu primeiro nome');
        const avatar=str(b.avatar,1,12,'o avatar');
        if(!['rocket','cat','star','planet','book','bolt'].includes(avatar)) throw new ApiError(400,'Escolha um avatar.');
        const salt=random();
        const r=await db.rpc('eq_register_student',{p_class:c.id,p_name:name,p_nick:nick,p_avatar:avatar,p_hash:await pinHash(p,salt),p_salt:salt});
        if(r.error?.code==='23505') throw new ApiError(409,'Esse apelido já está em uso nesta turma. Escolha outro.');
        check(r);
        return reply({ok:true,message:'Cadastro enviado! Aguarde a aprovação da professora.'});
      }
      const s=check(await db.from('students').select('id,status').eq('class_id',c.id).eq('nickname',nick).maybeSingle());
      const cred=s?check(await db.from('student_credentials').select('pin_hash,salt').eq('student_id',s.id).maybeSingle()):null;
      const calculated=await pinHash(p,cred?.salt||'constant-dummy-salt');
      if(!s||!cred||!equal(calculated,cred.pin_hash)) throw new ApiError(401,'Confira o código, apelido e PIN com a professora.');
      if(['disabled','rejected'].includes(s.status)) throw new ApiError(403,'Seu acesso não está disponível. Fale com a professora.');
      const token=random();
      check(await db.from('student_sessions').delete().lt('expires_at',new Date().toISOString()));
      check(await db.from('student_sessions').insert({token_hash:await digest(token),student_id:s.id,expires_at:new Date(Date.now()+8*3600000).toISOString()}));
      return reply({token});
    }
    if(action==='student-me') {
      const {s,c}=await student(req);
      let lessons: unknown[]=[];
      if(s.status==='approved') {
        const rows=check(await db.from('lessons').select('id,title,topic,objective,lesson_date,status,opens_at').eq('class_id',c.id).in('status',['published','scheduled']).order('lesson_date',{ascending:false}));
        lessons=rows.filter(x=>x.status==='published'||(x.opens_at&&Date.parse(x.opens_at)<=Date.now()));
      }
      return reply({student:{id:s.id,display_name:s.display_name,nickname:s.nickname,avatar:s.avatar,status:s.status},class:c,lessons});
    }
    if(action==='student-logout') {
      const token=req.headers.get('x-student-token');
      if(token) check(await db.from('student_sessions').delete().eq('token_hash',await digest(token)));
      return reply({ok:true});
    }
    const user=await staff(req);
    if(action==='dashboard') {
      const [classes,students,lessons,access]=await Promise.all([
        db.from('classes').select('*').order('created_at',{ascending:false}),
        db.from('students').select('*').order('created_at',{ascending:false}),
        db.from('lessons').select('*').order('lesson_date',{ascending:false}),
        db.from('staff_access').select('email').order('email'),
      ]);
      return reply({email:user.email,classes:check(classes),students:check(students),lessons:check(lessons),staff:check(access)});
    }
    if(action==='save-class') {
      const name=str(b.name,2,80,'o nome da turma');
      const days=b.days;
      if(!Array.isArray(days)||!days.length||days.length>7||!days.every(x=>['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].includes(x))) throw new ApiError(400,'Selecione os dias de aula.');
      const row={name,meeting_days:[...new Set(days)]};
      if(b.id) check(await db.from('classes').update(row).eq('id',id(b.id)).select('id').single());
      else check(await db.from('classes').insert({...row,created_by:user.id}));
    } else if(action==='archive-class') {
      if(typeof b.archived!=='boolean') throw new ApiError(400,'Estado inválido.');
      check(await db.from('classes').update({archived:b.archived}).eq('id',id(b.id)).select('id').single());
    } else if(action==='rotate-code') {
      check(await db.from('classes').update({join_code:hex(crypto.getRandomValues(new Uint8Array(4))).toUpperCase()}).eq('id',id(b.id)).select('id').single());
    } else if(action==='student-status') {
      if(!['approved','rejected','disabled'].includes(String(b.status))) throw new ApiError(400,'Estado inválido.');
      check(await db.from('students').update({status:b.status}).eq('id',id(b.id)).select('id').single());
    } else if(action==='reset-pin') {
      const p=pin(b.pin), salt=random();
      check(await db.rpc('eq_reset_pin',{p_student:id(b.id),p_hash:await pinHash(p,salt),p_salt:salt}));
    } else if(action==='save-lesson') {
      const classId=id(b.class_id);
      const c=check(await db.from('classes').select('id').eq('id',classId).eq('archived',false).maybeSingle());
      if(!c) throw new ApiError(400,'Selecione uma turma ativa.');
      const date=str(b.lesson_date,10,10,'a data');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))) throw new ApiError(400,'Data inválida.');
      const status=String(b.status);
      if(!['draft','scheduled','published','closed','archived'].includes(status)) throw new ApiError(400,'Estado inválido.');
      let opens=null;
      if(status==='scheduled') {
        const t=Date.parse(String(b.opens_at));
        if(!Number.isFinite(t)||t<=Date.now()) throw new ApiError(400,'Escolha um horário futuro para abrir a aula.');
        opens=new Date(t).toISOString();
      }
      const row={class_id:classId,title:str(b.title,2,120,'o título'),topic:str(b.topic||'',0,120,'o tema'),objective:str(b.objective||'',0,1000,'o objetivo'),lesson_date:date,status,opens_at:opens};
      if(b.id) check(await db.from('lessons').update(row).eq('id',id(b.id)).select('id').single());
      else check(await db.from('lessons').insert(row));
    } else if(action==='invite-staff') {
      const email=str(b.email,5,254,'o e-mail').toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'E-mail inválido.');
      check(await db.from('staff_access').upsert({email}));
    } else throw new ApiError(400,'Ação desconhecida.');
    return reply({ok:true});
  } catch(e) {
    if(e instanceof ApiError) return reply({error:e.message},e.status);
    console.error('school-api: unexpected failure');
    return reply({error:'Não foi possível concluir. Tente novamente.'},500);
  }
});
