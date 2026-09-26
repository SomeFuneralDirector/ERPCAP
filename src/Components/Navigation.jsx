import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Megaphone,
  Factory,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Users,
  Activity,
  Megaphone as CampaignIcon,
  Layers,
  ClipboardList,
  Box,
  Boxes,
  PhilippinePesoIcon,
  BookCheck,
  SheetIcon,
  PhilippinePeso,
  Sparkle,
  Amphora,
  PackageCheck,
  Gauge,
} from "lucide-react";
import logotry from "../assets/logo.jpg";
import { useAuth } from "../context/AuthContext";

const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  textMuted: "#6B6B70",
  border: "#E4E4E7",
  page: "#F6F6F7",
};

const navItems = [
  {
    id: "admin",
    label: "Admin",
    icon: LayoutDashboard,
    role: "admin",
    children: [
      { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { id: "admin-finance", label: "Finance", icon: PhilippinePeso, path: "/finance" },
      { id: "admin-ledger", label: "Ledger", icon: BookCheck, path: "/ledger" },
      { id: "admin-balance_sheet", label: "Balance Sheet", icon: SheetIcon, path: "/balance_sheet" },
      { id: "admin-income_statement", label: "Income Statement", icon: BookCheck, path: "/income_statement" },
      { id: "admin-user_management", label: "User Management", icon: Users, path: "/user_management" },
      { id: "admin-logs", label: "Activity Logs", icon: Activity, path: "/activity_logs" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    role: "inventory",
    children: [
      { id: "inventory-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/inventory_db" },
      { id: "inventory-products", label: "Products", icon: Box, path: "/inventory" },
      { id: "production-rawmaterials", label: "Raw Materials", icon: Amphora, path: "/production_rm" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    role: "marketing",
    children: [
      { id: "marketing-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/marketing" },
      { id: "marketing-campaigns", label: "Campaigns", icon: CampaignIcon, path: "/marketing_camp" },
      { id: "marketing-inventory", label: "Inventory Overview", icon: Layers, path: "/marketing_io" },
      { id: "marketing-recommendation", label: "Recommendation", icon: Sparkle, path: "/marketing_reco" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: ShoppingCart,
    role: "sales",
    children: [
      { id: "sales-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/sales_db" },
      { id: "sales-transactions", label: "Transactions", icon: PhilippinePesoIcon, path: "/sales" },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    role: "production",
    children: [
      { id: "production-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/production" },
      { id: "production-transaction", label: "Transactions", icon: Boxes, path: "/production_transaction" },
      { id: "production-workorders", label: "Work Orders", icon: ClipboardList, path: "/production_wo" },
      { id: "production-finished", label: "Finished Goods", icon: PackageCheck, path: "/production_fg" },
      { id: "production-usage", label: "Raw Materials Usage", icon: Gauge, path: "/RawMaterialUsage" },
    ],
  },
];

function groupIdForPath(pathname) {
  for (const item of navItems) {
    if (item.children?.some((c) => c.path === pathname)) return item.id;
  }
  return null;
}

function childIdForPath(pathname) {
  for (const item of navItems) {
    const child = item.children?.find((c) => c.path === pathname);
    if (child) return child.id;
  }
  return "admin-dashboard";
}

function Sidebar({
  collapsed,
  onToggleCollapsed,
  showClose,
  onClose,
  active,
  openGroups,
  onToggleGroup,
  onNavigate,
  onLogout,
  filteredNavItems,
  authLoading,
  userRole,
  userDisplay,
}) {
  return (
    <aside
      className="h-full bg-white flex flex-col"
      style={{
        width: collapsed ? 70 : 240,
        transition: "width 0.25s cubic-bezier(.4,0,.2,1)",
        boxShadow: "20px 0px 100px rgba(0, 0, 0, 0.12)",
        borderRight: `1px solid ${C.border}`,
      }}
    >
      <div
        className="flex items-center justify-between px-4 h-16 flex-shrink-0"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-3">
          <img
            src={logotry}
            alt="logo"
            className="h-10 w-10 rounded-full shadow-sm bg-white cursor-pointer object-cover"
            style={{ border: `2px solid ${C.accentSoftBorder}` }}
            onClick={() => onNavigate("admin-dashboard", "/admin")}
          />
          {!collapsed && (
            <span
              className="font-bold text-sm tracking-tight whitespace-nowrap overflow-hidden cursor-pointer"
              style={{ color: C.text }}
              onClick={() => onNavigate("admin-dashboard", "/admin")}
            >
              ISONFAM
            </span>
          )}
        </div>
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="hidden lg:flex transition-colors"
            style={{ color: C.textMuted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.textMuted;
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
        {showClose && (
          <button
            onClick={onClose}
            className="lg:hidden transition-colors"
            style={{ color: C.textMuted }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {filteredNavItems.length > 0 ? (
          filteredNavItems.map(({ id, label, icon: Icon, children }) => {
            const isOpen = !!openGroups[id];
            const hasActiveChild = children?.some((c) => c.id === active);

            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => onToggleGroup(id)}
                  title={collapsed ? label : undefined}
                  className={`w-full flex items-center rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    collapsed ? "justify-center px-2 py-2" : "justify-between px-2.5 py-2"
                  }`}
                  style={{
                    color: hasActiveChild || isOpen ? C.accent : C.textMuted,
                    backgroundColor: hasActiveChild ? C.accentSoft : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!hasActiveChild) e.currentTarget.style.backgroundColor = C.accentSoft;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = hasActiveChild
                      ? C.accentSoft
                      : "transparent";
                  }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon size={15} className="flex-shrink-0" strokeWidth={1.8} />
                    {!collapsed && (
                      <span className="text-xs font-bold uppercase tracking-widest truncate">
                        {label}
                      </span>
                    )}
                  </span>
                  {!collapsed && (
                    <ChevronDown
                      size={14}
                      className="flex-shrink-0"
                      style={{
                        transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  )}
                </button>

                {isOpen && children && (
                  <div
                    className={`mt-0.5 space-y-0.5 ${collapsed ? "" : "ml-3 pl-2"}`}
                    style={collapsed ? undefined : { borderLeft: `1px solid ${C.border}` }}
                  >
                    {children.map(({ id: childId, label: childLabel, icon: ChildIcon, path }) => {
                      const isActive = active === childId;
                      return (
                        <button
                          key={childId}
                          onClick={() => onNavigate(childId, path)}
                          title={collapsed ? childLabel : undefined}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                            collapsed ? "justify-center" : ""
                          }`}
                          style={
                            isActive
                              ? {
                                  backgroundColor: C.accent,
                                  color: "#FFFFFF",
                                  boxShadow: "0 2px 10px rgba(179,33,27,0.25)",
                                  fontWeight: 500,
                                }
                              : { color: C.textMuted }
                          }
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = C.accentSoft;
                              e.currentTarget.style.color = C.accent;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = C.textMuted;
                            }
                          }}
                        >
                          <ChildIcon
                            size={15}
                            className="flex-shrink-0"
                            strokeWidth={isActive ? 2.2 : 1.8}
                          />
                          {!collapsed && (
                            <span className="text-left whitespace-nowrap">{childLabel}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          !collapsed &&
          !authLoading && (
            <div className="text-center text-sm py-4" style={{ color: C.textMuted }}>
              No menu items available
            </div>
          )
        )}
      </nav>

      <div
        className="px-2 py-3 space-y-0.5"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <button
          onClick={onLogout}
          title={collapsed ? "Logout" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer"
          style={{ color: C.textMuted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = C.accentSoft;
            e.currentTarget.style.color = C.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = C.textMuted;
          }}
        >
          <LogOut size={18} className="flex-shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="flex-1 text-left">Logout</span>}
        </button>
        {userRole && (
          <div
            className={`flex items-center gap-3 px-3 py-2 rounded-xl mt-2 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
              style={{ backgroundColor: C.accent }}
            >
              {userDisplay.initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: C.text }}>
                  {userDisplay.name}
                </p>
                <p className="text-[10px] capitalize" style={{ color: C.textMuted }}>
                  {userDisplay.roleDisplay}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role: userRole, loading: authLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(() => childIdForPath(location.pathname));
  const [openGroups, setOpenGroups] = useState(() => {
    const id = groupIdForPath(location.pathname);
    return id ? { [id]: true } : {};
  });

  useEffect(() => {
    setActive(childIdForPath(location.pathname));
    const groupId = groupIdForPath(location.pathname);
    if (groupId) {
      setOpenGroups((prev) => ({ ...prev, [groupId]: true }));
    }
  }, [location.pathname]);

  const handleNavigation = (id, path) => {
    setActive(id);
    navigate(path);
    setMobileOpen(false);
  };

  const toggleGroup = (id) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLogout = async () => {
    try {
      const { supabase } = await import("../api/supabase");
      await supabase.auth.signOut();
      navigate("/");
      setMobileOpen(false);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const filteredNavItems = navItems.filter((item) => {
    if (authLoading) return false;
    if (!userRole) return false;
    if (userRole === "admin") return true;
    return item.role === userRole;
  });

  const getUserDisplay = () => {
    if (!user) return { initials: "US", name: "User", roleDisplay: "User" };
    const email = user.email || "";
    const initials = email ? email.substring(0, 2).toUpperCase() : "US";
    let name = "User";
    let roleDisplay = userRole?.replace("_", " ") || "User";
    if (userRole === "admin") name = "Admin User";
    else if (userRole === "sales") name = "Sales User";
    else if (userRole === "marketing") name = "Marketing User";
    else if (userRole === "inventory") name = "Inventory User";
    else if (userRole === "production") name = "Production User";
    return { initials, name, roleDisplay };
  };

  const userDisplay = getUserDisplay();

  const sidebarProps = {
    active,
    openGroups,
    onToggleGroup: toggleGroup,
    onNavigate: handleNavigation,
    onLogout: handleLogout,
    filteredNavItems,
    authLoading,
    userRole,
    userDisplay,
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: C.page }}>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-10 lg:hidden bg-white p-2 rounded-lg shadow-md"
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="hidden lg:block h-full flex-shrink-0">
        <Sidebar
          {...sidebarProps}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />
      </div>
      <div
        className={`fixed left-0 top-0 h-full z-30 lg:hidden transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: 240 }}
      >
        <Sidebar
          {...sidebarProps}
          collapsed={false}
          showClose
          onClose={() => setMobileOpen(false)}
        />
      </div>
    </div>
  );
}

export default Nav;