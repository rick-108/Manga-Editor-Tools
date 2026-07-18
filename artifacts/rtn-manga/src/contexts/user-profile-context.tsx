import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useUser } from "@clerk/react";

export type DbProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  currentXp: number;
  level: number;
};

type UserProfileContextType = {
  dbProfile: DbProfile | null;
  refreshProfile: () => void;
};

const UserProfileContext = createContext<UserProfileContextType>({
  dbProfile: null,
  refreshProfile: () => {},
});

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [dbProfile, setDbProfile] = useState<DbProfile | null>(null);

  const fetchProfile = useCallback(() => {
    if (!user) return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setDbProfile({
            displayName: d.displayName ?? null,
            avatarUrl: d.avatarUrl ?? null,
            currentXp: d.currentXp ?? 0,
            level: d.level ?? 1,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    setDbProfile(null);
    fetchProfile();
  }, [user?.id, fetchProfile]);

  return (
    <UserProfileContext.Provider value={{ dbProfile, refreshProfile: fetchProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserProfileContext);
}
