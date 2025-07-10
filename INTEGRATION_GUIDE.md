# Backend-Frontend Integration Guide

This guide explains how the Node.js backend integrates with your React frontend for the G85 file approval dashboard.

## 🔗 **Integration Overview**

The integration follows a **RESTful API pattern** where:
- **Frontend (React)** handles UI, user interactions, and state management
- **Backend (Node.js)** handles data processing, storage, and external services
- **Communication** happens via HTTP requests with JSON responses

## 🏗️ **Architecture Flow**

```
┌─────────────────┐    HTTP Requests    ┌─────────────────┐
│   React App     │ ──────────────────► │  Node.js API    │
│   (Frontend)    │                     │   (Backend)     │
│                 │ ◄────────────────── │                 │
└─────────────────┘    JSON Responses   └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   SQL Server    │
                    │   (Database)    │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   FTP Server    │
                    │  (File Storage) │
                    └─────────────────┘
```

## 🚀 **Key Integration Points**

### **1. Authentication Flow**

**Before (Mock):**
```javascript
// Old mock authentication
const mockUsers = [
  { username: 'user1', password: 'password123', role: 'user' }
];
const user = mockUsers.find(u => u.username === username);
```

**After (Backend Integration):**
```javascript
// New backend authentication
import apiService from './services/api';

const handleLogin = async (username, password) => {
  const response = await apiService.login(username, password);
  if (response.success) {
    setCurrentUser(response.user);
    apiService.setToken(response.token);
  }
};
```

### **2. File Upload Flow**

**Before (Client-side only):**
```javascript
// Old client-side file processing
const reader = new FileReader();
reader.onload = (event) => {
  const content = event.target.result;
  const mapData = parseG85(content);
  // Store in local state only
};
```

**After (Backend processing):**
```javascript
// New backend file processing
const handleFileUpload = async (file, description) => {
  const response = await apiService.uploadLot(file, description);
  if (response.success) {
    // File processed and stored in database
    loadLots(); // Refresh from backend
  }
};
```

### **3. Data Management Flow**

**Before (Local state):**
```javascript
// Old local state management
const [lots, setLots] = useState(mockLots);
setLots([...lots, newLot]);
```

**After (Backend state):**
```javascript
// New backend state management
const [lots, setLots] = useState([]);

const loadLots = async () => {
  const response = await apiService.getLots();
  if (response.success) {
    setLots(response.data);
  }
};
```

## 📡 **API Communication**

### **API Service Layer**

The `src/services/api.js` file provides a clean interface for all backend communication:

```javascript
class ApiService {
  // Authentication
  async login(username, password) { /* ... */ }
  async register(userData) { /* ... */ }
  async getCurrentUser() { /* ... */ }

  // G85 Operations
  async parseG85(content) { /* ... */ }
  async uploadG85File(file) { /* ... */ }
  async validateG85(content) { /* ... */ }

  // Lot Management
  async getLots(params) { /* ... */ }
  async uploadLot(file, description) { /* ... */ }
  async updateLotStatus(lotId, status) { /* ... */ }
  async uploadLotToFtp(lotId) { /* ... */ }
}
```

### **Request/Response Format**

**Standard Response Format:**
```javascript
// Success Response
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation completed successfully"
}

// Error Response
{
  "success": false,
  "error": "Error message"
}
```

## 🔄 **Data Flow Examples**

### **1. User Login Process**

```javascript
// 1. User enters credentials
const credentials = { username: 'admin', password: 'admin123' };

// 2. Frontend sends login request
const response = await apiService.login(credentials.username, credentials.password);

// 3. Backend validates credentials
// - Checks database for user
// - Verifies password hash
// - Generates JWT token

// 4. Frontend receives response
if (response.success) {
  setCurrentUser(response.user);
  apiService.setToken(response.token);
  loadLots(); // Load user's lots
}
```

### **2. G85 File Upload Process**

```javascript
// 1. User selects file
const file = event.target.files[0]; // G85 XML file

// 2. Frontend uploads to backend
const response = await apiService.uploadLot(file, description);

// 3. Backend processes file
// - Validates G85 format
// - Parses XML content
// - Extracts die data and statistics
// - Stores in SQL Server database
// - Returns processed data

// 4. Frontend updates UI
if (response.success) {
  setAlert({ type: 'success', message: 'File uploaded successfully!' });
  loadLots(); // Refresh lot list
}
```

### **3. Lot Approval Process**

