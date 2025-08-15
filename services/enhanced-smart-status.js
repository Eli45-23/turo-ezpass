const { db } = require('../config/database');

/**
 * Enhanced Smart Status System
 * Intelligent trip status management with multiple intelligence factors
 */
class EnhancedSmartStatus {
    constructor() {
        this.confidenceThresholds = {
            HIGH: 0.85,      // Auto-apply status
            MEDIUM: 0.65,    // Flag for review
            LOW: 0.45        // Needs manual input
        };
        
        this.statusPriority = {
            'canceled': 1,
            'extended': 2,
            'in_progress': 3,
            'completed': 4,
            'upcoming': 5
        };
    }

    /**
     * Main entry point - Get enhanced smart status for a trip
     */
    async getEnhancedSmartStatus(trip, hostId) {
        console.log(`🧠 Analyzing enhanced status for trip ${trip.turo_trip_id}`);
        
        try {
            // Factor 1: Time-based analysis (existing logic enhanced)
            const timeAnalysis = this.analyzeTimeBasedStatus(trip);
            
            // Factor 2: Toll activity intelligence
            const tollAnalysis = await this.analyzeTollActivity(trip);
            
            // Factor 3: User pattern recognition
            const patternAnalysis = await this.analyzeUserPatterns(trip, hostId);
            
            // Factor 4: Manual override check
            const manualOverride = await this.getManualOverride(trip.id);
            
            // Combine all factors for final intelligent status
            const finalAnalysis = this.calculateFinalStatus({
                timeAnalysis,
                tollAnalysis,
                patternAnalysis,
                manualOverride,
                trip
            });
            
            // Store analysis results
            await this.storeIntelligenceData(trip.id, hostId, {
                timeAnalysis,
                tollAnalysis,
                patternAnalysis,
                finalAnalysis
            });
            
            return finalAnalysis;
            
        } catch (error) {
            console.error(`❌ Error analyzing enhanced status for trip ${trip.turo_trip_id}:`, error);
            
            // Fallback to basic time-based status
            return this.getFallbackStatus(trip);
        }
    }

    /**
     * Enhanced time-based analysis
     */
    analyzeTimeBasedStatus(trip) {
        const now = new Date();
        const start = new Date(trip.start_date);
        const end = new Date(trip.end_date);
        
        let status, confidence, label, reasoning;
        
        if (now < start) {
            const daysUntil = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
            const hoursUntil = Math.ceil((start - now) / (1000 * 60 * 60));
            
            status = 'upcoming';
            confidence = 0.95; // High confidence for future trips
            
            if (daysUntil > 1) {
                label = `${daysUntil} days`;
            } else if (hoursUntil > 1) {
                label = `${hoursUntil}h`;
            } else {
                label = 'Starting soon';
            }
            
            reasoning = `Trip starts in ${hoursUntil} hours`;
            
        } else if (now >= start && now <= end) {
            const hoursRemaining = Math.ceil((end - now) / (1000 * 60 * 60));
            const totalDuration = Math.ceil((end - start) / (1000 * 60 * 60));
            const progressPercent = Math.floor(((now - start) / (end - start)) * 100);
            
            status = 'in_progress';
            confidence = 0.9; // High confidence for active trips
            
            if (hoursRemaining > 24) {
                label = `${Math.ceil(hoursRemaining / 24)}d left`;
            } else if (hoursRemaining > 1) {
                label = `${hoursRemaining}h left`;
            } else {
                label = 'Ending soon';
            }
            
            reasoning = `Trip is ${progressPercent}% complete, ${hoursRemaining}h remaining`;
            
        } else if (now > end) {
            const hoursAgo = Math.floor((now - end) / (1000 * 60 * 60));
            const daysAgo = Math.floor(hoursAgo / 24);
            
            status = 'completed';
            confidence = 0.8; // Medium confidence - could be extended
            
            if (daysAgo > 0) {
                label = 'Completed';
            } else if (hoursAgo < 1) {
                label = 'Just ended';
            } else {
                label = `${hoursAgo}h ago`;
            }
            
            reasoning = `Trip ended ${hoursAgo} hours ago`;
        }
        
        return {
            status,
            confidence,
            label,
            reasoning,
            source: 'time_analysis'
        };
    }

