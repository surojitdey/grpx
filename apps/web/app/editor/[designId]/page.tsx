import type { Metadata } from 'next';
import EditorLayout from '@/components/EditorLayout';
import '@/styles/globals.css';

export const metadata: Metadata = {
    title: 'Design Platform',
    description: 'Create stunning visual designs',
};

interface EditorPageProps {
    params: {
        designId: string;
    };
}

export default function EditorPage({ params }: EditorPageProps) {
    return <EditorLayout designId={params.designId} />;
}
