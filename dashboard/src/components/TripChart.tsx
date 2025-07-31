import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TripRecord } from '@/types';
import { format, parseISO } from 'date-fns';

interface TripChartProps {
  trips: TripRecord[];
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  totalRecords: number;
  status: 'success' | 'failure';
  summary: string;
}

export default function TripChart({ trips }: TripChartProps) {
  const chartData = useMemo(() => {
    if (!trips || trips.length === 0) return [];

    // Sort trips by date and prepare chart data
    const sortedTrips = [...trips].sort((a, b) => 
      new Date(a.scrapeDate).getTime() - new Date(b.scrapeDate).getTime()
    );

    return sortedTrips.map((trip): ChartDataPoint => {
      let displayDate: string;
      try {
        displayDate = format(parseISO(trip.scrapeDate), 'MMM dd');
      } catch {
        // Fallback if date parsing fails
        displayDate = trip.scrapeDate.split('T')[0];
      }

      return {
        date: trip.scrapeDate,
        displayDate,
        totalRecords: trip.status === 'success' ? trip.totalRecords : 0,
        status: trip.status,
        summary: trip.summary
      };
    });
  }, [trips]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.displayDate}</p>
          <p className={`text-sm ${data.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            Status: {data.status}
          </p>
          <p className="text-sm text-gray-600">
            Records: {data.totalRecords}
          </p>
          <p className="text-sm text-gray-500 max-w-xs">
            {data.summary}
          </p>
        </div>
      );
    }
    return null;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No data available for chart
      </div>
    );
  }

  // Calculate some statistics
  const successfulTrips = chartData.filter(d => d.status === 'success');
  const totalRecords = successfulTrips.reduce((sum, d) => sum + d.totalRecords, 0);
  const avgRecords = successfulTrips.length > 0 ? Math.round(totalRecords / successfulTrips.length) : 0;
  const maxRecords = Math.max(...chartData.map(d => d.totalRecords));

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Trips</p>
          <p className="text-lg font-semibold text-gray-900">{chartData.length}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Records</p>
          <p className="text-lg font-semibold text-gray-900">{totalRecords}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Records</p>
          <p className="text-lg font-semibold text-gray-900">{avgRecords}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Max Records</p>
          <p className="text-lg font-semibold text-gray-900">{maxRecords}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="displayDate" 
              tick={{ fontSize: 12 }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="totalRecords" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              name="Total Records"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Success Rate Indicator */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Successful: {successfulTrips.length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Failed: {chartData.length - successfulTrips.length}</span>
          </div>
        </div>
        <div>
          Success Rate: {chartData.length > 0 ? Math.round((successfulTrips.length / chartData.length) * 100) : 0}%
        </div>
      </div>
    </div>
  );
}