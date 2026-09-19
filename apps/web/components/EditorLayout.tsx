'use client';

import { useEffect, useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import { designApi, authApi } from '@/services/api';
import { debounce } from '@/utils/editor';
import EditorToolbar from '@/components/EditorToolbar';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import Canvas from '@/components/Canvas';
import PageNavigator from '@/components/PageNavigator';

interface EditorLayoutProps {
    designId: string;
}

export default function EditorLayout({ designId }: EditorLayoutProps) {
    const { design, setDesign } = useEditorStore();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadDesign = async () => {
            try {
                setError(null);
                // Determine a user-scoped cache key. We attempt to resolve the
                // current authenticated user so cached drafts are scoped to that
                // user. If we cannot determine a user (unauthenticated or error)
                // we fall back to an 'anon' namespace.
                let userId = 'anon';
                try {
                    const me = await authApi.getCurrentUser();
                    userId = String((me.data as any)?.id || 'anon');
                    try {
                        localStorage.setItem('current_user_id', userId);
                    } catch (e) {
                        // ignore storage errors
                    }
                } catch (e) {
                    // unable to resolve current user; continue as anon
                }

                const key = `design-editor:${userId}:${designId}`;
                const cached = localStorage.getItem(key);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        // Use cached design for fast restore (scoped to user), but
                        // do NOT treat it as authoritative. Launch a background
                        // fetch to reconcile with the server and update if newer.
                        setDesign(parsed);

                        (async () => {
                            try {
                                const response = await designApi.getDesign(designId);
                                const server = response.data as any;

                                // Prefer explicit version field if present, otherwise compare updatedAt timestamps.
                                const cachedVersion = (parsed as any).currentVersion;
                                const serverVersion = server?.currentVersion;

                                const cachedUpdated = parsed?.updatedAt ? new Date(parsed.updatedAt).getTime() : null;
                                const serverUpdated = server?.updatedAt ? new Date(server.updatedAt).getTime() : null;

                                let serverIsNewer = false;
                                if (serverVersion != null && cachedVersion != null) {
                                    serverIsNewer = serverVersion !== cachedVersion;
                                } else if (serverUpdated != null && cachedUpdated != null) {
                                    serverIsNewer = serverUpdated > cachedUpdated;
                                } else {
                                    // Fallback: shallow compare objects
                                    serverIsNewer = JSON.stringify(server) !== JSON.stringify(parsed);
                                }

                                if (serverIsNewer) {
                                    setDesign(server);
                                    try {
                                        localStorage.setItem(key, JSON.stringify(server));
                                    } catch (e) {
                                        // ignore local save errors
                                    }
                                }
                            } catch (err) {
                                // If background fetch fails, keep using cached state and allow main flow to handle errors.
                                // No-op here to avoid noisy console logs for transient network issues.
                            }
                        })();

                        // Continue: don't return early — background reconciliation will update if needed.
                    } catch (err) {
                        // fall back to API
                    }
                }

                const response = await designApi.getDesign(designId);
                setDesign(response.data);
            } catch (error: any) {
                console.error('Failed to load design:', error);
                if (error.response?.status === 404) {
                    setError('Design not found. It may have been deleted or you may not have access to it.');
                } else if (error.response?.status === 401) {
                    setError('You are not authenticated. Please log in again.');
                } else {
                    setError('Failed to load design. Please try again.');
                }
            }
        };

        loadDesign();
    }, [designId, setDesign]);

    // Autosave design to localStorage. Use the same user-scoped key that
    // `loadDesign` creates so drafts are stored per authenticated user.
    useEffect(() => {
        if (!design) return;
        const userId = typeof window !== 'undefined' ? (localStorage.getItem('current_user_id') || 'anon') : 'anon';
        const key = `design-editor:${userId}:${designId}`;
        const save = debounce((d: any) => {
            try {
                localStorage.setItem(key, JSON.stringify(d));
            } catch (err) {
                console.error('Failed to save design locally', err);
            }
        }, 1000);

        save(design);

        // Cancel any pending autosave when effect cleans up (component unmount or deps change)
        return () => {
            save.cancel?.();
        };
    }, [design, designId]);

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center max-w-md">
                    <div className="text-5xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Design</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <a
                        href="/designs"
                        className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Back to Designs
                    </a>
                </div>
            </div>
        );
    }

    if (!design) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading design...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Toolbar */}
            <EditorToolbar />

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <LeftSidebar />

                {/* Canvas */}
                <Canvas />

                {/* Right Sidebar */}
                <RightSidebar />
            </div>

            {/* Page Navigator */}
            <PageNavigator />
        </div>
    );
}
