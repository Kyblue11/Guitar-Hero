import { timer } from "rxjs";
import * as Tone from "tone";
import { Note, State, NoteX, Constants, Key, Body, Tail } from "./types";
import { show, hide } from "./util";

///////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Represents a tick event.
 * @param elapsed The elapsed time in milliseconds
 * @returns A new Tick object
 */
class Tick { constructor(
    public readonly elapsed:number
) {} }

/**
 * Represents a key press event.
 * @param key The key that was pressed
 * @param pressed Whether the key was pressed or released
 * @returns A new KeyPress object
 */
class KeyPress { constructor(
    public readonly key:Key,
    public readonly pressed: boolean
) {} }

/**
 * Represents a circle creation event.
 * @param note The note to create a circle object for
 * @returns A new CircleCreation object
 */
class CircleCreation { constructor(
    public readonly note : Note,
) {} }

/**
 * Represents a tail creation event.
 * @param note The note to create a tail object for
 * @returns A new TailCreation object
 */
class TailCreation { constructor(
    public readonly note : Note,
) {} }

/** Initial State */
const initialState: State = {
    gameEnd: false,
    multiplier: 1,
    score: 0,
    missedClicks: 0,

    time: 0,
    circleObjs: [],
    activeTails: [],
    collidedTails: [],
    exit: [],
    tailexit: [],
    bgexit: [],
    randomNotes: [],
    consecutiveNotes: 0,
};

/**
 * Changes the fill color of a static circle to a more cloudy-translucent color.
 * @param circleId The ID of the circle to change
 */
const pressCircle = (circleId: string) => {
    const circle = document.querySelector(`#${circleId}`) as SVGGraphicsElement;
    if (circle) {
        const gradientId = circleId.replace("Circle", "GradientPressed");
        circle.setAttribute("fill", `url(#${gradientId})`);
    }
};

/**
 * Reverts the fill color of a static circle to its original color.
 * @param circleId The ID of the circle to revert
 */
const releaseCircle = (circleId: string) => {
    const circle = document.querySelector(`#${circleId}`) as SVGGraphicsElement;
    if (circle) {
        const originalColor = circle.getAttribute("data-original-fill");
        if (originalColor) {
            circle.setAttribute("fill", originalColor);
        }
    }
};

/**
 * Stores the original fill color of a static circle.
 * @param circleId The ID of the circle to store
 */
const storeOriginalFill = (circleId: string) => {
    const circle = document.querySelector(`#${circleId}`) as SVGGraphicsElement;
    if (circle) {
        const originalColor = circle.getAttribute("fill");
        if (originalColor) {
            circle.setAttribute("data-original-fill", originalColor);
        }
    }
};

/**
 * Highlights each control circle with a color in the Key Bindings section.
 * @param controlCircleId The ID of the control circle to highlight
 * @param highlight Whether to highlight or not
 * @param color The color to highlight with
 */
function highlightControlCircle(
    controlCircleId: string, 
    highlight: boolean, 
    color: string
) {
    const controlCircle = document.getElementById(controlCircleId);
    if (controlCircle) {
        if (highlight) {
            controlCircle.style.backgroundColor = color;
        } else {
            controlCircle.style.backgroundColor = 'white';
        }
    }
}

/**
 * Flashes a red translucent rectangle to indicate a hit or miss.
 * @param flashRect The rectangle to flash
 */
function showFlash(flashRect: SVGGraphicsElement) {
    show(flashRect);
    timer(100).subscribe(() => hide(flashRect));
}

/**
 * Assigns the column and color of a note based on its pitch.
 *  
 * @param note The note to determine the column and color for
 * @returns The column and color of the note
 */
function heuristic(note: Note): { column: number, color: string } {
    const columns = [0, 1, 2, 3];
    const column = columns[note.pitch % columns.length];

    const color = ["green", "red", "blue", "yellow"][column];  
    return { column, color };
}
  
/**
 * Creates a circle object for a note.
 * 
 * @param note The note to create a circle object for
 * @param s The current state
 * @param createTime The time to create the circle
 * @returns The updated state
 */
function createCircle( 
    note: Note,
    s: State,
    createTime: number = s.time,
): State {   

    if (!note.instrument_name) {
        return s;
    }
    const { column, color } = heuristic(note);
    const circle: Body = {
        r: NoteX.RADIUS,
        cx: 20 + 20 * column,
        cy: 0,
        style: `fill: ${color}`,
        class: `shadow`,
        createTime: createTime,
        note,

    }; 
    const updatedCircleObjs = [...s.circleObjs, circle];
    return { ...s, circleObjs: updatedCircleObjs};
}
 
