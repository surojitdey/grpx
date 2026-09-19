import type { Metadata } from 'next';
import EditorLayout from '@/components/EditorLayout';
import '@/styles/globals.css';

export const metadata: Metadata = {
    title: 'Design Platform',
    description: 'Create stunning visual designs',
};

interface EditorPageProps {
    params: Promise<{
        designId: string;
    }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
    const { designId } = await params;
    return <EditorLayout designId={designId} />;
}
