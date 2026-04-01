import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, Megaphone, Factory, Settings, ChevronRight, ChevronLeft, Menu, X, Search, LogOut } from "lucide-react";
import logotry from '../assets/logo.jpg';
import { useAuth } from "../context/AuthContext";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin", role: "admin", badge: null },
  { id: "inventory", label: "Inventory", icon: Package, path: "/inventory", role: "inventory", badge: null },
  { id: "sales", label: "Sales", icon: ShoppingCart, path: "/sales", role: "sales", badge: null },
  { id: "marketing", label: "Marketing", icon: Megaphone, path: "/marketing", role: "marketing", badge: null },
  { id: "production", label: "Production", icon: Factory, path: "/production", role: "production", badge: null },
];

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role: userRole, loading: authLoading } = useAuth(); // Get role from AuthContext
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Get current active item based on path
  const getActiveItem = () => {
    const currentPath = location.pathname;
    const activeItem = navItems.find(item => item.path === currentPath);
    return activeItem ? activeItem.id : "dashboard";
  };

  const [active, setActive] = useState(getActiveItem());

  // Update active state when location changes
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

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => {
    // If still loading, don't show items
    if (authLoading) return false;
    // If no user role, don't show items
    if (!userRole) return false;
    // Show all items for admin role
    if (userRole === 'admin') return true;
    // For other roles, show only their specific items
    return item.role === userRole;
  });

  // Get user display info
  const getUserDisplay = () => {
    if (!user) return { initials: 'US', name: 'User', roleDisplay: 'User' };
    
    const email = user.email || '';
    const initials = email ? email.substring(0, 2).toUpperCase() : 'US';
    
    let name = 'User';
    let roleDisplay = userRole?.replace('_', ' ') || 'User';
    
    if (userRole === 'admin') {
      name = 'Admin User';
    } else if (userRole === 'sales') {
      name = 'Sales User';
    } else if (userRole === 'marketing') {
      name = 'Marketing User';
    } else if (userRole === 'inventory') {
      name = 'Inventory User';
    } else if (userRole === 'production') {
      name = 'Production User';
    }
        
    
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
      {/*Logo*/}
      <div className="flex items-center justify-between px-4 h-16 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={logotry}
            alt="logo"
            className="h-10 w-10 rounded-full shadow-sm border-2 border-white/50 bg-white/30 transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl hover:border-red-500/70 cursor-pointer object-cover"
            onClick={() => handleNavigation("dashboard", "/admin")}
          />
          {!collapsed && (
            <span 
              className="font-bold text-gray-900 text-sm tracking-tight whitespace-nowrap overflow-hidden cursor-pointer"
              onClick={() => handleNavigation("dashboard", "/admin")}>
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
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {filteredNavItems.length > 0 ? (
          filteredNavItems.map(({ id, label, icon: Icon, path, badge }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => handleNavigation(id, path)}
                title={collapsed ? label : undefined}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative
                  ${isActive
                    ? "bg-red-600 text-white"
                    : "text-gray-500 hover:bg-red-50 hover:text-red-600"
                  }
                `}
                style={isActive ? { boxShadow: "0 2px 12px rgba(220,38,38,0.3)" } : {}}
              >
                <Icon size={18} className="flex-shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />

                {!collapsed && (
                  <span className="flex-1 text-left whitespace-nowrap">{label}</span>
                )}

                {!collapsed && badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none
                    ${isActive ? "bg-white/25 text-white" : "bg-red-100 text-red-600"}`}>
                    {badge}
                  </span>
                )}

                {collapsed && badge && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            );
          })
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
        {/* Settings - Only show for admin */}
        {userRole === 'admin' && (
          <button
            onClick={() => handleNavigation("settings", "/settings")}
            title={collapsed ? "Settings" : undefined}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all relative"
          >
            <Settings size={18} className="flex-shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="flex-1 text-left">Settings</span>}
          </button>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all relative"
        >
          <LogOut size={18} className="flex-shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="flex-1 text-left">Logout</span>}
        </button>

        {/* User Info */}
        {userRole && (
          <div className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-50 cursor-pointer transition-all mt-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
              {userDisplay.initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {userDisplay.name}
                </p>
                <p className="text-[10px] text-gray-400 capitalize">
                  {userDisplay.roleDisplay}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-10 lg:hidden bg-white p-2 rounded-lg shadow-md"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/*Desktop*/}
      <div className="hidden lg:block h-full flex-shrink-0">
        <Sidebar/>
      </div>

      {/*Mobile*/}
      <div
        className={`fixed left-0 top-0 h-full z-30 lg:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 240 }}>
        <Sidebar/>
      </div>
    </div>
  );
}

export default Nav;