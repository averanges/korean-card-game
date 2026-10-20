/** Host paths only. Gameplay and room IDs remain independent of the frontend base. */
export const appBase=import.meta.env?.BASE_URL||'/';
export function withBase(path:string,base=appBase){
 if(!path.startsWith('/')||path.startsWith('//'))throw Error('Expected an application path');
 return base+path.slice(1);
}
export function withoutBase(pathname:string,base=appBase){
 const path=pathname===base.slice(0,-1)?'/':pathname.startsWith(base)?'/'+pathname.slice(base.length):'/';
 return path.replace(/\/+$/,'')||'/';
}
export const currentAppPath=()=>withoutBase(location.pathname);
