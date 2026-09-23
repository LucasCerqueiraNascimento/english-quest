'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, LockKeyhole, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { Notice } from './shared';
import { api } from '@/lib/api';
import { avatars } from '@/lib/types';

type Mode = 'login' | 'register';
type Place = 'in' | 'on' | 'under';
const places: Place[] = ['in', 'on', 'under'];
const sentences: Record<Place, string> = {
  in: 'The cat is in the box.',
  on: 'The cat is on the box.',
  under: 'The cat is under the box.',
};

export function Entry() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [code, setCode] = useState('');
  const [avatar, setAvatar] = useState('rocket');
  const [place, setPlace] = useState<Place>('in');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get('code');
    if (invite) setCode(invite.slice(0, 8).toUpperCase());
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setMessage('');
    setError(false);
    setShowPin(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ token?: string; message?: string }>(mode === 'login' ? 'login' : 'register', {
        code, nickname: form.get('nickname'), pin: form.get('pin'),
        name: form.get('name'), avatar,
      }, 'public');
      if (result.token) {
        sessionStorage.setItem('eq_student', result.token);
        router.push('/student');
      } else {
        setMode('login');
        setError(false);
        setMessage(result.message || 'Cadastro enviado. Aguarde a aprovação da professora.');
      }
    } catch (cause) {
      setError(true);
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="quest-page"><main className="quest-shell">
    <section className="quest-story" aria-label="Bem-vindo ao English Quest">
      <div className="quest-brand"><span className="quest-brand-mark" aria-hidden="true">EQ<span>✦</span></span><span className="quest-brand-divider"/><span className="quest-brand-name">English Quest<small>Sua aventura em inglês</small></span></div>
      <span className="quest-float quest-float-one" aria-hidden="true">Let&apos;s play!</span>
      <span className="quest-float quest-float-two" aria-hidden="true">New words ✦</span>
      <div className="quest-story-content">
        <span className="quest-eyebrow"><Sparkles size={16}/> Uma nova aventura em cada aula</span>
        <h1>Seu inglês.<br/><span>Sua próxima<br/>missão.</span></h1>
        <p>Entre na sua turma e descubra um novo jeito de aprender brincando.</p>
        <div className="quest-mini" aria-label="Experimente uma palavra em inglês">
          <div className="quest-mini-heading"><span className="quest-mini-icon"><Rocket size={21}/></span><div><small>Um gostinho da aventura</small><strong>Onde está o gatinho?</strong></div></div>
          <div className={`quest-scene quest-scene-${place}`} aria-hidden="true"><div className="quest-scene-box"><span className="quest-scene-cat">🐱</span></div></div>
          <div className="quest-mini-choices" aria-label="Escolha a posição do gatinho">{places.map(option => <button key={option} type="button" aria-pressed={place === option} onClick={() => setPlace(option)}>{option}</button>)}</div>
          <p className="quest-sentence" aria-live="polite">{sentences[place]}</p>
        </div>
      </div>
      <div className="quest-story-footer"><ShieldCheck size={17}/> Um espaço para aprender com a sua turma</div>
    </section>

    <section className="quest-access" aria-label="Acesso do aluno">
      <div className="quest-access-top"><span className="quest-access-label">ESPAÇO DO ALUNO</span><Link href="/teacher/login">Sou professora <ArrowRight size={15}/></Link></div>
      <div className="quest-form-wrap">
        <div className="quest-welcome"><div><span className="quest-kicker">HELLO, EXPLORADOR!</span><h2>{mode === 'login' ? 'Que bom te ver!' : 'Sua aventura começa aqui!'}</h2><p>{mode === 'login' ? 'Entre para encontrar a sua turma.' : 'Crie seu perfil e aguarde a professora aprovar.'}</p></div><div className="quest-buddy" aria-label="Mascote sorridente" role="img"><span/></div></div>
        <div className="quest-tabs" role="group" aria-label="Entrar ou criar conta"><button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>Já tenho conta</button><button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => changeMode('register')}>Primeira vez</button></div>
        <Notice message={message} error={error}/>
        <form className="quest-form" onSubmit={submit}>
          <label>Código da turma<span className="quest-input"><span className="quest-input-icon" aria-hidden="true">#</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Ex.: A1B2C3D4" required minLength={8} maxLength={8} autoCapitalize="characters" autoComplete="off"/></span></label>
          {mode === 'register' && <label>Seu primeiro nome<span className="quest-input"><span className="quest-input-icon" aria-hidden="true">✦</span><input name="name" required minLength={2} maxLength={40} placeholder="Como a professora chama você?" autoComplete="given-name"/></span></label>}
          <label>Apelido<span className="quest-input"><span className="quest-input-icon" aria-hidden="true">@</span><input name="nickname" required pattern="[a-zA-Z0-9_]{3,20}" minLength={3} maxLength={20} placeholder="Ex.: explorador_10" autoCapitalize="none" autoComplete="username"/></span><small>Use de 3 a 20 letras sem acento, números ou _.</small></label>
          <label>PIN de 4 números<span className="quest-input"><KeyRound size={18} aria-hidden="true"/><input name="pin" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required placeholder="••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/><button type="button" className="quest-reveal" aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'} onClick={() => setShowPin(!showPin)}>{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
          {mode === 'register' && <fieldset className="quest-avatar-field"><legend>Escolha seu explorador</legend><div className="quest-avatars">{Object.entries(avatars).map(([key, emoji]) => <button type="button" key={key} aria-label={`Avatar ${key}`} aria-pressed={avatar === key} onClick={() => setAvatar(key)}>{emoji}{avatar === key && <Check size={13} className="quest-avatar-check"/>}</button>)}</div></fieldset>}
          <button className="quest-submit" type="submit" disabled={busy}>{busy ? 'Só um instante…' : mode === 'login' ? 'Entrar na minha turma' : 'Criar meu perfil'}<ArrowRight size={19}/></button>
        </form>
        <p className="quest-help"><LockKeyhole size={15}/>{mode === 'login' ? 'Esqueceu o PIN? Peça ajuda à professora.' : 'Seu cadastro precisa da aprovação da professora.'}</p>
      </div>
      <footer className="quest-access-footer"><span>English Quest · Aprender pode ser uma aventura</span><Link href="/privacy">Privacidade</Link></footer>
    </section>
  </main></div>;
}
