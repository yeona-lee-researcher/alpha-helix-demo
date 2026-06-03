import { useState } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useTheme } from "../alpha/ThemeContext";
import { useNotificationStore } from "../store/useNotificationStore";
import { useLanguage } from "../i18n/LanguageContext";

const TYPE_CFG = {
  strategy: { color: "#3B82F6", bg: "#EFF6FF", emoji: "🎯" },
  backtest: { color: "#10B981", bg: "#ECFDF5", emoji: "📊" },
  regime:   { color: "#F59E0B", bg: "#FFFBEB", emoji: "🌍" },
  trust:    { color: "#8B5CF6", bg: "#F5F3FF", emoji: "🛡️" },
  briefing: { color: "#EC4899", bg: "#FDF2F8", emoji: "✨" },
  system:   { color: "#EF4444", bg: "#FEF2F2", emoji: "⚙️" },
};

const FILTER_KEYS = ["all", "unread", "strategy", "backtest", "regime", "briefing", "system"];

function timeAgo(iso, t) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)      return t("notifications.timeJustNow");
  if (d < 3_600_000)   return t("notifications.timeMinAgo",  { n: Math.floor(d / 60_000) });
  if (d < 86_400_000)  return t("notifications.timeHourAgo", { n: Math.floor(d / 3_600_000) });
  if (d < 172_800_000) return t("notifications.timeYesterday");
  return t("notifications.timeDayAgo", { n: Math.floor(d / 86_400_000) });
}

function groupByDate(list, t) {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const todayItems  = list.filter(n => new Date(n.time).toDateString() === today);
  const yItems      = list.filter(n => new Date(n.time).toDateString() === yesterday);
  const olderItems  = list.filter(n => {
    const d = new Date(n.time).toDateString();
    return d !== today && d !== yesterday;
  });
  const result = [];
  if (todayItems.length)  result.push({ label: t("notifications.dateToday"),     items: todayItems });
  if (yItems.length)      result.push({ label: t("notifications.dateYesterday"), items: yItems });
  if (olderItems.length)  result.push({ label: t("notifications.dateOlder"),     items: olderItems });
  return result;
}

