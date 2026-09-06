export interface DateRange {
  from: string;
  to: string;
}

export interface PageViewsSummary {
  currentPeriod: {
    totalViews: number;
    uniqueVisitors: number;
    loggedInViews: number;
    mobilePercent: number;
  };
  viewsByDay: { date: string; views: number; previousViews: number }[];
  heatmap: { dayOfWeek: number; hour: number; views: number }[];
  conversion: {
    venueId: string;
    venueName: string;
    views: number;
    bookings: number;
    conversionRate: number | null;
  }[];
  topSources: { source: string; views: number }[];
  topVenues: { venueId: string; venueName: string; views: number }[];
}
