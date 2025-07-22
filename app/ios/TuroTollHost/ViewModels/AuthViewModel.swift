import SwiftUI
import Combine

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showError = false
    
    // Login form properties
    @Published var email = ""
    @Published var password = ""
    @Published var isLoginValid = false
    
    private let cognitoService = CognitoService.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupBindings()
        checkAuthenticationStatus()
    }
    
    private func setupBindings() {
        // Bind authentication state from CognitoService
        cognitoService.$isAuthenticated
            .assign(to: &$isAuthenticated)
        
        cognitoService.$currentUser
            .assign(to: &$currentUser)
        
        // Validate login form
        Publishers.CombineLatest($email, $password)
            .map { email, password in
                !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                email.isValidEmail &&
                !password.isEmpty &&
                password.count >= 6
            }
            .assign(to: &$isLoginValid)
    }
    
    // MARK: - Authentication Methods
    
    func signIn() {
        guard isLoginValid else {
            showErrorMessage("Please enter a valid email and password.")
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        
        cognitoService.signIn(email: trimmedEmail, password: password)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    
                    if case .failure(let error) = completion {
                        self?.showErrorMessage(error.localizedDescription)
                    }
                },
                receiveValue: { [weak self] user in
                    self?.isLoading = false
                    self?.clearForm()
                    // Authentication state is handled by CognitoService
                }
            )
            .store(in: &cancellables)
    }
    
    func signOut() {
        isLoading = true
        errorMessage = nil
        
        cognitoService.signOut()
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    
                    if case .failure(let error) = completion {
                        self?.showErrorMessage(error.localizedDescription)
                    }
                },
                receiveValue: { [weak self] _ in
                    self?.isLoading = false
                    self?.clearForm()
                    // Authentication state is handled by CognitoService
                }
            )
            .store(in: &cancellables)
    }
    
    func checkAuthenticationStatus() {
        cognitoService.checkAuthenticationStatus()
    }
    
    func refreshTokens() {
        cognitoService.refreshTokens()
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        // If token refresh fails, sign out user
                        self?.signOut()
                        self?.showErrorMessage("Session expired. Please log in again.")
                    }
                },
                receiveValue: { _ in
                    // Tokens refreshed successfully
                }
            )
            .store(in: &cancellables)
    }
    
    // MARK: - Form Management
    
    func clearForm() {
        email = ""
        password = ""
        errorMessage = nil
        showError = false
    }
    
    private func showErrorMessage(_ message: String) {
        errorMessage = message
        showError = true
    }
    
    func dismissError() {
        showError = false
        errorMessage = nil
    }
    
    // MARK: - Validation Helpers
    
    var emailValidationMessage: String? {
        if !email.isEmpty && !email.isValidEmail {
            return "Please enter a valid email address"
        }
        return nil
    }
    
    var passwordValidationMessage: String? {
        if !password.isEmpty && password.count < 6 {
            return "Password must be at least 6 characters"
        }
        return nil
    }
    
    var canSubmit: Bool {
        return isLoginValid && !isLoading
    }
    
    // MARK: - Demo Helpers
    
    func fillDemoCredentials() {
        email = "demo@turoezpass.com"
        password = "DemoPass123!"
    }
    
    func handleDemoLogin() {
        fillDemoCredentials()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.signIn()
        }
    }
}

// MARK: - Form Validation States
extension AuthViewModel {
    enum ValidationState {
        case valid
        case invalid(String)
        case empty
        
        var isValid: Bool {
            if case .valid = self { return true }
            return false
        }
        
        var errorMessage: String? {
            if case .invalid(let message) = self { return message }
            return nil
        }
    }
    
    var emailValidationState: ValidationState {
        if email.isEmpty {
            return .empty
        } else if email.isValidEmail {
            return .valid
        } else {
            return .invalid("Invalid email format")
        }
    }
    
    var passwordValidationState: ValidationState {
        if password.isEmpty {
            return .empty
        } else if password.count >= 6 {
            return .valid
        } else {
            return .invalid("Password too short")
        }
    }
}