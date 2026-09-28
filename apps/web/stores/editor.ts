import { create } from 'zustand';
import { Design, DesignPage, DesignObject, User, PersistenceState } from '@/types';
import { buildCanonicalDocument } from '@/services/api';

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

    // Autosave persistence state (see PersistenceState in types/index.ts).
    persistence: PersistenceState;

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

    // Persistence actions
    markDirty: () => void;
    markClean: () => void;
    saveStarted: () => void;
    saveSuccess: (revision: number, savedAt: Date) => void;
    saveSuccessIfCurrent: (revision: number, savedAt: Date, serialized: string) => void;
    saveFailed: (message: string) => void;
    resetPersistence: (revision: number) => void;
}

const MAX_HISTORY = 50;

const INITIAL_PERSISTENCE: PersistenceState = {
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    saveError: null,
    revision: 0,
};

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

// Ensure a page has a valid document structure with objects array
const ensurePageDocument = (page: any): any => {
    if (!page.document || !Array.isArray(page.document.objects)) {
        return {
            ...page,
            document: {
                schemaVersion: '1.0',
                objects: [],
                background: {
                    type: 'color',
                    value: '#ffffff',
                },
                ...(page.document || {}),
            },
        };
    }
    return page;
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
    persistence: { ...INITIAL_PERSISTENCE },

    setDesign: (design) =>
        set({
            design: design ? {
                ...design,
                pages: (design.pages || []).map(ensurePageDocument),
            } : null,
            currentPageId: design?.pages?.[0]?.id || null,
            // Reset history when loading a new design so undo/redo applies to the
            // newly loaded document only. Seed initial snapshot for undo.
            history: design ? [JSON.parse(JSON.stringify({
                ...design,
                pages: (design.pages || []).map(ensurePageDocument),
            }))] : [],
            historyIndex: design ? 0 : -1,
            // Loading a design is not an edit: reset persistence so the
            // autosave flow starts clean (EditorLayout re-baselines from the
            // loaded revision and syncs save outcomes back via saveSuccess).
            persistence: { ...INITIAL_PERSISTENCE },
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
                pages: state.design.pages.map((p) => {
                    if (p.id === state.currentPageId) {
                        const page = ensurePageDocument(p);
                        return {
                            ...page,
                            document: {
                                ...page.document,
                                objects: [...(page.document.objects || []), object],
                            },
                        };
                    }
                    return p;
                }),
            };
            return {
                ...addToHistory(state, newDesign),
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    removeObject: (id) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p) => {
                    if (p.id === state.currentPageId) {
                        const page = ensurePageDocument(p);
                        return {
                            ...page,
                            document: {
                                ...page.document,
                                objects: (page.document.objects || []).filter((obj) => obj.id !== id),
                            },
                        };
                    }
                    return p;
                }),
            };
            return {
                ...addToHistory(state, newDesign),
                selectedObjectIds: state.selectedObjectIds.filter((sid) => sid !== id),
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    updateObject: (id, updates) =>
        set((state: any) => {
            if (!state.design || !state.currentPageId) return state;
            const newDesign = {
                ...state.design,
                pages: state.design.pages.map((p: any) => {
                    if (p.id === state.currentPageId) {
                        const page = ensurePageDocument(p);
                        return {
                            ...page,
                            document: {
                                ...page.document,
                                objects: (page.document.objects || []).map((obj: any) =>
                                    obj.id === id ? { ...obj, ...updates } : obj
                                ),
                            },
                        };
                    }
                    return p;
                }),
            } as any;
            return {
                ...addToHistory(state, newDesign),
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }) as any,

    reorderObject: (id, direction) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const page = state.design.pages.find((p) => p.id === state.currentPageId);
            if (!page) return state;

            const safePage = ensurePageDocument(page);
            const objects = [...(safePage.document.objects || [])];
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
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    duplicateObject: (id) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            const page = state.design.pages.find((p) => p.id === state.currentPageId);
            if (!page) return state;

            const safePage = ensurePageDocument(page);
            const objectToDuplicate = (safePage.document.objects || []).find((obj) => obj.id === id);
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
                pages: state.design.pages.map((p) => {
                    if (p.id === state.currentPageId) {
                        const page = ensurePageDocument(p);
                        return {
                            ...page,
                            document: {
                                ...page.document,
                                objects: [...(page.document.objects || []), duplicated],
                            },
                        };
                    }
                    return p;
                }),
            };

            return {
                ...addToHistory(state, newDesign),
                selectedObjectIds: [duplicated.id],
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    undo: () =>
        set((state) => {
            if (state.historyIndex <= 0) return state;
            const newIndex = state.historyIndex - 1;
            return {
                design: JSON.parse(JSON.stringify(state.history[newIndex])),
                historyIndex: newIndex,
                // Undo/redo change the document just as much as direct edits;
                // the autosave effect dedupes against the last synced payload.
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    redo: () =>
        set((state) => {
            if (state.historyIndex >= state.history.length - 1) return state;
            const newIndex = state.historyIndex + 1;
            return {
                design: JSON.parse(JSON.stringify(state.history[newIndex])),
                historyIndex: newIndex,
                persistence: { ...state.persistence, isDirty: true, saveError: null },
            };
        }),

    startEditingText: (id, initialValue) =>
        set({ editingTextId: id, editingTextValue: initialValue }),

    updateEditingText: (value) =>
        set({ editingTextValue: value }),

    stopEditingText: () =>
        set({ editingTextId: null, editingTextValue: '' }),

    markDirty: () =>
        set((state) => ({
            persistence: { ...state.persistence, isDirty: true, saveError: null },
        })),

    // Content is back in sync with the server (e.g. undo returned to the last
    // synced state) without a save acknowledging new edits.
    markClean: () =>
        set((state) => ({
            persistence: { ...state.persistence, isDirty: false, saveError: null },
        })),

    saveStarted: () =>
        set((state) => ({
            persistence: { ...state.persistence, isSaving: true, saveError: null },
        })),

    saveSuccess: (revision, savedAt) =>
        set((state) => ({
            persistence: {
                ...state.persistence,
                isDirty: false,
                isSaving: false,
                lastSavedAt: savedAt,
                saveError: null,
                revision,
            },
        })),

    // Only clears dirty state when the response corresponds to the current
    // in-memory document. A successful save that returned a stale payload
    // (e.g. because newer local edits arrived) must not be allowed to
    // temporarily mark the newer edits clean.
    saveSuccessIfCurrent: (revision: number, savedAt: Date, serialized: string) =>
        set((state) => {
            const currentDesign = state.design;
            if (!currentDesign) return { persistence: state.persistence };
            const currentSerialization = JSON.stringify(buildCanonicalDocument(currentDesign));
            if (currentSerialization !== serialized) {
                // Response is stale: do not clear dirty state, but do absorb
                // fresh metadata so the next local save starts from a newer
                // revision baseline.
                return {
                    persistence: {
                        ...state.persistence,
                        isSaving: false,
                        lastSavedAt: savedAt,
                        revision,
                        saveError: state.persistence.saveError ?? null,
                    },
                };
            }
            return {
                persistence: {
                    ...state.persistence,
                    isDirty: false,
                    isSaving: false,
                    lastSavedAt: savedAt,
                    saveError: null,
                    revision,
                },
            };
        }),

    saveFailed: (message) =>
        set((state) => ({
            persistence: {
                ...state.persistence,
                isSaving: false,
                // Stays dirty: the edits only leave this state once a save
                // succeeds (or the design is reloaded).
                isDirty: true,
                saveError: message,
            },
        })),

    resetPersistence: (revision) =>
        set(() => ({
            // Full reset (including lastSavedAt): used on load/design switch
            // where the previous design's save history must not leak through.
            persistence: { ...INITIAL_PERSISTENCE, revision },
        })),
}));
