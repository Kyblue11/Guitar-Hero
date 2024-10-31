///////////////////////////////////////////////////////////////////////////////////////////////
// Utility functions
// not and attr are taken from https://stackblitz.com/edit/asteroids2023?file=src%2Futil.ts

import { from, map, Observable, timer } from "rxjs";
import { Note } from "./types";

///////////////////////////////////////////////////////////////////////////////////////////////


const
/**
 * Composable not: invert boolean result of given function
 * @param f a function returning boolean
 * @param x the value that will be tested with f
 */
  not = <T>(f:(x:T)=>boolean)=> (x:T)=> !f(x),

/**
 * set a number of attributes on an Element at once
 * @param e the Element
 * @param o a property bag
 */
    attr = (e:Element,o: { [p:string]: unknown }) =>
    { for(const k in o) e.setAttribute(k,String(o[k])) }

// Stub value to indicate I need a toilet break
const IMPLEMENT_THIS: any = undefined;
type IMPLEMENT_THIS_TYPE = any;

/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
* Hides a SVG element on the canvas.
* @param elem SVG element to hide
*/
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
* Creates an SVG element with the given properties.
*
* See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
* element names and properties.
*
* @param namespace Namespace of the SVG element
* @param name SVGElement name
* @param props Properties to set on the SVG element
* @returns SVG element
*/
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {},
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  attr(elem, props);
  return elem;
};

/**
 * Parse the CSV contents into a stream of Note objects
 * @param contents CSV contents
 * @returns Observable of Note objects
 */
function parseCSV(contents: string): Observable<Note> {
  const lines = contents.split("\n").slice(1);
  return from(lines).pipe(
      map((line, index) => {
          const [user_played, instrument_name, velocity, pitch, start, end] = line.split(","); 
          return {
              user_played: user_played === "True",
              instrument_name,
              velocity: Number(velocity) / 127,
              pitch: Number(pitch),
              start: Number(start),
              end: Number(end),
          } as Note;
      })
  );
}

///////////////////////////////////////////////////////////////////////////////////////////////
export { not, attr, IMPLEMENT_THIS, show, hide, createSvgElement, parseCSV }
export type { IMPLEMENT_THIS_TYPE }