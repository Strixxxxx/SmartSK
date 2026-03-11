import axiosInstance from './axiosConfig';

export const fetchDashboardStats = async () => {
    const response = await axiosInstance.get('/api/admin/dashboard/stats');
    return response.data;
};

export const fetchDashboardCharts = async () => {
    const response = await axiosInstance.get('/api/admin/dashboard/charts');
    return response.data;
};

export const fetchDashboardActivity = async () => {
    const response = await axiosInstance.get('/api/admin/dashboard/activity');
    return response.data;
};
