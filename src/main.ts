import { Game } from './game';

// The OSD face ships with the game (VT323, SIL Open Font License).
const font = new FontFace('VT323', `url(${import.meta.env.BASE_URL}assets/fonts/VT323.woff2)`);
font.load().then((f) => document.fonts.add(f)).catch(() => undefined);

const game = new Game(document.getElementById('app')!);
(window as unknown as { game: Game }).game = game;
