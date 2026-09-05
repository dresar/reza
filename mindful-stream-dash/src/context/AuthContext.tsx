import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, UserAccount, UserRole, Patient } from "@/services/api";

interface AuthContextType {
  user: UserAccount | null;
  linkedPatient: Patient | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isTherapist: boolean;
  isParent: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  quickLogin: (role: UserRole) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setLinkedPatient: (p: Patient | null) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_USER = "adhd_auth_user";
const STORAGE_KEY_PATIENT = "adhd_auth_patient";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [linkedPatient, setLinkedPatientState] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize from localStorage or default to Terapis demo on first load
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_USER);
      const savedPatient = localStorage.getItem(STORAGE_KEY_PATIENT);
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        if (savedPatient) {
          setLinkedPatientState(JSON.parse(savedPatient));
        }
      } else {
        // Default login as Terapis for instant ready state
        const defaultUser: UserAccount = {
          id: "usr-terapis-01",
          name: "dr. Muhammad Reza, S.Kom",
          email: "terapis@adhd-care.id",
          role: "TERAPIS",
          phone: "+62 812-3456-7890",
          title_or_relation: "Terapis & Peneliti Utama UMSU",
          avatar_color: "#00D4FF",
          created_at: new Date().toISOString()
        };
        setUser(defaultUser);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(defaultUser));
      }
    } catch (e) {
      console.error("[Auth] Failed to load auth from localStorage:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setLinkedPatient = useCallback((p: Patient | null) => {
    setLinkedPatientState(p);
    if (p) {
      localStorage.setItem(STORAGE_KEY_PATIENT, JSON.stringify(p));
    } else {
      localStorage.removeItem(STORAGE_KEY_PATIENT);
    }
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.user));
        if (res.linkedPatient) {
          setLinkedPatient(res.linkedPatient);
        }
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || "Login gagal" };
    } catch (err: any) {
      return { success: false, message: err.message || "Koneksi ke backend gagal" };
    } finally {
      setIsLoading(false);
    }
  }, [setLinkedPatient]);

  const quickLogin = useCallback(async (targetRole: UserRole) => {
    setIsLoading(true);
    try {
      const res = await api.quickLogin(targetRole);
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.user));
        if (res.linkedPatient) {
          setLinkedPatient(res.linkedPatient);
        } else if (targetRole === "ORANG_TUA") {
          // Fetch first patient as fallback
          try {
            const patients = await api.getPatients();
            if (patients.length > 0) {
              setLinkedPatient(patients[0]);
            }
          } catch (e) {
            console.error("Failed to fetch fallback patient:", e);
          }
        }
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || "Quick login gagal" };
    } catch (err: any) {
      // Fallback local mock if backend is momentarily unreachable
      const fallbackUser: UserAccount = targetRole === "TERAPIS" ? {
        id: "usr-terapis-01",
        name: "dr. Muhammad Reza, S.Kom",
        email: "terapis@adhd-care.id",
        role: "TERAPIS",
        phone: "+62 812-3456-7890",
        title_or_relation: "Terapis & Peneliti Utama UMSU",
        avatar_color: "#00D4FF",
        created_at: new Date().toISOString()
      } : {
        id: "usr-ortu-01",
        name: "Bunda Siti Rahmawati",
        email: "ortu.bunda@gmail.com",
        role: "ORANG_TUA",
        phone: "+62 821-9876-5432",
        title_or_relation: "Orang Tua / Ibu Ananda Reza",
        avatar_color: "#10B981",
        created_at: new Date().toISOString()
      };
      setUser(fallbackUser);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(fallbackUser));
      return { success: true, message: `Login cepat (offline mode) sebagai ${targetRole}` };
    } finally {
      setIsLoading(false);
    }
  }, [setLinkedPatient]);

  const logout = useCallback(() => {
    setUser(null);
    setLinkedPatient(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_PATIENT);
  }, [setLinkedPatient]);

  const refreshUserData = useCallback(async () => {
    if (!user) return;
    try {
      const users = await api.getUsers();
      const fresh = users.find(u => u.id === user.id || u.email === user.email);
      if (fresh) {
        setUser(fresh);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(fresh));
      }
    } catch (err) {
      console.error("Failed to refresh user data:", err);
    }
  }, [user]);

  const role = user?.role || null;
  const isAuthenticated = !!user;
  const isTherapist = role === "TERAPIS";
  const isParent = role === "ORANG_TUA";

  return (
    <AuthContext.Provider
      value={{
        user,
        linkedPatient,
        role,
        isAuthenticated,
        isTherapist,
        isParent,
        isLoading,
        login,
        quickLogin,
        logout,
        setLinkedPatient,
        refreshUserData
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
