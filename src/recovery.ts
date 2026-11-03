import {SHAPES,fits,rotate,type Matrix} from './engine.ts';
import {normalizeSettings,type Profile,type Settings} from './profiles.ts';
export type Game={pieces:number;id:string;placements:number;board:Matrix;shape:Matrix;x:number;y:number;queue:number[];held:number|null;type:number;holdUsed:boolean;score:number;lines:number;status:'ready'|'playing'|'paused'|'over'};
export type BoardCheckpoint={profile:Profile;game:Game;elapsed:number;previousBest:number};
export type SavedMatch={version:1;savedAt:number;mode:'solo'|'multiplayer';turn:number;guestConsent:boolean;boards:BoardCheckpoint[]};
export const RECOVERY_KEY='tetris-recovery-v1';
export const BACKUP_KEY=RECOVERY_KEY+'-backup';
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const integer=(n:unknown):n is number=>number(n)&&Number.isInteger(n);
const piece=(n:unknown):n is number=>integer(n)&&n<7;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function validSettings(s:unknown):s is Settings{
 if(!object(s)||typeof s.name!=='string'||!s.name.trim()||s.name.length>24||!['dark','light'].includes(s.theme)||!['Prism','Aurora','Candy'].includes(s.palette)||!integer(s.difficulty)||s.difficulty<1||s.difficulty>10||!number(s.volume)||s.volume>100||!['Crystal','Soft pop','Arcade','Off'].includes(s.sound)||!['animations','ghost','grid'].every(k=>typeof s[k]==='boolean')||!object(s.keys))return false;
 return ['left','right','rotate','down','drop','hold','pause'].every(k=>typeof s.keys[k]==='string'&&s.keys[k].length>0&&s.keys[k].length<32);
}
export function validateMatch(value:unknown):value is SavedMatch{
 if(!object(value)||value.version!==1||!number(value.savedAt)||!['solo','multiplayer'].includes(value.mode)||typeof value.guestConsent!=='boolean'||!Array.isArray(value.boards)||value.boards.length!==(value.mode==='solo'?1:2)||!integer(value.turn)||value.turn>=value.boards.length)return false;
 const ids=new Set<string>();
 for(const b of value.boards){
  if(!object(b)||!object(b.profile)||typeof b.profile.id!=='string'||!b.profile.id||ids.has(b.profile.id)||!validSettings(b.profile.settings)||!number(b.profile.best)||!number(b.elapsed)||!number(b.previousBest)||!object(b.game))return false;
  ids.add(b.profile.id);if(b.profile.id.startsWith('guest-')&&!value.guestConsent)return false;
  const g=b.game;if(typeof g.id!=='string'||!g.id||!['playing','paused','over'].includes(g.status)||!['score','lines','pieces','placements'].every(k=>integer(g[k]))||g.placements<g.pieces||typeof g.holdUsed!=='boolean'||!piece(g.type)||!(g.held===null||piece(g.held))||!Array.isArray(g.queue)||g.queue.length<1||g.queue.length>21||!g.queue.every(piece))return false;
  if(!Array.isArray(g.board)||g.board.length!==20||!g.board.every((r:unknown)=>Array.isArray(r)&&r.length===10&&r.every(n=>integer(n)&&n<=7)))return false;
  let shape=SHAPES[g.type];let validShape=false;for(let i=0;i<4;i++){if(JSON.stringify(shape)===JSON.stringify(g.shape))validShape=true;shape=rotate(shape);}if(!validShape||!Number.isInteger(g.x)||g.x<0||g.x>9||!Number.isInteger(g.y)||g.y<0||g.y>19)return false;
  if(g.status!=='over'&&!fits(g.board,g.shape,g.x,g.y))return false;
 }
 return value.boards.some(b=>b.game.status!=='over')&&value.boards[value.turn].game.status!=='over';
}
export function loadRecovery(storage:StorageLike,profileIds:string[]):{match:SavedMatch|null;warning?:string}{
 try{
  let invalid=false;
  for(const key of [RECOVERY_KEY,BACKUP_KEY]){const raw=storage.getItem(key);if(!raw)continue;let data:unknown;try{data=JSON.parse(raw);}catch{invalid=true;continue;}
   if(object(data)&&data.version===1&&data.discarded===true)return {match:null};
   if(!validateMatch(data)){invalid=true;continue;}
   if(data.boards.some(b=>!b.profile.id.startsWith('guest-')&&!profileIds.includes(b.profile.id)))return {match:null,warning:'A saved player profile is missing. Start a fresh game instead.'};
   return {match:data,...(invalid?{warning:'The latest save was damaged. The previous valid checkpoint is available.'}:{})};
  }
  return {match:null,...(invalid?{warning:'The saved game is damaged or incompatible. You can start a fresh game.'}:{})};
 }catch{return {match:null,warning:'Browser storage is unavailable. Recovery cannot be loaded.'};}
}
export function saveRecovery(storage:StorageLike,match:SavedMatch){
 if(!validateMatch(match))throw new Error('Invalid recovery checkpoint');
 const previous=storage.getItem(RECOVERY_KEY);if(previous){try{if(validateMatch(JSON.parse(previous)))storage.setItem(BACKUP_KEY,previous);}catch(error){if(error instanceof SyntaxError){}else throw error;}}
 storage.setItem(RECOVERY_KEY,JSON.stringify(match));
}
export function discardRecovery(storage:StorageLike){storage.setItem(RECOVERY_KEY,JSON.stringify({version:1,discarded:true}));storage.removeItem(BACKUP_KEY);}
export function restoreBoard(board:BoardCheckpoint):BoardCheckpoint{return {...board,profile:{...board.profile,settings:normalizeSettings(board.profile.settings)},game:{...board.game,status:board.game.status==='over'?'over':'paused'}};}
