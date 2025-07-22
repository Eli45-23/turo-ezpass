import Foundation
import Combine

class CognitoService: ObservableObject {
    static let shared = CognitoService()
    
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    
    private var cancellables = Set<AnyCancellable>()
    
    private init() {
        checkAuthenticationStatus()
    }
    
    // MARK: - Authentication Methods
    
    func signIn(email: String, password: String) -> AnyPublisher<User, Error> {
        return Future { promise in
            // Simulate AWS Cognito authentication
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                // For demo purposes, accept any email/password combination
                // In real implementation, this would use AWS Cognito SDK
                if email.isValidEmail && !password.isEmpty {
                    let user = User(
                        id: UUID().uuidString,
                        email: email,
                        name: self.extractNameFromEmail(email),
                        turoHostId: "host_\(UUID().uuidString.prefix(8))"
                    )
                    
                    // Store authentication tokens in Keychain (simulated)
                    self.storeTokens(
                        accessToken: "access_token_\(UUID().uuidString)",
                        refreshToken: "refresh_token_\(UUID().uuidString)",
                        idToken: "id_token_\(UUID().uuidString)"
                    )
                    
                    // Update authentication state
                    self.isAuthenticated = true
                    self.currentUser = user
                    
                    // Store user info in UserDefaults
                    UserDefaults.standard.set(true, forKey: Constants.UserDefaultsKeys.isLoggedIn)
                    UserDefaults.standard.set(email, forKey: Constants.UserDefaultsKeys.userEmail)
                    
                    promise(.success(user))
                } else {
                    promise(.failure(AuthenticationError.invalidCredentials))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    func signOut() -> AnyPublisher<Void, Error> {
        return Future { promise in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                // Clear tokens from Keychain
                self.clearTokens()
                
                // Clear UserDefaults
                UserDefaults.standard.removeObject(forKey: Constants.UserDefaultsKeys.isLoggedIn)
                UserDefaults.standard.removeObject(forKey: Constants.UserDefaultsKeys.userEmail)
                
                // Update authentication state
                self.isAuthenticated = false
                self.currentUser = nil
                
                promise(.success(()))
            }
        }
        .eraseToAnyPublisher()
    }
    
    func checkAuthenticationStatus() {
        // Check if user is logged in from UserDefaults
        let isLoggedIn = UserDefaults.standard.bool(forKey: Constants.UserDefaultsKeys.isLoggedIn)
        
        if isLoggedIn {
            // In real implementation, validate tokens with AWS Cognito
            if let accessToken = getStoredToken(for: Constants.KeychainKeys.accessToken),
               !accessToken.isEmpty {
                
                // Simulate token validation
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    let email = UserDefaults.standard.string(forKey: Constants.UserDefaultsKeys.userEmail) ?? ""
                    
                    self.currentUser = User(
                        id: UUID().uuidString,
                        email: email,
                        name: self.extractNameFromEmail(email),
                        turoHostId: "host_\(UUID().uuidString.prefix(8))"
                    )
                    
                    self.isAuthenticated = true
                }
            }
        }
    }
    
    func refreshTokens() -> AnyPublisher<Void, Error> {
        return Future { promise in
            guard let refreshToken = self.getStoredToken(for: Constants.KeychainKeys.refreshToken) else {
                promise(.failure(AuthenticationError.noRefreshToken))
                return
            }
            
            // Simulate token refresh with AWS Cognito
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                // Store new tokens
                self.storeTokens(
                    accessToken: "new_access_token_\(UUID().uuidString)",
                    refreshToken: refreshToken, // Keep the same refresh token
                    idToken: "new_id_token_\(UUID().uuidString)"
                )
                
                promise(.success(()))
            }
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Token Management
    
    private func storeTokens(accessToken: String, refreshToken: String, idToken: String) {
        // In real implementation, store in iOS Keychain for security
        UserDefaults.standard.set(accessToken, forKey: Constants.KeychainKeys.accessToken)
        UserDefaults.standard.set(refreshToken, forKey: Constants.KeychainKeys.refreshToken)
        UserDefaults.standard.set(idToken, forKey: Constants.KeychainKeys.idToken)
    }
    
    private func getStoredToken(for key: String) -> String? {
        return UserDefaults.standard.string(forKey: key)
    }
    
    private func clearTokens() {
        UserDefaults.standard.removeObject(forKey: Constants.KeychainKeys.accessToken)
        UserDefaults.standard.removeObject(forKey: Constants.KeychainKeys.refreshToken)
        UserDefaults.standard.removeObject(forKey: Constants.KeychainKeys.idToken)
    }
    
    func getAccessToken() -> String? {
        return getStoredToken(for: Constants.KeychainKeys.accessToken)
    }
    
    // MARK: - Helper Methods
    
    private func extractNameFromEmail(_ email: String) -> String {
        let username = email.components(separatedBy: "@").first ?? ""
        return username.replacingOccurrences(of: ".", with: " ").capitalized
    }
}

// MARK: - Authentication Error
enum AuthenticationError: LocalizedError {
    case invalidCredentials
    case networkError
    case noRefreshToken
    case tokenExpired
    case userNotFound
    
    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password. Please try again."
        case .networkError:
            return "Network connection failed. Please check your internet connection."
        case .noRefreshToken:
            return "No refresh token available. Please log in again."
        case .tokenExpired:
            return "Your session has expired. Please log in again."
        case .userNotFound:
            return "User account not found. Please check your credentials."
        }
    }
}