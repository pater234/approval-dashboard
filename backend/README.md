# Approval Dashboard Backend

A Node.js backend for the G85 file approval dashboard with SQL Server integration and FTP file upload capabilities.

## Features

- **G85 File Processing**: Parse, validate, and generate G85 XML files
- **SQL Server Integration**: Store lot data, user information, and file metadata
- **FTP File Upload**: Automatically upload approved files to FTP server
- **User Authentication**: JWT-based authentication with role-based access control
- **File Management**: Upload, download, and manage G85 files
- **Approval Workflow**: Status-based approval system for lots
- **RESTful API**: Comprehensive API endpoints for all operations

## Prerequisites

- Node.js (v14 or higher)
- SQL Server (2016 or higher)
- FTP Server access
- npm or pnpm package manager

## Installation

1. **Clone the repository and navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp env.example .env
   ```

4. **Configure environment variables in `.env`:**
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Database Configuration (SQL Server)
   DB_SERVER=localhost
   DB_DATABASE=approval_dashboard
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_PORT=1433
   DB_OPTIONS_ENCRYPT=true
   DB_OPTIONS_TRUST_SERVER_CERTIFICATE=true

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=24h

   # FTP Configuration
   FTP_HOST=your_ftp_host
   FTP_PORT=21
   FTP_USER=your_ftp_username
   FTP_PASSWORD=your_ftp_password
   FTP_SECURE=false

   # File Upload Configuration
   UPLOAD_DIR=./uploads
   MAX_FILE_SIZE=10485760

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3000
   ```

5. **Create SQL Server database:**
   ```sql
   CREATE DATABASE approval_dashboard;
   ```

6. **Start the server:**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## Database Schema

The backend automatically creates the following tables:

### Users Table
- `id` (Primary Key)
- `username` (Unique)
- `email`
- `password` (Hashed)
- `role` (user/admin)
- `created_at`
- `updated_at`

### Lots Table
- `id` (Primary Key)
- `filename`
- `original_filename`
- `uploaded_by` (Foreign Key to users)
- `upload_date`
- `status` (pending/approved/rejected)
- `description`
- `file_path`
- `file_size`
- `substrate_number`
- `substrate_type`
- `substrate_id`
- `lot_id`
- `product_id`
- `wafer_size`
- `rows_count`
- `columns_count`
- `total_dies`
- `defect_count`
- `approved_by` (Foreign Key to users)
- `approved_at`
- `ftp_uploaded`
- `ftp_upload_date`

### Dies Table
- `id` (Primary Key)
- `lot_id` (Foreign Key to lots)
- `x_coord`
- `y_coord`
- `bin_code`
- `bin_quality`
- `bin_description`
- `is_defect`
- `defect_type`
- `created_at`

### Bins Table
- `id` (Primary Key)
- `lot_id` (Foreign Key to lots)
- `bin_code`
- `bin_quality`
- `bin_description`
- `bin_count`
- `created_at`

### FTP Logs Table
- `id` (Primary Key)
- `lot_id` (Foreign Key to lots)
- `filename`
- `status`
- `error_message`
- `uploaded_at`

## API Endpoints

### Authentication

#### POST `/api/auth/register`
Register a new user.

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "user"
}
```

#### POST `/api/auth/login`
Login user.

**Request Body:**
```json
{
  "username": "john_doe",
  "password": "password123"
}
```

#### GET `/api/auth/me`
Get current user information (requires authentication).

### G85 File Operations

#### POST `/api/g85/parse`
Parse G85 file content.

**Request Body:**
```json
{
  "content": "<Map>...</Map>"
}
```

#### POST `/api/g85/upload`
Upload and parse G85 file.

**Request:** Multipart form data with file field.

#### POST `/api/g85/generate`
Generate G85 file from map data.

**Request Body:**
```json
{
  "mapData": {
    "header": {...},
    "dies": {...},
    "bins": [...]
  }
}
```

#### POST `/api/g85/statistics`
Get statistics from G85 content.

#### POST `/api/g85/validate`
Validate G85 file content.

### Lot Management

#### GET `/api/lots`
Get all lots with pagination and filtering.

**Query Parameters:**
- `status`: Filter by status (pending/approved/rejected/all)
- `page`: Page number
- `limit`: Items per page
- `search`: Search in filename, lot_id, or product_id

#### GET `/api/lots/:id`
Get single lot with detailed information.

#### POST `/api/lots`
Upload new lot (requires file upload).

**Request:** Multipart form data with file and description fields.

#### PUT `/api/lots/:id/status`
Update lot status (admin only).

**Request Body:**
```json
{
  "status": "approved"
}
```

#### POST `/api/lots/:id/upload-ftp`
Upload approved lot to FTP server (admin only).

#### DELETE `/api/lots/:id`
Delete lot (admin only).

### FTP Operations

#### GET `/api/ftp/test`
Test FTP connection (admin only).

#### GET `/api/ftp/files`
List files on FTP server (admin only).

#### GET `/api/ftp/download/:filename`
Download file from FTP (admin only).

#### DELETE `/api/ftp/delete/:filename`
Delete file from FTP (admin only).

#### GET `/api/ftp/history/:lotId`
Get FTP upload history for a lot.

#### GET `/api/ftp/info`
Get FTP server information (admin only).

## Usage Examples

### Upload and Process G85 File

```javascript
// 1. Login to get token
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'user',
    password: 'password'
  })
});

const { token } = await loginResponse.json();

// 2. Upload G85 file
const formData = new FormData();
formData.append('file', g85File);
formData.append('description', 'Test lot upload');

const uploadResponse = await fetch('/api/lots', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { data: lot } = await uploadResponse.json();
```

### Approve and Upload to FTP

```javascript
// 1. Approve lot (admin only)
await fetch(`/api/lots/${lotId}/status`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({ status: 'approved' })
});

// 2. Upload to FTP
await fetch(`/api/lots/${lotId}/upload-ftp`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
```

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Different permissions for users and admins
- **Input Validation**: Request validation using express-validator
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Protection**: Configurable CORS settings
- **Helmet**: Security headers
- **File Upload Validation**: File type and size validation

## Development

### Running in Development Mode

```bash
npm run dev
```

This starts the server with nodemon for automatic restarts.

### Testing

```bash
npm test
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment | development |
| `DB_SERVER` | SQL Server host | localhost |
| `DB_DATABASE` | Database name | approval_dashboard |
| `DB_USER` | Database username | - |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT secret key | - |
| `FTP_HOST` | FTP server host | - |
| `FTP_USER` | FTP username | - |
| `FTP_PASSWORD` | FTP password | - |
| `UPLOAD_DIR` | File upload directory | ./uploads |
| `MAX_FILE_SIZE` | Maximum file size (bytes) | 10485760 |

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify SQL Server is running
   - Check database credentials in `.env`
   - Ensure database exists

2. **FTP Connection Error**
   - Verify FTP server is accessible
   - Check FTP credentials in `.env`
   - Test FTP connection manually

3. **File Upload Issues**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure file is valid G85 XML format

### Logs

The server logs important events and errors to the console. In production, consider using a logging service.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License 