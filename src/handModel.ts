import type { Card } from './engine';

export function splitHand(cards: readonly Card[]) {
  return { ordinary: cards.filter(c => !c.spell), magic: cards.filter(c => c.spell) };
}

// Physical order stays stable even when an effect reverses gameplay strength.
export function sortOrdinaryCards(cards: readonly Card[]): Card[] {
  return cards.filter(c => !c.spell).slice().sort((a,b) => a.rank-b.rank || a.suit-b.suit || a.id.localeCompare(b.id));
}

export function toggleHandSelection(ids: readonly string[], card: Card, cards: readonly Card[], attacking: boolean) {
  if (ids.includes(card.id)) return ids.filter(id => id !== card.id);
  if (!attacking || cards.find(c => c.id === ids[0])?.rank !== card.rank) return [card.id];
  return [...ids, card.id];
}

export function handLayout(count: number, viewport: number, cardWidth: number, cardHeight: number) {
  const compact = count >= 7;
  const scrolling = count >= 11;
  const side = 18, lift = 42;
  const minStep = Math.max(28, cardWidth * .3);
  const idealStep = cardWidth * (scrolling ? .9 : compact ? .55 : .83);
  const fittingStep = count > 1 ? (viewport-cardWidth-side*2)/(count-1) : 0;
  const step = scrolling ? idealStep : Math.max(minStep, Math.min(idealStep, fittingStep));
  const extent = count ? cardWidth + side*2 + step*(count-1) : viewport;
  const width = Math.max(viewport, extent);
  const scroll = scrolling || extent > viewport + 1;
  const maxAngle = scrolling ? 3 : compact ? 5 : 8;
  const drop = scrolling ? 4 : compact ? 10 : 18;
  return {
    mode: scrolling ? 'scroll' : compact ? 'compact' : 'fan',
    scroll, width, height: lift+cardHeight+drop+12, cardWidth, cardHeight,
    positions: Array.from({length:count},(_,i) => {
      const t = count <= 1 ? 0 : (i-(count-1)/2)/((count-1)/2);
      return { x:(width-(cardWidth+step*(count-1)))/2+i*step, y:lift+t*t*drop, angle:t*maxAngle };
    })
  };
}
