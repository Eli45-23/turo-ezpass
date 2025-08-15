const Redis = require('ioredis');
const NodeCache = require('node-cache');
const winston = require('winston');

// Configure logger for cache operations
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/cache.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * Multi-tier Cache Manager
 * Implements L1 (in-memory) and L2 (Redis) caching for optimal performance
 */
class CacheManager {
    constructor(options = {}) {
        this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
        this.keyPrefix = options.keyPrefix || 'turo:toll:';
        this.defaultTTL = options.defaultTTL || 300; // 5 minutes
        
        // Initialize Redis connection
        this.redis = new Redis(this.redisUrl, {
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000
        });
        
        // Initialize local cache (L1)
        this.localCache = new NodeCache({
            stdTTL: 60, // 1 minute default for L1 cache
            checkperiod: 30, // Check for expired keys every 30 seconds
            useClones: false,
            maxKeys: 1000 // Limit memory usage
        });
        
        // Cache metrics
        this.metrics = {
            l1Hits: 0,
            l1Misses: 0,
            l2Hits: 0,
            l2Misses: 0,
            totalRequests: 0,
            errors: 0,
            avgResponseTime: 0
        };
        
        this.responseTimes = [];
        this.maxResponseTimeHistory = 1000;
        
        // Cache warming strategies
        this.warmingStrategies = new Map();
        
        // Initialize Redis event handlers
        this.setupRedisHandlers();
        
        // Start metrics collection
        setInterval(() => this.collectMetrics(), 30000);
        
        logger.info('Cache Manager initialized');
    }

    setupRedisHandlers() {
        this.redis.on('connect', () => {
            logger.info('Connected to Redis');
        });
        
        this.redis.on('error', (error) => {
            logger.error('Redis error:', error);
            this.metrics.errors++;
        });
        
        this.redis.on('reconnecting', () => {
            logger.warn('Reconnecting to Redis');
        });
        
        this.redis.on('close', () => {
            logger.warn('Redis connection closed');
        });
    }

