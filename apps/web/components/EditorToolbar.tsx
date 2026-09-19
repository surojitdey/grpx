'use client';

import { useEditorStore } from '@/stores/editor';
import Button from './Button';
import IconButton from './IconButton';
import {
    ArrowUturnLeftIcon,
    ArrowUturnRightIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    SparklesIcon,
    ShareIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

export default function EditorToolbar() {
    const { zoom, setZoom } = useEditorStore();

    return (
        <div className="toolbar">
            <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="Design Platform" className="h-8 w-8" />
                <span className="font-semibold text-lg">Design</span>
            </div>

            <div className="flex-1" />

            {/* Undo/Redo */}
            <div className="flex items-center gap-2">
                <IconButton title="Undo (Ctrl+Z)">
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </IconButton>
                <IconButton title="Redo (Ctrl+Shift+Z)">
                    <ArrowUturnRightIcon className="w-5 h-5" />
                </IconButton>
            </div>

            <div className="tool-separator" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
                <IconButton title="Zoom Out" onClick={() => setZoom(zoom - 10)}>
                    <MagnifyingGlassMinusIcon className="w-5 h-5" />
                </IconButton>
                <input
                    type="number"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-12 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                />
                <span className="text-sm">%</span>
                <IconButton title="Zoom In" onClick={() => setZoom(zoom + 10)}>
                    <MagnifyingGlassPlusIcon className="w-5 h-5" />
                </IconButton>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setZoom(100)}
                >
                    Reset
                </Button>
            </div>

            <div className="tool-separator" />

            {/* Actions */}
            <Button variant="ghost" size="sm">
                <SparklesIcon className="w-4 h-4 mr-2" />
                AI Generate
            </Button>
            <Button variant="ghost" size="sm">
                <ShareIcon className="w-4 h-4 mr-2" />
                Share
            </Button>
            <Button variant="primary" size="sm">
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                Export
            </Button>
        </div>
    );
}