    /**
     * Toll activity intelligence analysis
     */
    async analyzeTollActivity(trip) {
        return new Promise((resolve) => {
            db.all(
                `SELECT toll_date, toll_amount, toll_location 
                 FROM toll_charges 
                 WHERE trip_id = ? 
                 ORDER BY toll_date ASC`,
                [trip.id],
                (err, tolls) => {
                    if (err || !tolls.length) {
                        resolve({
                            status: null,
                            confidence: 0.3,
                            reasoning: 'No toll activity found',
                            tollCount: 0,
                            hasActivity: false,
                            source: 'toll_analysis'
                        });
                        return;
                    }
                    
                    const tripStart = new Date(trip.start_date);
                    const tripEnd = new Date(trip.end_date);
                    const now = new Date();
                    
                    const firstToll = new Date(tolls[0].toll_date);
                    const lastToll = new Date(tolls[tolls.length - 1].toll_date);
                    
                    let status = null;
                    let confidence = 0.7;
                    let reasoning = '';
                    
                    // Analyze toll patterns
                    const tollsBeforeTrip = tolls.filter(t => new Date(t.toll_date) < tripStart).length;
                    const tollsDuringTrip = tolls.filter(t => {
                        const tollDate = new Date(t.toll_date);
                        return tollDate >= tripStart && tollDate <= tripEnd;
                    }).length;
                    const tollsAfterTrip = tolls.filter(t => new Date(t.toll_date) > tripEnd).length;
                    
                    // Intelligence rules based on toll patterns
                    if (tollsAfterTrip > 0 && lastToll > tripEnd) {
                        // Tolls detected after scheduled end - likely extended
                        const extensionHours = Math.ceil((lastToll - tripEnd) / (1000 * 60 * 60));
                        status = 'extended';
                        confidence = 0.9;
                        reasoning = `Toll activity ${extensionHours}h after scheduled end - trip likely extended`;
                        
                    } else if (tollsDuringTrip > 0 && now > tripEnd) {
                        // Normal toll activity during scheduled period, trip should be completed
                        status = 'completed';
                        confidence = 0.85;
                        reasoning = `${tollsDuringTrip} tolls during scheduled period, trip completed normally`;
                        
                    } else if (tollsDuringTrip === 0 && now > tripStart) {
                        // No tolls during scheduled period - possibly canceled or local-only trip
                        status = 'possibly_canceled';
                        confidence = 0.6;
                        reasoning = 'No toll activity during scheduled period - may be canceled or local-only';
                        
                    } else if (tollsDuringTrip > 0 && now >= tripStart && now <= tripEnd) {
                        // Active toll usage during current trip
                        status = 'in_progress';
                        confidence = 0.95;
                        reasoning = `Active toll usage detected - trip confirmed in progress`;
                        
                    } else {
                        // Default analysis
                        confidence = 0.5;
                        reasoning = `${tolls.length} total tolls found, standard pattern`;
                    }
                    
                    resolve({
                        status,
                        confidence,
                        reasoning,
                        tollCount: tolls.length,
                        tollsDuringTrip,
                        tollsAfterTrip,
                        hasActivity: tolls.length > 0,
                        dateRange: {
                            first: firstToll,
                            last: lastToll,
                            spanDays: Math.ceil((lastToll - firstToll) / (1000 * 60 * 60 * 24))
                        },
                        source: 'toll_analysis'
                    });
                }
            );
        });
    }

