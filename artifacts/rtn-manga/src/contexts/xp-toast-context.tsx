import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";

type XpToastContextType = {
  showXpToast: (amount: number) => void;
};

const XpToastContext = createContext<XpToastContextType>({ showXpToast: () => {} });

type Toast = { id: number; amount: number };

export function XpToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = { current: 0 };

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showXpToast = useCallback((amount: number) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, amount }]); // max 3 at once
    setTimeout(() => dismiss(id), 2200);
  }, [dismiss]);

  return (
    <XpToastContext.Provider value={{ showXpToast }}>
      {children}

      {/* XP Toast Overlay */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <XpToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </XpToastContext.Provider>
  );
}

function XpToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, y: -30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, y: -30 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      drag="y"
      dragConstraints={{ top: -80, bottom: 20 }}
      dragElastic={0.3}
      onDragEnd={(_, info) => { if (info.offset.y < -40) onDismiss(); }}
      className="pointer-events-auto cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-2.5 px-6 py-3.5 rounded-full shadow-2xl shadow-yellow-500/30 font-bold text-xl"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #eab308 50%, #f59e0b 100%)",
          color: "#1a0a00",
        }}
      >
        <Zap className="w-5 h-5 fill-current" />
        <span>+{toast.amount} XP</span>
      </div>
    </motion.div>
  );
}

export function useXpToast() {
  return useContext(XpToastContext);
}
