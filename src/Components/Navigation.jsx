import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Megaphone, Factory,
  Settings, ChevronRight, ChevronLeft, Menu, X, LogOut,
  Users, Activity, Megaphone as CampaignIcon,
  Layers, ClipboardList, Box, Boxes, PhilippinePesoIcon
} from "lucide-react";
import logotry from '../assets/logo.jpg';
import { useAuth } from "../context/AuthContext";

const navItems = [
  {
    id: "admin",
    label: "Admin",
    icon: LayoutDashboard,
    role: "admin",
    children: [
      { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { id: "admin-users", label: "User Management", icon: Users, path: "/admin/users" },
      { id: "admin-logs", label: "Activity Logs", icon: Activity, path: "/admin/logs" },
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
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    role: "marketing",
    children: [
      { id: "marketing-dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/marketing" },
      { id: "marketing-campaigns", label: "Campaigns", icon: CampaignIcon, path: "/marketing/campaigns" },
      { id: "marketing-inventory", label: "Inventory Overview", icon: Layers, path: "/marketing/inventory" },
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
      { id: "production-workorders", label: "Work Orders", icon: ClipboardList, path: "/production/work-orders" },
      { id: "production-rawmaterials", label: "Raw Materials", icon: Box, path: "/production/raw-materials" },
      { id: "production-finished", label: "Finished Goods", icon: Boxes, path: "/production/finished-goods" },
    ],
  },
];

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role: userRole, loading: authLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const getActiveItem = () => {
    const currentPath = location.pathname;
    for (const item of navItems) {
      if (item.children) {
        const child = item.children.find(c => c.path === currentPath);
        if (child) return child.id;
      }
    }
    return "admin-dashboard";
  };

  const [active, setActive] = useState(getActiveItem());

  useEffect(() => {
    setActive(getActiveItem());
  }, [location.pathname]);

  const handleNavigation = (id, path) => {
    setActive(id);
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    try {
      const { supabase } = await import('../api/supabase');
      await supabase.auth.signOut();
      navigate('/');
      setMobileOpen(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const filteredNavItems = navItems.filter(item => {
    if (authLoading) return false;
    if (!userRole) return false;
    if (userRole === 'admin') return true;
    return item.role === userRole;
  });

  const getUserDisplay = () => {
    if (!user) return { initials: 'US', name: 'User', roleDisplay: 'User' };
    const email = user.email || '';
    const initials = email ? email.substring(0, 2).toUpperCase() : 'US';
    let name = 'User';
    let roleDisplay = userRole?.replace('_', ' ') || 'User';
    if (userRole === 'admin') name = 'Admin User';
    else if (userRole === 'sales') name = 'Niggas in Sales';
    else if (userRole === 'marketing') name = 'Baddies in Marketing';
    else if (userRole === 'inventory') name = 'Ayasibs in Inventory';
    else if (userRole === 'production') name = 'Production User';
    return { initials, name, roleDisplay };
  };

  const userDisplay = getUserDisplay();

  const Sidebar = () => (
    <aside
      className="h-full bg-white flex flex-col"
      style={{
        width: collapsed ? 70 : 240,
        transition: "width 0.25s cubic-bezier(.4,0,.2,1)",
        boxShadow: "20px 0px 100px rgba(0, 0, 0, 0.38)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={logotry}
            alt="logo"
            className="h-10 w-10 rounded-full shadow-sm border-2 border-white/50 bg-white/30 transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl hover:border-red-500/70 cursor-pointer object-cover"
            onClick={() => handleNavigation("admin-dashboard", "/admin")}
          />
          {!collapsed && (
            <span
              className="font-bold text-gray-900 text-sm tracking-tight whitespace-nowrap overflow-hidden cursor-pointer"
              onClick={() => handleNavigation("admin-dashboard", "/admin")}
            >
              ISONFAM
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-red-500 transition-colors hidden lg:flex"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="text-gray-400 hover:text-red-500 transition-colors lg:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-3 overflow-y-auto">
        {filteredNavItems.length > 0 ? (
          filteredNavItems.map(({ id, label, icon: Icon, children }) => (
            <div key={id}>
              {!collapsed ? (
                <div className="flex items-center gap-2 px-3 mb-1">
                  <Icon size={15} className="text-red-600 flex-shrink-0" strokeWidth={1.8} />
                  <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
                    {label}
                  </span>
                </div>
              ) : (
                <div className="flex justify-center py-1">
                  <Icon size={16} className="text-red-600 flex-shrink-0" strokeWidth={1.6} />
                </div>
              )}
              {children && (
                <div className={!collapsed ? "ml-4 pl-3 border-l border-gray-100 space-y-0.5" : "space-y-0.5"}>
                  {children.map(({ id: childId, label: childLabel, icon: ChildIcon, path }) => {
                    const isActive = active === childId;
                    return (
                      <button
                        key={childId}
                        onClick={() => handleNavigation(childId, path)}
                        title={collapsed ? childLabel : undefined}
                        className={`
                          w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all
                          ${collapsed ? "justify-center" : ""}
                          ${isActive
                            ? "bg-red-600 text-white font-medium"
                            : "text-gray-500 hover:bg-red-50 hover:text-red-600"
                          }
                        `}
                        style={isActive ? { boxShadow: "0 2px 10px rgba(220,38,38,0.25)" } : {}}
                      >
                        <ChildIcon size={15} className="flex-shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                        {!collapsed && (
                          <span className="text-left whitespace-nowrap">{childLabel}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        ) : (
          !collapsed && !authLoading && (
            <div className="text-center text-gray-400 text-sm py-4">
              No menu items available
            </div>
          )
        )}
      </nav>

      {/* Bottom Section */}
      <div className="px-2 py-3 border-t border-gray-100 space-y-0.5">
        {userRole === 'admin' && (
          <button
            onClick={() => handleNavigation("settings", "/settings")}
            title={collapsed ? "Settings" : undefined}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <Settings size={18} className="flex-shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="flex-1 text-left">Settings</span>}
          </button>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
        >
          <LogOut size={18} className="flex-shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="flex-1 text-left">Logout</span>}
        </button>
        {userRole && (
          <div className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-50 cursor-pointer transition-all mt-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
              {userDisplay.initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{userDisplay.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{userDisplay.roleDisplay}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-10 lg:hidden bg-white p-2 rounded-lg shadow-md"
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <div className="hidden lg:block h-full flex-shrink-0">
        <Sidebar />
      </div>
      <div
        className={`fixed left-0 top-0 h-full z-30 lg:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 240 }}
      >
        <Sidebar />
      </div>
    </div>
  );
}

export default Nav;