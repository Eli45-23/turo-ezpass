import SwiftUI

struct JobDetailView: View {
    let job: Job
    @StateObject private var jobsViewModel = JobsViewModel()
    @State private var proofImage: UIImage?
    @State private var imageLoading = false
    @State private var showingFullScreenImage = false
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        ScrollView {
            VStack(spacing: Constants.UI.standardPadding) {
                // Header Card
                headerCard
                
                // Trip Information Card
                tripInformationCard
                
                // Toll Information Card
                tollInformationCard
                
                // Proof Image Card
                if job.hasProofImage {
                    proofImageCard
                }
                
                // Submission History Card
                submissionHistoryCard
                
                // Action Buttons
                actionButtons
                
                Spacer(minLength: Constants.UI.standardPadding)
            }
            .padding(Constants.UI.standardPadding)
        }
        .navigationTitle("Job Details")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            loadProofImage()
        }
        .fullScreenCover(isPresented: $showingFullScreenImage) {
            if let image = proofImage {
                FullScreenImageView(image: image)
            }
        }
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
    
    private var headerCard: some View {
        DetailCard {
            VStack(spacing: Constants.UI.standardPadding) {
                HStack {
                    VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                        Text("Job ID")
                            .font(.caption)
                            .foregroundColor(.secondaryGray)
                        
                        Text(job.id)
                            .font(.body)
                            .fontWeight(.medium)
                    }
                    
                    Spacer()
                    
                    StatusBadge(status: job.jobStatus)
                }
                
                HStack {
                    VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                        Text("Turo Trip ID")
                            .font(.caption)
                            .foregroundColor(.secondaryGray)
                        
                        Text(job.turoTripId)
                            .font(.body)
                            .fontWeight(.medium)
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: Constants.UI.smallPadding) {
                        Text("Toll Amount")
                            .font(.caption)
                            .foregroundColor(.secondaryGray)
                        
                        Text(job.formattedTollAmount)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.primaryBlue)
                    }
                }
            }
        }
    }
    
    private var tripInformationCard: some View {
        DetailCard(title: "Trip Information") {
            VStack(spacing: Constants.UI.standardPadding) {
                DetailRow(
                    label: "Start Date",
                    value: job.tripStartDate.formattedDateTime(),
                    icon: "calendar"
                )
                
                DetailRow(
                    label: "End Date",
                    value: job.tripEndDate.formattedDateTime(),
                    icon: "calendar"
                )
                
                DetailRow(
                    label: "Duration",
                    value: job.tripDuration,
                    icon: "clock"
                )
                
                DetailRow(
                    label: "Location",
                    value: job.tollLocation,
                    icon: "location"
                )
            }
        }
    }
    
    private var tollInformationCard: some View {
        DetailCard(title: "Toll Information") {
            VStack(spacing: Constants.UI.standardPadding) {
                DetailRow(
                    label: "Amount",
                    value: job.formattedTollAmount,
                    icon: "dollarsign.circle",
                    valueColor: .primaryBlue
                )
                
                DetailRow(
                    label: "Location",
                    value: job.tollLocation,
                    icon: "location.circle"
                )
                
                DetailRow(
                    label: "Created",
                    value: job.createdAt.formattedDateTime(),
                    icon: "plus.circle"
                )
                
                DetailRow(
                    label: "Updated",
                    value: job.updatedAt.formattedDateTime(),
                    icon: "arrow.clockwise.circle"
                )
            }
        }
    }
    
    private var proofImageCard: some View {
        DetailCard(title: "Proof Image") {
            VStack(spacing: Constants.UI.standardPadding) {
                if imageLoading {
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .fill(Color(.systemGray6))
                        .frame(height: 200)
                        .overlay(
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .primaryBlue))
                        )
                } else if let image = proofImage {
                    Button {
                        showingFullScreenImage = true
                    } label: {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 200)
                            .cornerRadius(Constants.UI.cornerRadius)
                            .overlay(
                                RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                    }
                } else {
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .fill(Color(.systemGray6))
                        .frame(height: 200)
                        .overlay(
                            VStack(spacing: Constants.UI.smallPadding) {
                                Image(systemName: "photo")
                                    .font(.largeTitle)
                                    .foregroundColor(.secondaryGray)
                                
                                Text("Failed to load image")
                                    .font(.subheadline)
                                    .foregroundColor(.secondaryGray)
                                
                                Button("Retry") {
                                    loadProofImage()
                                }
                                .font(.caption)
                                .foregroundColor(.primaryBlue)
                            }
                        )
                }
                
                if let imageUrl = job.proofImageUrl {
                    Text("Source: \(URL(string: imageUrl)?.host ?? "Unknown")")
                        .font(.caption)
                        .foregroundColor(.secondaryGray)
                        .multilineTextAlignment(.center)
                }
            }
        }
    }
    
    private var submissionHistoryCard: some View {
        DetailCard(title: "Submission History") {
            VStack(spacing: Constants.UI.standardPadding) {
                DetailRow(
                    label: "Attempts",
                    value: "\(job.submissionAttempts)",
                    icon: "arrow.clockwise.circle"
                )
                
                if let lastSubmissionDate = job.lastSubmissionDate {
                    DetailRow(
                        label: "Last Attempt",
                        value: lastSubmissionDate.timeAgoDisplay(),
                        icon: "clock.arrow.circlepath"
                    )
                }
                
                if let errorMessage = job.errorMessage, !errorMessage.isEmpty {
                    VStack(alignment: .leading, spacing: Constants.UI.smallPadding) {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.errorRed)
                            
                            Text("Last Error")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(.errorRed)
                        }
                        
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundColor(.secondaryGray)
                            .padding(.leading, 24)
                    }
                    .padding(Constants.UI.standardPadding)
                    .background(
                        RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                            .fill(Color.errorRed.opacity(0.1))
                    )
                }
            }
        }
    }
    
    private var actionButtons: some View {
        VStack(spacing: Constants.UI.standardPadding) {
            // Primary Action Button
            if job.canRetry || job.jobStatus == .pending {
                Button {
                    jobsViewModel.submitJob(job)
                } label: {
                    HStack {
                        if jobsViewModel.isSubmitting(job) {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: job.canRetry ? "arrow.clockwise" : "paperplane.fill")
                        }
                        
                        Text(jobsViewModel.isSubmitting(job) ? "Submitting..." : (job.canRetry ? "Submit Again" : "Submit Now"))
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: Constants.UI.buttonHeight)
                    .background(
                        RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                            .fill(job.canRetry ? Color.warningOrange : Color.primaryBlue)
                    )
                    .foregroundColor(.white)
                }
                .disabled(jobsViewModel.isSubmitting(job))
            }
            
            // Secondary Action Button
            Button {
                jobsViewModel.refreshJob(job)
            } label: {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Refresh Status")
                        .fontWeight(.medium)
                }
                .frame(maxWidth: .infinity, minHeight: Constants.UI.buttonHeight)
                .background(
                    RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                        .stroke(Color.primaryBlue, lineWidth: 2)
                )
                .foregroundColor(.primaryBlue)
            }
        }
    }
    
    private func loadProofImage() {
        guard let imageUrlString = job.proofImageUrl,
              let imageUrl = URL(string: imageUrlString),
              proofImage == nil else { return }
        
        imageLoading = true
        
        // In a real app, use proper image loading with caching
        URLSession.shared.dataTask(with: imageUrl) { data, _, error in
            DispatchQueue.main.async {
                imageLoading = false
                
                if let data = data, let image = UIImage(data: data) {
                    proofImage = image
                }
            }
        }.resume()
    }
}

