import Foundation

struct Job: Codable, Identifiable {
    let id: String
    let userId: String
    let turoTripId: String
    let status: String
    let tollAmount: Double
    let tollLocation: String
    let tripStartDate: Date
    let tripEndDate: Date
    let proofImageUrl: String?
    let submissionAttempts: Int
    let lastSubmissionDate: Date?
    let errorMessage: String?
    let createdAt: Date
    let updatedAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case turoTripId = "turo_trip_id"
        case status
        case tollAmount = "toll_amount"
        case tollLocation = "toll_location"
        case tripStartDate = "trip_start_date"
        case tripEndDate = "trip_end_date"
        case proofImageUrl = "proof_image_url"
        case submissionAttempts = "submission_attempts"
        case lastSubmissionDate = "last_submission_date"
        case errorMessage = "error_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
    
    init(id: String, 
         userId: String,
         turoTripId: String,
         status: String,
         tollAmount: Double,
         tollLocation: String,
         tripStartDate: Date,
         tripEndDate: Date,
         proofImageUrl: String? = nil,
         submissionAttempts: Int = 0,
         lastSubmissionDate: Date? = nil,
         errorMessage: String? = nil,
         createdAt: Date = Date(),
         updatedAt: Date = Date()) {
        self.id = id
        self.userId = userId
        self.turoTripId = turoTripId
        self.status = status
        self.tollAmount = tollAmount
        self.tollLocation = tollLocation
        self.tripStartDate = tripStartDate
        self.tripEndDate = tripEndDate
        self.proofImageUrl = proofImageUrl
        self.submissionAttempts = submissionAttempts
        self.lastSubmissionDate = lastSubmissionDate
        self.errorMessage = errorMessage
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        turoTripId = try container.decode(String.self, forKey: .turoTripId)
        status = try container.decode(String.self, forKey: .status)
        tollAmount = try container.decode(Double.self, forKey: .tollAmount)
        tollLocation = try container.decode(String.self, forKey: .tollLocation)
        submissionAttempts = try container.decode(Int.self, forKey: .submissionAttempts)
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
        proofImageUrl = try container.decodeIfPresent(String.self, forKey: .proofImageUrl)
        
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let tripStartString = try container.decode(String.self, forKey: .tripStartDate)
        let tripEndString = try container.decode(String.self, forKey: .tripEndDate)
        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        let updatedAtString = try container.decode(String.self, forKey: .updatedAt)
        
        tripStartDate = dateFormatter.date(from: tripStartString) ?? Date()
        tripEndDate = dateFormatter.date(from: tripEndString) ?? Date()
        createdAt = dateFormatter.date(from: createdAtString) ?? Date()
        updatedAt = dateFormatter.date(from: updatedAtString) ?? Date()
        
        if let lastSubmissionString = try container.decodeIfPresent(String.self, forKey: .lastSubmissionDate) {
            lastSubmissionDate = dateFormatter.date(from: lastSubmissionString)
        } else {
            lastSubmissionDate = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(turoTripId, forKey: .turoTripId)
        try container.encode(status, forKey: .status)
        try container.encode(tollAmount, forKey: .tollAmount)
        try container.encode(tollLocation, forKey: .tollLocation)
        try container.encode(submissionAttempts, forKey: .submissionAttempts)
        try container.encodeIfPresent(errorMessage, forKey: .errorMessage)
        try container.encodeIfPresent(proofImageUrl, forKey: .proofImageUrl)
        
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        try container.encode(dateFormatter.string(from: tripStartDate), forKey: .tripStartDate)
        try container.encode(dateFormatter.string(from: tripEndDate), forKey: .tripEndDate)
        try container.encode(dateFormatter.string(from: createdAt), forKey: .createdAt)
        try container.encode(dateFormatter.string(from: updatedAt), forKey: .updatedAt)
        
        if let lastSubmissionDate = lastSubmissionDate {
            try container.encode(dateFormatter.string(from: lastSubmissionDate), forKey: .lastSubmissionDate)
        }
    }
}

// MARK: - Job Extensions
extension Job {
    var jobStatus: Constants.JobStatus {
        return Constants.JobStatus(rawValue: status) ?? .pending
    }
    
