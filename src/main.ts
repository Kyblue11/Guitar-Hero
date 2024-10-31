import "./style.css";

import {fromEvent,merge,Observable,EMPTY,} from "rxjs";
import { filter, map, scan, takeUntil, switchMap, auditTime } from "rxjs/operators";

import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";
import { doc } from "prettier";
import { attr, not, show, hide, createSvgElement, parseCSV} from "./util";
import {Constants, Viewport, NoteX, State, Body, Tail, Note, Key, Event} from "./types";
import { Tick, KeyPress, CircleCreation, TailCreation, initialState, 
        pressCircle, releaseCircle, storeOriginalFill, highlightControlCircle, 
        showFlash, heuristic, createCircle, createTail,triggerNote, 
        triggerTailAttack, triggerTailRelease, generateRandomNote, 
        updateMultiplier } from "./state";
import { updateView } from "./view";
import { tick$, notesObs$, longnotesObs$, gameClock$, currentState$, 
        stateChanges$, exitEmpty$, gameEnd$ } from "./observable";

///////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Main function that initializes the game.
 * Will be called when the user clicks the "Start Game" button.
 * 
 * @param csvContents 
 * @param samples 
 */
export function main(
    csvContents: string,
    samples: { [key: string]: Tone.Sampler },
) {
    // Canvas elements
    const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement & HTMLElement;
    const preview = document.querySelector( "#svgPreview") as SVGGraphicsElement & HTMLElement;
    const gameover = document.querySelector("#gameOver") as SVGGraphicsElement & HTMLElement;
    const container = document.querySelector("#main") as HTMLElement;

    svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
    svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

    // Text fields
    const wrongClicksText = document.querySelector("#wrongClicksText") as HTMLElement;
    wrongClicksText.style.color = "red";
    
    const resetCanvas = () => {
    const circlesSelector = "circle:not(#greenCircle):not(#redCircle):not(#blueCircle):not(#yellowCircle)";
    const linesSelector = "line:not(#greenLine):not(#redLine):not(#blueLine):not(#yellowLine)";
    svg.querySelectorAll(`${circlesSelector}, ${linesSelector}`)
    .forEach((element) => element.remove());
    };
    const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
    const resetButtonCLick$ = fromEvent(resetButton, "click");
    const resetSub = resetButtonCLick$.subscribe(() => {
        subscription.unsubscribe();
        resetCanvas();
        resetSub.unsubscribe();
        main(csvContents, samples);
    
    });

    const greenC = document.querySelector("#greenCircle")! as SVGGraphicsElement;
    const redC = document.querySelector("#redCircle")! as SVGGraphicsElement;
    const blueC = document.querySelector("#blueCircle")! as SVGGraphicsElement;
    const yellowC = document.querySelector("#yellowCircle")! as SVGGraphicsElement;

    const staticCircles = [
        { element: greenC, 
            cx: parseFloat(greenC.getAttribute("cx")!), 
            cy: parseFloat(greenC.getAttribute("cy")!), 
            r: parseFloat(greenC.getAttribute("r")!) },
        { element: redC, 
            cx: parseFloat(redC.getAttribute("cx")!), 
            cy: parseFloat(redC.getAttribute("cy")!), 
            r: parseFloat(redC.getAttribute("r")!) },
        { element: blueC, 
            cx: parseFloat(blueC.getAttribute("cx")!), 
            cy: parseFloat(blueC.getAttribute("cy")!), 
            r: parseFloat(blueC.getAttribute("r")!) },
        { element: yellowC, 
            cx: parseFloat(yellowC.getAttribute("cx")!), 
            cy: parseFloat(yellowC.getAttribute("cy")!), 
            r: parseFloat(yellowC.getAttribute("r")!) },
    ];

    //Store the original fill colors of the static circles
    storeOriginalFill("greenCircle");
    storeOriginalFill("redCircle");
    storeOriginalFill("blueCircle");
    storeOriginalFill("yellowCircle");

    // Observables
    const notes$ = notesObs$(csvContents);
    const longnotes$ = longnotesObs$(csvContents);

    const gameClock$ = tick$.pipe(map(elapsed => new Tick(elapsed)))
    const fromKey = <T>(e:Event, keyCode: Key, result:()=>T) =>
        fromEvent<KeyboardEvent>(document, e).pipe(
            filter(({ code }) => code === keyCode),
            filter(({repeat})=>!repeat),
            map(result)
        ); 
    const
    pressKeyH$ = fromKey("keydown", "KeyH", () => new KeyPress("KeyH", true)),
    pressKeyJ$ = fromKey("keydown", "KeyJ", () => new KeyPress("KeyJ", true)),
    pressKeyK$ = fromKey("keydown", "KeyK", () => new KeyPress("KeyK", true)),
    pressKeyL$ = fromKey("keydown", "KeyL", () => new KeyPress("KeyL", true)),
    releaseKeyH$ = fromKey("keyup", "KeyH", () => new KeyPress("KeyH", false)),
    releaseKeyJ$ = fromKey("keyup", "KeyJ", () => new KeyPress("KeyJ", false)),
    releaseKeyK$ = fromKey("keyup", "KeyK", () => new KeyPress("KeyK", false)),
    releaseKeyL$ = fromKey("keyup", "KeyL", () => new KeyPress("KeyL", false));
    
    /////////////////////////////////////////////////////////////////////////////
 
    // Move the body of the circle down the screen
    const moveBody = (circ: Body, elapsed: number = Constants.DIFFICULTY): Body=> {
        const cy = circ.cy + elapsed;
        return {
            ...circ,
            cy: cy,
        };
    }

    // Move the tail of the circle down, as well as its head
    const moveTail = (tail: Tail, elapsed: number = Constants.DIFFICULTY): Tail => {
        const y1 = tail.y1 + elapsed;
        const y2 = tail.y2 + elapsed;
        const cy = tail.head.cy + elapsed;
        return {
            ...tail,
            y1: y1,
            y2: y2,
            head: {
                ...tail.head,
                cy: cy,
    },};};

    // Detect collisions between circles
    const detectCollision = (circ: Body, 
        staticCircle: { cx: number, cy: number, r: number }
    ): boolean => {
        const dx = circ.cx - staticCircle.cx;
        const dy = circ.cy - staticCircle.cy;
        const distance = Math.sqrt(dy * dy + dx * dx);
        const collision = distance <= (circ.r + staticCircle.r);
        return collision;
    }
 
    // Calculate collision length between the tail and the static circles
    const tailCollisionDistance = (
        tail: Tail, 
        staticCircle: { cx: number, cy: number, r: number }
    ): number => {
        const tailBottomEdge = tail.y2;
        const staticCircleTopEdge = staticCircle.cy - staticCircle.r;
        const distance = staticCircleTopEdge - tailBottomEdge;
        return distance;
    }
    
    // Updates movement of the circles and tails
    const tick = (elapsed: number, s: State): State => { 

        // circles that passes through the static circles are considered expired
        const expired = (b: Body) => (b.cy) > staticCircles[0].cy;
        const expiredCircles: Body[] = s.circleObjs.filter(expired);
        const activeCircles = s.circleObjs.filter(not(expired));
        // Separate expiredCircles into exit and bgexit based on user_played
        const exitCircles = expiredCircles.filter(circle => circle.note.user_played);
        const bgexitCircles = expiredCircles.filter(circle => !circle.note.user_played);
        // Detect collisions with the static circles at the bottom
        const tailNotCollided = (t: Tail) => (t.y2 <= staticCircles[0].cy - staticCircles[0].r - 20);
        const notCollidedTails = s.activeTails.filter(tailNotCollided);
        const newlyCollidedTails = s.activeTails.filter(not(tailNotCollided));


        // Detect fully consumed tails
        const tailExpired = (t: Tail) => (t.y1 > 0 && t.y2 - t.y1 < 10);
        const expiredTails = s.collidedTails.filter(tailExpired);
        // combine all colliding tails
        const collidedTails = [...s.collidedTails.filter(not(tailExpired)), ...newlyCollidedTails];
        // Also shave off the tail y2 for currently collided tails
        const updatedCollidedTails = collidedTails.map(tail => {
            const distance = tailCollisionDistance(tail, staticCircles[0]);
            if (distance <= 0) {
                return {
                    ...tail,
                    y2: tail.y2 - Math.abs(distance)
                };
            }
            return tail;
        });
        // Filter tails whose head's cy value exceeds 350
        const expiredtailHeads = updatedCollidedTails.filter(tail => 
            (staticCircles[0].cy+staticCircles[0].r) < tail.head.cy);
         // Update score for long notes
        const scoreIncrement = updatedCollidedTails.reduce((acc, tail) => {
            if (tail.isPressed) {
                return acc + 0.05;
            }
            return acc;
        }, 0);

        // Update the state
        return {
            ...s,
            time: elapsed,
            exit: [...exitCircles, ...expiredtailHeads],
            tailexit: [...expiredTails],
            bgexit: [...bgexitCircles],
            circleObjs: activeCircles.map(circ => moveBody(circ)),
            activeTails: notCollidedTails.map(tail => moveTail(tail)),
            collidedTails: updatedCollidedTails.map(tail => moveTail(tail)),
            randomNotes: [],
            score: s.score + scoreIncrement,
        } as State;
    };

    const handleKeyPress = (e: KeyPress, s: State): State => {
        // Map the key to the corresponding column
        const keyToColumnMap: { [key: string]: number } = {
            KeyH: 0,
            KeyJ: 1,
            KeyK: 2,
            KeyL: 3,
        };
        const staticColumn = keyToColumnMap[e.key];
        // Reverse map from column to key
        const columnToKeyMap: { [column: number]: string } = {
            0: "KeyH",
            1: "KeyJ",
            2: "KeyK",
            3: "KeyL",
        };

        // Update the collided tails based on the key press
        const updatedCollidedTails = s.collidedTails.map(tail => {
            if (e.pressed && e.key === columnToKeyMap[tail.noteKey]) {
                if (!tail.isPressed) {
                    return {
                        ...tail,
                        isPressed: true 
                    };
                }
            } else {
                return {
                    ...tail,
                    isPressed: false
                };
            }
            return tail;
        });

        // Check for collisions with the static circles at the bottom
        const collidedCircles = s.circleObjs.filter(circ => {
            const { column: circColumn } = heuristic(circ.note);
            const circSVG = document.querySelector(
                `circle[data-create-time="${circ.createTime}"]`) as SVGGraphicsElement;
            return  circColumn === staticColumn 
                    && staticCircles.some(staticCircle => detectCollision(circ, staticCircle))
                    && circSVG !== null
                    && circ.note.user_played;
        });
    
        // If there are collisions, update the score and remove the collided circles
        if (updatedCollidedTails.length > 0 || 
            collidedCircles.length > 0) {
            const newScore = s.score + (collidedCircles.length * s.multiplier);
                const updatedCircleObjs = s.circleObjs.map(circ => {
                    if (collidedCircles.includes(circ)) {
                        return { ...circ, clicked: true };
                    }
                    return circ;
                });


        // Update the state
        return {
            ...s,
            score: newScore,
            circleObjs: updatedCircleObjs,
            exit: s.exit.concat(collidedCircles),
            consecutiveNotes: s.consecutiveNotes + 1,
            multiplier: updateMultiplier(s.consecutiveNotes + 1),
            collidedTails: updatedCollidedTails,
        };
        } else if (e.pressed) {
            const randomNote = generateRandomNote(s);
            return {...s, 
                randomNotes: s.randomNotes.concat(randomNote),
                missedClicks: s.missedClicks + 1,
                consecutiveNotes: 0,
                multiplier: 1.0,
            };
        }
        return {...s,
            collidedTails: updatedCollidedTails,
        }
    };

    // Error handling for invalid events
    const error = (s: State): State => {
        console.error("Invalid event");
        return s;
    }

    // State transducer
    const reduceState = (s: State, e: CircleCreation | TailCreation | Tick | KeyPress ) => {
        return e instanceof CircleCreation ? createCircle(e.note, s) :
                e instanceof TailCreation ? createTail(e.note, s) :
               e instanceof KeyPress ? handleKeyPress(e, s) : 
                e instanceof Tick ? tick(e.elapsed, s) :
                error(s);
    };     

    /////////////////////////////////////////////////////////////////////////////

    // Create an observable that emits when notes$ completes
    const notesComplete$ = new Observable<void>(observer => {
        notes$.subscribe({
            complete: () => observer.next(),
        });
    });
    // Combine the two observables to create a completion condition
    const gameComplete$ = notesComplete$.pipe(
        switchMap(() => exitEmpty$),
        map(() =>{
            const currentState = currentState$.getValue();
            return {...currentState, gameEnd: true};
        })
    );
    // Create an observable that emits the final state and then completes
    const finalState$ = gameComplete$.pipe(
        map(finalState => {
            currentState$.next(finalState);
            return finalState;
        }),
        switchMap(() => EMPTY) // Emit nothing and complete
    );
    // Call the gameEnd$ observable when the game ends
    gameEnd$.subscribe(() => {
        show(gameover);
        subscription.unsubscribe();
    });


    // Main subscription game engine
    const subscription = merge(
        longnotes$,notes$,
        gameClock$,
        pressKeyH$, pressKeyJ$, pressKeyK$, pressKeyL$,
        releaseKeyH$, releaseKeyJ$, releaseKeyK$, releaseKeyL$,
    ).pipe(
        scan((accState, event) => {
            const newState = reduceState(accState, event);
            currentState$.next(newState); // Emit(save) the new state to the BehaviorSubject
            return newState; }, initialState),
        takeUntil(finalState$),
        auditTime(16) // 60fps to reduce audio stacking
    ).subscribe((state: State) => {
        updateView(state, svg, samples);})
}

