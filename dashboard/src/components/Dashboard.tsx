import { useState, useEffect } from 'react';
import { User as UserType } from '@/types';
import { api } from '@/services/api';
import { apiAuth } from '@/services/api-auth';
import { authService } from '@/services/auth';
import { TripRecord, ListTripsResponse } from '@/types';
import TripsTable from './TripsTable';
import TripChart from './TripChart';
import { LogOut, RefreshCw, AlertCircle, Play } from 'lucide-react';

interface DashboardProps {
  user: UserType;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isTriggeringScrape, setIsTriggeringScrape] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);

  const fetchTrips = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use authenticated API if Cognito is configured, otherwise use regular API
      const response: ListTripsResponse = authService.isConfigured() 
        ? await apiAuth.getTrips()
        : await api.getTrips(user.username);
        
      setTrips(response.trips);
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('Error fetching trips:', error);
      setError(error.message || 'Failed to fetch trips');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [user.username]);

  const handleRefresh = () => {
    fetchTrips();
  };

  const handleTriggerScrape = async () => {
    try {
      setIsTriggeringScrape(true);
      setScrapeMessage(null);
      
      // Use authenticated API if Cognito is configured, otherwise use regular API
      const result = authService.isConfigured() 
        ? await apiAuth.triggerScrape()
        : await api.triggerScrape(user.username);
        
      setScrapeMessage(`Scrape triggered successfully! Event ID: ${result.eventId}`);
      
      // Automatically clear message after 5 seconds
      setTimeout(() => setScrapeMessage(null), 5000);
    } catch (error: any) {
      console.error('Error triggering scrape:', error);
      setScrapeMessage(`Failed to trigger scrape: ${error.message}`);
      
      // Clear error message after 5 seconds
      setTimeout(() => setScrapeMessage(null), 5000);
    } finally {
      setIsTriggeringScrape(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Turo-E-Pass Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome back, {user.username}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="btn-secondary flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleTriggerScrape}
                disabled={isTriggeringScrape}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors duration-200"
              >
                <Play className={`h-4 w-4 ${isTriggeringScrape ? 'animate-pulse' : ''}`} />
                <span>{isTriggeringScrape ? 'Running...' : 'Run Scrape Now'}</span>
              </button>
              <button
                onClick={onLogout}
                className="btn-primary flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Status Bar */}
        <div className="px-4 py-4 sm:px-0">
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Total Trips: {trips.length}
                  </p>
                  <p className="text-sm text-gray-500">
                    Success Rate: {trips.length > 0 ? Math.round((trips.filter(t => t.status === 'success').length / trips.length) * 100) : 0}%
                  </p>
                </div>
                {lastUpdated && (
                  <div>
                    <p className="text-sm text-gray-500">
                      Last updated: {lastUpdated.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-4">
                {error && (
                  <div className="flex items-center space-x-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}
                {scrapeMessage && (
                  <div className={`flex items-center space-x-2 ${scrapeMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                    <div className="h-2 w-2 rounded-full bg-current animate-pulse"></div>
                    <span className="text-sm">{scrapeMessage}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="px-4 sm:px-0">
            <div className="card p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading trips...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="px-4 sm:px-0">
            <div className="card p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Failed to load trips
              </h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!isLoading && !error && (
          <div className="px-4 sm:px-0 space-y-6">
            {trips.length === 0 ? (
              <div className="card p-8 text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No trips found
                </h3>
                <p className="text-gray-600">
                  No trip data available for user "{user.username}". 
                  Make sure the scraper has run successfully.
                </p>
              </div>
            ) : (
              <>
                {/* Chart Section */}
                <div className="card p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Records Over Time
                  </h2>
                  <TripChart trips={trips} />
                </div>

                {/* Table Section */}
                <div className="card p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Trip History
                  </h2>
                  <TripsTable trips={trips} userId={user.username} />
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}