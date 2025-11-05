import "jsr:@std/dotenv/load";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") || "http://localhost:8000/api/CalendarSync/oauth/callback";

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string }>;
}

export class GoogleCalendarAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  static getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar",
      access_type: "offline",
      prompt: "consent",
      ...(state && { state }),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  static async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    return await response.json();
  }

  static async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    return await response.json();
  }

  async listCalendars(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list calendars: ${error}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  async listEvents(timeMin?: Date, timeMax?: Date): Promise<GoogleCalendarEvent[]> {
    // First, get all calendars the user has access to
    const calendars = await this.listCalendars();
    
    // Fetch events from all calendars in parallel
    const allEventsPromises = calendars.map(async (calendar) => {
      const params = new URLSearchParams({
        maxResults: "100",
        singleEvents: "true",
        orderBy: "startTime",
        ...(timeMin && { timeMin: timeMin.toISOString() }),
        ...(timeMax && { timeMax: timeMax.toISOString() }),
      });

      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.warn(`Failed to fetch events from calendar ${calendar.summary}: ${response.statusText}`);
          return [];
        }

        const data = await response.json();
        const events = data.items || [];
        
        // Add calendar info to each event for reference
        return events.map((event: any) => ({
          ...event,
          calendarId: calendar.id,
          calendarName: calendar.summary,
        }));
      } catch (error) {
        console.warn(`Error fetching events from calendar ${calendar.summary}:`, error);
        return [];
      }
    });

    // Wait for all calendar event fetches to complete
    const allEventsArrays = await Promise.all(allEventsPromises);
    
    // Flatten the array of arrays into a single array
    const allEvents = allEventsArrays.flat();
    
    // Sort by start time
    allEvents.sort((a, b) => {
      const aStart = a.start?.dateTime || a.start?.date;
      const bStart = b.start?.dateTime || b.start?.date;
      return new Date(aStart).getTime() - new Date(bStart).getTime();
    });
    
    return allEvents;
  }

  async createEvent(event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    return await response.json();
  }

  async updateEvent(eventId: string, event: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update event: ${error}`);
    }

    return await response.json();
  }

  async deleteEvent(eventId: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete event: ${error}`);
    }
  }
}
