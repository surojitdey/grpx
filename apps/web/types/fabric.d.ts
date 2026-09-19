declare module 'fabric' {
    namespace fabric {
        class Canvas {
            constructor(element: HTMLCanvasElement, options?: any);
            add(...objects: any[]): Canvas;
            remove(...objects: any[]): Canvas;
            setZoom(value: number): Canvas;
            renderAll(): Canvas;
            getActiveObjects(): any[];
            dispose(): void;
            on(event: string, handler: (opt: any) => void): Canvas;
            off(event: string, handler?: (opt: any) => void): Canvas;
            viewportTransform?: number[];
            getPointer?(e: any): { x: number; y: number };
        }

        class Object {
            set(properties: any): any;
        }

        class Image extends Object {
            static fromURL(
                url: string,
                callback: (img: Image) => void,
                options?: any
            ): void;
            constructor(element?: any, options?: any);
        }

        class Textbox extends Object {
            constructor(text: string, options?: any);
        }

        class Rect extends Object {
            constructor(options?: any);
        }

        class Circle extends Object {
            constructor(options?: any);
        }

        class Line extends Object {
            constructor(points: number[], options?: any);
        }
    }

    export { fabric };
}
