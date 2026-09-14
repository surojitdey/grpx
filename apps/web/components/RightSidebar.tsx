'use client';

import { useEditorStore } from '@/stores/editor';
import cn from 'classnames';
import { ChevronUpIcon, ChevronDownIcon, EyeIcon, EyeSlashIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';

export function PropertiesPanel() {
    const { selectedObjectIds, design, currentPageId } = useEditorStore();

    if (selectedObjectIds.length === 0) {
        return (
            <div className="p-4 text-center text-gray-500 text-sm">
                Select an object to edit properties
            </div>
        );
    }

    const currentPage = design?.pages.find((p) => p.id === currentPageId);
    const selectedObject = currentPage?.document.objects.find(
        (obj) => obj.id === selectedObjectIds[0]
    );

    if (!selectedObject) return null;

    return (
        <div className="space-y-4 p-4">
            <div className="form-group">
                <label className="form-label">Name</label>
                <input
                    type="text"
                    value={selectedObject.type}
                    className="form-input text-sm"
                    disabled
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                    <label className="form-label">X</label>
                    <input
                        type="number"
                        value={selectedObject.x}
                        className="form-input text-sm"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Y</label>
                    <input
                        type="number"
                        value={selectedObject.y}
                        className="form-input text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                    <label className="form-label">Width</label>
                    <input
                        type="number"
                        value={selectedObject.width}
                        className="form-input text-sm"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Height</label>
                    <input
                        type="number"
                        value={selectedObject.height}
                        className="form-input text-sm"
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Rotation</label>
                <input
                    type="number"
                    min="0"
                    max="360"
                    value={selectedObject.rotation}
                    className="form-input text-sm"
                />
            </div>

            <div className="form-group">
                <label className="form-label">Opacity</label>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedObject.opacity * 100}
                    className="w-full"
                />
                <span className="text-xs text-gray-500">{Math.round(selectedObject.opacity * 100)}%</span>
            </div>

            {selectedObject.type === 'text' && (
                <>
                    <div className="border-t pt-4">
                        <h4 className="text-sm font-semibold mb-3">Text</h4>
                        <div className="form-group">
                            <label className="form-label">Font Family</label>
                            <select className="form-select text-sm">
                                <option>Inter</option>
                                <option>Arial</option>
                                <option>Helvetica</option>
                                <option>Times New Roman</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="form-group">
                                <label className="form-label">Size</label>
                                <input type="number" className="form-input text-sm" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Weight</label>
                                <select className="form-select text-sm">
                                    <option value="400">Regular</option>
                                    <option value="600">Bold</option>
                                    <option value="700">Bolder</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export function LayersPanel() {
    const { design, currentPageId, selectedObjectIds, setSelectedObjects, updateObject, reorderObject } = useEditorStore();

    const currentPage = design?.pages.find((p) => p.id === currentPageId);
    const objects = currentPage?.document.objects || [];

    const sortedObjects = [...objects].sort((a, b) => b.zIndex - a.zIndex);

    return (
        <div className="space-y-1 p-2">
            {sortedObjects.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No objects yet</div>
            ) : (
                sortedObjects.map((obj) => (
                    <div
                        key={obj.id}
                        className={cn(
                            'layer-item',
                            selectedObjectIds.includes(obj.id) && 'selected'
                        )}
                        onClick={() => setSelectedObjects([obj.id])}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center flex-1 gap-2 min-w-0">
                                <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0">
                                    {obj.type}
                                </span>
                                <span className="text-sm text-gray-700 truncate">
                                    {obj.type === 'text' && 'text' in obj.content
                                        ? obj.content.text.substring(0, 20)
                                        : obj.id}
                                </span>
                            </div>
                            <div className="layer-controls">
                                <button
                                    className="layer-control-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateObject(obj.id, { visible: !obj.visible });
                                    }}
                                    title={obj.visible ? 'Hide' : 'Show'}
                                >
                                    {obj.visible ? (
                                        <EyeIcon className="w-4 h-4" />
                                    ) : (
                                        <EyeSlashIcon className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    className="layer-control-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateObject(obj.id, { locked: !obj.locked });
                                    }}
                                    title={obj.locked ? 'Unlock' : 'Lock'}
                                >
                                    {obj.locked ? (
                                        <LockClosedIcon className="w-4 h-4" />
                                    ) : (
                                        <LockOpenIcon className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    className="layer-control-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        reorderObject(obj.id, 'up');
                                    }}
                                    title="Bring Forward"
                                >
                                    <ChevronUpIcon className="w-4 h-4" />
                                </button>
                                <button
                                    className="layer-control-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        reorderObject(obj.id, 'down');
                                    }}
                                    title="Send Backward"
                                >
                                    <ChevronDownIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

export default function RightSidebar() {
    const { activeRightPanel, setActiveRightPanel, rightSidebarOpen } = useEditorStore();

    if (!rightSidebarOpen) return null;

    return (
        <div className="panel w-80 border-l border-gray-200 flex flex-col bg-white">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveRightPanel('properties')}
                    className={cn(
                        'flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                        activeRightPanel === 'properties'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                    )}
                >
                    Properties
                </button>
                <button
                    onClick={() => setActiveRightPanel('layers')}
                    className={cn(
                        'flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                        activeRightPanel === 'layers'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                    )}
                >
                    Layers
                </button>
            </div>

            {/* Content */}
            <div className="panel-content flex-1">
                {activeRightPanel === 'properties' && <PropertiesPanel />}
                {activeRightPanel === 'layers' && <LayersPanel />}
            </div>
        </div>
    );
}
