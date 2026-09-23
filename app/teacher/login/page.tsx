'use client';
import {useState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,GraduationCap,ArrowLeft} from 'lucide-react';
import Link from 'next/link';
import {PublicHeader,Footer,Notice} from '@/components/shared';
import {supabase,assertEnvironment} from '@/lib/api';
export default function TeacherLogin(){
 const [mode,setMode]=useState<'login'|'signup'|'recover'|'update'>('login');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState(false);const router=useRouter();
 useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setMode('update');});return()=>subscription.unsubscribe();},[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);const email=String(f.get('email')||'').trim();const password=String(f.get('password')||'');
  try{assertEnvironment();if(mode==='login'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw new Error('Não foi possível entrar. Confira o e-mail, a senha e a confirmação do cadastro.');router.push('/teacher');}
  else if(mode==='signup'){const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/teacher/login'}});if(error)throw error;setMessage('Confira seu e-mail para confirmar a conta. Depois, volte e entre. O painel exige autorização administrativa.');setError(false);setMode('login');}
  else if(mode==='recover'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/teacher/login'});if(error)throw error;setError(false);setMessage('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.');}
  else{const {error}=await supabase.auth.updateUser({password});if(error)throw error;router.push('/teacher');}
  }catch(e){setError(true);setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="public-page"><PublicHeader/><main className="login-wrap"><Link className="text-link" href="/"><ArrowLeft size={16}/> Voltar para a entrada dos alunos</Link><section className="entry-card login-card"><span className="icon-square"><GraduationCap size={25}/></span><div className="eyebrow">ÁREA DA PROFESSORA</div><h1>{mode==='signup'?'Prepare seu acesso.':mode==='recover'?'Recupere sua senha.':mode==='update'?'Sua nova senha.':'Tudo pronto para ensinar.'}</h1><p className="muted">Organize suas turmas e acompanhe cada nova descoberta.</p><Notice message={message} error={error}/><form onSubmit={submit}>{mode!=='update'&&<label>E-mail<input name="email" type="email" required placeholder="voce@exemplo.com" autoComplete="email"/></label>}{mode!=='recover'&&<label>Senha<input name="password" type="password" minLength={mode==='login'?1:10} required autoComplete={mode==='login'?'current-password':'new-password'}/>{mode!=='login'&&<small>Use pelo menos 10 caracteres.</small>}</label>}<button className="button primary full" disabled={busy}>{busy?'Só um instante…':mode==='signup'?'Criar minha conta':mode==='recover'?'Enviar recuperação':mode==='update'?'Salvar nova senha':'Entrar no painel'}<ArrowRight size={18}/></button></form><div className="login-actions"><button onClick={()=>{setMode(mode==='signup'?'login':'signup');setMessage('')}}>{mode==='signup'?'Já tenho conta':'Primeiro acesso'}</button><button onClick={()=>{setMode(mode==='recover'?'login':'recover');setMessage('')}}>{mode==='recover'?'Voltar ao login':'Esqueci minha senha'}</button></div><p className="fine-print">Área restrita às pessoas autorizadas pela administração. Criar uma conta não concede acesso ao painel.</p></section></main><Footer/></div>
}
