// Live integration test. Use ONLY disposable QA accounts and clean fixtures after.
// TEST_EMAIL and TEST_PASSWORD belong to an authorized, verified test staff user.
import assert from 'node:assert/strict';
const url=process.env.TEST_SUPABASE_URL||'https://dqmhafewnzckwiskrukh.supabase.co';
const key=process.env.TEST_PUBLISHABLE_KEY||'sb_publishable_Ggs2pWJ31fz2b4R4ztxnog_ztTWP0UA';
if(!process.env.TEST_EMAIL||!process.env.TEST_PASSWORD)throw Error('Provide disposable QA credentials in TEST_EMAIL and TEST_PASSWORD');
const authRes=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD})});
const auth=await authRes.json();assert.equal(authRes.status,200,JSON.stringify(auth));
async function call(action,data={},token=auth.access_token,studentToken=''){
 const r=await fetch(url+'/functions/v1/school-api',{method:'POST',headers:{apikey:key,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(studentToken?{'x-student-token':studentToken}:{})},body:JSON.stringify({action,...data})});
 const body=await r.json();return {status:r.status,body};
}
assert.equal((await call('dashboard',{},'')).status,401);
console.log('PASS: anonymous dashboard denied');
const rest=await fetch(url+'/rest/v1/students?select=*',{headers:{apikey:key,authorization:'Bearer '+auth.access_token}});
assert.ok([401,403].includes(rest.status));console.log('PASS: direct authenticated table access denied');
assert.equal((await call('save-class',{name:'QA disposable foundation',days:['Segunda','Quarta']})).status,200);
let d=(await call('dashboard')).body;const c=d.classes.find(x=>x.name==='QA disposable foundation');assert.ok(c);
console.log('PASS: create and reload class',c.id);
const credentials={code:c.join_code,nickname:'qa_student',pin:'8362'};
assert.equal((await call('register',{...credentials,name:'QA Student',avatar:'rocket'},'')).status,200);
assert.equal((await call('register',{...credentials,name:'QA Duplicate',avatar:'cat'},'')).status,409);
const login=await call('login',credentials,'');assert.equal(login.status,200,JSON.stringify(login.body));const session=login.body.token;
let me=await call('student-me',{},'',session);assert.equal(me.body.student.status,'pending');assert.equal(me.body.lessons.length,0);
assert.equal((await call('dashboard',{},session)).status,401);
console.log('PASS: registration, duplicate rejection, pending access, role separation');
const sid=me.body.student.id;
assert.equal((await call('student-status',{id:sid,status:'approved'})).status,200);
let lesson={class_id:c.id,title:'QA test lesson',topic:'System verification',objective:'Temporary fixture',lesson_date:'2026-09-28',status:'draft'};
assert.equal((await call('save-lesson',lesson)).status,200);
me=await call('student-me',{},'',session);assert.equal(me.body.lessons.length,0);
d=(await call('dashboard')).body;const l=d.lessons.find(x=>x.class_id===c.id);
assert.equal((await call('save-lesson',{...lesson,id:l.id,status:'scheduled',opens_at:new Date(Date.now()+86400000).toISOString()})).status,200);
assert.equal((await call('student-me',{},'',session)).body.lessons.length,0);
assert.equal((await call('save-lesson',{...lesson,id:l.id,status:'published'})).status,200);
me=await call('student-me',{},'',session);assert.equal(me.body.lessons.length,1);
assert.equal(me.body.lessons[0].title,'QA test lesson');
console.log('PASS: approval, hidden drafts, future schedules hidden, published lessons visible');
assert.equal((await call('student-status',{id:sid,status:'disabled'})).status,200);
assert.equal((await call('student-me',{},'',session)).status,403);
assert.equal((await call('student-status',{id:sid,status:'approved'})).status,200);
assert.equal((await call('reset-pin',{id:sid,pin:'9407'})).status,200);
assert.equal((await call('student-me',{},'',session)).status,401);
assert.equal((await call('login',credentials,'')).status,401);
const nextLogin=await call('login',{...credentials,pin:'9407'},'');assert.equal(nextLogin.status,200);
assert.equal((await call('archive-class',{id:c.id,archived:true})).status,200);
assert.equal((await call('student-me',{},'',nextLogin.body.token)).status,403);
assert.equal((await call('archive-class',{id:c.id,archived:false})).status,200);
console.log('PASS: disabled access, PIN reset invalidates sessions, archived class denied');
for(let i=0;i<6;i++){const r=await call('login',{...credentials,nickname:'ratelimit_qa',pin:'0000'},'');if(i===5)assert.equal(r.status,429);}
console.log('PASS: persistent account rate limiting');
console.log('QA_FIXTURES',JSON.stringify({class_id:c.id,student_id:sid,lesson_id:l.id}));
await fetch(url+'/auth/v1/logout',{method:'POST',headers:{apikey:key,authorization:'Bearer '+auth.access_token}});
console.log('PASS: QA staff signed out');
