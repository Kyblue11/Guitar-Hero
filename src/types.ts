
/** Constants */


const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

//SleepingBeauty | RockinRobin
const Constants = {
    TICK_RATE_MS: 50,
    SONG_NAME: "RockinRobin",
    DIFFICULTY: 7,
} as const;

const NoteX = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 10,
};

/** User input */

type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL";

type Event = "keydown" | "keyup" | "keypress";


/** State processing */
type State = Readonly<{
    gameEnd: boolean;
    multiplier: number;
    score: number;
    missedClicks: number;

    time: number;
    circleObjs: ReadonlyArray<Body>;
    activeTails: ReadonlyArray<Tail>;
    collidedTails: ReadonlyArray<Tail>;

    exit: ReadonlyArray<Body>;
    tailexit: ReadonlyArray<Tail>;
    bgexit: ReadonlyArray<Body>;

    randomNotes: ReadonlyArray<Note>;
    consecutiveNotes: number;
}>;

type Body = Readonly<{
    r: number;
    cx: number;
    cy: number;
    style: string;
    class: string;
    createTime: number;
    note: Note;
    clicked?: boolean;
}>;

type Tail = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    style: string;
    class: string;
    createTime: number;
    note: Note;
    hasAttacked?: boolean;
    isPressed?: boolean;
    head: {
        cx: number;
        cy: number;
        r: number;
        style: string;
        class: string;
    };
    noteKey: number;
};

interface Note {
    user_played: boolean;
    instrument_name: string;
    velocity: number;
    pitch: number;
    start: number;
    end: number;
    key: number;
};

///////////////////////////////////////////////////////////////////////////////////////////////
export {
    Constants,
    Viewport,
    NoteX,
};

export type {
    State,
    Body,
    Tail,
    Note,
    Key,
    Event,
};