    /**
     * User pattern recognition analysis
     */
    async analyzeUserPatterns(trip, hostId) {
        return new Promise((resolve) => {
            // First get user's historical patterns
            db.get(
                `SELECT * FROM user_trip_patterns WHERE host_id = ?`,
                [hostId],
                (err, patterns) => {
                    if (err || !patterns) {
                        resolve({
                            status: null,
                            confidence: 0.3,
                            reasoning: 'Insufficient pattern data',
                            source: 'pattern_analysis'
                        });
                        return;
                    }
                    
                    // Get recent trip history for this user
                    db.all(
                        `SELECT t.*, 
                                COUNT(tc.id) as toll_count,
                                COALESCE(SUM(tc.toll_amount), 0) as total_tolls
                         FROM trips t
                         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
                         WHERE t.host_id = ? AND t.id != ?
                         GROUP BY t.id
                         ORDER BY t.start_date DESC
                         LIMIT 20`,
                        [hostId, trip.id],
                        (err, recentTrips) => {
                            if (err) {
                                resolve({
                                    status: null,
                                    confidence: 0.3,
                                    reasoning: 'Error analyzing user patterns',
                                    source: 'pattern_analysis'
                                });
                                return;
                            }
                            
                            const analysis = this.analyzePatterns(trip, patterns, recentTrips);
                            resolve(analysis);
                        }
                    );
                }
            );
        });
    }

    /**
     * Pattern analysis logic
     */
    analyzePatterns(currentTrip, patterns, recentTrips) {
        let confidence = 0.5;
        let reasoning = 'Pattern analysis';
        let suggestedStatus = null;
        
        if (!recentTrips.length) {
            return {
                status: null,
                confidence: 0.3,
                reasoning: 'No historical trip data for pattern analysis',
                source: 'pattern_analysis'
            };
        }
        
        // Calculate user's typical behaviors
        const tripsWith

 = recentTrips.filter(t => t.toll_count > 0).length;
        const tripsWithoutTolls = recentTrips.filter(t => t.toll_count === 0).length;
        const noTollRate = tripsWithoutTolls / recentTrips.length;
        
        // Pattern-based rules
        if (noTollRate > 0.5 && currentTrip.toll_count === 0) {
            // User often has trips without tolls - normal pattern
            confidence = 0.7;
            reasoning = `User typically has ${Math.round(noTollRate * 100)}% of trips without tolls - normal pattern`;
            
        } else if (noTollRate < 0.2 && currentTrip.toll_count === 0) {
            // User almost always has tolls, but this trip doesn't - suspicious
            suggestedStatus = 'possibly_canceled';
            confidence = 0.6;
            reasoning = `User typically has tolls on ${Math.round((1-noTollRate) * 100)}% of trips - unusual pattern`;
            
        } else if (patterns.avg_extension_hours > 2) {
            // User frequently extends trips
            confidence = 0.6;
            reasoning = `User averages ${patterns.avg_extension_hours}h extensions - watch for extended status`;
        }
        
        return {
            status: suggestedStatus,
            confidence,
            reasoning,
            patterns: {
                noTollRate: Math.round(noTollRate * 100),
                avgExtension: patterns.avg_extension_hours,
                totalTrips: recentTrips.length
            },
            source: 'pattern_analysis'
        };
    }

    /**
     * Check for manual status overrides
     */
    async getManualOverride(tripId) {
        return new Promise((resolve) => {
            db.get(
                `SELECT manual_override, manual_override_reason, manual_override_at 
                 FROM trip_status_intelligence 
                 WHERE trip_id = ? AND manual_override IS NOT NULL
                 ORDER BY updated_at DESC LIMIT 1`,
                [tripId],
                (err, override) => {
                    if (err || !override) {
                        resolve(null);
                        return;
                    }
                    
                    resolve({
                        status: override.manual_override,
                        confidence: 1.0, // Manual overrides have perfect confidence
                        reasoning: override.manual_override_reason || 'Manual override by user',
                        timestamp: override.manual_override_at,
                        source: 'manual_override'
                    });
                }
            );
        });
    }

