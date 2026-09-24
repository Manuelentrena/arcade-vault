export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type GameCat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  /** Identificador estable; también es el segmento de URL. */
  id: string;
  title: string;
  /** Una línea, para la tarjeta de la biblioteca. */
  short: string;
  /** Párrafo, para la pantalla de detalle. */
  long: string;
  cat: GameCat;
  /** Clase CSS de la portada generada por CSS: "cover-bricks". */
  cover: string;
  /**
   * Portada en imagen, si el juego tiene una captura real bajo `public/`.
   * Cuando existe, sustituye a la portada generada por CSS.
   */
  image?: string;
  /** Variante de color del botón JUGAR. */
  color: GameColor;
  best: number;
  plays: string;
};

export const GAMES: Game[] = [
  {
    id: "tetrix",
    title: "TETRIX",
    short: "Encaja los tetrominós y limpia líneas sin llegar al techo.",
    long: "Siete piezas de neón caen sobre una rejilla de 10 × 20. Rótalas, deslízalas y encájalas para limpiar líneas: cada diez líneas sube el nivel y las piezas caen más rápido, hasta el nivel 10. Una sola vida: si el montón llega al techo, la partida termina y empiezas de nuevo.",
    cat: "PUZZLE",
    cover: "cover-tetro",
    image: "/juegos/tetrix.png",
    color: "magenta",
    best: 184220,
    plays: "31.8K",
  },
  {
    id: "serpentina",
    title: "SERPENTINA",
    short: "Crece sin morder tu propia cola.",
    long: "Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.",
    cat: "ARCADE",
    cover: "cover-snake",
    color: "green",
    best: 7820,
    plays: "9.1K",
  },
  {
    id: "gloton",
    title: "GLOTÓN",
    short: "Devora puntos y escapa de los fantasmas.",
    long: "Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.",
    cat: "ARCADE",
    cover: "cover-glot",
    color: "yellow",
    best: 96400,
    plays: "27.2K",
  },
  {
    id: "invasores",
    title: "INVASORES",
    short: "Defiende el planeta de filas alienígenas.",
    long: "Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.",
    cat: "SHOOTER",
    cover: "cover-invaders",
    color: "green",
    best: 54190,
    plays: "18.0K",
  },
  {
    id: "rocas",
    title: "ROCAS",
    short: "Pulveriza asteroides en gravedad cero.",
    long: "Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.",
    cat: "SHOOTER",
    cover: "cover-rocas",
    color: "yellow",
    best: 41200,
    plays: "15.6K",
  },
  {
    id: "ranaria",
    title: "RANARIA",
    short: "Cruza la autopista de pixeles.",
    long: "Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.",
    cat: "ARCADE",
    cover: "cover-rana",
    color: "green",
    best: 18900,
    plays: "6.4K",
  },
  {
    id: "duelo-pixel",
    title: "DUELO PIXEL",
    short: "Dos paletas. Una pelota. Reflejos máximos.",
    long: "El duelo más puro: dos paletas verticales se enfrentan por rebotar una pelota luminosa. Modo solitario contra la CPU o partida local a dos jugadores.",
    cat: "VERSUS",
    cover: "cover-duelo",
    color: "cyan",
    best: 24,
    plays: "4.2K",
  },
];

export const CATS = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"] as const;

/** Valor del filtro de categoría de la biblioteca: "TODOS" o una GameCat. */
export type CatFilter = (typeof CATS)[number];

export function getGame(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id);
}
