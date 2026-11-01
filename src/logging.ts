import log from 'loglevel';

export type LogLevel='DEBUG'|'INFO'|'WARN'|'ERROR';
export type LogContext=Record<string,unknown>;
export type Emit=(level:LogLevel,event:string,context?:LogContext)=>void;
const levels:LogLevel[]=['DEBUG','INFO','WARN','ERROR'];
export const sessionId=crypto.randomUUID();
export function resolveLogLevel(value:unknown):LogLevel{return typeof value==='string'&&levels.includes(value.toUpperCase() as LogLevel)?value.toUpperCase() as LogLevel:'INFO';}
const logger=log.getLogger('tetris');
const environment=(import.meta as ImportMeta & {env?:Record<string,string>}).env;
let configured:unknown=environment?.VITE_LOG_LEVEL;
try{configured=localStorage.getItem('tetris-log-level')||configured;}catch{}
logger.setLevel(resolveLogLevel(configured),false);
let players:string[]=[];
export function setLogPlayers(ids:string[]){players=[...ids];}
export function setLogLevel(level:LogLevel){logger.setLevel(resolveLogLevel(level),false);}
export const logEvent:Emit=(level,event,context={})=>{
 logger[level.toLowerCase() as 'debug'|'info'|'warn'|'error']({timestamp:new Date().toISOString(),...context,level,event,sessionId,...(players.length?{playerIds:[...players]}:{})});
};
export function errorDetails(error:unknown){return error instanceof Error?{name:error.name,message:error.message,stack:error.stack}: {message:typeof error==='string'?error:'Unknown error'};}
export function reportError(event:string,error:unknown,context:LogContext={}){logEvent('ERROR',event,{...context,error:errorDetails(error)});}

type Snapshot={id:string;status:'ready'|'playing'|'paused'|'over';score:number;lines:number};
/** Observe committed transitions: never log a tick, movement, render or turn change. */
export function createGameLifecycle(context:LogContext,emit:Emit=logEvent){
 let previous:Snapshot|undefined;
 return (game:Snapshot)=>{
  if(previous?.id!==game.id){emit('INFO','game_created',{...context,gameId:game.id});previous={...game,status:'ready'};}
  if(previous.status!==game.status){
   const event=game.status==='playing'?(previous.status==='paused'?'game_resumed':'game_started'):game.status==='paused'?'game_paused':game.status==='over'?'game_over':null;
   if(event)emit('INFO',event,{...context,gameId:game.id,...(game.status==='over'?{score:game.score,lines:game.lines}:{})});
  }
  previous={...game};
 };
}

export function installApplicationLogging(target:Pick<Window,'addEventListener'|'removeEventListener'>=window){
 logEvent('INFO','application_started');
 const onError=(event:Event)=>{const e=event as ErrorEvent;reportError('unexpected_error',e.error||e.message,{source:'window',filename:e.filename,line:e.lineno});};
 const onRejection=(event:Event)=>reportError('unhandled_rejection',(event as PromiseRejectionEvent).reason,{source:'promise'});
 target.addEventListener('error',onError);target.addEventListener('unhandledrejection',onRejection);
 return ()=>{target.removeEventListener('error',onError);target.removeEventListener('unhandledrejection',onRejection);};
}
