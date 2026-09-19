'use client';

import { useEditorStore } from '@/stores/editor';
import { PlusIcon } from '@heroicons/react/24/outline';
import cn from 'classnames';
import Button from './Button';

export default function PageNavigator() {
    const { design, currentPageId, setCurrentPage } = useEditorStore();

    if (!design) return null;

    return (
        <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center gap-4 overflow-x-auto">
            {design.pages.map((page, index) => (
                <button
                    key={page.id}
                    onClick={() => setCurrentPage(page.id)}
                    className={cn(
                        'px-4 py-2 rounded-lg border-2 transition-colors text-sm font-medium whitespace-nowrap',
                        currentPageId === page.id
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}
                >
                    Page {index + 1}
                </button>
            ))}
            <Button variant="ghost" size="sm">
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Page
            </Button>
        </div>
    );
}
