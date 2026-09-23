'use client';
import {Volume2} from 'lucide-react';
export function speakEnglish(word:string){
 if(typeof window==='undefined'||!('speechSynthesis' in window))return;
 window.speechSynthesis.cancel();
 const utterance=new SpeechSynthesisUtterance(word);
 utterance.lang='en-US';utterance.rate=.8;
 window.speechSynthesis.speak(utterance);
}
export function GameChoices({choices,disabled=false,onChoose}:{choices:string[];disabled?:boolean;onChoose:(choice:string)=>void}){
 return <div className="game-choices">{choices.map((choice,i)=><div className="choice-card" key={choice}>
  <button type="button" className="choice-answer" disabled={disabled} onClick={()=>onChoose(choice)} aria-label={`Escolher ${choice}`}><span className="choice-letter">{'ABCD'[i]}</span><span>{choice}</span></button>
  <button type="button" className="choice-audio" onClick={()=>speakEnglish(choice)} aria-label={`Ouvir pronúncia de ${choice}`} title={`Ouvir ${choice}`}><Volume2 size={20}/><span>Ouvir</span></button>
 </div>)}</div>
}
export function QuestionAudio(){return <button type="button" className="listen-button" aria-label="Ouvir pergunta em inglês" title="Ouvir pergunta" onClick={()=>speakEnglish('What is this?')}><Volume2 size={21}/><span>Ouvir</span></button>}
