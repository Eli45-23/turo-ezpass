import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var jobsViewModel = JobsViewModel()
    @State private var showingProfile = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Statistics Header
                statisticsHeader
                
                // Jobs List
                jobsList
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    profileButton
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    refreshButton
                }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environmentObject(authViewModel)
            }
            .refreshable {
                await MainActor.run {
                    jobsViewModel.refreshJobs()
                }
            }
            .searchable(text: $jobsViewModel.searchText, prompt: "Search jobs...")
            .alert("Submission Result", isPresented: $jobsViewModel.showSubmissionResult) {
                Button("OK") {
                    jobsViewModel.dismissSubmissionResult()
                }
            } message: {
                if let result = jobsViewModel.lastSubmissionResult {
                    Text(result.message ?? (result.success ? "Job submitted successfully!" : "Submission failed"))
                }
            }
            .alert("Error", isPresented: $jobsViewModel.showError) {
                Button("OK") {
                    jobsViewModel.dismissError()
                }
            } message: {
                Text(jobsViewModel.errorMessage ?? "An error occurred")
            }
        }
        .onAppear {
            jobsViewModel.loadJobs()
        }
    }
    
    private var statisticsHeader: some View {
        VStack(spacing: Constants.UI.standardPadding) {
            HStack(spacing: Constants.UI.standardPadding) {
                StatCard(
                    title: "Pending",
                    value: "\(jobsViewModel.pendingJobsCount)",
                    color: .warningOrange,
                    icon: "clock.fill"
                )
                
                StatCard(
                    title: "Completed",
                    value: "\(jobsViewModel.completedJobsCount)",
                    color: .successGreen,
                    icon: "checkmark.circle.fill"
                )
                
                StatCard(
                    title: "Failed",
                    value: "\(jobsViewModel.failedJobsCount)",
                    color: .errorRed,
                    icon: "xmark.circle.fill"
                )
            }
            
            // Filter Picker
            filterPicker
        }
        .padding(.horizontal, Constants.UI.standardPadding)
        .padding(.bottom, Constants.UI.smallPadding)
        .background(Color(.systemGroupedBackground))
    }
    
    private var filterPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Constants.UI.smallPadding) {
                ForEach(Constants.JobStatus.allCases, id: \.self) { status in
                    FilterChip(
                        title: status.displayName,
                        isSelected: jobsViewModel.selectedStatus == status,
                        count: countForStatus(status)
                    ) {
                        jobsViewModel.setStatusFilter(status)
                    }
                }
            }
            .padding(.horizontal, Constants.UI.standardPadding)
        }
    }
    
    private var jobsList: some View {
        Group {
            if jobsViewModel.isLoading && jobsViewModel.jobs.isEmpty {
                LoadingView()
            } else if jobsViewModel.isEmpty {
                EmptyStateView(
                    message: jobsViewModel.emptyStateMessage,
                    systemImage: "tray",
                    actionTitle: "Refresh",
                    action: {
                        jobsViewModel.refreshJobs()
                    }
                )
            } else {
                List {
                    ForEach(jobsViewModel.filteredJobs) { job in
                        NavigationLink(destination: JobDetailView(job: job)) {
                            JobRowView(
                                job: job,
                                isSubmitting: jobsViewModel.isSubmitting(job),
                                onSubmit: {
                                    jobsViewModel.submitJob(job)
                                }
                            )
                        }
                        .listRowInsets(EdgeInsets(
                            top: Constants.UI.smallPadding,
                            leading: Constants.UI.standardPadding,
                            bottom: Constants.UI.smallPadding,
                            trailing: Constants.UI.standardPadding
                        ))
                    }
                    
                    if jobsViewModel.hasMoreJobs {
                        HStack {
                            Spacer()
                            ProgressView()
                                .onAppear {
                                    jobsViewModel.loadMoreJobs()
                                }
                            Spacer()
                        }
                        .listRowInsets(EdgeInsets())
                    }
                }
                .listStyle(PlainListStyle())
            }
        }
    }
    
    private var profileButton: some View {
        Button {
            showingProfile = true
        } label: {
            HStack(spacing: Constants.UI.smallPadding) {
                Circle()
                    .fill(Color.primaryBlue)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Text(authViewModel.currentUser?.initials ?? "?")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                    )
            }
        }
    }
    
    private var refreshButton: some View {
        Button {
            jobsViewModel.refreshJobs()
        } label: {
            Image(systemName: "arrow.clockwise")
                .foregroundColor(.primaryBlue)
        }
        .disabled(jobsViewModel.isRefreshing)
    }
    
    private func countForStatus(_ status: Constants.JobStatus) -> Int {
        switch status {
        case .pending:
            return jobsViewModel.pendingJobsCount
        case .completed:
            return jobsViewModel.completedJobsCount
        case .failed, .retry:
            return jobsViewModel.failedJobsCount
        default:
            return jobsViewModel.jobs.filter { $0.jobStatus == status }.count
        }
    }
}

// MARK: - Supporting Views

struct StatCard: View {
    let title: String
    let value: String
    let color: Color
    let icon: String
    
