import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/school-api/index.ts','utf8');
const schema=fs.readFileSync('supabase/schema.sql','utf8');
test('all application tables have RLS and no browser grants',()=>{
 for(const name of ['staff_access','classes','students','student_credentials','student_sessions','lessons','auth_rate_limits']){
  assert.ok(schema.includes(`alter table public.${name} enable row level security`));
 }
 assert.match(schema,/from anon, authenticated/);
 assert.doesNotMatch(schema,/security definer/i);
});
test('staff authentication validates verified identity and server allowlist',()=>{
 assert.match(source,/auth\.getUser\(token\)/);
 assert.match(source,/email_confirmed_at/);
 assert.match(source,/from\('staff_access'\)/);
 assert.doesNotMatch(source,/user_metadata/);
});
test('student security separates PIN hash, random session and live status',()=>{
 assert.match(source,/iterations:210000/);
 assert.match(source,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
 assert.match(source,/eq_rate_limit/);
 assert.match(source,/s\.status==='approved'/);
 assert.match(source,/c\.archived/);
});
test('no secret API key embedded in application source',()=>{
 for(const file of ['lib/api.ts','lib/types.ts']){
  const text=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(text,/sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY/);
 }
});
