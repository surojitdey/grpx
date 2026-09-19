import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/Button';
import '@/styles/globals.css';

export const metadata: Metadata = {
    title: 'Design Platform',
    description: 'Create stunning visual designs',
};

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Navigation */}
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg" />
                            <span className="text-xl font-bold text-gray-900">Design</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/auth/login">
                                <Button variant="ghost">Sign In</Button>
                            </Link>
                            <Link href="/auth/register">
                                <Button variant="primary">Get Started</Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="max-w-4xl mx-auto px-4 py-20 text-center">
                <h1 className="text-5xl font-bold text-gray-900 mb-6">
                    Create Stunning Designs
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                    Professional visual design platform for social media, marketing, and more
                </p>
                <div className="flex gap-4 justify-center">
                    <Link href="/auth/register">
                        <Button variant="primary" size="lg">
                            Start Designing Now
                        </Button>
                    </Link>
                    <Link href="/">
                        <Button variant="secondary" size="lg">
                            Learn More
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Features Grid */}
            <div className="max-w-6xl mx-auto px-4 py-16">
                <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
                    Powerful Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        {
                            title: 'Easy to Use',
                            description: 'Intuitive editor with drag-and-drop functionality',
                        },
                        {
                            title: 'Rich Templates',
                            description: 'Thousands of templates to get you started',
                        },
                        {
                            title: 'Export Anywhere',
                            description: 'Download as PNG, JPEG, or PDF',
                        },
                        {
                            title: 'Multi-Page',
                            description: 'Create designs with multiple pages',
                        },
                        {
                            title: 'Cloud Storage',
                            description: 'Your designs are always saved and accessible',
                        },
                        {
                            title: 'Sharing',
                            description: 'Share your designs with a secure link',
                        },
                    ].map((feature, index) => (
                        <div
                            key={index}
                            className="bg-white rounded-lg shadow-lg p-6"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                {feature.title}
                            </h3>
                            <p className="text-gray-600">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