    /**
     * Combine all analysis factors into final intelligent status
     */
    calculateFinalStatus({timeAnalysis, tollAnalysis, patternAnalysis, manualOverride, trip}) {
        console.log(`🔍 Combining analysis factors for trip ${trip.turo_trip_id}:`);
        console.log(`   Time: ${timeAnalysis.status} (${timeAnalysis.confidence})`);
        console.log(`   Toll: ${tollAnalysis.status} (${tollAnalysis.confidence})`);
        console.log(`   Pattern: ${patternAnalysis.status} (${patternAnalysis.confidence})`);
        console.log(`   Manual: ${manualOverride?.status || 'none'}`);
        
        // Manual override always wins
        if (manualOverride) {
            return {
                status: manualOverride.status,
                label: this.getStatusLabel(manualOverride.status, trip),
                class: `status-${manualOverride.status}`,
                confidence: 1.0,
                reasoning: manualOverride.reasoning,
                source: 'manual_override',
                needsReview: false,
                factors: {timeAnalysis, tollAnalysis, patternAnalysis, manualOverride}
            };
        }
        
        // Collect all status suggestions with weights
        const suggestions = [];
        
        if (timeAnalysis.status) {
            suggestions.push({
                status: timeAnalysis.status,
                confidence: timeAnalysis.confidence,
                weight: 0.4, // Time analysis base weight
                source: 'time'
            });
        }
        
        if (tollAnalysis.status && tollAnalysis.confidence > 0.5) {
            let weight = 0.35;
            
            // Increase weight for high-confidence toll analysis
            if (tollAnalysis.confidence > 0.8) {
                weight = 0.5;
            }
            
            suggestions.push({
                status: tollAnalysis.status,
                confidence: tollAnalysis.confidence,
                weight: weight,
                source: 'toll'
            });
        }
        
        if (patternAnalysis.status && patternAnalysis.confidence > 0.5) {
            suggestions.push({
                status: patternAnalysis.status,
                confidence: patternAnalysis.confidence,
                weight: 0.25,
                source: 'pattern'
            });
        }
        
        // Calculate weighted scores for each possible status
        const statusScores = {};
        
        suggestions.forEach(suggestion => {
            const score = suggestion.confidence * suggestion.weight;
            
            if (!statusScores[suggestion.status]) {
                statusScores[suggestion.status] = {
                    totalScore: 0,
                    sources: [],
                    maxConfidence: 0
                };
            }
            
            statusScores[suggestion.status].totalScore += score;
            statusScores[suggestion.status].sources.push(suggestion.source);
            statusScores[suggestion.status].maxConfidence = Math.max(
                statusScores[suggestion.status].maxConfidence, 
                suggestion.confidence
            );
        });
        
        // Find highest scoring status
        let finalStatus = timeAnalysis.status; // Default fallback
        let finalConfidence = timeAnalysis.confidence;
        let bestScore = 0;
        let winingSources = ['time'];
        
        Object.keys(statusScores).forEach(status => {
            const data = statusScores[status];
            
            if (data.totalScore > bestScore) {
                bestScore = data.totalScore;
                finalStatus = status;
                finalConfidence = data.maxConfidence;
                winingSources = data.sources;
            }
        });
        
        // Apply priority rules for conflicting statuses
        if (tollAnalysis.status === 'extended' && tollAnalysis.confidence > 0.8) {
            finalStatus = 'extended';
            finalConfidence = tollAnalysis.confidence;
            winingSources = ['toll'];
        }
        
        if (tollAnalysis.status === 'possibly_canceled' && tollAnalysis.confidence > 0.7) {
            finalStatus = 'possibly_canceled';
            finalConfidence = tollAnalysis.confidence;
            winingSources = ['toll'];
        }
        
        // Determine if needs review
        const needsReview = finalConfidence < this.confidenceThresholds.HIGH;
        
        // Generate combined reasoning
        const reasoning = this.generateCombinedReasoning({
            timeAnalysis,
            tollAnalysis, 
            patternAnalysis,
            finalStatus,
            winingSources
        });
        
        return {
            status: finalStatus,
            label: this.getStatusLabel(finalStatus, trip),
            class: `status-${finalStatus.replace('_', '-')}`,
            confidence: finalConfidence,
            reasoning: reasoning,
            needsReview: needsReview,
            source: `combined(${winingSources.join(',')})`,
            factors: {
                timeAnalysis,
                tollAnalysis,
                patternAnalysis,
                statusScores
            }
        };
    }

