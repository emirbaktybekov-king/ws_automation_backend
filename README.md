# WhatsApp Automation Backend

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/whatsapp_automation"

# JWT Secrets (generate these securely in production)
JWT_ACCESS_SECRET="your-super-secret-access-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"

# Server
PORT=8000

# CORS Origins (comma-separated)
CORS_ORIGINS="http://localhost:3001,http://127.0.0.1:3001"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user info (protected)

### Request/Response Examples

#### Register

```json
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "username": "username"
}

Response:
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "username"
  },
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here"
}
```

#### Login

```json
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "username"
  },
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here"
}
```

#### Refresh Token

```json
POST /api/v1/auth/refresh
{
  "refreshToken": "refresh_token_here"
}

Response:
{
  "accessToken": "new_jwt_token_here",
  "refreshToken": "new_refresh_token_here"
}
```

## Security Features

- Password hashing with bcryptjs
- JWT access tokens (5 hours expiry)
- JWT refresh tokens (30 days expiry)
- Protected routes with middleware
- CORS configuration for frontend
- Input validation and error handling
