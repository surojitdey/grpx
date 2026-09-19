'use client';

import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '@/stores/editor';
import {
    createDefaultRectangle,
    createDefaultCircle,
    createDefaultTextObject,
    createDefaultLine,
} from '@/utils/editor';

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<any | null>(null);
    const {
        design,
        currentPageId,
        zoom,
        panX,
        panY,
        selectedObjectIds,
        setSelectedObjects,
        activeTool,
        addObject,
        setActiveTool,
    } = useEditorStore();

    useEffect(() => {
        if (!canvasRef.current || !design) return;

        // Initialize Fabric.js canvas
        const fabricCanvas = new fabric.Canvas(canvasRef.current, {
            width: design.width || 1080,
            height: design.height || 1080,
            backgroundColor: '#ffffff',
            selection: true,
            preserveObjectStacking: true,
        });

        fabricCanvasRef.current = fabricCanvas;

        // Load objects from current page
        const currentPage = design.pages.find((p) => p.id === currentPageId);
        if (currentPage?.document?.objects) {
            currentPage.document.objects.forEach((obj) => {
                let fabricObj: any | null = null;

                if (obj.type === 'text') {
                    fabricObj = new fabric.Textbox(obj.content.text, {
                        left: obj.x,
                        top: obj.y,
                        width: obj.width,
                        height: obj.height,
                        fontSize: (obj as any).style?.fontSize || 16,
                        fontFamily: (obj as any).style?.fontFamily || 'Arial',
                        fill: (obj as any).style?.color || '#000000',
                        textAlign: (obj as any).style?.textAlign || 'left',
                        selectable: true,
                    });
                } else if (obj.type === 'rectangle') {
                    fabricObj = new fabric.Rect({
                        left: obj.x,
                        top: obj.y,
                        width: obj.width,
                        height: obj.height,
                        fill: (obj as any).fill || '#cccccc',
                        stroke: (obj as any).stroke,
                        strokeWidth: (obj as any).strokeWidth || 0,
                        selectable: true,
                    });
                } else if (obj.type === 'circle') {
                    fabricObj = new fabric.Circle({
                        left: obj.x,
                        top: obj.y,
                        radius: Math.min(obj.width, obj.height) / 2,
                        fill: (obj as any).fill || '#cccccc',
                        stroke: (obj as any).stroke,
                        strokeWidth: (obj as any).strokeWidth || 0,
                        selectable: true,
                    });
                } else if (obj.type === 'line') {
                    fabricObj = new fabric.Line([0, 0, obj.width, 0], {
                        left: obj.x,
                        top: obj.y,
                        stroke: (obj as any).stroke || '#000000',
                        strokeWidth: (obj as any).strokeWidth || 2,
                        selectable: true,
                    } as any);
                } else if (obj.type === 'image') {
                    const url = (obj as any).content?.assetId;
                    if (url) {
                        // load image properly
                        fabric.Image.fromURL(
                            url,
                            (img: any) => {
                                // Check if canvas is still valid before rendering
                                if (!fabricCanvasRef.current || !fabricCanvasRef.current.getContext) return;

                                img.set({
                                    left: obj.x,
                                    top: obj.y,
                                    width: obj.width,
                                    height: obj.height,
                                    selectable: true,
                                    crossOrigin: 'anonymous',
                                });
                                (img as any).objId = obj.id;
                                fabricCanvasRef.current.add(img);
                                fabricCanvasRef.current.renderAll();
                            },
                            { crossOrigin: 'anonymous' } as any
                        );
                        // skip adding placeholder here because async loader will add
                        fabricObj = null;
                    } else {
                        fabricObj = new fabric.Rect({
                            left: obj.x,
                            top: obj.y,
                            width: obj.width,
                            height: obj.height,
                            fill: '#e0e0e0',
                            selectable: true,
                        });
                    }
                }

                if (fabricObj) {
                    (fabricObj as any).objId = obj.id;
                    fabricObj.set({
                        opacity: obj.opacity,
                        angle: obj.rotation,
                        visible: obj.visible,
                    });
                    fabricCanvas.add(fabricObj);
                }
            });
        }

        // Handle selection
        const handleSelection = () => {
            const selected = fabricCanvas.getActiveObjects();
            if (selected.length > 0) {
                const ids = selected
                    .map((obj: any) => obj.objId)
                    .filter(Boolean);
                setSelectedObjects(ids);
            } else {
                setSelectedObjects([]);
            }
        };

        fabricCanvas.on('selection:created', handleSelection);
        fabricCanvas.on('selection:updated', handleSelection);
        fabricCanvas.on('selection:cleared', () => setSelectedObjects([]));

        // Handle adding objects when a tool is active
        const handlePointerDown = (opt: any) => {
            try {
                if (!activeTool || activeTool === 'select') return;
                const pointer = (fabricCanvas as any).getPointer?.(opt.e) || { x: opt.e?.offsetX || 50, y: opt.e?.offsetY || 50 };
                const x = pointer.x || 50;
                const y = pointer.y || 50;

                let obj = null;
                if (activeTool === 'rectangle') {
                    obj = createDefaultRectangle(x, y);
                } else if (activeTool === 'circle') {
                    obj = createDefaultCircle(x, y);
                } else if (activeTool === 'text') {
                    obj = createDefaultTextObject(x, y);
                } else if (activeTool === 'line') {
                    obj = createDefaultLine(x, y);
                }

                if (obj) {
                    addObject(obj);
                    setActiveTool('select');
                }
            } catch (err) {
                console.error('Error adding object:', err);
            }
        };

        fabricCanvas.on('mouse:down', handlePointerDown);

        // Apply zoom
        fabricCanvas.setZoom(zoom / 100);

        // Apply pan
        fabricCanvas.viewportTransform = [1, 0, 0, 1, panX, panY];

        fabricCanvas.renderAll();

        return () => {
            fabricCanvas.off('selection:created', handleSelection);
            fabricCanvas.off('selection:updated', handleSelection);
            fabricCanvas.off('selection:cleared');
            fabricCanvas.off('mouse:down', handlePointerDown);
            fabricCanvas.dispose();
        };
    }, [design, currentPageId, zoom, panX, panY, activeTool, addObject, setActiveTool, setSelectedObjects]);

    // Sync property changes to fabric canvas
    useEffect(() => {
        if (!fabricCanvasRef.current) return;

        const fabricCanvas = fabricCanvasRef.current;
        const currentPage = design?.pages.find((p) => p.id === currentPageId);

        if (!currentPage?.document?.objects) return;

        // Update each object's properties in the fabric canvas
        currentPage.document.objects.forEach((obj) => {
            const fabricObj = fabricCanvas.getObjects().find((fo: any) => fo.objId === obj.id);
            if (!fabricObj) return;

            // Update common properties
            fabricObj.set({
                left: obj.x,
                top: obj.y,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY,
                opacity: obj.opacity,
                angle: obj.rotation,
                visible: obj.visible,
            });

            // Update dimensions for shapes
            if (obj.type === 'rectangle') {
                fabricObj.set({
                    width: obj.width,
                    height: obj.height,
                    fill: (obj as any).fill,
                    stroke: (obj as any).stroke,
                    strokeWidth: (obj as any).strokeWidth || 0,
                });
            } else if (obj.type === 'circle') {
                const radius = Math.min(obj.width, obj.height) / 2;
                fabricObj.set({
                    radius: radius,
                    fill: (obj as any).fill,
                    stroke: (obj as any).stroke,
                    strokeWidth: (obj as any).strokeWidth || 0,
                });
            } else if (obj.type === 'text') {
                const style = (obj as any).style || {};
                fabricObj.set({
                    width: obj.width,
                    height: obj.height,
                    fontSize: style.fontSize || 16,
                    fontFamily: style.fontFamily || 'Arial',
                    fill: style.color || '#000000',
                    textAlign: style.textAlign || 'left',
                });
            } else if (obj.type === 'line') {
                fabricObj.set({
                    stroke: (obj as any).stroke || '#000000',
                    strokeWidth: (obj as any).strokeWidth || 2,
                    x1: 0,
                    y1: 0,
                    x2: obj.width,
                    y2: 0,
                });
            } else if (obj.type === 'image') {
                fabricObj.set({
                    width: obj.width,
                    height: obj.height,
                });
            }
        });

        fabricCanvas.renderAll();
    }, [design, currentPageId]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const store = useEditorStore.getState();

            if (e.key === 'Delete' && store.selectedObjectIds.length > 0) {
                e.preventDefault();
                store.selectedObjectIds.forEach((id) => {
                    store.removeObject(id);
                });
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && store.selectedObjectIds.length > 0) {
                e.preventDefault();
                // Duplicate the first selected object
                store.duplicateObject(store.selectedObjectIds[0]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="canvas-container flex-1 overflow-auto">
            <div className="canvas-wrapper">
                <canvas
                    ref={canvasRef}
                    width={design?.width || 1080}
                    height={design?.height || 1080}
                    style={{
                        display: 'block',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    }}
                />
            </div>
        </div>
    );
}
