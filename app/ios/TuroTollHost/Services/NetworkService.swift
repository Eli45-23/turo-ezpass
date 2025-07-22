import Foundation
import Combine

class NetworkService: ObservableObject {
    static let shared = NetworkService()
    
    private let session: URLSession
    private var cancellables = Set<AnyCancellable>()
    
    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = Constants.API.timeout
        configuration.timeoutIntervalForResource = Constants.API.timeout * 2
        self.session = URLSession(configuration: configuration)
    }
    
    // MARK: - Generic Request Method
    
    private func makeRequest<T: Codable>(_ request: URLRequest, responseType: T.Type) -> AnyPublisher<T, Error> {
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: T.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    // MARK: - Authentication Helper
    
    private func createAuthenticatedRequest(for url: URL, method: HTTPMethod = .GET) -> URLRequest? {
        guard let accessToken = CognitoService.shared.getAccessToken() else {
            return nil
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        return request
    }
    
    // MARK: - Jobs API
    
    func fetchJobs(status: String? = nil, page: Int = 1, limit: Int = 20) -> AnyPublisher<JobsResponse, Error> {
        var components = URLComponents(string: "\(Constants.API.baseURL)\(Constants.API.jobsEndpoint)")!
        
        var queryItems = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        
        if let status = status {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        
        components.queryItems = queryItems
        
        guard let url = components.url,
              let request = createAuthenticatedRequest(for: url) else {
            return Fail(error: NetworkError.invalidRequest)
                .eraseToAnyPublisher()
        }
        
        // For demo purposes, return mock data
        return Just(JobsResponse(
            jobs: Job.mockJobs,
            totalCount: Job.mockJobs.count,
            page: page,
            limit: limit,
            hasMore: false
        ))
        .setFailureType(to: Error.self)
        .delay(for: .milliseconds(500), scheduler: RunLoop.main)
        .eraseToAnyPublisher()
        
        // Uncomment below for real API call
        /*
        return makeRequest(request, responseType: JobsResponse.self)
        */
    }
    
    func submitJob(jobId: String) -> AnyPublisher<JobSubmissionResponse, Error> {
        let url = URL(string: "\(Constants.API.baseURL)\(Constants.API.submitEndpoint)/\(jobId)")!
        
        guard var request = createAuthenticatedRequest(for: url, method: .POST) else {
            return Fail(error: NetworkError.authenticationRequired)
                .eraseToAnyPublisher()
        }
        
        let submitData = ["job_id": jobId]
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: submitData)
        } catch {
            return Fail(error: NetworkError.encodingError)
                .eraseToAnyPublisher()
        }
        
        // For demo purposes, simulate success/failure
        return Future { promise in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                // Simulate 80% success rate
                let isSuccess = Int.random(in: 1...10) <= 8
                
                let response = JobSubmissionResponse(
                    success: isSuccess,
                    jobId: jobId,
                    status: isSuccess ? "processing" : "failed",
                    message: isSuccess ? "Job submitted successfully" : "Submission failed - please try again",
                    submissionId: isSuccess ? "sub_\(UUID().uuidString.prefix(8))" : nil
                )
                
                promise(.success(response))
            }
        }
        .eraseToAnyPublisher()
        
        // Uncomment below for real API call
        /*
        return makeRequest(request, responseType: JobSubmissionResponse.self)
        */
    }
    
    func refreshJob(jobId: String) -> AnyPublisher<Job, Error> {
        let url = URL(string: "\(Constants.API.baseURL)\(Constants.API.jobsEndpoint)/\(jobId)")!
        
        guard let request = createAuthenticatedRequest(for: url) else {
            return Fail(error: NetworkError.invalidRequest)
                .eraseToAnyPublisher()
        }
        
        // For demo purposes, return updated mock job
        return Future { promise in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if let mockJob = Job.mockJobs.first(where: { $0.id == jobId }) {
                    promise(.success(mockJob))
                } else {
                    promise(.failure(NetworkError.notFound))
                }
            }
        }
        .eraseToAnyPublisher()
        
        // Uncomment below for real API call
        /*
        return makeRequest(request, responseType: Job.self)
        */
    }
    
    // MARK: - Image Loading
    
    func loadImage(from urlString: String) -> AnyPublisher<Data, Error> {
        guard let url = URL(string: urlString) else {
            return Fail(error: NetworkError.invalidURL)
                .eraseToAnyPublisher()
        }
        
        return session.dataTaskPublisher(for: url)
            .map(\.data)
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    // MARK: - Health Check
    
    func healthCheck() -> AnyPublisher<Bool, Error> {
        let url = URL(string: "\(Constants.API.baseURL)/health")!
        let request = URLRequest(url: url)
        
        return session.dataTaskPublisher(for: request)
            .map { _ in true }
            .catch { _ in Just(false).setFailureType(to: Error.self) }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
}

// MARK: - HTTP Method Enum
enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
    case PATCH = "PATCH"
}

// MARK: - Network Error
enum NetworkError: LocalizedError {
    case invalidURL
    case invalidRequest
    case authenticationRequired
    case encodingError
    case decodingError
    case noData
    case notFound
    case serverError(Int)
    case unknownError
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL format."
        case .invalidRequest:
            return "Invalid request configuration."
        case .authenticationRequired:
            return "Authentication required. Please log in again."
        case .encodingError:
            return "Failed to encode request data."
        case .decodingError:
            return "Failed to decode response data."
        case .noData:
            return "No data received from server."
        case .notFound:
            return "Requested resource not found."
        case .serverError(let code):
            return "Server error occurred (Code: \(code))."
        case .unknownError:
            return "An unknown error occurred."
        }
    }
}

// MARK: - Network Monitoring
extension NetworkService {
    func startMonitoring() {
        // In a real app, you might want to monitor network connectivity
        // using Network framework
        Timer.publish(every: 30, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                self.healthCheck()
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { isHealthy in
                            if !isHealthy {
                                // Handle server unavailability
                                print("Server health check failed")
                            }
                        }
                    )
                    .store(in: &self.cancellables)
            }
            .store(in: &cancellables)
    }
}