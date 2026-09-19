import axios from 'axios';
import { Design, Template, Asset, ExportJob, User, DesignShare } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const client = axios.create({
    baseURL: API_URL,
    // Don't set default Content-Type - let axios handle it per request
    // FormData needs to set multipart/form-data with boundary automatically
    headers: {},
});

// Convert snake_case keys to camelCase
function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

function transformKeys(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(transformKeys);
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).reduce((result: any, key: string) => {
            const camelKey = snakeToCamel(key);
            result[camelKey] = transformKeys(obj[key]);
            return result;
        }, {});
    }
    return obj;
}

// Add token to requests
client.interceptors.request.use((config) => {
    // Allow callers to skip attaching the Authorization header by setting
    // a custom `x-skip-auth` header on the request config. This is useful
    // for login/register endpoints where an expired token in localStorage
    // should not be sent.
    const skip = config.headers && (config.headers as any)['x-skip-auth'];
    if (skip) {
        // remove the helper header before sending
        delete (config.headers as any)['x-skip-auth'];
    }

    // Set Content-Type for JSON requests (but not for FormData)
    if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
    }

    // Only attach Authorization header when caller did NOT request skip
    if (!skip) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        if (token) {
            config.headers = config.headers || {};
            (config.headers as any).Authorization = `Bearer ${token}`;
        }
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
        }, { headers: { 'x-skip-auth': '1' } });
    },

    login: (email: string, password: string) =>
        client.post('/auth/login/', { email, password }, { headers: { 'x-skip-auth': '1' } }),

    logout: () => client.post('/auth/logout/', {}),

    refresh: () => client.post('/auth/token/refresh/', {}),

    getCurrentUser: () => client.get<User>('/auth/me/'),
};

// Design API
export const designApi = {
    getDesigns: async () => {
        const response = await client.get<Design[]>('/designs/');
        return { ...response, data: transformKeys(response.data) };
    },

    getDesign: async (id: string) => {
        const response = await client.get<Design>(`/designs/${id}/`);
        return { ...response, data: transformKeys(response.data) };
    },

    createDesign: async (data: Partial<Design>) => {
        const response = await client.post<Design>('/designs/', data);
        return { ...response, data: transformKeys(response.data) };
    },

    updateDesign: async (id: string, data: Partial<Design>) => {
        const response = await client.patch<Design>(`/designs/${id}/`, data);
        return { ...response, data: transformKeys(response.data) };
    },

    deleteDesign: (id: string) => client.delete(`/designs/${id}/`),

    duplicateDesign: async (id: string) => {
        const response = await client.post<Design>(`/designs/${id}/duplicate/`, {});
        return { ...response, data: transformKeys(response.data) };
    },
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

    directUpload: async (file: File, name?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (name) {
            formData.append('name', name);
        }

        // Don't override Content-Type - let axios set it with proper boundary
        // The request interceptor will add Authorization header automatically
        const response = await client.post<Asset>('/assets/direct-upload/', formData);
        return { ...response, data: transformKeys(response.data) };
    },

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
