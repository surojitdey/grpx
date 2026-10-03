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

// Instantiate a fabric object for a canonical design object (text, rectangle,
// circle, line). Shared by top-level loading and group children so every type
// keeps its shape-specific rendering when the design loads. Image objects load
// asynchronously and are handled by the callers; returns null for unknown or
// unsupported types.
function createFabricObject(obj: any): any | null {
    if (!obj || typeof obj !== 'object') return null;

    if (obj.type === 'text') {
        return new fabric.Textbox(obj.content.text, {
            left: obj.x,
            top: obj.y,
            width: obj.width,
            height: obj.height,
            fontSize: obj.style?.fontSize || 16,
            fontFamily: obj.style?.fontFamily || 'Arial',
            fill: obj.style?.color || '#000000',
            textAlign: obj.style?.textAlign || 'left',
        });
    }
    if (obj.type === 'rectangle') {
        return new fabric.Rect({
            left: obj.x,
            top: obj.y,
            width: obj.width,
            height: obj.height,
            fill: obj.fill || '#cccccc',
            stroke: obj.stroke,
            strokeWidth: obj.strokeWidth || 0,
        });
    }
    if (obj.type === 'circle') {
        return new fabric.Circle({
            left: obj.x,
            top: obj.y,
            radius: Math.min(obj.width, obj.height) / 2,
            fill: obj.fill || '#cccccc',
            stroke: obj.stroke,
            strokeWidth: obj.strokeWidth || 0,
        });
    }
    if (obj.type === 'line') {
        return new fabric.Line([0, 0, obj.width, 0], {
            left: obj.x,
            top: obj.y,
            stroke: obj.stroke || '#000000',
            strokeWidth: obj.strokeWidth || 2,
        } as any);
    }
    return null;
}

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<any | null>(null);
    const design = useEditorStore((state) => state.design);
    const currentPageId = useEditorStore((state) => state.currentPageId);
    const zoom = useEditorStore((state) => state.zoom);
    const panX = useEditorStore((state) => state.panX);
    const panY = useEditorStore((state) => state.panY);
    const setSelectedObjects = useEditorStore((state) => state.setSelectedObjects);
    const setDraggedObjectPosition = useEditorStore(
        (state) => state.setDraggedObjectPosition
    );
    const updateObject = useEditorStore((state) => state.updateObject);
    const activeTool = useEditorStore((state) => state.activeTool);
    const addObject = useEditorStore((state) => state.addObject);
    const setActiveTool = useEditorStore((state) => state.setActiveTool);

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
        // Track whether this effect's canvas is still "alive" so async callbacks
        // (like image loaders) don't mutate a disposed or recreated canvas.
        let effectAlive = true;
        let pendingDraggedPosition: { id: string; x: number; y: number } | null =
            null;
        let draggedPositionFrame: number | null = null;

        const cancelDraggedPositionUpdate = () => {
            if (draggedPositionFrame !== null) {
                cancelAnimationFrame(draggedPositionFrame);
                draggedPositionFrame = null;
            }
            pendingDraggedPosition = null;
        };

        // Load objects from current page
        const currentPage = design.pages.find((p) => p.id === currentPageId);
        if (currentPage?.document?.objects) {
            // Child records referenced by a group are rendered inside that group
            // only; they must not also be added as independent top-level objects
            // by the loop below, or they would appear twice on the canvas.
            const groupedChildIds = new Set<string>();
            currentPage.document.objects.forEach((o: any) => {
                if ((o as any)?.type === 'group' && Array.isArray((o as any).children)) {
                    (o as any).children.forEach((childId: string) => groupedChildIds.add(childId));
                }
            });

            currentPage.document.objects.forEach((obj) => {
                let fabricObj: any | null = null;

                // Group-owned children are consumed by their group's branch.
                if (groupedChildIds.has(obj.id)) return;

                // Text, rectangle, circle and line share the factory below so
                // group children are instantiated exactly the same way.
                if (['text', 'rectangle', 'circle', 'line'].includes(obj.type)) {
                    fabricObj = createFabricObject(obj);
                    fabricObj?.set({ selectable: true });
                } else if ((obj as any).type === 'group') {
                    // Canonical group: children are object IDs resolved from the
                    // same page's objects list. Unknown child IDs are skipped.
                    // Fabric Group is absent from the local type defs, hence casts.
                    const pageObjects: any[] = ((currentPage as any).document.objects || []) as any[];
                    const childIds: string[] = ((obj as any).children || []) as string[];
                    const groupChildren: any[] = [];
                    const imageChildren: any[] = [];
                    childIds
                        .map((childId: string) => pageObjects.find((o: any) => o.id === childId))
                        .filter(Boolean)
                        .forEach((child: any) => {
                            if (child.type === 'image') {
                                // Images load asynchronously; folded in below.
                                imageChildren.push(child);
                                return;
                            }
                            // Same type-specific instantiation as top-level
                            // objects, so grouped text/shapes keep their content.
                            const childObj: any = createFabricObject(child);
                            if (childObj) {
                                childObj.set({ selectable: false });
                                groupChildren.push(childObj);
                            }
                        });
                    // Children are stored in page coordinates (they live in the
                    // same objects list as the group), so the Group is constructed
                    // WITHOUT left/top: Fabric derives the group's bounds and
                    // position from the children's absolute coords. Passing
                    // obj.x/obj.y here would apply the group offset on top of
                    // already-absolute child positions and misplace the artwork.
                    // The group is only built once it has at least one child;
                    // image-only groups are created lazily by the first image
                    // callback since images load asynchronously.
                    const groupHolder: { group: any } = { group: null };
                    if (groupChildren.length > 0) {
                        groupHolder.group = new (fabric as any).Group(groupChildren, {
                            selectable: true,
                        });
                    }
                    // Fold asynchronously loaded image children into the group.
                    imageChildren.forEach((child: any) => {
                        const url = child.content?.assetId;
                        if (!url) return;
                        fabric.Image.fromURL(
                            url,
                            (img: any) => {
                                if (!effectAlive) return;
                                img.set({
                                    left: child.x,
                                    top: child.y,
                                    width: child.width,
                                    height: child.height,
                                    selectable: false,
                                    crossOrigin: 'anonymous',
                                });
                                if (groupHolder.group) {
                                    groupHolder.group.addWithUpdate(img);
                                } else {
                                    // First child of an image-only group: create it
                                    // around the image, again without left/top.
                                    groupHolder.group = new (fabric as any).Group([img], {
                                        selectable: true,
                                    });
                                    (groupHolder.group as any).objId = obj.id;
                                    fabricCanvas.add(groupHolder.group);
                                }
                                fabricCanvas.renderAll();
                            },
                            { crossOrigin: 'anonymous' } as any
                        );
                    });
                    fabricObj = groupHolder.group;
                } else if (obj.type === 'image') {
                    const url = (obj as any).content?.assetId;
                    if (url) {
                        // load image properly
                        // Capture the fabricCanvas instance and effect liveness in the
                        // callback closure so that if this effect has been cleaned up
                        // (canvas disposed/recreated) the callback will no-op.
                        const capturedCanvas = fabricCanvas;
                        fabric.Image.fromURL(
                            url,
                            (img: any) => {
                                // Ignore callback if this effect has been torn down
                                if (!effectAlive) return;
                                // Also ensure the captured canvas still looks valid
                                if (!capturedCanvas || !capturedCanvas.getContext) return;

                                img.set({
                                    left: obj.x,
                                    top: obj.y,
                                    width: obj.width,
                                    height: obj.height,
                                    selectable: true,
                                    crossOrigin: 'anonymous',
                                });
                                (img as any).objId = obj.id;
                                capturedCanvas.add(img);
                                capturedCanvas.renderAll();
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
        const handleSelectionCleared = () => {
            cancelDraggedPositionUpdate();
            setSelectedObjects([]);
        };
        fabricCanvas.on('selection:cleared', handleSelectionCleared);

        const handleObjectMoving = (event: any) => {
            const target = event.target;
            if (
                !target?.objId ||
                typeof target.left !== 'number' ||
                typeof target.top !== 'number'
            ) {
                return;
            }
            pendingDraggedPosition = {
                id: target.objId,
                x: target.left,
                y: target.top,
            };
            if (draggedPositionFrame !== null) return;

            // Limit sidebar updates to display refreshes, not every pointer event.
            draggedPositionFrame = requestAnimationFrame(() => {
                draggedPositionFrame = null;
                if (effectAlive && pendingDraggedPosition) {
                    setDraggedObjectPosition(pendingDraggedPosition);
                }
            });
        };

        const handleObjectModified = (event: any) => {
            const target = event.target;
            if (
                !target?.objId ||
                typeof target.left !== 'number' ||
                typeof target.top !== 'number'
            ) {
                return;
            }
            cancelDraggedPositionUpdate();
            const state = useEditorStore.getState();
            const page = state.design?.pages.find(
                (item) => item.id === state.currentPageId
            );
            const object = page?.document.objects.find(
                (item) => item.id === target.objId
            );
            if (object?.type === 'text' && typeof target.text === 'string') {
                updateObject(target.objId, {
                    x: target.left,
                    y: target.top,
                    content: { ...object.content, text: target.text },
                });
                return;
            }
            updateObject(target.objId, {
                x: target.left,
                y: target.top,
            });
        };

        fabricCanvas.on('object:moving', handleObjectMoving);
        fabricCanvas.on('object:modified', handleObjectModified);

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
            // mark this effect as dead so any pending async callbacks won't touch
            // the disposed canvas instance
            effectAlive = false;
            cancelDraggedPositionUpdate();
            fabricCanvas.off('selection:created', handleSelection);
            fabricCanvas.off('selection:updated', handleSelection);
            fabricCanvas.off('selection:cleared', handleSelectionCleared);
            fabricCanvas.off('object:moving', handleObjectMoving);
            fabricCanvas.off('object:modified', handleObjectModified);
            fabricCanvas.off('mouse:down', handlePointerDown);
            fabricCanvas.dispose();
        };
    }, [
        design,
        currentPageId,
        zoom,
        panX,
        panY,
        activeTool,
        addObject,
        setActiveTool,
        setSelectedObjects,
        setDraggedObjectPosition,
        updateObject,
    ]);

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

            // Delete
            if (e.key === 'Delete' && store.selectedObjectIds.length > 0) {
                e.preventDefault();
                store.selectedObjectIds.forEach((id) => {
                    store.removeObject(id);
                });
            }
            // Duplicate (Ctrl+D or Cmd+D)
            else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && store.selectedObjectIds.length > 0) {
                e.preventDefault();
                store.duplicateObject(store.selectedObjectIds[0]);
            }
            // Undo (Ctrl+Z or Cmd+Z)
            else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                store.undo();
            }
            // Redo (Ctrl+Y or Cmd+Y or Ctrl+Shift+Z)
            else if (((e.ctrlKey || e.metaKey) && e.key === 'y') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                store.redo();
            }
            // Select All (Ctrl+A or Cmd+A)
            else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const page = store.design?.pages.find((p) => p.id === store.currentPageId);
                if (page) {
                    const allIds = page.document.objects.map((obj) => obj.id);
                    store.setSelectedObjects(allIds);
                }
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
