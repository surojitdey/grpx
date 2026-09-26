import { create } from 'zustand';
import { Design, DesignPage, DesignObject, User } from '@/types';

interface EditorState {
    // Design state
    design: Design | null;
    currentPageId: string | null;

    // UI state
    activeTool: 'select' | 'text' | 'rectangle' | 'circle' | 'line' | 'image';
    selectedObjectIds: string[];
    zoom: number;
    panX: number;
    panY: number;

    // Sidebar state
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;
    activeLeftPanel: 'templates' | 'elements' | 'text' | 'images' | 'uploads';
    activeRightPanel: 'properties' | 'layers';

    // Grid and guides
    showGrid: boolean;
    showGuides: boolean;
    gridSize: number;

    // Undo/Redo history
    history: Design[];
    historyIndex: number;

    // Text editing state
    editingTextId: string | null;
    editingTextValue: string;

    // Actions
    setDesign: (design: Design) => void;
    setCurrentPage: (pageId: string) => void;
    setActiveTool: (tool: string) => void;
    setSelectedObjects: (ids: string[]) => void;
    addSelectedObject: (id: string) => void;
    removeSelectedObject: (id: string) => void;
    clearSelection: () => void;

    setZoom: (zoom: number) => void;
    setPan: (x: number, y: number) => void;

    setLeftSidebarOpen: (open: boolean) => void;
    setRightSidebarOpen: (open: boolean) => void;
    setActiveLeftPanel: (panel: string) => void;
    setActiveRightPanel: (panel: string) => void;

    toggleGrid: () => void;
    toggleGuides: () => void;
    setGridSize: (size: number) => void;

    // Document operations
    addObject: (object: DesignObject) => void;
    removeObject: (id: string) => void;
    updateObject: (id: string, updates: Partial<DesignObject>) => void;
    reorderObject: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
    duplicateObject: (id: string) => void;

    // Text editing actions
    startEditingText: (id: string, initialValue: string) => void;
    updateEditingText: (value: string) => void;
    stopEditingText: () => void;

    // Undo/Redo actions
    undo: () => void;
    redo: () => void;
}

const MAX_HISTORY = 50;

const addToHistory = (state: any, newDesign: Design) => {
    // Remove any redo history beyond current index
    const newHistory = state.history.slice(0, state.historyIndex + 1);

    // If history is empty but there is an existing design, include it as the initial snapshot
    if (newHistory.length === 0 && state.design) {
        newHistory.push(JSON.parse(JSON.stringify(state.design)));
    }

    newHistory.push(JSON.parse(JSON.stringify(newDesign)));

    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
    }

    return {
        design: newDesign,
        history: newHistory,
        historyIndex: newHistory.length - 1,
    };
};

