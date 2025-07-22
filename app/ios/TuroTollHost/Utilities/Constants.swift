import Foundation

struct Constants {
    // MARK: - API Configuration
    struct API {
        static let baseURL = "https://api.example.com"
        static let jobsEndpoint = "/jobs"
        static let submitEndpoint = "/submit"
        static let timeout: TimeInterval = 30.0
    }
    
    // MARK: - AWS Cognito Configuration
    struct Cognito {
        static let userPoolId = "us-east-1_XXXXXXXXX"  // Replace with actual User Pool ID
        static let clientId = "XXXXXXXXXXXXXXXXXXXXXXXXXX"  // Replace with actual Client ID
        static let region = "us-east-1"
    }
    
    // MARK: - AWS S3 Configuration
    struct S3 {
        static let bucketName = "turo-ezpass-storage"  // Replace with actual bucket name
        static let region = "us-east-1"
    }
    
    // MARK: - UI Constants
    struct UI {
        static let cornerRadius: CGFloat = 12.0
        static let standardPadding: CGFloat = 16.0
        static let smallPadding: CGFloat = 8.0
        static let buttonHeight: CGFloat = 50.0
    }
    
    // MARK: - Colors
    struct Colors {
        static let primaryBlue = "007AFF"
        static let secondaryGray = "8E8E93"
        static let successGreen = "34C759"
        static let errorRed = "FF3B30"
        static let warningOrange = "FF9500"
    }
    
    // MARK: - UserDefaults Keys
    struct UserDefaultsKeys {
        static let isLoggedIn = "isLoggedIn"
        static let userEmail = "userEmail"
        static let lastRefreshDate = "lastRefreshDate"
    }
    
    // MARK: - Keychain Keys
    struct KeychainKeys {
        static let accessToken = "accessToken"
        static let refreshToken = "refreshToken"
        static let idToken = "idToken"
    }
    
    // MARK: - Job Status
    enum JobStatus: String, CaseIterable {
        case pending = "pending"
        case processing = "processing"
        case completed = "completed"
        case failed = "failed"
        case retry = "retry"
        
        var displayName: String {
            switch self {
            case .pending: return "Pending"
            case .processing: return "Processing"
            case .completed: return "Completed"
            case .failed: return "Failed"
            case .retry: return "Retry"
            }
        }
    }
    
    // MARK: - Error Messages
    struct ErrorMessages {
        static let genericError = "Something went wrong. Please try again."
        static let networkError = "Network connection failed. Please check your internet connection."
        static let authenticationError = "Authentication failed. Please log in again."
        static let validationError = "Please fill in all required fields."
        static let serverError = "Server error. Please try again later."
    }
}