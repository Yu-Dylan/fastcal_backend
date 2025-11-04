import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = "Session" + ".";

/**
 * @concept Session
 * @purpose authenticate users and manage login sessions
 * @principle users must log in with Google OAuth to get a session token;
 * all requests include the session token to verify identity
 */

type SessionToken = string;
type User = string;

interface SessionDoc {
  _id: ID;
  token: SessionToken;
  user: User;
  email: string;
  name: string;
  createdAt: Date;
  expiresAt: Date;
}

export default class SessionConcept {
  private sessions: Collection<SessionDoc>;

  constructor(private readonly db: Db) {
    this.sessions = this.db.collection(PREFIX + "sessions");
  }

  /**
   * Create a new session after successful Google OAuth login
   */
  async create(params: {
    user: User;
    email: string;
    name: string;
  }): Promise<{ token: SessionToken; user: User } | { error: string }> {
    const { user, email, name } = params;

    try {
      // Generate a session token
      const token = freshID();
      
      // Session expires in 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const sessionDoc: SessionDoc = {
        _id: freshID(),
        token,
        user,
        email,
        name,
        createdAt: new Date(),
        expiresAt,
      };

      await this.sessions.insertOne(sessionDoc);

      return { token, user };
    } catch (e: any) {
      console.error("SessionConcept.create - Error:", e);
      return { error: "Failed to create session." };
    }
  }

  /**
   * Verify a session token and return the user
   */
  async verify(params: {
    token: SessionToken;
  }): Promise<{ user: User; email: string; name: string } | { error: string }> {
    const { token } = params;

    try {
      const session = await this.sessions.findOne({ token });

      if (!session) {
        return { error: "Invalid session token." };
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        await this.sessions.deleteOne({ _id: session._id });
        return { error: "Session expired." };
      }

      return {
        user: session.user,
        email: session.email,
        name: session.name,
      };
    } catch (e: any) {
      console.error("SessionConcept.verify - Error:", e);
      return { error: "Failed to verify session." };
    }
  }

  /**
   * End a session (logout)
   */
  async end(params: {
    token: SessionToken;
  }): Promise<Empty | { error: string }> {
    const { token } = params;

    try {
      await this.sessions.deleteOne({ token });
      return {};
    } catch (e: any) {
      console.error("SessionConcept.end - Error:", e);
      return { error: "Failed to end session." };
    }
  }

  /**
   * Get session info
   */
  async getSession(params: {
    token: SessionToken;
  }): Promise<{ user: User; email: string; name: string } | { error: string }> {
    return this.verify(params);
  }

  /**
   * Clean up expired sessions (maintenance)
   */
  async cleanupExpired(): Promise<{ deletedCount: number } | { error: string }> {
    try {
      const result = await this.sessions.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      return { deletedCount: result.deletedCount || 0 };
    } catch (e: any) {
      console.error("SessionConcept.cleanupExpired - Error:", e);
      return { error: "Failed to cleanup expired sessions." };
    }
  }
}
