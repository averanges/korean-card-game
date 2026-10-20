export const WAKE_TIMEOUT_MS=90000;
export type ConnectionProgress=(text:string)=>void;
export function needsReadiness(api:string){try{return new URL(api).hostname.endsWith('.onrender.com')||import.meta.env?.VITE_ROOM_HEALTHCHECK==='1';}catch{return false;}}
export class RoomReadinessError extends Error {constructor(public code:'health_timeout'|'health_http'|'health_network',status?:number){super(code==='health_timeout'?'HTTP: сервер не проснулся за 90 секунд. Повторите попытку.':code==='health_http'?`HTTP: сервер готовности вернул ошибку ${status??''}. Повторите попытку позже.`:'HTTP: не удалось проверить готовность сервера. Проверьте сеть и повторите попытку.');}}
/** Safe GETs may repeat during cold start. Room creation and commands never auto-repeat here. */
export async function waitForRoomServer(api:string,progress:ConnectionProgress=()=>{},signal?:AbortSignal,force=false){
 if(!force&&!needsReadiness(api))return;
 const controller=new AbortController(),started=Date.now();let timedOut=false,lastStatus:number|undefined;
 const abort=()=>controller.abort();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');signal?.addEventListener('abort',abort,{once:true});
 const report=()=>progress(`Пробуждаем сервер: проверяем HTTP /health… ${Math.floor((Date.now()-started)/1000)} с`);
 report();const ticker=setInterval(report,1000),deadline=setTimeout(()=>{timedOut=true;controller.abort();},WAKE_TIMEOUT_MS);
 const pause=()=>new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},1500);controller.signal.addEventListener('abort',cancel,{once:true});if(controller.signal.aborted)cancel();});
 try{
  while(!controller.signal.aborted){
   try{
    const response=await fetch(api+'/health',{signal:controller.signal,cache:'no-store',credentials:'omit'});lastStatus=response.status;
    if(response.ok){const value=await response.json();if(value?.ok===true&&['hangul-durak-render-probe','hangul-durak-rooms'].includes(value?.service)){progress('HTTP: сервер готов.');return;}}
    else if(response.status>=400&&response.status<500)throw new RoomReadinessError('health_http',response.status);
   }catch(error){if(error instanceof RoomReadinessError)throw error;if(controller.signal.aborted)throw error;}
   await pause();
  }
 }catch(error){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(error instanceof RoomReadinessError)throw error;throw new RoomReadinessError(timedOut?'health_timeout':lastStatus?'health_http':'health_network',lastStatus);}
 finally{clearInterval(ticker);clearTimeout(deadline);signal?.removeEventListener('abort',abort);}
 if(timedOut)throw new RoomReadinessError('health_timeout');
}
