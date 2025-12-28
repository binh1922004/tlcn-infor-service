# 🏆 TLCN Information Service - Online Judge Backend

Backend service cho hệ thống Online Judge, được xây dựng bằng Node.js và Express, sử dụng Docker để triển khai. 

## 📋 Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Chạy ứng dụng](#chạy-ứng-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [API Documentation](#api-documentation)
- [Đóng góp](#đóng-góp)

## 🎯 Giới thiệu

**BNOJ - Information Service** là backend service cho hệ thống Online Judge, cung cấp các API để quản lý bài tập lập trình, xử lý submission, quản lý người dùng, và xử lý kết quả chấm bài thời gian thực.

## ✨ Tính năng

- 🔐 **Xác thực & Phân quyền**: JWT authentication, Google OAuth 2.0
- 👥 **Quản lý người dùng**: Đăng ký, đăng nhập, quản lý profile
- 📝 **Quản lý bài tập**:  CRUD operations cho problems và test cases
- 📤 **Xử lý submission**: Gửi và theo dõi submission thông qua Kafka
- 💬 **Real-time communication**: WebSocket với Socket.IO và Redis adapter
- 📧 **Email service**: Gửi email thông báo với Nodemailer
- ☁️ **Cloud Storage**: Tích hợp AWS S3 và Cloudinary
- 📊 **Cron Jobs**: Tự động hóa các tác vụ định kỳ
- ⚡ **Caching**: Redis cho performance optimization

## 🛠 Công nghệ sử dụng

### Core Technologies
- **Runtime**: Node.js 22
- **Framework**: Express. js 5.x
- **Database**: MongoDB (Mongoose ODM)
- **Cache**: Redis
- **Message Queue**: Apache Kafka

### Key Libraries
- **Authentication**:  Passport.js, JWT, bcrypt
- **File Processing**: Multer, JSZip, XLSX, Yauzl
- **Real-time**: Socket.IO with Redis Adapter
- **Cloud Services**: AWS SDK (S3), Cloudinary
- **Task Scheduling**: node-cron
- **Email**:  Nodemailer
- **Security**: sanitize-html, CORS

## 💻 Yêu cầu hệ thống

- Docker >= 20.10
- Docker Compose >= 2.0
- MongoDB instance (local hoặc cloud)
- Redis (được cung cấp qua docker-compose)
- Kafka broker (optional, để xử lý submission)

## 📦 Cài đặt

### 1. Clone repository

```bash
git clone https://github.com/binh1922004/tlcn-infor-service.git
cd tlcn-infor-service
```

### 2. Tạo file môi trường

Sao chép file `.env.example` thành `.env`:

```bash
cp .env.example .env
```

### 3. Cấu hình các biến môi trường

Chỉnh sửa file `.env` với các thông tin của bạn:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/online-judge

# Server Configuration
PORT=8888

# JWT Configuration
ACCESS_TOKEN_KEY=your_access_token_secret_key
ACCESS_TOKEN_LIFE=1h
REFRESH_TOKEN_KEY=your_refresh_token_secret_key
REFRESH_TOKEN_LIFE=14d

# Email Configuration (SMTP)
EMAIL=your-email@gmail.com
PASSWORD_EMAIL=your-app-password

# Google OAuth Configuration
CLIENT_ID=your-google-client-id
CLIENT_SECRET_ID=your-google-client-secret
CALLBACK_URL=http://localhost:8888/api/auth/google/callback

# Frontend URLs
FE_LOCALHOST_URL=http://localhost:5173
FE_URL=http://localhost:5173

# AWS S3 Configuration
AWS_ACCESS_KEY=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
BUCKET_NAME=your-s3-bucket-name
BUCKET_REGION=your-s3-region

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Kafka Configuration
KAFKA_BROKER=localhost:9092
KAFKA_SUBMISSION_TOPIC=submission-topic

# Redis Configuration (auto-configured trong docker-compose)
REDIS_HOST=redis: 6379
```

## 🚀 Chạy ứng dụng

### Sử dụng Docker Compose (Khuyến nghị)

```bash
# Build và chạy tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f

# Dừng services
docker-compose down

# Dừng và xóa volumes
docker-compose down -v
```

Services sẽ chạy trên: 
- **API Server**: http://localhost:PORT (theo `.env`)
- **Redis**: localhost:6380 (mapped từ container port 6379)

### Chạy local (Development)

```bash
# Cài đặt dependencies
npm install

# Chạy development mode với nodemon
npm run dev

# Chạy production mode
npm start
```

## 📁 Cấu trúc thư mục

```
tlcn-infor-service/
├── config/              # Configuration files
├── src/
│   ├── app. js          # Express app setup
│   ├── server. js       # Server entry point
│   ├── controllers/    # Request handlers
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── middlewares/    # Custom middlewares
│   ├── service/        # Business logic
│   ├── helpers/        # Helper functions
│   ├── utils/          # Utility functions
│   ├── socket/         # Socket. IO handlers
│   ├── jobs/           # Cron jobs
│   ├── method/         # Custom methods
│   └── migration/      # Database migrations
├── . env.example        # Environment variables template
├── .gitignore         # Git ignore rules
├── Dockerfile         # Docker image definition
├── docker-compose.yml # Docker compose configuration
├── package.json       # Project dependencies
└── README.md         # Project documentation
```

## 📚 API Documentation

### Authentication Endpoints
```
POST   /api/auth/register          # Đăng ký tài khoản
POST   /api/auth/login             # Đăng nhập
POST   /api/auth/refresh-token     # Refresh access token
GET    /api/auth/google            # Google OAuth login
GET    /api/auth/google/callback   # Google OAuth callback
POST   /api/auth/logout            # Đăng xuất
```

### User Endpoints
```
GET    /api/users/profile          # Lấy thông tin user
PUT    /api/users/profile          # Cập nhật profile
GET    /api/users/: id              # Lấy thông tin user theo ID
```

### Problem Endpoints
```
GET    /api/problems               # Lấy danh sách problems
GET    /api/problems/:id           # Lấy chi tiết problem
POST   /api/problems               # Tạo problem mới
PUT    /api/problems/:id           # Cập nhật problem
DELETE /api/problems/:id           # Xóa problem
```

### Submission Endpoints
```
POST   /api/submissions            # Gửi submission
GET    /api/submissions/:id        # Lấy kết quả submission
GET    /api/submissions/user/: userId  # Lấy submissions của user
```

_(Chi tiết đầy đủ API documentation sẽ được cập nhật sau)_

## 🔧 Docker Configuration

### Dockerfile

Service sử dụng Node.js 22 Alpine image để tối ưu kích thước: 

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

### Docker Compose Services

- **redis**: Redis cache server với health check
  - Port: 6380: 6379
  - Persistent storage với volume `redis_data`

- **info**:  Main application service
  - Depends on Redis
  - Environment variables từ `.env`
  - Auto-restart enabled

## 🧪 Testing

```bash
# Chạy tests (sẽ cập nhật sau)
npm test
```

## 🔒 Security

- JWT-based authentication
- Password hashing với bcrypt
- HTML sanitization để prevent XSS
- CORS configuration
- Environment variables cho sensitive data

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng: 

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

## 📝 License

Dự án này chưa có license được chỉ định. 

## 👤 Tác giả

**binh1922004**
- GitHub: [@binh1922004](https://github.com/binh1922004)

**nghiatran**
- Github: [@TranTrongNghia1609](https://github.com/TranTrongNghia1609)

## 📞 Liên hệ

Nếu có bất kỳ câu hỏi nào, vui lòng tạo issue trên GitHub repository.

---

⭐ Nếu project này hữu ích, hãy star repository để ủng hộ nhé! 
