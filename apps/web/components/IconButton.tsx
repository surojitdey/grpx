'use client';

import { ReactNode } from 'react';
import cn from 'classnames';

interface IconButtonProps {
    children: ReactNode;
    onClick?: () => void;
    title?: string;
    active?: boolean;
    className?: string;
}

export default function IconButton({
    children,
    onClick,
    title,
    active = false,
    className,
}: IconButtonProps) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                'tool-button',
                active && 'active',
                'flex items-center justify-center',
                className
            )}
        >
            {children}
        </button>
    );
}