    /**
     * Generate human-readable status labels
     */
    getStatusLabel(status, trip) {
        const now = new Date();
        const start = new Date(trip.start_date);
        const end = new Date(trip.end_date);
        
        switch (status) {
            case 'upcoming':
                const daysUntil = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
                return daysUntil > 1 ? `${daysUntil} days` : 'Tomorrow';
                
            case 'in_progress':
                const hoursLeft = Math.ceil((end - now) / (1000 * 60 * 60));
                return hoursLeft > 24 ? 'In Progress' : `${hoursLeft}h left`;
                
            case 'completed':
                const daysAgo = Math.floor((now - end) / (1000 * 60 * 60 * 24));
                return daysAgo === 0 ? 'Just Ended' : 'Completed';
                
            case 'extended':
                return 'Extended';
                
            case 'possibly_canceled':
                return 'Possibly Canceled';
                
            default:
                return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
    }

    /**
     * Generate combined reasoning from all factors
     */
    generateCombinedReasoning({timeAnalysis, tollAnalysis, patternAnalysis, finalStatus, winingSources}) {
        const reasons = [];
        
        if (winingSources.includes('time')) {
            reasons.push(timeAnalysis.reasoning);
        }
        
        if (winingSources.includes('toll') && tollAnalysis.reasoning) {
            reasons.push(tollAnalysis.reasoning);
        }
        
        if (winingSources.includes('pattern') && patternAnalysis.reasoning) {
            reasons.push(patternAnalysis.reasoning);
        }
        
        return reasons.join(' • ');
    }

    /**
     * Store intelligence analysis data
     */
    async storeIntelligenceData(tripId, hostId, analysisData) {
        const {timeAnalysis, tollAnalysis, patternAnalysis, finalAnalysis} = analysisData;
        
        return new Promise((resolve) => {
            db.run(`
                INSERT OR REPLACE INTO trip_status_intelligence 
                (trip_id, host_id, time_based_status, toll_based_status, pattern_based_status, 
                 final_status, time_confidence, toll_confidence, pattern_confidence, 
                 overall_confidence, toll_count, has_toll_activity, needs_review, analyzed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                tripId,
                hostId,
                timeAnalysis.status,
                tollAnalysis.status,
                patternAnalysis.status,
                finalAnalysis.status,
                timeAnalysis.confidence,
                tollAnalysis.confidence,
                patternAnalysis.confidence,
                finalAnalysis.confidence,
                tollAnalysis.tollCount || 0,
                tollAnalysis.hasActivity || false,
                finalAnalysis.needsReview || false
            ], (err) => {
                if (err) {
                    console.error('❌ Error storing intelligence data:', err);
                }
                resolve();
            });
        });
    }

    /**
     * Fallback status for errors
     */
    getFallbackStatus(trip) {
        const basicStatus = this.analyzeTimeBasedStatus(trip);
        return {
            ...basicStatus,
            needsReview: true,
            reasoning: 'Fallback status due to analysis error',
            source: 'fallback'
        };
    }

    /**
     * Get intelligence summary for dashboard
     */
    async getIntelligenceSummary(hostId) {
        return new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_analyzed,
                    SUM(CASE WHEN overall_confidence >= 0.85 THEN 1 ELSE 0 END) as high_confidence,
                    SUM(CASE WHEN overall_confidence BETWEEN 0.65 AND 0.84 THEN 1 ELSE 0 END) as medium_confidence,
                    SUM(CASE WHEN overall_confidence < 0.65 THEN 1 ELSE 0 END) as low_confidence,
                    SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) as needs_review,
                    SUM(CASE WHEN manual_override IS NOT NULL THEN 1 ELSE 0 END) as manual_overrides,
                    AVG(overall_confidence) as avg_confidence
                FROM trip_status_intelligence tsi
                JOIN trips t ON tsi.trip_id = t.id
                WHERE tsi.host_id = ? 
                AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            `, [hostId], (err, summary) => {
                resolve(err ? {} : summary);
            });
        });
    }
}

module.exports = EnhancedSmartStatus;