import axiosInstance from '../backend connection/axiosConfig';

/**
 * Utility to load high-fidelity spreadsheet JSON from the backend.
 * The backend handles the conversion from XLSX to FortuneSheet JSON.
 */
export const loadProjectTemplate = async (fileName: string) => {
    try {
        // Fetch pre-converted high-fidelity JSON from the Node.js backend
        const response = await axiosInstance.get(`/api/project-batch/excel-json/${fileName}`);

        if (response.data && response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.message || 'Failed to load high-fidelity template.');
        }
    } catch (error) {
        console.error('Failed to load project template:', error);
        throw error;
    }
};
