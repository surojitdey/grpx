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
}

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

    setDesign: (design) => set({ design, currentPageId: design.pages[0]?.id }),

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
            const page = state.design.pages.find((p) => p.id === state.currentPageId);
            if (!page) return state;
            return {
                design: {
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
                },
            };
        }),

    removeObject: (id) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            return {
                design: {
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
                },
                selectedObjectIds: state.selectedObjectIds.filter((sid) => sid !== id),
            };
        }),

    updateObject: (id, updates) =>
        set((state) => {
            if (!state.design || !state.currentPageId) return state;
            return {
                design: {
                    ...state.design,
                    pages: state.design.pages.map((p) =>
                        p.id === state.currentPageId
                            ? {
                                ...p,
                                document: {
                                    ...p.document,
                                    objects: p.document.objects.map((obj) =>
                                        obj.id === id ? { ...obj, ...updates } : obj
                                    ),
                                },
                            }
                            : p
                    ),
                },
            };
        }),

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
}));