/**
 * Creates a tail object for a note.
 * 
 * @param note The note to create a tail object for
 * @param s The current state
 * @param createTime The time to create the tail
 * @returns The updated state
 */
function createTail(
    note: Note,
    s: State,
    createTime: number = s.time,
): State {
    const { column, color } = heuristic(note);
    const tailHeight = (note.end - note.start) 
                     * (1000 / Constants.TICK_RATE_MS) 
                     * Constants.DIFFICULTY;
    const gradientId = `${color}Gradient`;
    const tail: Tail = {
        x1: 20 + 20 * column,
        y1: -tailHeight,
        x2: 20 + 20 * column,
        y2: 0,
        style: `stroke: ${color}; stroke-width: ${NoteX.TAIL_WIDTH}`,
        class: `shadow`,
        createTime: createTime,
        note,
        head: { // Circle that joins at the head of the tail
            cx: 20 + 20 * column,
            cy: - NoteX.RADIUS,
            r: NoteX.RADIUS,
            style: `fill: url(#${gradientId})`,
            class: `shadow`,
        },
        noteKey: column,
    };
    const updatedTailObjs = [...s.activeTails, tail];
    return { ...s, activeTails: updatedTailObjs};
}

/**
 * Triggers a note to be played.
 * 
 * @param samples The samples to play
 * @param note The note to play
 */
function triggerNote(
    samples: { [key: string]: Tone.Sampler },
    note : Note,
): void {
    const { instrument_name, velocity, pitch, start, end } = note;
    const instrument = samples[instrument_name];
    const duration = end - (start === -1 ? 0 : start);
    instrument.triggerAttackRelease(
        Tone.Frequency(pitch, "midi").toNote(),duration, undefined, velocity);
}

/**
 * Triggers the start of a note to be played.
 * 
 * @param samples The samples to play
 * @param tail The tail to play
 */
function triggerTailAttack(
    samples: { [key: string]: Tone.Sampler },
    tail: Tail,
): void {
    const { instrument_name, velocity, pitch } = tail.note;
    const instrument = samples[instrument_name];
    instrument.triggerAttack(Tone.Frequency(pitch, "midi").toNote(), undefined, velocity);
}

/**
 * Triggers the end of a note to be played.
 * 
 * @param samples The samples to play
 * @param tail The tail to play
 */
function triggerTailRelease(
    samples: { [key: string]: Tone.Sampler },
    tail: Tail,
): void {
    const { instrument_name, pitch } = tail.note;
    const instrument = samples[instrument_name];
    instrument.triggerRelease(Tone.Frequency(pitch, "midi").toNote());
}

/**
 * Generates a random note.
 * 
 * @param s The current state
 * @returns A random note
 */
function generateRandomNote(s: State): Note {
    const instruments = ["piano", "violin", "flute", "bass-electric"];

    const hash = (seed: number) => {
        const m = 0x80000000; // 2**31
        const a = 1103515245;
        const c = 12345;
        return (a * seed + c) % m;
    };
 
    const scaledHash = (hashValue: number, range: number) => 
        Math.floor((hashValue / 0x80000000) * range);
    const scaledHashFloat = (hashValue: number, min: number, max: number) => {
        return min + (hashValue / 0x80000000) * (max - min);
    };
    const instrumentIndex = scaledHash(hash(s.time), instruments.length);
    const pitch = scaledHash(hash(s.time + 1), 25) + 75;
    const duration = scaledHashFloat(hash(s.time + 2), 0.1, 0.5);

    return {
        user_played: false,
        instrument_name: instruments[instrumentIndex],
        velocity: 1,
        pitch: pitch,
        start: -1,
        end: duration,
    } as Note;
}

/**
 * Updates the multiplier based on the number of consecutive notes hit.
 * 
 * @param consecutiveNotes The number of consecutive notes hit
 * @returns The updated multiplier
 */
function updateMultiplier(consecutiveNotes: number): number {
    return 1.0 + Math.floor(consecutiveNotes / 10) * 0.2;
}

///////////////////////////////////////////////////////////////////////////////////////////////
export {
    Tick, KeyPress, CircleCreation, TailCreation,
    initialState,
    pressCircle,
    releaseCircle,
    storeOriginalFill,
    highlightControlCircle,
    showFlash,
    heuristic,
    createCircle,
    createTail,
    triggerNote,
    triggerTailAttack,
    triggerTailRelease,
    generateRandomNote,
    updateMultiplier,
};