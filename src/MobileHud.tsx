import {MagicStatus} from './MagicStatus';

export function MobileHud({attacking,result,name,ordinary,magic,trump,deck,simple,connection}:{attacking:boolean;result?:string;name:string;ordinary:number;magic:number;trump:number;deck:number;simple:boolean;connection:string}){
 return <section className="mobile-hud" aria-label="Состояние партии">
  <div className={'mobile-phase '+(attacking?'attacking':'defending')}><strong>{result||(attacking?'Ваш ход':'Ход соперника')}</strong><span>{attacking?'⚔ Атака':'♢ Защита'}</span></div>
  <div className="mobile-opponent"><strong>{name}</strong><span>{ordinary} карт · ✦ {magic}</span><small role="status">{connection}</small></div>
  <MagicStatus trump={trump} count={deck} simple={simple}/>
 </section>;
}
