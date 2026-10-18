import {suits,type GameNotice,type GameResult,type Player} from './engine';
import {spellNames} from './spells';
export function winnerText(result:GameResult|undefined,self:Player=0){return !result?undefined:result.winner===null?'Ничья':result.winner===self?'Вы победили!':'Бот победил';}
export function noticeText(notice:GameNotice|undefined,self:Player=0):string {
 if(!notice)return '';
 if(notice.type==='magic_applied')return (notice.player===self?'Вы применили':'Соперник применил')+' «'+(spellNames[notice.spell]||notice.spell)+'».'+(notice.spell==='fate'?' Новый козырь: '+suits[notice.trump!]:'');
 return {started:'Партия началась. Первый ход — по младшему козырю.',defended:'Бито. Ход переходит защитнику.',taken:'Защитник забрал карты.',taking:'Защитник берёт. Атакующий может подкинуть.',passed:'Атака пропущена: все обычные карты временно заблокированы.',magic_failed:'Неверный ответ. Магическая карта сгорела.'}[notice.type];
}
