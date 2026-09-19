'use client';

import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '@/stores/editor';

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const {
        design,
        currentPageId,
        zoom,
        panX,
        panY,
        selectedObjectIds,
        setSelectedObjects,
    } = useEditorStore();

    useEffect(() => {
        if (!canvasRef.current) return;

        // Initialize Fabric.js canvas
        const fabricCanvas = new fabric.Canvas(canvasRef.current, {
            width: design?.width || 1080,
            height: design?.height || 1080,
            backgroundColor: '#ffffff',
        });

        fabricCanvasRef.current = fabricCanvas;

        // Load objects from design
        const currentPage = design?.pages.find((p) => p.id === currentPageId);
        if (currentPage) {
            currentPage.document.objects.forEach((obj) => {
                let fabricObj: fabric.Object | null = null;

                if (obj.type === 'text') {
                    fabricObj = new fabric.Textbox(obj.content.text, {
                        left: obj.x,
                        top: obj.y,
                        width: obj.width,
                        height: obj.height,
                        fontSize: (obj as any).style.fontSize || 16,
                        fontFamily: (obj as any).style.fontFamily || 'Arial',
                        fill: (obj as any).style.color || '#000000',
                        textAlign: (obj as any).style.textAlign || 'left',
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
                    });
                } else if (obj.type === 'circle') {
                    fabricObj = new fabric.Circle({
                        left: obj.x,
                        top: obj.y,
                        radius: Math.min(obj.width, obj.height) / 2,
                        fill: (obj as any).fill || '#cccccc',
                        stroke: (obj as any).stroke,
                        strokeWidth: (obj as any).strokeWidth || 0,
                    });
                } else if (obj.type === 'image') {
                    // Placeholder for image loading
                    fabricObj = new fabric.Rect({
                        left: obj.x,
                        top: obj.y,
                        width: obj.width,
                        height: obj.height,
                        fill: '#e0e0e0',
                    });
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

        // Apply zoom
        fabricCanvas.setZoom(zoom / 100);

        // Apply pan
        fabricCanvas.viewportTransform = [1, 0, 0, 1, panX, panY];

        fabricCanvas.renderAll();

        return () => {
            fabricCanvas.dispose();
        };
    }, [design, currentPageId, zoom, panX, panY, selectedObjectIds, setSelectedObjects]);

    return (
        <div className="canvas-container flex-1 overflow-auto">
            <div className="canvas-wrapper">
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
}
