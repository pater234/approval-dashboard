// API service for communicating with the backend
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('token');
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  // Clear authentication token
  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  // Get headers for API requests
  getHeaders(includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Generic API request method
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(options.includeAuth !== false),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          this.clearToken();
          window.location.href = '/login';
          throw new Error('Authentication failed');
        }
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // Authentication endpoints
  async login(username, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      includeAuth: false,
    });

    if (response.success) {
      this.setToken(response.token);
    }

    return response;
  }

  async register(userData) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
      includeAuth: false,
    });

    if (response.success) {
      this.setToken(response.token);
    }

    return response;
  }

  async getCurrentUser() {
    return await this.request('/auth/me');
  }

  // G85 file endpoints
  async parseG85(content) {
    return await this.request('/g85/parse', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async uploadG85File(file) {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseURL}/g85/upload`;
    const config = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  }

  async validateG85(content) {
    return await this.request('/g85/validate', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async generateG85(mapData) {
    return await this.request('/g85/generate', {
      method: 'POST',
      body: JSON.stringify({ mapData }),
    });
  }

  // Lot management endpoints
  async getLots(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/lots?${queryString}` : '/lots';
    return await this.request(endpoint);
  }

  async getLot(id) {
    return await this.request(`/lots/${id}`);
  }

  async uploadLot(file, description) {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }

    const url = `${this.baseURL}/lots`;
    const config = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Lot upload failed');
    }

    return data;
  }

  async updateLotStatus(lotId, status) {
    return await this.request(`/lots/${lotId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async uploadLotToFtp(lotId) {
    return await this.request(`/lots/${lotId}/upload-ftp`, {
      method: 'POST',
    });
  }

  async deleteLot(lotId) {
    return await this.request(`/lots/${lotId}`, {
      method: 'DELETE',
    });
  }

  // FTP endpoints
  async testFtpConnection() {
    return await this.request('/ftp/test');
  }

  async getFtpFiles(path = '/') {
    return await this.request(`/ftp/files?path=${encodeURIComponent(path)}`);
  }

  async getFtpInfo() {
    return await this.request('/ftp/info');
  }

  async getFtpHistory(lotId) {
    return await this.request(`/ftp/history/${lotId}`);
  }

  // Download file from backend
  async downloadFile(filename) {
    const url = `${this.baseURL}/g85/download/${filename}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return response.blob();
  }
}

// Create and export a singleton instance
const apiService = new ApiService();
export default apiService; 