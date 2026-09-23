'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,RotateCcw,X} from 'lucide-react';
import {api} from '@/lib/api';
import {Lesson} from '@/lib/types';
import {Loading,Notice} from './shared';
import {GameChoices,QuestionAudio} from './game-choices';
type Item={image_url:string;answer:string;choices:string[]};
type Data={game:{title:string}|null;items:Item[]};
type Feedback={text:string;points:number;resolved:boolean;correct:boolean};
export function GamePreview({lesson,onClose}:{lesson:Lesson;onClose:()=>void}){
 const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [index,setIndex]=useState(0);const [mistakes,setMistakes]=useState(0);const [streak,setStreak]=useState(0);const [score,setScore]=useState(0);const [feedback,setFeedback]=useState<Feedback|null>(null);
 useEffect(()=>{let active=true;api<Data>('game-editor',{lesson_id:lesson.id}).then(result=>{if(active)setData(result)}).catch(cause=>{if(active)setError((cause as Error).message)});return()=>{active=false}},[lesson.id]);
 useEffect(()=>{function close(event:KeyboardEvent){if(event.key==='Escape')onClose()}window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose]);

 function choose(choice:string){const items=data?.items,item=items?.[index];if(!item||feedback?.resolved)return;const correct=choice===item.answer;const errors=mistakes+Number(!correct);const resolved=correct||errors===3;const points=correct?(mistakes===0?100:mistakes===1?70:50):0;const nextStreak=correct?streak+1:0;const bonus=resolved?(nextStreak===3?50:0)+(index===items!.length-1?100:0):0;
  setMistakes(errors);if(resolved){setStreak(nextStreak===3?0:nextStreak);setScore(score+points+bonus)}
  setFeedback({correct,resolved,points:points+bonus,text:correct?'Muito bem! ✨':resolved?`A resposta era ${item.answer}.`:'Tente novamente! Você consegue.'});
 }
 function next(){setFeedback(null);setMistakes(0);setIndex(index+1)}
 function restart(){setIndex(0);setMistakes(0);setStreak(0);setScore(0);setFeedback(null)}
 const item=data?.items[index];
 return <div className="game-editor-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="game-editor game-preview" role="dialog" aria-modal="true" aria-label={`Testar jogo da aula ${lesson.title}`}><header className="game-editor-head"><div><span className="eyebrow">MODO TESTE · ÁREA DA PROFESSORA</span><h2>{data?.game?.title||'Testar Picture Challenge'}</h2><p>Jogue como os alunos veem as perguntas. Este teste não cria tentativas nem altera os relatórios.</p></div><button className="icon-button" aria-label="Fechar teste" onClick={onClose}><X/></button></header><Notice message={error} error/>{!data&&!error?<Loading/>:data&&!data.game?<p>Crie e salve o jogo nesta aula para poder testá-lo.</p>:data&&item?<div className="preview-board"><div className="game-progress"><strong>Imagem {index+1} de {data.items.length}</strong><strong>{score} pontos</strong></div><div className="game-track"><span style={{width:`${index/data.items.length*100}%`}}/></div><div className="game-picture"><img src={item.image_url} alt="Imagem da pergunta"/></div><h3>What is this? <QuestionAudio/></h3><p>Toque na palavra que combina com a imagem.</p><GameChoices choices={item.choices} disabled={!!feedback?.resolved} onChoose={choose}/>{feedback&&<div role="status" className={`game-feedback ${feedback.correct?'good':'retry'}`}><strong>{feedback.text}</strong><span>{feedback.points?`+${feedback.points} pontos`:feedback.resolved?'Vamos para a próxima imagem.':`${3-mistakes} chances restantes`}</span>{feedback.resolved&&<button className="button primary" onClick={next}>{index===data.items.length-1?'Ver resultado':'Próxima imagem'}<ArrowRight size={16}/></button>}</div>}</div>:data?.game?<div className="game-result"><span className="game-result-icon">🏆</span><h3>Fim do teste!</h3><strong>{score} pontos</strong><p>Esta pontuação não foi salva. Você pode testar quantas vezes quiser.</p><button className="button primary" onClick={restart}><RotateCcw size={17}/>Testar de novo</button></div>:null}</section></div>
}
