'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/Button';
import { designApi } from '@/services/api';
import '@/styles/globals.css';

interface Design {
    id: number;
    name: string;
    description: string;
    width: number;
    height: number;
    status: string;
    created_at: string;
    updated_at: string;
}

export default function DesignsPage() {
    const router = useRouter();
    const [designs, setDesigns] = useState<Design[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadDesigns();
    }, []);

    const loadDesigns = async () => {
        try {
            setLoading(true);
            const response = await designApi.getDesigns();
            // Handle paginated response from DRF
            const designsData = Array.isArray(response.data) ? response.data : response.data.results || [];
            setDesigns(designsData);
        } catch (err) {
            console.error('Failed to load designs:', err);
            setError('Failed to load designs. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDesign = async () => {
        setCreating(true);
        setError('');
        try {
            const response = await designApi.createDesign({
                name: 'Untitled Design',
                description: '',
                width: 1080,
                height: 1080,
                status: 'draft'
            });
            router.push(`/editor/${response.data.id}`);
        } catch (err) {
            console.error('Failed to create design:', err);

            // Extract error message from various sources
            let errorMessage = 'Failed to create design. Please try again.';
            if (err.response?.data?.detail) {
                errorMessage = err.response.data.detail;
            } else if (err.response?.data?.non_field_errors?.[0]) {
                errorMessage = err.response.data.non_field_errors[0];
            } else if (err.response?.data?.name?.[0]) {
                errorMessage = `Name: ${err.response.data.name[0]}`;
            } else if (typeof err.response?.data === 'string') {
                errorMessage = err.response.data;
            } else if (err.message) {
                errorMessage = err.message;
            }

            setError(errorMessage);
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navigation */}
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg" />
                            <span className="text-xl font-bold text-gray-900">Design</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="primary"
                                onClick={handleCreateDesign}
                                disabled={creating}
                            >
                                {creating ? 'Creating...' : '+ New Design'}
                            </Button>
                            <button className="w-10 h-10 rounded-full bg-gray-200" />
                        </div>
                    </div>
                </div>
            </nav>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Designs</h1>
                <p className="text-gray-600 mb-8">Manage and create your designs</p>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                        <p className="text-gray-600">Loading designs...</p>
                    </div>
                ) : designs.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500 mb-4">No designs yet</p>
                        <Button variant="primary" onClick={handleCreateDesign} disabled={creating}>
                            {creating ? 'Creating...' : 'Create Your First Design'}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {designs.map((design) => (
                            <Link
                                key={design.id}
                                href={`/editor/${design.id}`}
                                className="group"
                            >
                                <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                                    <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="text-4xl font-bold text-gray-400">{design.id}</div>
                                            <div className="text-sm text-gray-400 mt-2">{design.width}×{design.height}</div>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                            {design.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1 truncate">
                                            {design.description || 'No description'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-2">
                                            {new Date(design.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
