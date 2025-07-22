import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var isPasswordVisible = false
    
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    // Header Section
                    headerSection(geometry: geometry)
                    
                    // Login Form Section
                    loginFormSection()
                    
                    // Footer Section
                    footerSection()
                    
                    Spacer(minLength: Constants.UI.standardPadding)
                }
                .frame(minHeight: geometry.size.height)
            }
        }
        .background(
            LinearGradient(
                colors: [Color.primaryBlue.opacity(0.1), Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .navigationBarHidden(true)
        .onTapGesture {
            hideKeyboard()
        }
        .alert("Login Error", isPresented: $authViewModel.showError) {
            Button("OK") {
                authViewModel.dismissError()
            }
        } message: {
            Text(authViewModel.errorMessage ?? "An error occurred")
        }
    }
    
    private func headerSection(geometry: GeometryProxy) -> some View {
        VStack(spacing: Constants.UI.standardPadding) {
            Spacer()
                .frame(height: geometry.safeAreaInsets.top + 40)
            
            // App Logo/Icon
            Image(systemName: "car.fill")
                .font(.system(size: 60, weight: .light))
                .foregroundColor(.primaryBlue)
                .padding(.bottom, Constants.UI.smallPadding)
            
            // App Title
            Text("Turo Toll Host")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.primary)
            
            // Subtitle
            Text("Automate your toll submissions")
                .font(.subheadline)
                .foregroundColor(.secondaryGray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Constants.UI.standardPadding)
        }
        .padding(.bottom, 40)
    }
    
    private func loginFormSection() -> some View {
        VStack(spacing: Constants.UI.standardPadding) {
            // Email Field
            VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                HStack {
                    Image(systemName: "envelope.fill")
                        .foregroundColor(.primaryBlue)
                        .frame(width: 20)
                    
                    TextField("Email", text: $authViewModel.email)
                        .textFieldStyle(PlainTextFieldStyle())
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .textContentType(.emailAddress)
                        .disabled(authViewModel.isLoading)
                }
                .padding(Constants.UI.standardPadding)
                .background(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .fill(Color(.systemBackground))
                        .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .stroke(borderColor(for: authViewModel.emailValidationState), lineWidth: 1)
                )
                
                if let message = authViewModel.emailValidationMessage {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.errorRed)
                        .padding(.leading, Constants.UI.smallPadding)
                }
            }
            
            // Password Field
            VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                HStack {
                    Image(systemName: "lock.fill")
                        .foregroundColor(.primaryBlue)
                        .frame(width: 20)
                    
                    Group {
                        if isPasswordVisible {
                            TextField("Password", text: $authViewModel.password)
                        } else {
                            SecureField("Password", text: $authViewModel.password)
                        }
                    }
                    .textFieldStyle(PlainTextFieldStyle())
                    .textContentType(.password)
                    .disabled(authViewModel.isLoading)
                    
                    Button {
                        isPasswordVisible.toggle()
                    } label: {
                        Image(systemName: isPasswordVisible ? "eye.slash.fill" : "eye.fill")
                            .foregroundColor(.secondaryGray)
                    }
                    .disabled(authViewModel.isLoading)
                }
                .padding(Constants.UI.standardPadding)
                .background(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .fill(Color(.systemBackground))
                        .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .stroke(borderColor(for: authViewModel.passwordValidationState), lineWidth: 1)
                )
                
                if let message = authViewModel.passwordValidationMessage {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.errorRed)
                        .padding(.leading, Constants.UI.smallPadding)
                }
            }
            
            // Login Button
            Button {
                authViewModel.signIn()
            } label: {
                HStack {
                    if authViewModel.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(0.8)
                    }
                    
                    Text(authViewModel.isLoading ? "Signing In..." : "Sign In")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, minHeight: Constants.UI.buttonHeight)
                .background(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .fill(
                            authViewModel.canSubmit 
                            ? Color.primaryBlue 
                            : Color.secondaryGray
                        )
                )
                .foregroundColor(.white)
            }
            .disabled(!authViewModel.canSubmit)
            .padding(.top, Constants.UI.smallPadding)
        }
        .padding(.horizontal, Constants.UI.standardPadding * 1.5)
    }
    
    private func footerSection() -> some View {
        VStack(spacing: Constants.UI.standardPadding) {
            // Demo Login Button
            Button {
                authViewModel.handleDemoLogin()
            } label: {
                HStack {
                    Image(systemName: "play.circle.fill")
                    Text("Try Demo Login")
                }
                .font(.subheadline)
                .foregroundColor(.primaryBlue)
            }
            .disabled(authViewModel.isLoading)
            .padding(.top, Constants.UI.standardPadding)
            
            // Help Text
            VStack(spacing: Constants.UI.smallPadding) {
                Text("Need help?")
                    .font(.footnote)
                    .foregroundColor(.secondaryGray)
                
                Button("Contact Support") {
                    // In a real app, this would open support contact
                }
                .font(.footnote)
                .foregroundColor(.primaryBlue)
            }
            .padding(.top, Constants.UI.standardPadding)
            
            // Version Info
            Text("Version \(Bundle.main.appVersion) (\(Bundle.main.buildNumber))")
                .font(.caption2)
                .foregroundColor(.secondaryGray)
                .padding(.top, Constants.UI.standardPadding)
        }
    }
    
    private func borderColor(for state: AuthViewModel.ValidationState) -> Color {
        switch state {
        case .valid:
            return .successGreen
        case .invalid:
            return .errorRed
        case .empty:
            return .clear
        }
    }
}

#Preview {
    NavigationView {
        LoginView()
            .environmentObject(AuthViewModel())
    }
}