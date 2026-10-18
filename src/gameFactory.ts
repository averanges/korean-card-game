import {createGame,type Game} from './engine';
import {validateDeck,type DeckSnapshot} from './decks';
export function createDeckGame(snapshot:DeckSnapshot,random=Math.random):Game{
 const deck=validateDeck(snapshot),game=createGame(random,deck.words);
 game.wordDeck={name:deck.name,wordCount:game.dictionary!.length,sourceCount:deck.words.length};return game;
}
