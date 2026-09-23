import { Game } from './game';

const game = new Game(document.getElementById('app')!);
(window as unknown as { game: Game }).game = game;
