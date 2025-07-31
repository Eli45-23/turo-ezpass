import { useState } from 'react';
import { TripRecord } from '@/types';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { Eye, CheckCircle, XCircle, Loader } from 'lucide-react';

interface TripsTableProps {
  trips: TripRecord[];
  userId: string;
}

interface TripDetailModalProps {
  trip: TripRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

function TripDetailModal({ trip, isOpen, onClose }: TripDetailModalProps) {
  if (!isOpen || !trip) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Trip Details - {format(new Date(trip.scrapeDate), 'MMM dd, yyyy')}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">User ID</label>
                <p className="mt-1 text-sm text-gray-900">{trip.userId}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1 flex items-center">
                  {trip.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 mr-2" />
                  )}
                  <span className={`text-sm capitalize ${trip.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                    {trip.status}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Summary</label>
              <p className="mt-1 text-sm text-gray-900">{trip.summary}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Total Records</label>
              <p className="mt-1 text-sm text-gray-900">{trip.totalRecords}</p>
            </div>
            {trip.error && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Error</label>
                <p className="mt-1 text-sm text-red-600">{trip.error}</p>
              </div>
            )}
            {trip.data && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Raw Data</label>
                <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-96">
                  {JSON.stringify(trip.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TripsTable({ trips, userId }: TripsTableProps) {
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  const handleViewDetails = async (trip: TripRecord) => {
    try {
      setLoadingDetails(trip.scrapeDate);
      // Fetch full trip details
      const fullTrip = await api.getTrip(userId, trip.scrapeDate);
      setSelectedTrip(fullTrip);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error fetching trip details:', error);
      alert('Failed to load trip details');
    } finally {
      setLoadingDetails(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Records
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Summary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {trips.map((trip) => (
              <tr key={`${trip.userId}-${trip.scrapeDate}`} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatDate(trip.scrapeDate)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {trip.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 mr-2" />
                    )}
                    <span className={`text-sm capitalize ${trip.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                      {trip.status}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {trip.totalRecords}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                  {trip.summary}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <button
                    onClick={() => handleViewDetails(trip)}
                    disabled={loadingDetails === trip.scrapeDate}
                    className="btn-secondary flex items-center space-x-1 text-xs"
                  >
                    {loadingDetails === trip.scrapeDate ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    <span>View JSON</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trips.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No trips found
          </div>
        )}
      </div>

      <TripDetailModal
        trip={selectedTrip}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}