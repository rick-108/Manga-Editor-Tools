import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  token: string | null;
  setToken: (token: string | null) => void;
  publisherToken: string | null;
  setPublisherToken: (token: string | null) => void;
  logout: () => void;
  logoutPublisher: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(
    localStorage.getItem("rtn_user_token")
  );
  const [publisherToken, setPublisherTokenState] = useState<string | null>(
    localStorage.getItem("rtn_publisher_token")
  );

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("rtn_user_token", newToken);
    } else {
      localStorage.removeItem("rtn_user_token");
    }
    setTokenState(newToken);
  };

  const setPublisherToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("rtn_publisher_token", newToken);
    } else {
      localStorage.removeItem("rtn_publisher_token");
    }
    setPublisherTokenState(newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  const logoutPublisher = () => {
    setPublisherToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token,
        setToken,
        publisherToken,
        setPublisherToken,
        logout,
        logoutPublisher,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
