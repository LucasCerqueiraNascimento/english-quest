'use client';
import Link from 'next/link';
import { Compass, LoaderCircle } from 'lucide-react';
export function Brand({light=false}:{light?:boolean}){return <Link className={`brand ${light?'light':''}`} href="/" aria-label="English Quest — início"><span className="brand-symbol"><Compass size={25}/></span><span>english<span className="brand-bottom">quest<span className="brand-dot">.</span></span></span></Link>}
export function PublicHeader(){return <header className="public-header"><Brand/></header>}
export function Notice({message,error=false}:{message:string;error?:boolean}){return message?<div className={`notice ${error?'error':'success'}`} role={error?'alert':'status'}>{message}</div>:null}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin"/>Carregando seu espaço…</div>}
export function Empty({title,children}:{title:string;children:React.ReactNode}){return <div className="empty"><span className="empty-icon"><Compass size={28}/></span><h3>{title}</h3><p>{children}</p></div>}
export function Footer(){return <footer className="public-footer"><span>English Quest · Espaço de aprendizagem</span><Link href="/privacy">Privacidade e cuidado com os dados</Link></footer>}