// MARK: - Supporting Views

struct DetailCard<Content: View>: View {
    let title: String?
    let content: Content
    
    init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: Constants.UI.standardPadding) {
            if let title = title {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
            }
            
            content
        }
        .padding(Constants.UI.standardPadding)
        .background(
            RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
        )
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    let icon: String
    let valueColor: Color
    
    init(label: String, value: String, icon: String, valueColor: Color = .primary) {
        self.label = label
        self.value = value
        self.icon = icon
        self.valueColor = valueColor
    }
    
    var body: some View {
        HStack(spacing: Constants.UI.standardPadding) {
            Image(systemName: icon)
                .foregroundColor(.primaryBlue)
                .frame(width: 20)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondaryGray)
                
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(valueColor)
            }
            
            Spacer()
        }
    }
}

struct FullScreenImageView: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(
                        MagnificationGesture()
                            .onChanged { value in
                                let delta = value / lastScale
                                lastScale = value
                                let newScale = scale * delta
                                scale = min(max(newScale, 0.5), 4.0)
                            }
                            .onEnded { value in
                                lastScale = 1.0
                            }
                            .simultaneously(with:
                                DragGesture()
                                    .onChanged { value in
                                        let newOffset = CGSize(
                                            width: lastOffset.width + value.translation.x,
                                            height: lastOffset.height + value.translation.y
                                        )
                                        offset = newOffset
                                    }
                                    .onEnded { value in
                                        lastOffset = offset
                                    }
                            )
                    )
                    .onTapGesture(count: 2) {
                        withAnimation(.spring()) {
                            if scale > 1.0 {
                                scale = 1.0
                                offset = .zero
                                lastOffset = .zero
                            } else {
                                scale = 2.0
                            }
                        }
                    }
            }
            .navigationTitle("Proof Image")
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
    NavigationView {
        JobDetailView(job: Job.mockJob)
    }
}