    var formattedTollAmount: String {
        return tollAmount.formattedCurrency
    }
    
    var tripDuration: String {
        let interval = tripEndDate.timeIntervalSince(tripStartDate)
        let days = Int(interval / 86400)
        let hours = Int((interval.truncatingRemainder(dividingBy: 86400)) / 3600)
        
        if days > 0 {
            return "\(days)d \(hours)h"
        } else {
            return "\(hours)h"
        }
    }
    
    var formattedTripDates: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        
        if Calendar.current.isDate(tripStartDate, inSameDayAs: tripEndDate) {
            return formatter.string(from: tripStartDate)
        } else {
            return "\(formatter.string(from: tripStartDate)) - \(formatter.string(from: tripEndDate))"
        }
    }
    
    var canRetry: Bool {
        return jobStatus == .failed || jobStatus == .retry
    }
    
    var isProcessing: Bool {
        return jobStatus == .processing
    }
    
    var isCompleted: Bool {
        return jobStatus == .completed
    }
    
    var hasProofImage: Bool {
        return proofImageUrl != nil && !proofImageUrl!.isEmpty
    }
    
    var lastAttemptDescription: String {
        guard let lastDate = lastSubmissionDate else {
            return "No attempts yet"
        }
        return "Last attempt: \(lastDate.timeAgoDisplay())"
    }
}

// MARK: - Job Response Models
struct JobsResponse: Codable {
    let jobs: [Job]
    let totalCount: Int
    let page: Int
    let limit: Int
    let hasMore: Bool
    
    enum CodingKeys: String, CodingKey {
        case jobs
        case totalCount = "total_count"
        case page
        case limit
        case hasMore = "has_more"
    }
}

struct JobSubmissionResponse: Codable {
    let success: Bool
    let jobId: String
    let status: String
    let message: String?
    let submissionId: String?
    
    enum CodingKeys: String, CodingKey {
        case success
        case jobId = "job_id"
        case status
        case message
        case submissionId = "submission_id"
    }
}

// MARK: - Mock Data
extension Job {
    static let mockJob = Job(
        id: "job123",
        userId: "user456",
        turoTripId: "trip789",
        status: "pending",
        tollAmount: 12.50,
        tollLocation: "George Washington Bridge",
        tripStartDate: Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date(),
        tripEndDate: Calendar.current.date(byAdding: .day, value: -6, to: Date()) ?? Date(),
        proofImageUrl: "https://s3.amazonaws.com/bucket/proof123.jpg"
    )
    
    static let mockJobs = [
        Job(id: "1", userId: "user1", turoTripId: "trip1", status: "pending", tollAmount: 15.75,
            tollLocation: "Golden Gate Bridge", 
            tripStartDate: Calendar.current.date(byAdding: .day, value: -2, to: Date()) ?? Date(),
            tripEndDate: Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date(),
            proofImageUrl: "https://s3.amazonaws.com/bucket/proof1.jpg"),
        Job(id: "2", userId: "user1", turoTripId: "trip2", status: "failed", tollAmount: 8.50,
            tollLocation: "Bay Bridge",
            tripStartDate: Calendar.current.date(byAdding: .day, value: -5, to: Date()) ?? Date(),
            tripEndDate: Calendar.current.date(byAdding: .day, value: -4, to: Date()) ?? Date(),
            submissionAttempts: 2, errorMessage: "Turo API timeout"),
        Job(id: "3", userId: "user1", turoTripId: "trip3", status: "completed", tollAmount: 22.00,
            tollLocation: "Holland Tunnel",
            tripStartDate: Calendar.current.date(byAdding: .day, value: -10, to: Date()) ?? Date(),
            tripEndDate: Calendar.current.date(byAdding: .day, value: -9, to: Date()) ?? Date(),
            proofImageUrl: "https://s3.amazonaws.com/bucket/proof3.jpg")
    ]
}