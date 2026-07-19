import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useUser } from "@clerk/react";

export type DbProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  currentXp: number;
  level: number;
  viewedChaptersCount: number;
};

type UserProfileContextType = {
  dbProfile: DbProfile | null;
  refreshProfile: () => void;
  updateXp: (currentXp: number, level: number) => void;
  incrementViewedChapters: () => void;
};

const UserProfileContext = createContext<UserProfileContextType>({
  dbProfile: null,
  refreshProfile: () => {},
  updateXp: () => {},
  incrementViewedChapters: () => {},
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
            viewedChaptersCount: d.viewedChaptersCount ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  const updateXp = useCallback((currentXp: number, level: number) => {
    setDbProfile((prev) =>
      prev
        ? { ...prev, currentXp, level }
        : { displayName: null, avatarUrl: null, currentXp, level, viewedChaptersCount: 0 }
    );
  }, []);

  const incrementViewedChapters = useCallback(() => {
    if (!user) return;
    // Optimistic update
    setDbProfile((prev) =>
      prev
        ? { ...prev, viewedChaptersCount: prev.viewedChaptersCount + 1 }
        : { displayName: null, avatarUrl: null, currentXp: 0, level: 1, viewedChaptersCount: 1 }
    );
    // Persist to server
    fetch("/api/profile/viewed-chapter", { method: "POST" }).catch(() => {});
  }, [user]);

  useEffect(() => {
    setDbProfile(null);
    fetchProfile();
  }, [user?.id, fetchProfile]);

  return (
    <UserProfileContext.Provider value={{ dbProfile, refreshProfile: fetchProfile, updateXp, incrementViewedChapters }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserProfileContext);
}