    /**
     * Get value from cache with L1/L2 tier support
     */
    async get(key, options = {}) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        
        try {
            const fullKey = this.keyPrefix + key;
            
            // Check L1 cache first (fastest)
            let value = this.localCache.get(fullKey);
            if (value !== undefined) {
                this.metrics.l1Hits++;
                this.recordResponseTime(Date.now() - startTime);
                return this.deserialize(value);
            }
            
            this.metrics.l1Misses++;
            
            // Check L2 cache (Redis)
            if (this.redis.status === 'ready') {
                const redisValue = await this.redis.get(fullKey);
                if (redisValue !== null) {
                    this.metrics.l2Hits++;
                    
                    // Store in L1 cache for future requests
                    const deserializedValue = this.deserialize(redisValue);
                    this.localCache.set(fullKey, redisValue, options.l1TTL || 60);
                    
                    this.recordResponseTime(Date.now() - startTime);
                    return deserializedValue;
                }
            }
            
            this.metrics.l2Misses++;
            this.recordResponseTime(Date.now() - startTime);
            return null;
            
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache get error:', { key, error: error.message });
            this.recordResponseTime(Date.now() - startTime);
            return null;
        }
    }

    /**
     * Set value in both cache tiers
     */
    async set(key, value, ttl = null, options = {}) {
        const startTime = Date.now();
        
        try {
            const fullKey = this.keyPrefix + key;
            const serializedValue = this.serialize(value);
            const cacheTTL = ttl || this.defaultTTL;
            
            // Set in L1 cache
            this.localCache.set(fullKey, serializedValue, options.l1TTL || Math.min(cacheTTL, 60));
            
            // Set in L2 cache (Redis)
            if (this.redis.status === 'ready') {
                if (cacheTTL > 0) {
                    await this.redis.setex(fullKey, cacheTTL, serializedValue);
                } else {
                    await this.redis.set(fullKey, serializedValue);
                }
            }
            
            this.recordResponseTime(Date.now() - startTime);
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache set error:', { key, error: error.message });
            this.recordResponseTime(Date.now() - startTime);
            return false;
        }
    }

    /**
     * Delete from both cache tiers
     */
    async del(key) {
        try {
            const fullKey = this.keyPrefix + key;
            
            // Delete from L1
            this.localCache.del(fullKey);
            
            // Delete from L2
            if (this.redis.status === 'ready') {
                await this.redis.del(fullKey);
            }
            
            return true;
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache delete error:', { key, error: error.message });
            return false;
        }
    }

    /**
     * Cache-aside pattern with automatic population
     */
    async getOrSet(key, fetchFunction, ttl = null, options = {}) {
        const startTime = Date.now();
        
        try {
            // Try to get from cache first
            let value = await this.get(key, options);
            if (value !== null) {
                return value;
            }
            
            // Cache miss - fetch data
            logger.info(`Cache miss for key: ${key}, fetching data`);
            value = await fetchFunction();
            
            if (value !== null && value !== undefined) {
                // Store in cache
                await this.set(key, value, ttl, options);
            }
            
            this.recordResponseTime(Date.now() - startTime);
            return value;
            
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache getOrSet error:', { key, error: error.message });
            this.recordResponseTime(Date.now() - startTime);
            
            // On error, try to fetch directly
            try {
                return await fetchFunction();
            } catch (fetchError) {
                logger.error('Fallback fetch error:', { key, error: fetchError.message });
                throw fetchError;
            }
        }
    }

    /**
     * Bulk cache operations
     */
    async mget(keys) {
        try {
            const fullKeys = keys.map(key => this.keyPrefix + key);
            const results = {};
            
            // Check L1 cache for all keys
            const l1Results = {};
            const missedKeys = [];
            
            for (const fullKey of fullKeys) {
                const value = this.localCache.get(fullKey);
                if (value !== undefined) {
                    const originalKey = fullKey.replace(this.keyPrefix, '');
                    l1Results[originalKey] = this.deserialize(value);
                    this.metrics.l1Hits++;
                } else {
                    missedKeys.push(fullKey);
                    this.metrics.l1Misses++;
                }
            }
            
            // Check L2 cache for missed keys
            if (missedKeys.length > 0 && this.redis.status === 'ready') {
                const redisValues = await this.redis.mget(...missedKeys);
                
                for (let i = 0; i < missedKeys.length; i++) {
                    const fullKey = missedKeys[i];
                    const originalKey = fullKey.replace(this.keyPrefix, '');
                    const value = redisValues[i];
                    
                    if (value !== null) {
                        const deserializedValue = this.deserialize(value);
                        results[originalKey] = deserializedValue;
                        
                        // Store in L1 for future requests
                        this.localCache.set(fullKey, value, 60);
                        this.metrics.l2Hits++;
                    } else {
                        results[originalKey] = null;
                        this.metrics.l2Misses++;
                    }
                }
            }
            
            // Combine L1 and L2 results
            return { ...results, ...l1Results };
            
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache mget error:', { keys, error: error.message });
            return {};
        }
    }

    /**
     * Invalidate cache by pattern
     */
    async invalidatePattern(pattern) {
        try {
            const fullPattern = this.keyPrefix + pattern;
            
            // Clear from L1 cache
            const l1Keys = this.localCache.keys();
            const matchedL1Keys = l1Keys.filter(key => key.includes(pattern));
            this.localCache.del(matchedL1Keys);
            
            // Clear from L2 cache
            if (this.redis.status === 'ready') {
                const keys = await this.redis.keys(fullPattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            
            logger.info(`Invalidated ${matchedL1Keys.length} L1 keys and Redis pattern: ${fullPattern}`);
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            logger.error('Cache invalidatePattern error:', { pattern, error: error.message });
            return false;
        }
    }

    /**
     * Register cache warming strategy
     */
    registerWarmingStrategy(name, strategy) {
        this.warmingStrategies.set(name, strategy);
        logger.info(`Registered cache warming strategy: ${name}`);
    }

    /**
     * Execute cache warming
     */
    async warmCache(strategyName) {
        try {
            const strategy = this.warmingStrategies.get(strategyName);
            if (!strategy) {
                logger.warn(`Cache warming strategy not found: ${strategyName}`);
                return false;
            }
            
            logger.info(`Starting cache warming with strategy: ${strategyName}`);
            await strategy(this);
            logger.info(`Completed cache warming with strategy: ${strategyName}`);
            
            return true;
        } catch (error) {
            logger.error('Cache warming error:', { strategy: strategyName, error: error.message });
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const totalHits = this.metrics.l1Hits + this.metrics.l2Hits;
        const totalMisses = this.metrics.l1Misses + this.metrics.l2Misses;
        const hitRate = totalHits / (totalHits + totalMisses) || 0;
        const l1HitRate = this.metrics.l1Hits / (this.metrics.l1Hits + this.metrics.l1Misses) || 0;
        const l2HitRate = this.metrics.l2Hits / (this.metrics.l2Hits + this.metrics.l2Misses) || 0;
        
        return {
            ...this.metrics,
            hitRate: (hitRate * 100).toFixed(2) + '%',
            l1HitRate: (l1HitRate * 100).toFixed(2) + '%',
            l2HitRate: (l2HitRate * 100).toFixed(2) + '%',
            l1Size: this.localCache.keys().length,
            redisConnected: this.redis.status === 'ready',
            avgResponseTimeMs: this.metrics.avgResponseTime.toFixed(2)
        };
    }

    /**
     * Flush all caches
     */
    async flush() {
        try {
            // Flush L1
            this.localCache.flushAll();
            
            // Flush L2 (only keys with our prefix)
            if (this.redis.status === 'ready') {
                const keys = await this.redis.keys(this.keyPrefix + '*');
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            
            logger.info('Cache flushed successfully');
            return true;
        } catch (error) {
            logger.error('Cache flush error:', error.message);
            return false;
        }
    }

    serialize(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            logger.error('Serialization error:', error.message);
            return null;
        }
    }

    deserialize(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            logger.error('Deserialization error:', error.message);
            return value;
        }
    }

    recordResponseTime(duration) {
        this.responseTimes.push(duration);
        if (this.responseTimes.length > this.maxResponseTimeHistory) {
            this.responseTimes.shift();
        }
        
        this.metrics.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    }

    collectMetrics() {
        const stats = this.getStats();
        logger.info('Cache metrics:', stats);
    }

    async shutdown() {
        logger.info('Shutting down cache manager...');
        
        try {
            this.localCache.flushAll();
            this.localCache.close();
            
            if (this.redis) {
                await this.redis.quit();
            }
            
            logger.info('Cache manager shut down successfully');
        } catch (error) {
            logger.error('Cache shutdown error:', error.message);
        }
    }
}

// Cache key generators for common patterns
class CacheKeys {
    static dashboardSummary(hostId) {
        return `dashboard:summary:${hostId}`;
    }
    
    static tollCharges(hostId, filters = {}) {
        const filterKey = Object.keys(filters).sort().map(k => `${k}:${filters[k]}`).join('|');
        return `toll_charges:${hostId}:${filterKey}`;
    }
    
    static trips(hostId, filters = {}) {
        const filterKey = Object.keys(filters).sort().map(k => `${k}:${filters[k]}`).join('|');
        return `trips:${hostId}:${filterKey}`;
    }
    
    static tollAccounts(hostId) {
        return `toll_accounts:${hostId}`;
    }
    
    static analytics(hostId, type, period) {
        return `analytics:${hostId}:${type}:${period}`;
    }
    
    static transponderMappings(hostId) {
        return `transponders:${hostId}`;
    }
    
    static invoices(hostId, status = null) {
        return status ? `invoices:${hostId}:${status}` : `invoices:${hostId}`;
    }
    
    static notifications(hostId) {
        return `notifications:${hostId}`;
    }
}

module.exports = { CacheManager, CacheKeys };