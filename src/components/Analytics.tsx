import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { supabase } from '../lib/supabase';
import type { Bot } from '../types';
import { ExternalLink } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface AnalyticsProps {
  bot: Bot;
}

interface LinkStats {
  url: string;
  total_clicks: number;
  unique_users: number;
  ctr: number;
  first_click: string;
  last_click: string;
  is_extracted: boolean;
}

export function Analytics({ bot }: AnalyticsProps) {
  const [dailyStats, setDailyStats] = useState<{ date: string; count: number }[]>([]);
  const [totalStarts, setTotalStarts] = useState(0);
  const [linkStats, setLinkStats] = useState<LinkStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [bot.id]);

  const fetchAnalytics = async () => {
    try {
      // Get the date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get all users for total count
      const { data: allUsers, error: allUsersError } = await supabase
        .from('bot_users')
        .select('id')
        .eq('bot_id', bot.id);

      if (allUsersError) throw allUsersError;

      // Get users for the last 30 days
      const { data: recentUsers, error: recentUsersError } = await supabase
        .from('bot_users')
        .select('created_at')
        .eq('bot_id', bot.id)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (recentUsersError) throw recentUsersError;

      // Get link stats including both inline buttons and extracted links
      const { data: linkStatsData, error: linkStatsError } = await supabase
        .rpc('get_link_click_stats', { p_bot_id: bot.id, p_days: 30 });

      if (linkStatsError) {
        console.error('Error fetching link stats:', linkStatsError);
      }

      // Group by date and count
      const stats = recentUsers.reduce((acc: { [key: string]: number }, item) => {
        const date = new Date(item.created_at).toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      // Fill in missing dates with 0
      const allStats = [];
      for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        allStats.push({
          date: dateStr,
          count: stats[dateStr] || 0
        });
      }

      setDailyStats(allStats);
      setTotalStarts(allUsers?.length || 0);
      setLinkStats(linkStatsData || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setLoading(false);
    }
  };

  const chartData = {
    labels: dailyStats.map(stat => {
      const date = new Date(stat.date);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }),
    datasets: [
      {
        label: 'Nombre de /start',
        data: dailyStats.map(stat => stat.count),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Utilisation de la commande /start (30 derniers jours)'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Statistiques globales</h3>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{totalStarts}</p>
            <p className="text-sm text-blue-600">Nombre total de /start</p>
          </div>
        </div>
        
        <div className="h-[400px]">
          <Bar data={chartData} options={options} />
        </div>
      </div>
    </div>
  );
}