export const useEditorStore = create<EditorState>((set, get) => ({
    design: null,
    currentPageId: null,
    activeTool: 'select',
    selectedObjectIds: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    activeLeftPanel: 'templates',
    activeRightPanel: 'properties',
    showGrid: false,
    showGuides: false,
    gridSize: 20,
    history: [],
    historyIndex: -1,
    editingTextId: null,
    editingTextValue: '',

    setDesign: (design) =>
        set({
            design,
            currentPageId: design.pages[0]?.id,
            // Reset history when loading a new design so undo/redo applies to the
            // newly loaded document only. Seed initial snapshot for undo.
            history: [JSON.parse(JSON.stringify(design))],
            historyIndex: 0,
        }),

    setCurrentPage: (pageId) => set({ currentPageId: pageId }),

    setActiveTool: (tool) => set({ activeTool: tool as any }),

    setSelectedObjects: (ids) => set({ selectedObjectIds: ids }),

    addSelectedObject: (id) =>
        set((state) => ({
            selectedObjectIds: [...new Set([...state.selectedObjectIds, id])],
        })),

    removeSelectedObject: (id) =>
        set((state) => ({
            selectedObjectIds: state.selectedObjectIds.filter((sid) => sid !== id),
        })),

    clearSelection: () => set({ selectedObjectIds: [] }),

    setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(500, zoom)) }),

    setPan: (x, y) => set({ panX: x, panY: y }),

    setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),

    setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),

    setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel as any }),

    setActiveRightPanel: (panel) => set({ activeRightPanel: panel as any }),

    toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

    toggleGuides: () => set((state) => ({ showGuides: !state.showGuides })),

    setGridSize: (size) => set({ gridSize: size }),

    addObject: (object) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p) =>
                    p.id === state.currentPageId
                        ? {
                            ...p,
                            document: {
                                ...p.document,
                                objects: [...p.document.objects, object],
                            },
                        }
                        : p
                ),
            };
            return addToHistory(state, newDesign);
        }),

    removeObject: (id) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p) =>
                    p.id === state.currentPageId
                        ? {
                            ...p,
                            document: {
                                ...p.document,
                                objects: p.document.objects.filter((obj) => obj.id !== id),
                            },
                        }
                        : p
                ),
            };
            return {
                ...addToHistory(state, newDesign),
                selectedObjectIds: state.selectedObjectIds.filter((sid) => sid !== id),
            };
        }),

    updateObject: (id, updates) =>
        set((state: any) => {
            if (!state.design || !state.currentPageId) return state;
            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p: any) =>
                    p.id === state.currentPageId
                        ? {
                            ...p,
                            document: {
                                ...p.document,
                                objects: p.document.objects.map((obj: any) =>
                                    obj.id === id ? { ...obj, ...updates } : obj
                                ),
                            },
                        }
                        : p
                ),
            } as any;
            return addToHistory(state, newDesign);
        }) as any,

    reorderObject: (id, direction) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const page = state.design.pages.find((p) => p.id === state.currentPageId);
            if (!page) return state;

            const objects = [...page.document.objects];
            const index = objects.findIndex((obj) => obj.id === id);
            if (index === -1) return state;

            const maxZIndex = Math.max(...objects.map((o) => o.zIndex), 0);
            const minZIndex = Math.min(...objects.map((o) => o.zIndex), 0);

            if (direction === 'up' && index < objects.length - 1) {
                objects[index].zIndex = objects[index + 1].zIndex + 1;
            } else if (direction === 'down' && index > 0) {
                objects[index].zIndex = objects[index - 1].zIndex - 1;
            } else if (direction === 'top') {
                objects[index].zIndex = maxZIndex + 1;
            } else if (direction === 'bottom') {
                objects[index].zIndex = minZIndex - 1;
            }

            return {
                design: {
                    ...state.design,
                    pages: state.design.pages.map((p) =>
                        p.id === state.currentPageId
                            ? {
                                ...p,
                                document: {
                                    ...p.document,
                                    objects,
                                },
                            }
                            : p
                    ),
                },
            };
        }),

    duplicateObject: (id) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const page = state.design.pages.find((p) => p.id === state.currentPageId);
            if (!page) return state;

            const objectToDuplicate = page.document.objects.find((obj) => obj.id === id);
            if (!objectToDuplicate) return state;

            // Create a copy with a new ID, offset position slightly
            const { v4: uuidv4 } = require('uuid');
            const duplicated: DesignObject = {
                ...JSON.parse(JSON.stringify(objectToDuplicate)),
                id: `obj_${uuidv4()}`,
                x: objectToDuplicate.x + 20,
                y: objectToDuplicate.y + 20,
            };

            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p) =>
                    p.id === state.currentPageId
                        ? {
                            ...p,
                            document: {
                                ...p.document,
                                objects: [...p.document.objects, duplicated],
                            },
                        }
                        : p
                ),
            };

            return {
                ...addToHistory(state, newDesign),
                selectedObjectIds: [duplicated.id],
            };
        }),

    undo: () =>
        set((state) => {
            if (state.historyIndex <= 0) return state;
            const newIndex = state.historyIndex - 1;
            return {
                design: JSON.parse(JSON.stringify(state.history[newIndex])),
                historyIndex: newIndex,
            };
        }),

    redo: () =>
        set((state) => {
            if (state.historyIndex >= state.history.length - 1) return state;
            const newIndex = state.historyIndex + 1;
            return {
                design: JSON.parse(JSON.stringify(state.history[newIndex])),
                historyIndex: newIndex,
            };
        }),

    startEditingText: (id, initialValue) =>
        set({ editingTextId: id, editingTextValue: initialValue }),

    updateEditingText: (value) =>
        set({ editingTextValue: value }),

    stopEditingText: () =>
        set({ editingTextId: null, editingTextValue: '' }),
}));