```javascript
// 1. Admin clicks approve button
const handleApproval = async (lotId, 'approved') => {
  // 2. Frontend sends approval request
  const response = await apiService.updateLotStatus(lotId, 'approved');
  
  // 3. Backend updates database
  // - Updates lot status
  // - Records approval timestamp
  // - Logs approval action
  
  // 4. Frontend updates UI
  if (response.success) {
    setLots(lots.map(lot => 
      lot.id === lotId ? { ...lot, status: 'approved' } : lot
    ));
  }
};
```

### **4. FTP Upload Process**

```javascript
// 1. Admin clicks upload to FTP
const handleFtpUpload = async (lotId) => {
  // 2. Frontend requests FTP upload
  const response = await apiService.uploadLotToFtp(lotId);
  
  // 3. Backend processes upload
  // - Retrieves approved lot file
  // - Connects to FTP server
  // - Uploads file with standardized naming
  // - Logs upload status
  
  // 4. Frontend shows result
  if (response.success) {
    setAlert({ type: 'success', message: 'File uploaded to FTP!' });
  }
};
```

## 🔧 **Configuration**

### **Environment Variables**

**Frontend (.env):**
```env
REACT_APP_API_URL=http://localhost:5000/api
```

**Backend (.env):**
```env
PORT=5000
DB_SERVER=localhost
DB_DATABASE=approval_dashboard
FTP_HOST=your_ftp_host
JWT_SECRET=your_secret_key
```

### **CORS Configuration**

The backend is configured to accept requests from your React app:

```javascript
// backend/server.js
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
```

## 🔐 **Security Features**

### **Authentication**
- **JWT Tokens**: Secure token-based authentication
- **Token Storage**: Tokens stored in localStorage
- **Auto-logout**: Automatic logout on token expiration
- **Protected Routes**: API endpoints require authentication

### **Authorization**
- **Role-based Access**: Different permissions for users vs admins
- **Route Protection**: Admin-only endpoints for sensitive operations
- **Input Validation**: Server-side validation of all inputs

## 📊 **State Management**

### **Frontend State**
```javascript
const [currentUser, setCurrentUser] = useState(null);
const [lots, setLots] = useState([]);
const [loading, setLoading] = useState(false);
const [alert, setAlert] = useState(null);
```

### **Backend State**
- **Database**: Persistent storage in SQL Server
- **File System**: G85 files stored locally
- **FTP Server**: Approved files uploaded remotely

## 🚨 **Error Handling**

### **Frontend Error Handling**
```javascript
try {
  const response = await apiService.uploadLot(file);
  if (response.success) {
    // Handle success
  }
} catch (error) {
  setAlert({ type: 'danger', message: error.message });
}
```

### **Backend Error Handling**
```javascript
// Standardized error responses
res.status(400).json({
  success: false,
  error: 'Validation failed'
});
```

## 🔄 **Real-time Updates**

### **Polling Strategy**
The frontend automatically refreshes data:
- On user login
- After file uploads
- When status filters change
- On approval actions

### **Loading States**
- Loading spinners during API calls
- Disabled buttons during operations
- Progress indicators for file uploads

## 🧪 **Testing the Integration**

### **1. Start Both Servers**
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
npm start
```

### **2. Test Authentication**
```bash
# Use default credentials
Username: admin
Password: admin123
```

### **3. Test File Upload**
1. Login as admin
2. Click "Upload New Lot"
3. Select a G85 file
4. Verify file is processed and stored

### **4. Test Approval Workflow**
1. Upload a file as user
2. Login as admin
3. Approve the lot
4. Upload to FTP (if configured)

## 🔍 **Debugging**

### **Frontend Debugging**
- Check browser console for API errors
- Verify network requests in DevTools
- Check localStorage for token storage

### **Backend Debugging**
- Check server console for errors
- Verify database connections
- Test API endpoints with Postman

### **Common Issues**
1. **CORS Errors**: Ensure backend CORS is configured correctly
2. **Authentication Failures**: Check JWT token validity
3. **File Upload Issues**: Verify file size limits and format
4. **Database Errors**: Check SQL Server connection and credentials

## 📈 **Performance Considerations**

### **Frontend Optimizations**
- Debounced search inputs
- Pagination for large datasets
- Lazy loading of components
- Efficient state updates

### **Backend Optimizations**
- Database connection pooling
- File upload streaming
- Caching for frequently accessed data
- Rate limiting for API endpoints

This integration provides a robust, scalable solution for your G85 file approval dashboard with proper separation of concerns, security, and error handling. 