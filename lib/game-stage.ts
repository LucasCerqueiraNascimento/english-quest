export function gameStage(position:number,total:number){
 const stages=['Começando','Explorando','Desafio final'] as const;
 return stages[Math.min(2,Math.floor(position*3/Math.max(total,1)))];
}
