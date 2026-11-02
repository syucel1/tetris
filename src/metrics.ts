/** Counts only active play time; pauses and other players' turns are excluded. */
export function createPlayClock(now:()=>number=()=>performance.now()){
 let accumulated=0;let started:number|null=null;
 return {
  setRunning(running:boolean){if(running&&started===null)started=now();else if(!running&&started!==null){accumulated+=Math.max(0,now()-started);started=null;}},
  reset(){accumulated=0;started=null;},
  elapsed(){return accumulated+(started===null?0:Math.max(0,now()-started));},
 };
}
export function formatDuration(milliseconds:number){const seconds=Math.floor(Math.max(0,milliseconds)/1000);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
export function piecesPerMinute(pieces:number,milliseconds:number){return milliseconds>0?Math.round(pieces*60000/milliseconds):0;}
export function compareBest(score:number,previousBest:number){return score>previousBest?'New personal best':score===previousBest&&score>0?'Personal best matched':`${Math.max(0,previousBest-score).toLocaleString()} to personal best`;}
