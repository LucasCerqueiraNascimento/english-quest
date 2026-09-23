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
async function nameKey(name: string) {
  const base=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  if(base.length<3) throw new ApiError(400,'Escreva seu nome com pelo menos três letras.');
  return base.length<=20?base:`${base.slice(0,13)}_${(await digest(base)).slice(0,6)}`;
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
    if(raw.length>16000) throw new ApiError(413,'Solicitação muito grande.');
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
      const name=typeof b.name==='string'?str(b.name,3,40,'seu nome').replace(/\s+/g,' '):null;
      // The nickname branch keeps accounts made by older versions accessible.
      const nick=b.nickname!==undefined?str(b.nickname,3,20,'o identificador').toLowerCase():name?await nameKey(name):'';
      if(!/^[a-z0-9_]{3,20}$/.test(nick)) throw new ApiError(400,'Confira seu nome.');
      const p=pin(b.pin);
      await limit(`${action}:account:${code}:${nick}`,action==='login'?5:3);
      const c=check(await db.from('classes').select('id').eq('join_code',code).eq('archived',false).maybeSingle());
      if(!c) throw new ApiError(400,'Confira o código da turma, seu nome e o PIN com a professora.');
      if(action==='register') {
        if(!name) throw new ApiError(400,'Informe seu nome.');
        const avatar=str(b.avatar,1,12,'o avatar');
        if(!['rocket','cat','star','planet','book','bolt'].includes(avatar)) throw new ApiError(400,'Escolha um avatar.');
        const salt=random();
        const r=await db.rpc('eq_register_student',{p_class:c.id,p_name:name,p_nick:nick,p_avatar:avatar,p_hash:await pinHash(p,salt),p_salt:salt});
        if(r.error?.code==='23505') throw new ApiError(409,'Já há um cadastro com esse nome nesta turma. Informe também o sobrenome ou fale com a professora.');
        check(r);
        return reply({ok:true,message:'Cadastro enviado! Aguarde a aprovação da professora.'});
      }
      const s=check(await db.from('students').select('id,status').eq('class_id',c.id).eq('nickname',nick).maybeSingle());
      const cred=s?check(await db.from('student_credentials').select('pin_hash,salt').eq('student_id',s.id).maybeSingle()):null;
      const calculated=await pinHash(p,cred?.salt||'constant-dummy-salt');
      if(!s||!cred||!equal(calculated,cred.pin_hash)) throw new ApiError(401,'Confira o código da turma, seu nome e o PIN com a professora.');
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
      const lessonIds=lessons.map(x=>x.id);
      const games=lessonIds.length?check(await db.from('picture_games').select('id,lesson_id,title').in('lesson_id',lessonIds)):[];
      const attempts=games.length?check(await db.from('picture_attempts').select('game_id,attempt_number,score,completed_at').eq('student_id',s.id).in('game_id',games.map(g=>g.id))):[];
      const year=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bahia',year:'numeric'}).format(new Date()));
      let points=0,completedGames=0;
      if(s.status==='approved') {
        // Include closed/archived lessons in the yearly score. Count the student's best completed attempt per game.
        const completed=check(await db.from('picture_attempts').select('game_id,score').eq('student_id',s.id).not('completed_at','is',null));
        if(completed.length){
          const best=new Map<string,number>();
          for(const attempt of completed) best.set(attempt.game_id,Math.max(best.get(attempt.game_id)||0,attempt.score));
          const scoredGames=check(await db.from('picture_games').select('id,lesson_id').in('id',[...best.keys()]));
          const scoredLessons=scoredGames.length?check(await db.from('lessons').select('id,lesson_date').eq('class_id',c.id).in('id',scoredGames.map(game=>game.lesson_id))):[];
          const dates=new Map(scoredLessons.map(lesson=>[lesson.id,lesson.lesson_date]));
          for(const game of scoredGames){if(dates.get(game.lesson_id)?.startsWith(`${year}-`)){points+=best.get(game.id)||0;completedGames++}}
        }
      }
      return reply({student:{id:s.id,display_name:s.display_name,nickname:s.nickname,avatar:s.avatar,status:s.status},class:c,lessons,games,attempts,scoreboard:{year,points,completedGames}});
    }
    if(action==='student-logout') {
      const token=req.headers.get('x-student-token');
      if(token) check(await db.from('student_sessions').delete().eq('token_hash',await digest(token)));
      return reply({ok:true});
    }
    if(action==='game-state'||action==='game-start'||action==='game-answer') {
      const {s}=await student(req);
      if(s.status!=='approved') throw new ApiError(403,'Aguarde a aprovação da professora.');
      const gameId=id(b.game_id);
      if(action==='game-start'||action==='game-answer') {
        const result=await db.rpc('eq_picture_step',{p_student:s.id,p_game:gameId,
          p_item:action==='game-answer'?id(b.item_id):null,
          p_choice:action==='game-answer'?str(b.choice,2,60,'a resposta'):null});
        if(result.error) {
          if(result.error.message.includes('attempt_limit')) throw new ApiError(409,'Você já concluiu as três tentativas.');
          if(result.error.message.includes('game_unavailable')) throw new ApiError(403,'Este jogo ainda não está disponível.');
          if(result.error.message.includes('game_empty')) throw new ApiError(409,'O jogo ainda está sendo preparado.');
          if(result.error.message.includes('attempt_unavailable')) throw new ApiError(409,'Comece uma nova partida para responder.');
          if(result.error.message.includes('item_order')||result.error.message.includes('choice_invalid')) throw new ApiError(400,'Confira a questão e a resposta.');
          check(result);
        }
        if(action==='game-answer') return reply(result.data);
      }
      const g=check(await db.from('picture_games').select('id,lesson_id,title').eq('id',gameId).single());
      const l=check(await db.from('lessons').select('class_id,status,opens_at').eq('id',g.lesson_id).single());
      if(l.class_id!==s.class_id||!(l.status==='published'||(l.status==='scheduled'&&l.opens_at&&Date.parse(l.opens_at)<=Date.now()))) throw new ApiError(403,'Este jogo ainda não está disponível.');
      const items=check(await db.from('picture_items').select('id,position,image_url,choices').eq('game_id',gameId).order('position'));
      const attempts=check(await db.from('picture_attempts').select('id,score,attempt_number,completed_at').eq('game_id',gameId).eq('student_id',s.id).order('attempt_number',{ascending:false}));
      const current=attempts[0]?.completed_at?null:attempts[0];
      const answers=current?check(await db.from('picture_answers').select('item_id,correct,resolved,mistakes,points').eq('attempt_id',current.id)):[];
      return reply({game:g,items,attempt:current,answers,best:Math.max(0,...attempts.filter(a=>a.completed_at).map(a=>a.score)),attemptsUsed:attempts.length});
    }
    const user=await staff(req);
    if(action==='dashboard') {
      const [classes,students,lessons,access,games,attempts,answers]=await Promise.all([
        db.from('classes').select('*').order('created_at',{ascending:false}),
        db.from('students').select('*').order('created_at',{ascending:false}),
        db.from('lessons').select('*').order('lesson_date',{ascending:false}),
        db.from('staff_access').select('email').order('email'),
        db.from('picture_games').select('id,lesson_id,title'),
        db.from('picture_attempts').select('game_id,student_id,score,completed_at').not('completed_at','is',null),
        db.from('picture_answers').select('item_id,correct,mistakes,picture_items(answer,game_id)').eq('resolved',true),
      ]);
      return reply({email:user.email,classes:check(classes),students:check(students),lessons:check(lessons),staff:check(access),games:check(games),attempts:check(attempts),answers:check(answers)});
    }
    if(action==='game-editor') {
      const game=check(await db.from('picture_games').select('id,lesson_id,title').eq('lesson_id',id(b.lesson_id)).maybeSingle());
      const items=game?check(await db.from('picture_items').select('position,image_url,answer,choices').eq('game_id',game.id).order('position')):[];
      const countResult=game?await db.from('picture_attempts').select('id',{count:'exact',head:true}).eq('game_id',game.id):null;
      if(countResult) check(countResult);
      const attempts=countResult?.count||0;
      return reply({game,items,locked:Boolean(attempts)});
    }
    if(action==='save-game') {
      const lessonId=id(b.lesson_id);
      const lesson=check(await db.from('lessons').select('id,status').eq('id',lessonId).single());
      const existing=check(await db.from('picture_games').select('id').eq('lesson_id',lesson.id).maybeSingle());
      if(existing) {
        const count=await db.from('picture_attempts').select('id',{count:'exact',head:true}).eq('game_id',existing.id);
        check(count);if(count.count) throw new ApiError(409,'O jogo já recebeu respostas. Crie uma nova aula para mudar as perguntas.');
      }
      const items=b.items;
      if(!Array.isArray(items)||items.length<4||items.length>24) throw new ApiError(400,'Inclua de 4 a 24 imagens.');
      const rows=items.map((item:unknown,position:number)=>{
        if(!item||typeof item!=='object') throw new ApiError(400,'Confira as imagens.');
        const i=item as Record<string,unknown>;
        const image=str(i.image_url,2,500,'o endereço da imagem');
        if(!/^\/(?:rooms|furniture)\/[a-z0-9-]+\.(?:svg|webp)$/.test(image)&&!/^https:\/\/[^\s]+$/i.test(image)) throw new ApiError(400,'Use uma imagem HTTPS ou uma imagem da biblioteca.');
        const answer=str(i.answer,2,60,'a palavra correta');
        if(!Array.isArray(i.choices)||i.choices.length!==4) throw new ApiError(400,'Cada imagem precisa de quatro opções.');
        const choices=i.choices.map(x=>str(x,2,60,'a opção'));
        if(new Set(choices.map(x=>x.toLowerCase())).size!==4||!choices.includes(answer)) throw new ApiError(400,'As quatro opções devem ser diferentes e conter a resposta correta.');
        return {position,image_url:image,answer,choices};
      });
      const title=str(b.title||'Picture Challenge',2,80,'o título do jogo');
      const game=check(await db.from('picture_games').upsert({lesson_id:lessonId,title},{onConflict:'lesson_id'}).select('id').single());
      check(await db.from('picture_items').delete().eq('game_id',game.id));
      check(await db.from('picture_items').insert(rows.map(row=>({...row,game_id:game.id}))));
      return reply({ok:true});
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
