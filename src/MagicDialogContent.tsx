import type {ReactNode,CSSProperties} from 'react';
import {MagicBurn} from './MagicBurn';
import {spells} from './spells';
/** Shared composition of the existing question / artwork / effect dialog. */
export function MagicDialogContent({spell,children,failed=false,burnDelay=0,burnDuration=1100,extra,onCancel,cancelDisabled=false}:{spell:typeof spells[number];children:ReactNode;failed?:boolean;burnDelay?:number;burnDuration?:number;extra?:ReactNode;onCancel:()=>void;cancelDisabled?:boolean}) {
 return <>{children}<div className={'activation-card spell-'+spell.id+(failed?' burning-card':'')} role="img" aria-label={spell.name} style={failed?({'--burn-delay':burnDelay+'ms','--burn-duration':burnDuration+'ms'} as CSSProperties):undefined}>{failed&&<><div className="burn-face"/><MagicBurn delay={burnDelay} duration={burnDuration}/></>}</div><div className="effect-column"><div className="parchment effect-panel"><h2>Эффект</h2><h3>{spell.name}</h3><div className="effect-divider">✧</div><p>{spell.effect}</p>{extra}</div><button className="spell-cancel" disabled={cancelDisabled} onClick={onCancel}>Отмена</button></div></>;
}
