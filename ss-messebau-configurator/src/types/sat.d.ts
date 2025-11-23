declare module "sat" {
  export class Vector {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  export class Box {
    pos: Vector;
    w: number;
    h: number;
    constructor(pos: Vector, w: number, h: number);
    toPolygon(): Polygon;
  }

  export class Polygon {
    pos: Vector;
    points: Vector[];
    constructor(pos: Vector, points: Vector[]);
  }

  export function testPolygonPolygon(a: Polygon, b: Polygon): boolean;
}
