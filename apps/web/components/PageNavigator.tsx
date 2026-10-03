'use client';

import { useRef, useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    DocumentDuplicateIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import cn from 'classnames';
import Button from './Button';

// Per-page controls are revealed on hover/focus only — they stay in the
// layout (opacity, not display) so they remain reachable by keyboard.
const controlClass =
    'rounded p-0.5 text-gray-400 transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-gray-700 disabled:opacity-0 disabled:hover:text-gray-400';

export default function PageNavigator() {
    const design = useEditorStore((state) => state.design);
    const currentPageId = useEditorStore((state) => state.currentPageId);
    const setCurrentPage = useEditorStore((state) => state.setCurrentPage);
    const addPage = useEditorStore((state) => state.addPage);
    const duplicatePage = useEditorStore((state) => state.duplicatePage);
    const deletePage = useEditorStore((state) => state.deletePage);
    const renamePage = useEditorStore((state) => state.renamePage);
    const movePage = useEditorStore((state) => state.movePage);

    // Inline rename target: `original` lets a cancelled/unchanged edit avoid
    // pushing a pointless history entry.
    const [editing, setEditing] = useState<{ id: string; original: string } | null>(null);
    const [draftName, setDraftName] = useState('');
    const draggingIdRef = useRef<string | null>(null);

    if (!design) return null;

    const pages = design.pages;

    const startRename = (page: any, name: string) => {
        setEditing({ id: page.id, original: name });
        setDraftName(page.name ?? '');
    };

    const commitRename = () => {
        if (!editing) return;
        const trimmed = draftName.trim();
        if (trimmed && trimmed !== editing.original) {
            renamePage(editing.id, trimmed);
        }
        setEditing(null);
    };

    const tryDelete = (page: any, name: string) => {
        const hasContents = (page.document?.objects?.length ?? 0) > 0;
        if (hasContents && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm(`Delete "${name}" and everything on it?`)) return;
        }
        deletePage(page.id);
    };

    return (
        <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center gap-3 overflow-x-auto">
            {pages.map((page, index) => {
                const name = page.name || `Page ${index + 1}`;
                const isCurrent = currentPageId === page.id;
                const isEditing = editing?.id === page.id;
                const isFirst = index === 0;
                const isLast = index === pages.length - 1;

                return (
                    <div
                        key={page.id}
                        className="group flex items-center gap-1"
                        // Drag/drop reorder (US-3.18): the drop target's index is
                        // the destination, so this shares movePage with the arrows.
                        draggable={!isEditing}
                        onDragStart={() => {
                            draggingIdRef.current = page.id;
                        }}
                        onDragOver={(event) => {
                            event.preventDefault();
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            const draggedId = draggingIdRef.current;
                            draggingIdRef.current = null;
                            if (draggedId && draggedId !== page.id) {
                                movePage(draggedId, index);
                            }
                        }}
                    >
                        {isEditing ? (
                            <input
                                autoFocus
                                value={draftName}
                                aria-label={`New name for ${name}`}
                                onChange={(event) => setDraftName(event.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') commitRename();
                                    else if (event.key === 'Escape') setEditing(null);
                                }}
                                className="w-32 rounded-lg border-2 border-blue-500 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setCurrentPage(page.id)}
                                className={cn(
                                    'px-4 py-2 rounded-lg border-2 transition-colors text-sm font-medium whitespace-nowrap',
                                    isCurrent
                                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                )}
                            >
                                {name}
                            </button>
                        )}

                        <span className="flex items-center gap-0.5">
                            <button
                                type="button"
                                title="Move left"
                                aria-label={`Move ${name} left`}
                                disabled={isFirst}
                                onClick={() => movePage(page.id, index - 1)}
                                className={controlClass}
                            >
                                <ChevronLeftIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                title="Move right"
                                aria-label={`Move ${name} right`}
                                disabled={isLast}
                                onClick={() => movePage(page.id, index + 1)}
                                className={controlClass}
                            >
                                <ChevronRightIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                title="Rename"
                                aria-label={`Rename ${name}`}
                                onClick={() => startRename(page, name)}
                                className={controlClass}
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                title="Duplicate"
                                aria-label={`Duplicate ${name}`}
                                onClick={() => duplicatePage(page.id)}
                                className={controlClass}
                            >
                                <DocumentDuplicateIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                title="Delete"
                                aria-label={`Delete ${name}`}
                                disabled={pages.length <= 1}
                                onClick={() => tryDelete(page, name)}
                                className={controlClass}
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </span>
                    </div>
                );
            })}

            <Button variant="ghost" size="sm" onClick={() => addPage()}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Page
            </Button>
        </div>
    );
}
