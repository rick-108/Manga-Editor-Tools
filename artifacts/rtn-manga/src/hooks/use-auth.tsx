import { createContext, useContext, useState, ReactNode } from "react";

// Only publisher token remains — user auth is handled by Clerk
interface AuthContextType {
  publisherToken: string | null;
  setPublisherToken: (token: string | null) => void;
  logoutPublisher: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [publisherToken, setPublisherTokenState] = useState<string | null>(
    () => { try { return localStorage.getItem("rtn_publisher_token"); } catch { return null; } }
  );

  const setPublisherToken = (newToken: string | null) => {
    try {
      if (newToken) localStorage.setItem("rtn_publisher_token", newToken);
      else localStorage.removeItem("rtn_publisher_token");
    } catch {}
    setPublisherTokenState(newToken);
  };

  const logoutPublisher = () => setPublisherToken(null);

  return (
    <AuthContext.Provider value={{ publisherToken, setPublisherToken, logoutPublisher }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
