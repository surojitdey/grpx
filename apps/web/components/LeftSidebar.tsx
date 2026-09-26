'use client';

import { useEditorStore } from '@/stores/editor';
import { assetApi } from '@/services/api';
import { createDefaultImage } from '@/utils/editor';
import cn from 'classnames';
import { useState } from 'react';
import {
    SparklesIcon,
    Squares2X2Icon,
    CubeIcon,
    PencilIcon,
    PhotoIcon,
    PlusCircleIcon,
} from '@heroicons/react/24/outline';

interface TemplateItemProps {
    id: string;
    name: string;
    preview: string;
    category: string;
}

function TemplateItem({ id, name, preview, category }: TemplateItemProps) {
    return (
        <div className="cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-full aspect-square bg-gray-200 rounded-lg overflow-hidden mb-2">
                <img
                    src={preview}
                    alt={name}
                    className="w-full h-full object-cover"
                />
            </div>
            <p className="text-sm font-medium text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">{category}</p>
        </div>
    );
}

const mockTemplates: TemplateItemProps[] = [
    {
        id: '1',
        name: 'Social Media Post',
        preview: 'https://via.placeholder.com/150',
        category: 'Social Media',
    },
    {
        id: '2',
        name: 'Instagram Story',
        preview: 'https://via.placeholder.com/150',
        category: 'Social Media',
    },
    {
        id: '3',
        name: 'Marketing Flyer',
        preview: 'https://via.placeholder.com/150',
        category: 'Marketing',
    },
];

export default function LeftSidebar() {
    const {
        activeLeftPanel,
        setActiveLeftPanel,
        activeTool,
        setActiveTool,
        leftSidebarOpen,
        addObject,
    } = useEditorStore();

    const [uploading, setUploading] = useState(false);

    if (!leftSidebarOpen) return null;

    const panels = [
        { id: 'templates', label: 'Templates', icon: SparklesIcon },
        { id: 'elements', label: 'Elements', icon: Squares2X2Icon },
        { id: 'text', label: 'Text', icon: PencilIcon },
        { id: 'images', label: 'Images', icon: PhotoIcon },
        { id: 'uploads', label: 'Uploads', icon: PlusCircleIcon },
    ];

    return (
        <div className="sidebar w-sidebar border-r border-gray-200 flex flex-col bg-white">
            {/* Panel Tabs */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
                {panels.map((panel) => {
                    const Icon = panel.icon;
                    const isActive = activeLeftPanel === panel.id;
                    return (
                        <button
                            key={panel.id}
                            onClick={() => setActiveLeftPanel(panel.id)}
                            className={cn(
                                'flex-1 px-3 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap',
                                isActive
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-600 hover:text-gray-900'
                            )}
                            title={panel.label}
                        >
                            <Icon className="w-4 h-4 mx-auto" />
                        </button>
                    );
                })}
            </div>

            {/* Panel Content */}
            <div className="panel-content flex-1">
                {activeLeftPanel === 'templates' && (
                    <div className="p-4 space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900">Templates</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {mockTemplates.map((template) => (
                                <TemplateItem key={template.id} {...template} />
                            ))}
                        </div>
                    </div>
                )}

                {activeLeftPanel === 'elements' && (
                    <div className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Elements</h3>
                        <div className="space-y-2">
                            <button
                                onClick={() => setActiveTool('rectangle')}
                                className={cn(
                                    'w-full px-4 py-2 rounded-lg border-2 transition-colors text-left text-sm font-medium',
                                    activeTool === 'rectangle'
                                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                                        : 'border-gray-200 hover:border-gray-300'
                                )}
                            >
                                Rectangle
                            </button>
                            <button
                                onClick={() => setActiveTool('circle')}
                                className={cn(
                                    'w-full px-4 py-2 rounded-lg border-2 transition-colors text-left text-sm font-medium',
                                    activeTool === 'circle'
                                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                                        : 'border-gray-200 hover:border-gray-300'
                                )}
                            >
                                Circle
                            </button>
                            <button
                                onClick={() => setActiveTool('line')}
                                className={cn(
                                    'w-full px-4 py-2 rounded-lg border-2 transition-colors text-left text-sm font-medium',
                                    activeTool === 'line'
                                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                                        : 'border-gray-200 hover:border-gray-300'
                                )}
                            >
                                Line
                            </button>
                        </div>
                    </div>
                )}

                {activeLeftPanel === 'text' && (
                    <div className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Text</h3>
                        <button
                            onClick={() => setActiveTool('text')}
                            className={cn(
                                'w-full px-4 py-3 rounded-lg border-2 transition-colors text-left font-medium',
                                activeTool === 'text'
                                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                                    : 'border-gray-200 hover:border-gray-300'
                            )}
                        >
                            Add Text
                        </button>
                    </div>
                )}

                {activeLeftPanel === 'images' && (
                    <div className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Images</h3>
                        <p className="text-sm text-gray-500">No images yet. Upload from the Uploads tab.</p>
                    </div>
                )}

                {activeLeftPanel === 'uploads' && (
                    <div className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Upload Image</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="image-upload"
                                disabled={uploading}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    try {
                                        setUploading(true);
                                        // Upload to backend
                                        const response = await assetApi.directUpload(file, file.name);
                                        const url = response.data.url;

                                        const rect = (document.querySelector('.canvas-wrapper canvas') as HTMLCanvasElement)?.getBoundingClientRect();
                                        const x = rect ? Math.max(20, rect.width / 2 - 150) : 100;
                                        const y = rect ? Math.max(20, rect.height / 2 - 100) : 100;
                                        const imgObj = createDefaultImage(x, y, url);
                                        addObject(imgObj);
                                        setActiveTool('select');
                                    } catch (err) {
                                        console.error('Image upload failed:', err);
                                        alert('Failed to upload image');
                                    } finally {
                                        setUploading(false);
                                    }
                                }}
                            />
                            <label
                                htmlFor="image-upload"
                                className={cn(
                                    'cursor-pointer text-sm',
                                    uploading
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-gray-600 hover:text-gray-900'
                                )}
                            >
                                {uploading ? 'Uploading...' : 'Drag and drop or click to select'}
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
