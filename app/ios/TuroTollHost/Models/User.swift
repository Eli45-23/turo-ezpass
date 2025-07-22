import Foundation

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let name: String
    let turoHostId: String?
    let createdAt: Date
    let updatedAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case email
        case name
        case turoHostId = "turo_host_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
    
    init(id: String, email: String, name: String, turoHostId: String? = nil, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.email = email
        self.name = name
        self.turoHostId = turoHostId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(String.self, forKey: .id)
        email = try container.decode(String.self, forKey: .email)
        name = try container.decode(String.self, forKey: .name)
        turoHostId = try container.decodeIfPresent(String.self, forKey: .turoHostId)
        
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        let updatedAtString = try container.decode(String.self, forKey: .updatedAt)
        
        createdAt = dateFormatter.date(from: createdAtString) ?? Date()
        updatedAt = dateFormatter.date(from: updatedAtString) ?? Date()
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(id, forKey: .id)
        try container.encode(email, forKey: .email)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(turoHostId, forKey: .turoHostId)
        
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        try container.encode(dateFormatter.string(from: createdAt), forKey: .createdAt)
        try container.encode(dateFormatter.string(from: updatedAt), forKey: .updatedAt)
    }
}

// MARK: - User Extensions
extension User {
    var displayName: String {
        return name.isEmpty ? email : name
    }
    
    var initials: String {
        let components = name.components(separatedBy: " ")
        if components.count >= 2 {
            let firstInitial = String(components[0].prefix(1))
            let lastInitial = String(components[1].prefix(1))
            return "\(firstInitial)\(lastInitial)".uppercased()
        } else if !name.isEmpty {
            return String(name.prefix(2)).uppercased()
        } else {
            return String(email.prefix(2)).uppercased()
        }
    }
    
    var hasTuroHostId: Bool {
        return turoHostId != nil && !turoHostId!.isEmpty
    }
}

// MARK: - Mock Data
extension User {
    static let mockUser = User(
        id: "user123",
        email: "john.doe@example.com",
        name: "John Doe",
        turoHostId: "host456"
    )
    
    static let mockUsers = [
        User(id: "1", email: "alice@example.com", name: "Alice Johnson", turoHostId: "host001"),
        User(id: "2", email: "bob@example.com", name: "Bob Smith", turoHostId: "host002"),
        User(id: "3", email: "carol@example.com", name: "Carol Davis", turoHostId: nil)
    ]
}