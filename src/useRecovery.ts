import {useEffect,useRef,useState} from 'react';
import {discardRecovery,loadRecovery,saveRecovery,type BoardCheckpoint,type SavedMatch} from './recovery';
import type {Profile} from './profiles';
import {logEvent} from './logging';
export function useRecovery(playing:boolean,players:Profile[],turn:number,profileIds:string[]){
 const [loaded]=useState(()=>{try{return loadRecovery(localStorage,profileIds);}catch{return {match:null,warning:'Recovery storage is unavailable.'};}});
 const [pending,setPending]=useState(loaded.match);const [notice,setNotice]=useState(loaded.warning||'');const [guestConsent,setConsent]=useState(false);const [savedAt,setSavedAt]=useState(0);
 const boards=useRef(new Map<string,BoardCheckpoint>());const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const disabled=useRef(false);const warned=useRef(false);
 const meta=useRef({playing,players,turn,guestConsent,pending});meta.current={playing,players,turn,guestConsent,pending};
 function fail(){setNotice('Recovery could not be saved. The last successful checkpoint is kept; this round may not be recoverable.');if(!warned.current){logEvent('WARN','recovery_storage_unavailable');warned.current=true;}}
 function clear(){try{discardRecovery(localStorage);setSavedAt(0);}catch{fail();}}
 function reset(){if(timer.current)clearTimeout(timer.current);timer.current=null;boards.current.clear();disabled.current=false;clear();}
 function save(){timer.current=null;const m=meta.current;if(disabled.current||!m.playing||m.pending)return;
  if(m.players.some(p=>p.id.startsWith('guest-'))&&!m.guestConsent)return;
  const all=m.players.map(p=>boards.current.get(p.id));if(all.some(b=>!b||b.game.status==='ready'))return;const snapshots=all as BoardCheckpoint[];
  if(snapshots.every(b=>b.game.status==='over')){clear();return;}
  const active=snapshots[m.turn]?.game.status==='over'?snapshots.findIndex(b=>b.game.status!=='over'):m.turn;
  const match:SavedMatch={version:1,savedAt:Date.now(),mode:snapshots.length===1?'solo':'multiplayer',turn:active,guestConsent:m.guestConsent,boards:snapshots};
  try{saveRecovery(localStorage,match);setSavedAt(match.savedAt);if(warned.current||notice){setNotice('');warned.current=false;}}catch{fail();}
 }
 const saveRef=useRef(save);saveRef.current=save;
 function checkpoint(board:BoardCheckpoint,important=false){boards.current.set(board.profile.id,board);if(disabled.current)return;if(important&&timer.current){clearTimeout(timer.current);timer.current=null;}if(!timer.current)timer.current=setTimeout(()=>saveRef.current(),important?0:1000);}
 useEffect(()=>{const flush=()=>saveRef.current();const visibility=()=>{if(document.visibilityState==='hidden')flush();};window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);return()=>{if(timer.current)clearTimeout(timer.current);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);};},[]);
 function discard(){setConsent(false);meta.current.guestConsent=false;disabled.current=true;if(timer.current)clearTimeout(timer.current);timer.current=null;clear();setPending(null);}
 function resume(){const match=pending;if(!match)return null;boards.current.clear();for(const b of match.boards)boards.current.set(b.profile.id,b);setConsent(match.guestConsent);setPending(null);disabled.current=false;return match;}
 function consent(value:boolean){setConsent(value);meta.current.guestConsent=value;if(!value){clear();}else if(!timer.current)timer.current=setTimeout(()=>saveRef.current(),0);}
 return {pending,notice,savedAt,guestConsent,checkpoint,reset,discard,resume,consent};
}