    var body: some View {
        VStack(spacing: Constants.UI.smallPadding) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Spacer()
                Text(value)
                    .font(.title2)
                    .fontWeight(.bold)
            }
            
            HStack {
                Text(title)
                    .font(.caption)
                    .foregroundColor(.secondaryGray)
                Spacer()
            }
        }
        .padding(Constants.UI.standardPadding)
        .background(
            RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
        )
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let count: Int
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                if count > 0 {
                    Text("\(count)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Circle()
                                .fill(isSelected ? Color.white.opacity(0.3) : Color.primaryBlue.opacity(0.2))
                        )
                }
            }
            .foregroundColor(isSelected ? .white : .primaryBlue)
            .padding(.horizontal, Constants.UI.standardPadding)
            .padding(.vertical, Constants.UI.smallPadding)
            .background(
                RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                    .fill(isSelected ? Color.primaryBlue : Color.primaryBlue.opacity(0.1))
            )
        }
    }
}

struct JobRowView: View {
    let job: Job
    let isSubmitting: Bool
    let onSubmit: () -> Void
    
    var body: some View {
        HStack(spacing: Constants.UI.standardPadding) {
            VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                HStack {
                    Text(job.tollLocation)
                        .font(.headline)
                        .lineLimit(1)
                    
                    Spacer()
                    
                    Text(job.formattedTollAmount)
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(.primaryBlue)
                }
                
                HStack {
                    Text(job.formattedTripDates)
                        .font(.subheadline)
                        .foregroundColor(.secondaryGray)
                    
                    Spacer()
                    
                    StatusBadge(status: job.jobStatus)
                }
                
                if job.canRetry || job.jobStatus == .pending {
                    HStack {
                        Spacer()
                        
                        Button {
                            onSubmit()
                        } label: {
                            HStack(spacing: 4) {
                                if isSubmitting {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        .scaleEffect(0.7)
                                } else {
                                    Image(systemName: job.canRetry ? "arrow.clockwise" : "paperplane.fill")
                                        .font(.caption)
                                }
                                
                                Text(isSubmitting ? "Submitting..." : (job.canRetry ? "Retry" : "Submit"))
                                    .font(.caption)
                                    .fontWeight(.semibold)
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, Constants.UI.standardPadding)
                            .padding(.vertical, Constants.UI.smallPadding)
                            .background(
                                RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                                    .fill(job.canRetry ? Color.warningOrange : Color.primaryBlue)
                            )
                        }
                        .disabled(isSubmitting)
                    }
                    .padding(.top, Constants.UI.smallPadding)
                }
            }
        }
        .padding(Constants.UI.standardPadding)
        .background(
            RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 1, x: 0, y: 1)
        )
    }
}

struct StatusBadge: View {
    let status: Constants.JobStatus
    
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(statusColor)
                .frame(width: 6, height: 6)
            
            Text(status.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .foregroundColor(statusColor)
        .padding(.horizontal, Constants.UI.smallPadding)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                .fill(statusColor.opacity(0.1))
        )
    }
    
    private var statusColor: Color {
        switch status {
        case .pending:
            return .warningOrange
        case .processing:
            return .primaryBlue
        case .completed:
            return .successGreen
        case .failed, .retry:
            return .errorRed
        }
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: Constants.UI.standardPadding) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .primaryBlue))
                .scaleEffect(1.2)
            
            Text("Loading jobs...")
                .font(.subheadline)
                .foregroundColor(.secondaryGray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct EmptyStateView: View {
    let message: String
    let systemImage: String
    let actionTitle: String?
    let action: (() -> Void)?
    
    var body: some View {
        VStack(spacing: Constants.UI.standardPadding) {
            Image(systemName: systemImage)
                .font(.system(size: 60))
                .foregroundColor(.secondaryGray.opacity(0.5))
            
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondaryGray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Constants.UI.standardPadding)
            
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primaryBlue)
                        .padding(.horizontal, Constants.UI.standardPadding)
                        .padding(.vertical, Constants.UI.smallPadding)
                        .background(
                            RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                                .stroke(Color.primaryBlue, lineWidth: 1)
                        )
                }
                .padding(.top, Constants.UI.smallPadding)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(Constants.UI.standardPadding)
    }
}

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack(spacing: Constants.UI.standardPadding) {
                // User Avatar
                Circle()
                    .fill(Color.primaryBlue)
                    .frame(width: 80, height: 80)
                    .overlay(
                        Text(authViewModel.currentUser?.initials ?? "?")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                    )
                
                // User Info
                VStack(spacing: Constants.UI.smallPadding) {
                    Text(authViewModel.currentUser?.displayName ?? "Unknown User")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text(authViewModel.currentUser?.email ?? "")
                        .font(.subheadline)
                        .foregroundColor(.secondaryGray)
                }
                
                Spacer()
                
                // Sign Out Button
                Button {
                    authViewModel.signOut()
                    dismiss()
                } label: {
                    HStack {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                        Text("Sign Out")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: Constants.UI.buttonHeight)
                    .background(
                        RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                            .fill(Color.errorRed)
                    )
                    .foregroundColor(.white)
                }
                .padding(.horizontal, Constants.UI.standardPadding)
            }
            .padding(Constants.UI.standardPadding)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
}