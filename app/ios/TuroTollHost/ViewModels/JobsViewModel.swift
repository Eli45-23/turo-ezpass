import SwiftUI
import Combine

@MainActor
class JobsViewModel: ObservableObject {
    @Published var jobs: [Job] = []
    @Published var filteredJobs: [Job] = []
    @Published var isLoading = false
    @Published var isRefreshing = false
    @Published var errorMessage: String?
    @Published var showError = false
    
    // Filter and pagination
    @Published var selectedStatus: Constants.JobStatus = .pending
    @Published var searchText = ""
    @Published var currentPage = 1
    @Published var hasMoreJobs = false
    
    // Job submission
    @Published var submittingJobIds: Set<String> = []
    @Published var lastSubmissionResult: JobSubmissionResponse?
    @Published var showSubmissionResult = false
    
    private let networkService = NetworkService.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupBindings()
        loadJobs()
    }
    
    private func setupBindings() {
        // Filter jobs when search text or selected status changes
        Publishers.CombineLatest($jobs, $searchText)
            .combineLatest($selectedStatus)
            .map { (jobsAndSearch, status) in
                let (jobs, searchText) = jobsAndSearch
                let statusFiltered = jobs.filter { job in
                    status == .pending || job.jobStatus == status
                }
                
                if searchText.isEmpty {
                    return statusFiltered
                } else {
                    return statusFiltered.filter { job in
                        job.tollLocation.localizedCaseInsensitiveContains(searchText) ||
                        job.turoTripId.localizedCaseInsensitiveContains(searchText) ||
                        job.formattedTollAmount.localizedCaseInsensitiveContains(searchText)
                    }
                }
            }
            .assign(to: &$filteredJobs)
    }
    
    // MARK: - Data Loading
    
    func loadJobs(refresh: Bool = false) {
        if refresh {
            isRefreshing = true
            currentPage = 1
        } else if !jobs.isEmpty {
            return // Prevent multiple initial loads
        } else {
            isLoading = true
        }
        
        errorMessage = nil
        
        let statusFilter = selectedStatus == .pending ? nil : selectedStatus.rawValue
        
        networkService.fetchJobs(status: statusFilter, page: currentPage)
            .sink(
                receiveCompletion: { [weak self] completion in
                    DispatchQueue.main.async {
                        self?.isLoading = false
                        self?.isRefreshing = false
                        
                        if case .failure(let error) = completion {
                            self?.showErrorMessage(error.localizedDescription)
                        }
                    }
                },
                receiveValue: { [weak self] response in
                    DispatchQueue.main.async {
                        self?.isLoading = false
                        self?.isRefreshing = false
                        
                        if refresh || self?.currentPage == 1 {
                            self?.jobs = response.jobs
                        } else {
                            self?.jobs.append(contentsOf: response.jobs)
                        }
                        
                        self?.hasMoreJobs = response.hasMore
                    }
                }
            )
            .store(in: &cancellables)
    }
    
    func loadMoreJobs() {
        guard hasMoreJobs && !isLoading && !isRefreshing else { return }
        
        currentPage += 1
        loadJobs()
    }
    
    func refreshJobs() {
        loadJobs(refresh: true)
    }
    
    // MARK: - Job Actions
    
    func submitJob(_ job: Job) {
        guard !submittingJobIds.contains(job.id) else { return }
        
        submittingJobIds.insert(job.id)
        errorMessage = nil
        
        networkService.submitJob(jobId: job.id)
            .sink(
                receiveCompletion: { [weak self] completion in
                    DispatchQueue.main.async {
                        self?.submittingJobIds.remove(job.id)
                        
                        if case .failure(let error) = completion {
                            self?.showErrorMessage("Failed to submit job: \(error.localizedDescription)")
                        }
                    }
                },
                receiveValue: { [weak self] response in
                    DispatchQueue.main.async {
                        self?.submittingJobIds.remove(job.id)
                        self?.lastSubmissionResult = response
                        self?.showSubmissionResult = true
                        
                        // Update job status locally
                        if let index = self?.jobs.firstIndex(where: { $0.id == job.id }) {
                            var updatedJob = job
                            updatedJob = Job(
                                id: updatedJob.id,
                                userId: updatedJob.userId,
                                turoTripId: updatedJob.turoTripId,
                                status: response.status,
                                tollAmount: updatedJob.tollAmount,
                                tollLocation: updatedJob.tollLocation,
                                tripStartDate: updatedJob.tripStartDate,
                                tripEndDate: updatedJob.tripEndDate,
                                proofImageUrl: updatedJob.proofImageUrl,
                                submissionAttempts: updatedJob.submissionAttempts + 1,
                                lastSubmissionDate: Date(),
                                errorMessage: response.success ? nil : response.message,
                                createdAt: updatedJob.createdAt,
                                updatedAt: Date()
                            )
                            self?.jobs[index] = updatedJob
                        }
                        
                        // Refresh jobs if submission was successful
                        if response.success {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                                self?.refreshJobs()
                            }
                        }
                    }
                }
            )
            .store(in: &cancellables)
    }
    
    func refreshJob(_ job: Job) {
        networkService.refreshJob(jobId: job.id)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.showErrorMessage("Failed to refresh job: \(error.localizedDescription)")
                    }
                },
                receiveValue: { [weak self] updatedJob in
                    DispatchQueue.main.async {
                        if let index = self?.jobs.firstIndex(where: { $0.id == job.id }) {
                            self?.jobs[index] = updatedJob
                        }
                    }
                }
            )
            .store(in: &cancellables)
    }
    
    // MARK: - Filter Management
    
    func setStatusFilter(_ status: Constants.JobStatus) {
        selectedStatus = status
        currentPage = 1
        loadJobs(refresh: true)
    }
    
    func clearSearch() {
        searchText = ""
    }
    
    // MARK: - Error Handling
    
    private func showErrorMessage(_ message: String) {
        errorMessage = message
        showError = true
    }
    
    func dismissError() {
        showError = false
        errorMessage = nil
    }
    
    func dismissSubmissionResult() {
        showSubmissionResult = false
        lastSubmissionResult = nil
    }
    
    // MARK: - Helper Methods
    
    func isSubmitting(_ job: Job) -> Bool {
        return submittingJobIds.contains(job.id)
    }
    
    var pendingJobsCount: Int {
        return jobs.filter { $0.jobStatus == .pending }.count
    }
    
    var failedJobsCount: Int {
        return jobs.filter { $0.jobStatus == .failed || $0.jobStatus == .retry }.count
    }
    
    var completedJobsCount: Int {
        return jobs.filter { $0.jobStatus == .completed }.count
    }
    
    var totalTollAmount: Double {
        return filteredJobs.reduce(0) { $0 + $1.tollAmount }
    }
    
    var isEmpty: Bool {
        return filteredJobs.isEmpty && !isLoading
    }
    
    var emptyStateMessage: String {
        if searchText.isEmpty {
            switch selectedStatus {
            case .pending:
                return "No pending toll submissions found"
            case .completed:
                return "No completed submissions found"
            case .failed:
                return "No failed submissions found"
            default:
                return "No jobs found"
            }
        } else {
            return "No results found for '\(searchText)'"
        }
    }
}

// MARK: - Job Statistics
extension JobsViewModel {
    struct JobStatistics {
        let totalJobs: Int
        let pendingCount: Int
        let completedCount: Int
        let failedCount: Int
        let totalAmount: Double
        let successRate: Double
        
        init(jobs: [Job]) {
            self.totalJobs = jobs.count
            self.pendingCount = jobs.filter { $0.jobStatus == .pending }.count
            self.completedCount = jobs.filter { $0.jobStatus == .completed }.count
            self.failedCount = jobs.filter { $0.jobStatus == .failed || $0.jobStatus == .retry }.count
            self.totalAmount = jobs.reduce(0) { $0 + $1.tollAmount }
            
            let attemptedJobs = completedCount + failedCount
            self.successRate = attemptedJobs > 0 ? Double(completedCount) / Double(attemptedJobs) : 0.0
        }
    }
    
    var statistics: JobStatistics {
        return JobStatistics(jobs: jobs)
    }
}