///////////////////////////////////////////////////////////////////////////////////////////////

// Map key presses to the static circles
const keyToCircleMap: { [key in Key]: string } = {
    KeyH: "greenCircle",
    KeyJ: "redCircle",
    KeyK: "blueCircle",
    KeyL: "yellowCircle",
};

function showKeys() {
    function showKey(k: Key, controlCircleId: string, color: string) {
        const circleId = keyToCircleMap[k];
        if (!circleId) return;

        const o = (e: string) => fromEvent<KeyboardEvent>(document, e).pipe(
            filter(({ code }) => code === k)
        );

        o('keydown').subscribe(() => {
            pressCircle(circleId);
            highlightControlCircle(controlCircleId, true, color);
        });
        o('keyup').subscribe(() => {
            releaseCircle(circleId);
            highlightControlCircle(controlCircleId, false, color);
        }); 
    } 
 
    showKey('KeyH', 'controlCircleH', 'green');
    showKey('KeyJ', 'controlCircleJ', 'red');
    showKey('KeyK', 'controlCircleK', 'blue');
    showKey('KeyL', 'controlCircleL', 'yellow');
}

///////////////////////////////////////////////////////////////////////////////////////////////
// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
///////////////////////////////////////////////////////////////////////////////////////////////

if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: "samples/",
    });
    const startGame = (contents: string) => {
        main(contents, samples);
        showKeys();
    };
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", function () {
    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        // Function to fetch the song based on user input
        const fetchSong = (songName: string) => {
            fetch(`${baseUrl}/assets/${songName}.csv`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error("Network response was not ok");
                    }
                    return response.text();
                })
                .then((text) => startGame(text))
                .catch((error) =>
                    console.error("Error fetching the CSV file:", error)
                );
        };
            const loadSongButton = document.getElementById("loadSongButton");
            const songNameInput = document.getElementById("songNameInput") as HTMLInputElement;

            // Detect when the user clicks the "Load Song" button
            if (loadSongButton && songNameInput) {
                fromEvent(loadSongButton, "click")
                    .pipe(
                        filter(() => Boolean(songNameInput.value)) // Ensure the input is not empty
                    )
                    .subscribe(() => {
                        const songName = songNameInput.value;
                        fetchSong(songName);
                    });
            }
        });
    });
}