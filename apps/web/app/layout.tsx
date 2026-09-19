import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
    title: 'Design Platform',
    description: 'Create stunning visual designs with our web-based editor',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
