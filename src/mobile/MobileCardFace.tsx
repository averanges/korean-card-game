import {ranks,suits,type Card} from '../engine';
export function MobileCardFace({card,back=false,mini=false,translation=true}:{card:Card;back?:boolean;mini?:boolean;translation?:boolean}){
 return <div className={'ux-card '+(back?'ux-back':'')+(!back&&[1,2].includes(card.suit)?' ux-red':'')} aria-hidden="true">{!back&&<><span className="ux-corner">{ranks[card.rank]}<small>{suits[card.suit]}</small></span>{!mini&&<span className="ux-card-word" lang="ko">{card.word.ko}{translation&&<small lang="ru">{card.word.ru}</small>}</span>}<span className="ux-card-star">✧</span></>}</div>;
}