export default function NotificationsPage() {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { notifications, markRead, markAllRead, remove, clearAll } = useNotificationStore();
  const [filter, setFilter]   = useState("all");
  const [hovered, setHovered] = useState(null);
  const [delHov, setDelHov]   = useState(null);

  const unread = notifications.filter(n => !n.read).length;

  const filtered = notifications.filter(n => {
    if (filter === "all")    return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });

  const groups = groupByDate(filtered, t);

  const filterCount = (key) => {
    if (key === "all")    return notifications.length;
    if (key === "unread") return unread;
    return notifications.filter(n => n.type === key).length;
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "calc(100vh - 44px)", padding: "36px 40px 80px" }}>
      <style>{`
        @keyframes ah-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.75)} }
        @keyframes ah-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 32, flexWrap: "wrap", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 17, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
          }}>
            <Bell size={24} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
              background: "linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {t("notifications.pageTitle")}
            </h1>
            <p style={{
              margin: "5px 0 0", fontSize: 13, fontWeight: 500,
              color: unread > 0 ? "#6366f1" : "#64748B",
            }}>
              {unread > 0 ? t("notifications.unreadCount", { count: unread }) : t("notifications.allRead")}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {unread > 0 && (
            <ActionBtn
              icon={<CheckCheck size={14} />}
              label={t("notifications.markAllRead")}
              color="#3B82F6"
              hoverBg="#EFF6FF"
              hoverBorder="#BFDBFE"
              onClick={markAllRead}
            />
          )}
          {notifications.length > 0 && (
            <ActionBtn
              icon={<Trash2 size={14} />}
              label={t("notifications.clearAll")}
              color="#94A3B8"
              hoverBg="#FEF2F2"
              hoverBorder="#FECACA"
              hoverColor="#EF4444"
              onClick={clearAll}
            />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 30, flexWrap: "wrap" }}>
        {FILTER_KEYS.map(key => {
          const cnt    = filterCount(key);
          const active = filter === key;
          return (
            <button key={key} onClick={() => setFilter(key)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 15px", borderRadius: 20, border: "none",
              background: active
                ? "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)"
                : "rgba(148,163,184,0.12)",
              color:       active ? "white" : "#475569",
              fontSize: 13, fontWeight: active ? 700 : 500,
              cursor: "pointer",
              boxShadow: active ? "0 3px 12px rgba(99,102,241,0.28)" : "none",
              transition: "all 0.15s",
            }}>
              {t(`notifications.filters.${key}`)}
              {cnt > 0 && (
                <span style={{
                  background: active ? "rgba(255,255,255,0.25)" : "rgba(100,116,139,0.14)",
                  color: active ? "white" : "#64748B",
                  borderRadius: 10, padding: "0 6px",
                  fontSize: 11, fontWeight: 700, lineHeight: "18px",
                }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 780 }}>
        {groups.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {groups.map(group => (
              <section key={group.label}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#94A3B8",
                    textTransform: "uppercase", letterSpacing: 1.2,
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(148,163,184,0.2)" }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.items.map(n => {
                    const cfg  = TYPE_CFG[n.type] || TYPE_CFG.system;
                    const isHov = hovered === n.id;
                    return (
                      <div
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 14,
                          padding: "17px 18px",
                          background: n.read ? "rgba(243,244,246,0.7)" : "white",
                          borderRadius: 16,
                          border: n.read
                            ? "1px solid rgba(226,232,240,0.5)"
                            : "1px solid rgba(203,213,225,0.9)",
                          boxShadow: isHov
                            ? "0 8px 28px rgba(0,0,0,0.11)"
                            : n.read ? "none" : "0 2px 10px rgba(0,0,0,0.06)",
                          transform: isHov ? "translateY(-2px)" : "none",
                          transition: "transform 0.15s ease, box-shadow 0.15s ease",
                          cursor: "pointer",
                          animation: "ah-fadeUp 0.22s ease",
                          position: "relative",
                        }}
                      >
                        <div style={{
                          width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                          background: cfg.bg,
                          border: `1.5px solid ${cfg.color}28`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20,
                        }}>
                          {cfg.emoji}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            <span style={{
                              background: cfg.bg, color: cfg.color,
                              fontSize: 10, fontWeight: 800,
                              textTransform: "uppercase", letterSpacing: 0.5,
                              padding: "2px 9px", borderRadius: 10,
                              border: `1px solid ${cfg.color}30`,
                            }}>
                              {t(`notifications.types.${n.type}`)}
                            </span>
                            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
                              {timeAgo(n.time, t)}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 14, lineHeight: 1.35, marginBottom: 5,
                            fontWeight: n.read ? 400 : 600,
                            color: n.read ? "#94A3B8" : "#0F172A",
                          }}>
                            {n.title}
                          </div>
                          <div style={{
                            fontSize: 13, color: n.read ? "#CBD5E1" : "#64748B", lineHeight: 1.6,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {n.body}
                          </div>
                        </div>

                        <div style={{
                          display: "flex", flexDirection: "column",
                          alignItems: "flex-end", gap: 10, flexShrink: 0,
                        }}>
                          {!n.read && (
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: cfg.color, display: "block",
                              animation: "ah-pulse 2s ease-in-out infinite",
                            }} />
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); remove(n.id); }}
                            onMouseEnter={() => setDelHov(n.id)}
                            onMouseLeave={() => setDelHov(null)}
                            style={{
                              width: 28, height: 28, borderRadius: 8, border: "none",
                              background: delHov === n.id ? "#FEE2E2" : "#F1F5F9",
                              color:      delHov === n.id ? "#EF4444" : "#94A3B8",
                              cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              opacity: isHov ? 1 : 0,
                              transition: "opacity 0.12s, background 0.12s, color 0.12s",
                              pointerEvents: isHov ? "auto" : "none",
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, color, hoverBg, hoverBorder, hoverColor, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "9px 18px", borderRadius: 12,
        background: hov ? hoverBg : "white",
        border: `1.5px solid ${hov ? (hoverBorder || hoverBg) : "#E2E8F0"}`,
        color: hov ? (hoverColor || color) : color,
        fontSize: 13, fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ filter }) {
  const { t } = useLanguage();
  const emojis = { all: "🔔", unread: "✅", strategy: "🎯", backtest: "📊", regime: "🌍", briefing: "✨", system: "⚙️" };
  const emoji = emojis[filter] || "🔔";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "80px 0", gap: 18,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: "linear-gradient(135deg,#EFF6FF 0%,#E0E7FF 100%)",
        border: "1.5px solid rgba(99,102,241,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36,
        boxShadow: "0 4px 16px rgba(99,102,241,0.1)",
      }}>
        {emoji}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 7 }}>
          {t(`notifications.empty.${filter}.title`)}
        </div>
        <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>
          {t(`notifications.empty.${filter}.sub`)}
        </div>
      </div>
    </div>
  );
}
