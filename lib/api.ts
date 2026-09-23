import { createClient } from '@supabase/supabase-js';
// Public API identifiers, not secrets. Every operation is authorized by school-api.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dqmhafewnzckwiskrukh.supabase.co';
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ggs2pWJ31fz2b4R4ztxnog_ztTWP0UA';
export const supabase = createClient(SUPABASE_URL,PUBLISHABLE_KEY);
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export function assertEnvironment(){
  if(process.env.NEXT_PUBLIC_APP_ENV==='preview'&&SUPABASE_URL==='https://dqmhafewnzckwiskrukh.supabase.co')
    throw new ApiError('Esta é uma prévia visual. Configure um banco de testes separado para usar cadastros e acessos sem afetar os dados reais.',503);
}
export async function api<T=Record<string,unknown>>(action:string,body:Record<string,unknown>={},kind:'public'|'teacher'|'student'='teacher'):Promise<T>{
  assertEnvironment();
  const headers:Record<string,string>={'Content-Type':'application/json',apikey:PUBLISHABLE_KEY};
  if(kind==='teacher'){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new ApiError('Entre na conta da professora.',401);
    headers.Authorization=`Bearer ${session.access_token}`;
  }
  if(kind==='student') headers['x-student-token']=sessionStorage.getItem('eq_student')||'';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const res=await fetch(`${SUPABASE_URL}/functions/v1/school-api`,{method:'POST',headers,body:JSON.stringify({...body,action}),signal:controller.signal});
    const data=await res.json();
    if(!res.ok) throw new ApiError(data.error||'Não foi possível concluir.',res.status);
    return data as T;
  }catch(e){
    if(e instanceof ApiError) throw e;
    throw new ApiError('Não foi possível conectar. Confira sua internet e tente novamente.',503);
  }finally{clearTimeout(timeout);}
}
