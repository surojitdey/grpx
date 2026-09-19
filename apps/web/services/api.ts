import axios from 'axios';
import { Design, Template, Asset, ExportJob, User, DesignShare } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth API
export const authApi = {
    register: (email: string, password: string, name: string) => {
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        return client.post('/auth/register/', {
            email,
            password,
            password_confirm: password,
            username: email.split('@')[0], // Use email prefix as username
            first_name: firstName,
            last_name: lastName,
        });
    },

    login: (email: string, password: string) =>
        client.post('/auth/login/', { email, password }),

    logout: () => client.post('/auth/logout/', {}),

    refresh: () => client.post('/auth/token/refresh/', {}),

    getCurrentUser: () => client.get<User>('/auth/me/'),
};

// Design API
export const designApi = {
    getDesigns: () => client.get<Design[]>('/designs/'),

    getDesign: (id: string) => client.get<Design>(`/designs/${id}/`),

    createDesign: (data: Partial<Design>) =>
        client.post<Design>('/designs/', data),

    updateDesign: (id: string, data: Partial<Design>) =>
        client.patch<Design>(`/designs/${id}/`, data),

    deleteDesign: (id: string) => client.delete(`/designs/${id}/`),

    duplicateDesign: (id: string) =>
        client.post<Design>(`/designs/${id}/duplicate/`, {}),
};

// Pages API
export const pageApi = {
    createPage: (designId: string) =>
        client.post(`/designs/${designId}/pages/`, {}),

    updatePage: (designId: string, pageId: string, document: any) =>
        client.patch(`/designs/${designId}/pages/${pageId}/`, { document }),

    deletePage: (designId: string, pageId: string) =>
        client.delete(`/designs/${designId}/pages/${pageId}/`),

    duplicatePage: (designId: string, pageId: string) =>
        client.post(`/designs/${designId}/pages/${pageId}/duplicate/`, {}),
};

// Asset API
export const assetApi = {
    getAssets: () => client.get<Asset[]>('/assets/'),

    getAsset: (id: string) => client.get<Asset>(`/assets/${id}/`),

    deleteAsset: (id: string) => client.delete(`/assets/${id}/`),

    getUploadUrl: (filename: string, contentType: string) =>
        client.post('/assets/upload-url/', { filename, contentType }),

    completeUpload: (key: string, etag: string) =>
        client.post('/assets/complete/', { key, etag }),
};

// Template API
export const templateApi = {
    getTemplates: (category?: string) =>
        client.get<Template[]>('/templates/', { params: { category } }),

    getTemplate: (id: string) => client.get<Template>(`/templates/${id}/`),

    createDesignFromTemplate: (templateId: string) =>
        client.post<Design>('/designs/from-template/', { templateId }),
};

// Export API
export const exportApi = {
    createExport: (designId: string, format: string, quality?: number) =>
        client.post<ExportJob>(`/designs/${designId}/exports/`, {
            format,
            quality,
        }),

    getExport: (id: string) => client.get<ExportJob>(`/exports/${id}/`),
};

// Share API
export const shareApi = {
    createShare: (designId: string, permission: string, expiresAt?: string) =>
        client.post<DesignShare>(`/designs/${designId}/shares/`, {
            permission,
            expiresAt,
        }),

    getShares: (designId: string) =>
        client.get<DesignShare[]>(`/designs/${designId}/shares/`),

    deleteShare: (designId: string, shareId: string) =>
        client.delete(`/designs/${designId}/shares/${shareId}/`),

    getSharedDesign: (token: string) =>
        client.get<Design>(`/shared/${token}/`),
};

export default client;
