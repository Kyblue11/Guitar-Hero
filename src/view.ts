import { attr, createSvgElement, show, hide } from './util';
import { State, Body, Tail } from './types';
import { showFlash, triggerNote, triggerTailAttack, triggerTailRelease } from './state';
import * as Tone from 'tone';

////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function updateView(
        s: State, 
        svg: SVGGraphicsElement, 
        samples: { [key: string]: Tone.Sampler }
    ): void {
    const multiplier = document.querySelector("#multiplierText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;
    const wrongClicksText = document.querySelector("#wrongClicksText") as HTMLElement;
    const streakText = document.querySelector("#streakText") as HTMLElement;
    const timerText = document.querySelector("#timerText") as HTMLElement;
    const redFlash = document.querySelector("#flashRect") as SVGGraphicsElement;

    multiplier.textContent = `${s.multiplier.toFixed(1)}`;
    scoreText.textContent = `${s.score.toFixed(1)}`;
    wrongClicksText.textContent = `${s.missedClicks}`;
    streakText.textContent = s.consecutiveNotes.toString();        
    timerText.textContent = `${s.time.toFixed(0)}`;

    const updateBodyView = (circle: Body) => {
        const createBodyView = (circle: Body) => {
            const { cx, cy, r, style, class: cls, createTime } = circle;
            const circleElem = createSvgElement(
                svg.namespaceURI,
                "circle",
                { cx: `${cx}%`, cy: `${cy}%`, r: `${r}`, 
                style, class: cls, 'data-create-time': `${createTime}`, 
                'data-note': `${circle.note.user_played}`},
            ) as SVGGraphicsElement;
            svg.appendChild(circleElem);
            circle.note.user_played === true ? show(circleElem) : hide(circleElem);
            return circleElem;
        }
        const v = svg.querySelector(`circle[data-create-time="${circle.createTime}"]`) || createBodyView(circle);
        attr(v, { cy: `${circle.cy}` });
    }

    s.circleObjs.forEach(circle => {
        updateBodyView(circle);
    });

    const updateTailView = (tail: Tail) => {
        const createTailView = (tail: Tail) => {
            const { x1, y1, x2, y2, style, class: cls, createTime } = tail;
            const tailElem = createSvgElement(
                svg.namespaceURI,
                "line",
                { x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%`, 
                style, class: cls, 'data-create-time': `${createTime}`, 
                'data-note': `${tail.note.user_played}` },
            ) as SVGGraphicsElement;
            svg.appendChild(tailElem);

            const { cx, cy, r, style: headStyle, class: headClass } = tail.head;
            const headElem = createSvgElement(
                svg.namespaceURI,
                "circle",
                { cx: `${cx}%`, cy: `${cy}%`, r: `${r}`, 
                style: headStyle, class: headClass, 
                'data-create-time': `circleHead${createTime}`, 
                'data-note': `${tail.note.user_played}` },
            ) as SVGGraphicsElement;
            svg.appendChild(headElem);

            return { tailElem, headElem };
        }

        const tailElem = svg.querySelector(
            `line[data-create-time="${tail.createTime}"]`) as SVGLineElement || createTailView(tail).tailElem;
        const headElem = svg.querySelector(
            `circle[data-create-time="circleHead${tail.createTime}"]`) as SVGCircleElement;

        if (tailElem) {
            attr(tailElem, { y1: `${tail.y1}`, y2: `${tail.y2}` });
        }

        if (headElem) {
            attr(headElem, { cy: `${tail.head.cy}` });
        }
    };

    s.activeTails.forEach(tail => {
        updateTailView(tail);
    });

    s.collidedTails.forEach(tail => {
        updateTailView(tail);

        if (tail.isPressed && !tail.hasAttacked) {
            triggerTailAttack(samples, tail);
            tail.hasAttacked = true;

        } else if (!tail.isPressed && tail.hasAttacked) {
            triggerTailRelease(samples, tail);
        }
    });

    s.exit.forEach((circ) => {
        const circleElem = svg.querySelector(`circle[data-create-time="${circ.createTime}"]`);
        const headElem = svg.querySelector(`circle[data-create-time="circleHead${circ.createTime}"]`);

        if (circ.clicked) {
            triggerNote(samples, circ.note);
        }
        
        if (circleElem) {
            svg.removeChild(circleElem);
        }

        if (headElem) {
            svg.removeChild(headElem);
        }
    });

    s.tailexit.forEach((tail) => {
        const lineElem = svg.querySelector(`line[data-create-time="${tail.createTime}"]`);
        triggerTailRelease(samples, tail); // To prevent continuous sound after tail is consumed

        if (lineElem) {
            svg.removeChild(lineElem);
        }
    });
    
    s.bgexit.forEach((item, index) => {
        const circleElem = svg.querySelector(`circle[data-create-time="${item.createTime}"]`);
        const lineElem = svg.querySelector(`line[data-create-time="${item.createTime}"]`);
        triggerNote(samples, item.note);

        if (circleElem) {
            svg.removeChild(circleElem);
        }
        
        if (lineElem) {
            svg.removeChild(lineElem);
        }
    });

    s.randomNotes.forEach((note) => {
        triggerNote(samples, note);
        if (s.randomNotes.length > 0) {
            showFlash(redFlash);
        }
    });
}